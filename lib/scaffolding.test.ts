import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strictEqual, ok } from 'node:assert';

const scaffolding = await import('./scaffolding.mjs');
const { initWorkspace, updateWorkspace, resolveWorkspacePath, getNosTemplatesRoot } = scaffolding;

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nos-scaffolding-test-'));
}

describe('resolveWorkspacePath', () => {
  it('returns CWD when no input', () => {
    const result = resolveWorkspacePath();
    strictEqual(result, process.cwd());
  });

  it('resolves relative path to absolute', () => {
    const result = resolveWorkspacePath('.');
    strictEqual(result, process.cwd());
  });

  it('returns absolute path unchanged', () => {
    const absPath = fs.mkdtempSync(path.join(os.tmpdir(), 'nos-test-'));
    const result = resolveWorkspacePath(absPath);
    // fs.realpathSync resolves symlinks on macOS, so compare resolved paths
    strictEqual(result, fs.realpathSync(absPath));
    fs.rmdirSync(absPath);
  });
});

describe('initWorkspace', () => {
  let tempDir;
  let templatesRoot;

  beforeEach(() => {
    tempDir = createTempDir();
    templatesRoot = getNosTemplatesRoot();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('AC-1: copies templates/.nos/ into target directory .nos/', () => {
    const result = initWorkspace(tempDir, templatesRoot);
    ok(result.ok, 'initWorkspace should succeed, got: ' + JSON.stringify(result));
    const nosDir = path.join(tempDir, '.nos');
    ok(fs.existsSync(nosDir), '.nos/ directory should exist');
    ok(fs.existsSync(path.join(nosDir, 'settings.yaml')), 'settings.yaml should exist');
    ok(fs.existsSync(path.join(nosDir, 'system-prompt.md')), 'system-prompt.md should exist');
    ok(fs.existsSync(path.join(nosDir, 'workflows', 'requirements', 'config.json')), 'requirements config.json should exist');
    ok(fs.existsSync(path.join(nosDir, 'agents', 'david-engineer', 'index.md')), 'david-engineer index.md should exist');
  });

  it('AC-2: fails if .nos/ already exists', () => {
    fs.mkdirSync(path.join(tempDir, '.nos'));
    const result = initWorkspace(tempDir, templatesRoot);
    strictEqual(result.ok, false);
    strictEqual(result.error, 'already_exists');
  });

  it('AC-3: defaults to CWD when no path argument', () => {
    const cwd = process.cwd();
    process.chdir(tempDir);
    try {
      const result = initWorkspace(process.cwd(), templatesRoot);
      ok(result.ok, 'initWorkspace should succeed in CWD: ' + JSON.stringify(result));
      const nosDir = path.join(process.cwd(), '.nos');
      ok(fs.existsSync(nosDir), '.nos/ should exist in CWD');
    } finally {
      process.chdir(cwd);
    }
  });

  it('AC-4: resolves relative path to absolute', () => {
    const parent = path.dirname(tempDir);
    const relative = path.basename(tempDir);
    const cwd = process.cwd();
    process.chdir(parent);
    try {
      const result = initWorkspace(relative, templatesRoot);
      ok(result.ok, 'initWorkspace should accept relative path: ' + JSON.stringify(result));
      const nosDir = path.join(tempDir, '.nos');
      ok(fs.existsSync(nosDir), '.nos/ should exist at resolved absolute path');
    } finally {
      process.chdir(cwd);
    }
  });

  it('AC-5: scaffolds activity.jsonl as empty file in each workflow directory', () => {
    const result = initWorkspace(tempDir, templatesRoot);
    ok(result.ok, 'initWorkspace should succeed: ' + JSON.stringify(result));
    const activityPath = path.join(tempDir, '.nos', 'workflows', 'requirements', 'activity.jsonl');
    ok(fs.existsSync(activityPath), 'activity.jsonl should exist');
    const stat = fs.statSync(activityPath);
    strictEqual(stat.size, 0, 'activity.jsonl should be empty');
  });
});

describe('updateWorkspace', () => {
  let tempDir;
  let templatesRoot;

  beforeEach(() => {
    tempDir = createTempDir();
    templatesRoot = getNosTemplatesRoot();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('AC-7: adds only missing files (additive)', () => {
    fs.mkdirSync(path.join(tempDir, '.nos'));
    fs.mkdirSync(path.join(tempDir, '.nos', 'workflows'));
    fs.mkdirSync(path.join(tempDir, '.nos', 'workflows', 'requirements'));
    fs.writeFileSync(path.join(tempDir, '.nos', 'workflows', 'requirements', 'custom.md'), 'custom content');
    fs.writeFileSync(path.join(tempDir, '.nos', 'settings.yaml'), 'custom settings');

    const result = updateWorkspace({ workspacePath: tempDir, templatesRoot, force: false, dryRun: false });
    ok(result.ok, 'updateWorkspace should succeed: ' + JSON.stringify(result));

    const customFile = path.join(tempDir, '.nos', 'workflows', 'requirements', 'custom.md');
    const content = fs.readFileSync(customFile, 'utf8');
    strictEqual(content, 'custom content', 'existing custom file should not be overwritten');
  });

  it('AC-8: system-prompt.md is never overwritten by default', () => {
    const initResult = initWorkspace(tempDir, templatesRoot);
    ok(initResult.ok, 'initWorkspace should succeed: ' + JSON.stringify(initResult));

    const customContent = 'This is my custom system prompt that I wrote myself.';
    fs.writeFileSync(path.join(tempDir, '.nos', 'system-prompt.md'), customContent);

    const updateResult = updateWorkspace({ workspacePath: tempDir, templatesRoot, force: false, dryRun: false });
    ok(updateResult.ok, 'updateWorkspace should succeed: ' + JSON.stringify(updateResult));

    const content = fs.readFileSync(path.join(tempDir, '.nos', 'system-prompt.md'), 'utf8');
    strictEqual(content, customContent, 'system-prompt.md should not be overwritten');
  });

  it('AC-9: --force overwrites system-prompt.md', () => {
    const initResult = initWorkspace(tempDir, templatesRoot);
    ok(initResult.ok, 'initWorkspace should succeed: ' + JSON.stringify(initResult));

    fs.writeFileSync(path.join(tempDir, '.nos', 'system-prompt.md'), 'Custom content');

    const updateResult = updateWorkspace({ workspacePath: tempDir, templatesRoot, force: true, dryRun: false });
    ok(updateResult.ok, 'updateWorkspace with force should succeed: ' + JSON.stringify(updateResult));

    const templateContent = fs.readFileSync(path.join(templatesRoot, 'system-prompt.md'), 'utf8');
    const actualContent = fs.readFileSync(path.join(tempDir, '.nos', 'system-prompt.md'), 'utf8');
    strictEqual(actualContent, templateContent, 'system-prompt.md should be restored from template');
  });

  it('AC-10: --dry-run does not modify filesystem', () => {
    fs.mkdirSync(path.join(tempDir, '.nos'));

    const before = Date.now();
    const result = updateWorkspace({ workspacePath: tempDir, templatesRoot, force: false, dryRun: true });
    ok(result.ok, 'updateWorkspace --dry-run should succeed: ' + JSON.stringify(result));
    ok(result.added.length > 0, 'should list files that would be added');

    for (const file of result.added) {
      const filePath = path.join(tempDir, '.nos', file);
      const exists = fs.existsSync(filePath);
      if (exists) {
        const mtime = fs.statSync(filePath).mtimeMs;
        ok(mtime < before, 'file ' + file + ' should not have been created in dry-run');
      }
    }
  });

  it('AC-11: defaults to CWD when no path argument', () => {
    fs.mkdirSync(path.join(tempDir, '.nos'));
    const cwd = process.cwd();
    process.chdir(tempDir);
    try {
      const result = updateWorkspace({ workspacePath: process.cwd(), templatesRoot, force: false, dryRun: false });
      ok(result.ok, 'updateWorkspace should work on CWD: ' + JSON.stringify(result));
    } finally {
      process.chdir(cwd);
    }
  });

  it('returns error when .nos/ does not exist', () => {
    const result = updateWorkspace({ workspacePath: tempDir, templatesRoot, force: false, dryRun: false });
    strictEqual(result.ok, false);
    strictEqual(result.error, 'workspace_not_found');
  });
});

describe('integration: init then update', () => {
  let tempDir;
  let templatesRoot;

  beforeEach(() => {
    tempDir = createTempDir();
    templatesRoot = getNosTemplatesRoot();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('init then update adds no files when already complete', () => {
    const initResult = initWorkspace(tempDir, templatesRoot);
    ok(initResult.ok, 'initWorkspace should succeed: ' + JSON.stringify(initResult));

    const updateResult = updateWorkspace({ workspacePath: tempDir, templatesRoot, force: false, dryRun: false });
    ok(updateResult.ok, 'updateWorkspace should succeed: ' + JSON.stringify(updateResult));
    strictEqual(updateResult.added.length, 0, 'no files should be added after full init');
  });
});