#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { select } from '@inquirer/prompts';
import open from 'open';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pkgRoot = path.resolve(__dirname, '..');
const projectRoot = process.env.NOS_PROJECT_ROOT || process.cwd();
const port = Number(process.env.NOS_PORT) || 30128;
const url = `http://localhost:${port}`;

const nosHome = process.env.NOS_HOME && process.env.NOS_HOME.trim()
  ? path.resolve(process.env.NOS_HOME)
  : path.join(os.homedir(), '.nos');
const runtimeDir = path.join(nosHome, 'runtime');
const lockfilePath = path.join(runtimeDir, 'server.json');
const logFilePath = path.join(runtimeDir, 'server.log');
const LOG_MAX_BYTES = 10 * 1024 * 1024;

// ---- Bootstrapping ----

function ensureRuntimeDir() {
  fs.mkdirSync(runtimeDir, { recursive: true });
}

function resolveNextBin() {
  try {
    const pkgJsonPath = require.resolve('next/package.json', { paths: [pkgRoot] });
    const nextPkg = require(pkgJsonPath);
    const binRel = typeof nextPkg.bin === 'string' ? nextPkg.bin : nextPkg.bin?.next;
    if (!binRel) throw new Error('next package has no bin entry');
    return path.join(path.dirname(pkgJsonPath), binRel);
  } catch (err) {
    console.error('nos: could not resolve next binary:', err?.message ?? err);
    process.exit(1);
  }
}

// ---- Lockfile ----

function readLockfile() {
  try { return JSON.parse(fs.readFileSync(lockfilePath, 'utf8')); } catch { return null; }
}

function writeLockfile(data) {
  ensureRuntimeDir();
  fs.writeFileSync(lockfilePath, JSON.stringify(data, null, 2), 'utf8');
}

function deleteLockfile() {
  try { fs.unlinkSync(lockfilePath); } catch {}
}

// ---- Liveness probe ----

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function tcpAlive(p) {
  return new Promise(resolve => {
    const sock = net.createConnection({ port: p, host: '127.0.0.1' });
    const t = setTimeout(() => { sock.destroy(); resolve(false); }, 1000);
    sock.on('connect', () => { clearTimeout(t); sock.destroy(); resolve(true); });
    sock.on('error', () => { clearTimeout(t); resolve(false); });
  });
}

async function isAlive(lf) {
  if (!lf) return false;
  if (!pidAlive(lf.pid)) return false;
  return tcpAlive(lf.port);
}

// ---- Log management ----

function truncateLog() {
  ensureRuntimeDir();
  try { fs.writeFileSync(logFilePath, ''); } catch {}
}

function rotateLogIfLarge() {
  try {
    const stat = fs.statSync(logFilePath);
    if (stat.size <= LOG_MAX_BYTES) return;
    const content = fs.readFileSync(logFilePath, 'utf8');
    fs.writeFileSync(logFilePath, content.slice(Math.floor(content.length / 2)), 'utf8');
  } catch {}
}

// ---- Server management ----

function startDetachedServer(nextBin) {
  truncateLog();
  const logFd = fs.openSync(logFilePath, 'a');
  const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
    cwd: pkgRoot,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    windowsHide: true,
    env: { ...process.env, NOS_PROJECT_ROOT: projectRoot, NOS_PORT: String(port) },
  });
  fs.closeSync(logFd);
  if (!child.pid) throw new Error('Failed to spawn NOS server process');
  child.unref();
  writeLockfile({
    pid: child.pid,
    port,
    projectRoot,
    startedAt: new Date().toISOString(),
    logPath: logFilePath,
  });
}

async function stopServer(lf) {
  if (!lf) return;
  const { pid } = lf;
  if (!pidAlive(pid)) { deleteLockfile(); return; }
  try { process.kill(pid, 'SIGINT'); } catch {}
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 200));
    if (!pidAlive(pid)) { deleteLockfile(); return; }
  }
  try { process.kill(pid, 'SIGKILL'); } catch {}
  await new Promise(r => setTimeout(r, 200));
  deleteLockfile();
}

// ---- Scaffolding ----

async function handleInit(args) {
  const templatesRoot = path.join(pkgRoot, 'templates', '.nos');
  const { initWorkspace } = await import(path.join(pkgRoot, 'lib', 'scaffolding.js')).catch(() =>
    import(path.join(pkgRoot, 'lib', 'scaffolding.mjs'))
  ).catch(() => null);
  if (!initWorkspace) {
    try {
      const mod = await import(path.join(pkgRoot, 'lib', 'scaffolding.mjs'));
      handleInitInner(mod, args, templatesRoot);
    } catch {
      console.error('nos init: could not load scaffolding module');
      process.exit(1);
    }
  } else {
    handleInitInner({ initWorkspace }, args, templatesRoot);
  }
}

function handleInitInner(mod, args, templatesRoot) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: nos init [path]');
    console.log('');
    console.log('Scaffold a new NOS workspace in the target directory.');
    console.log('If no path is provided, uses the current working directory.');
    console.log('');
    console.log('Arguments:');
    console.log('  path    Target directory (absolute or relative to CWD)');
    process.exit(0);
  }

  const workspacePath = args[0] ?? process.cwd();
  let resolved;
  try {
    resolved = fs.realpathSync(workspacePath);
  } catch {
    console.error('nos init: path does not exist:', workspacePath);
    process.exit(1);
  }

  const result = mod.initWorkspace(resolved, templatesRoot);

  if (result.ok) {
    console.log('NOS scaffolded at', result.nosDir);
    process.exit(0);
  } else {
    if (result.error === 'already_exists') {
      console.error('nos init: .nos/ already exists at', result.nosDir);
      process.exit(1);
    } else if (result.error === 'template_not_found') {
      console.error('nos init: templates not found at', templatesRoot);
      process.exit(1);
    } else {
      console.error('nos init:', result.error);
      process.exit(1);
    }
  }
}

async function handleUpdate(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: nos update [path] [--dry-run] [--force]');
    console.log('');
    console.log('Update a NOS workspace by adding missing template files.');
    console.log('The update is additive — existing files are never overwritten by default.');
    console.log('The system-prompt.md is sacred and never overwritten unless --force is passed.');
    console.log('');
    console.log('Arguments:');
    console.log('  path         Target directory (default: current working directory)');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run    Preview what files would be added without modifying the filesystem');
    console.log('  --force      Overwrite all template files including system-prompt.md');
    console.log('  --help, -h   Show this help message');
    process.exit(0);
  }

  const templatesRoot = path.join(pkgRoot, 'templates', '.nos');

  const mod = await import(path.join(pkgRoot, 'lib', 'scaffolding.mjs')).catch(() => null);
  if (!mod) {
    console.error('nos update: could not load scaffolding module');
    process.exit(1);
  }

  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const targetArgs = args.filter(a => !a.startsWith('--'));
  const workspacePath = targetArgs[0] ?? process.cwd();

  let resolved;
  try {
    resolved = fs.realpathSync(workspacePath);
  } catch {
    console.error('nos update: path does not exist:', workspacePath);
    process.exit(1);
  }

  const result = mod.updateWorkspace({
    workspacePath: resolved,
    templatesRoot,
    force,
    dryRun,
  });

  if (!result.ok) {
    if (result.error === 'workspace_not_found') {
      console.error('nos update: .nos/ not found at', result.nosDir, '(run "nos init" first)');
      process.exit(1);
    }
    console.error('nos update:', result.error);
    process.exit(1);
  }

  if (dryRun) {
    if (result.added.length === 0) {
      console.log('nos update --dry-run: no files to add');
    } else {
      console.log('nos update --dry-run: the following files would be added:');
      for (const file of result.added) {
        console.log(' +', file);
      }
    }
  } else {
    if (result.added.length === 0) {
      console.log('nos update: no new files to add');
    } else {
      console.log('nos update: added', result.added.length, 'file(s):');
      for (const file of result.added) {
        console.log(' +', file);
      }
    }
  }

  process.exit(0);
}

// ---- Subcommands ----

async function handleStatus() {
  const lf = readLockfile();
  const alive = await isAlive(lf);
  if (alive) {
    console.log(JSON.stringify({ running: true, pid: lf.pid, port: lf.port, startedAt: lf.startedAt }));
    process.exit(0);
  } else {
    if (lf) deleteLockfile();
    console.log(JSON.stringify({ running: false }));
    process.exit(1);
  }
}

async function handleStopCmd() {
  const lf = readLockfile();
  const alive = await isAlive(lf);
  if (!alive) {
    if (lf) deleteLockfile();
    process.stderr.write('No NOS server running.\n');
    process.exit(1);
  }
  await stopServer(lf);
  process.exit(0);
}

// ---- Non-TTY fallback (AC-8) ----

function handleNoTTY(nextBin) {
  const server = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
    cwd: pkgRoot,
    stdio: 'inherit',
    env: { ...process.env, NOS_PROJECT_ROOT: projectRoot, NOS_PORT: String(port) },
  });
  server.on('exit', code => process.exit(code ?? 0));
  setTimeout(() => open(url).catch(() => {}), 4000);
  process.on('SIGINT', () => {
    try { server.kill('SIGINT'); } catch {}
    process.exit();
  });
}

// ---- Log view (AC-2, AC-7) ----

async function showLogView() {
  const ESC = '\x1b';
  process.stdout.write(ESC + '[2J' + ESC + '[H');
  process.stdout.write(ESC + '[1;36m' + 'NOS running at ' + url + '  (Ctrl+C = return to menu)' + ESC + '[0m\n\n');

  let pos = 0;
  let active = true;

  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();

  const onData = (chunk) => {
    if (chunk[0] === 3) active = false;
  };
  process.stdin.on('data', onData);

  try {
    const stat = fs.statSync(logFilePath);
    if (stat.size > 0) {
      pos = Math.max(0, stat.size - 65536);
      const len = stat.size - pos;
      const buf = Buffer.alloc(len);
      const fd = fs.openSync(logFilePath, 'r');
      fs.readSync(fd, buf, 0, len, pos);
      fs.closeSync(fd);
      pos = stat.size;
      process.stdout.write(buf);
    }
  } catch {}

  while (active) {
    await new Promise(r => setTimeout(r, 300));
    if (!active) break;
    try {
      const stat = fs.statSync(logFilePath);
      if (stat.size > pos) {
        const len = stat.size - pos;
        const buf = Buffer.alloc(len);
        const fd = fs.openSync(logFilePath, 'r');
        fs.readSync(fd, buf, 0, len, pos);
        fs.closeSync(fd);
        pos = stat.size;
        process.stdout.write(buf);
        rotateLogIfLarge();
      }
    } catch {}
  }

  process.stdin.removeListener('data', onData);
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
}

// ---- TUI menu loop (AC-1 through AC-7) ----

async function runTUI(nextBin) {
  while (true) {
    const ESC = '\x1b';
    process.stdout.write(ESC + '[2J' + ESC + '[H');

    const lf = readLockfile();
    let alive = await isAlive(lf);
    if (!alive && lf) {
      // AC-5: auto-restart on dead server
      console.log(`[${new Date().toISOString()}] [nos] Server died (was started at ${lf.startedAt}). Restarting...`);
      startDetachedServer(nextBin);
      // Re-check after restart
      alive = await isAlive(lf);
    }
    if (!alive && lf) deleteLockfile();

    const firstLaunch = !alive;

    const choices = alive
      ? [
          { name: 'Show logs', value: 'logs' },
          { name: 'Stop service', value: 'stop' },
        ]
      : [
          { name: 'Show logs', value: 'logs' },
          { name: 'Run in background', value: 'background' },
          { name: 'Stop service', value: 'stop-disabled', disabled: '(not running)' },
        ];

    let choice;
    try {
      choice = await select({
        message: alive ? 'NOS - ' + url : 'NOS - New Old School',
        choices,
        pageSize: 10,
      });
    } catch {
      // Ctrl+C at menu - exit cleanly, leave any running server alive
      process.exit(0);
    }

    if (choice === 'logs') {
      if (!alive) {
        startDetachedServer(nextBin);
        if (firstLaunch) {
          const t = setTimeout(() => open(url).catch(() => {}), 4000);
          t.unref();
        }
      }
      await showLogView();
      // continue loop -> back to menu
    } else if (choice === 'background') {
      startDetachedServer(nextBin);
      console.log('NOS running in background on ' + url);
      process.exit(0);
    } else if (choice === 'stop') {
      const lf2 = readLockfile();
      await stopServer(lf2);
      process.exit(0);
    }
  }
}

// ---- Main ----

async function main() {
  const cmd = process.argv[2];
  const restArgs = process.argv.slice(3);

  if (cmd === 'status') return handleStatus();
  if (cmd === 'stop') return handleStopCmd();
  if (cmd === 'init') {
    await handleInit(restArgs);
    return;
  }
  if (cmd === 'update') {
    await handleUpdate(restArgs);
    return;
  }

  const nextBin = resolveNextBin();

  if (!process.stdout.isTTY) return handleNoTTY(nextBin);

  ensureRuntimeDir();

  return runTUI(nextBin);
}

main().catch(err => {
  console.error('nos:', err?.message ?? err);
  process.exit(1);
});
