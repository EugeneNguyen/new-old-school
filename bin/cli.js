#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const open = require('open').default || require('open');

const pkgRoot = path.resolve(__dirname, '..');
const projectRoot = process.cwd();
const port = Number(process.env.NOS_PORT) || 30128;

function ensureNosDir() {
  const target = path.join(projectRoot, '.nos');
  if (fs.existsSync(target)) {
    console.log(`Using existing .nos/ at ${target}`);
    return;
  }
  const source = path.join(pkgRoot, 'templates', '.nos');
  if (!fs.existsSync(source)) {
    console.error(`nos: bundled template missing at ${source}`);
    process.exit(1);
  }
  console.log(`Initializing .nos/ in ${target}`);
  try {
    fs.cpSync(source, target, { recursive: true, errorOnExist: true, force: false });
  } catch (err) {
    const failed = err && err.path ? err.path : (err && err.message) || String(err);
    console.error(`nos: failed to scaffold .nos/: ${failed}`);
    process.exit(1);
  }
}

function resolveNextBin() {
  try {
    const pkgJsonPath = require.resolve('next/package.json', { paths: [pkgRoot] });
    const nextPkg = require(pkgJsonPath);
    const binRel = typeof nextPkg.bin === 'string' ? nextPkg.bin : nextPkg.bin && nextPkg.bin.next;
    if (!binRel) throw new Error('next package has no bin entry');
    return path.join(path.dirname(pkgJsonPath), binRel);
  } catch (err) {
    console.error('nos: could not resolve next binary:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

ensureNosDir();

const nextBin = resolveNextBin();
const url = `http://localhost:${port}`;

console.log('Launching nos...');

const server = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
  cwd: pkgRoot,
  stdio: 'inherit',
  env: { ...process.env, NOS_PROJECT_ROOT: projectRoot, NOS_PORT: String(port) },
});

server.on('exit', (code) => {
  process.exit(code ?? 0);
});

setTimeout(async () => {
  try {
    await open(url);
    console.log(`\nnos is ready at ${url}`);
    console.log('Press Ctrl+C to stop the server and exit.\n');
  } catch (err) {
    console.error('Failed to open browser:', err);
  }
}, 4000);

process.on('SIGINT', () => {
  console.log('\nStopping nos server...');
  try { server.kill('SIGINT'); } catch {}
  process.exit();
});
