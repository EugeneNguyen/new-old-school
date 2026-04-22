import fs from 'fs';
import path from 'path';

export function getTemplatesRoot() {
  return path.resolve(process.cwd(), 'templates');
}

export function getNosTemplatesRoot() {
  return path.join(getTemplatesRoot(), '.nos');
}

export function resolveWorkspacePath(input) {
  if (input) {
    if (!path.isAbsolute(input)) {
      return path.resolve(process.cwd(), input);
    }
    return fs.realpathSync(input);
  }
  return process.cwd();
}

export function initWorkspace(workspacePath, templatesRoot) {
  const nosDir = path.join(workspacePath, '.nos');

  if (fs.existsSync(nosDir)) {
    return { ok: false, error: 'already_exists', nosDir };
  }

  const src = templatesRoot;
  if (!fs.existsSync(src)) {
    return { ok: false, error: 'template_not_found' };
  }

  copyDirRecursive(src, nosDir);
  ensureActivityFiles(nosDir);

  return { ok: true, nosDir };
}

export function updateWorkspace({ workspacePath, templatesRoot, force = false, dryRun = false }) {
  const nosDir = path.join(workspacePath, '.nos');

  if (!fs.existsSync(nosDir)) {
    return { ok: false, error: 'workspace_not_found', nosDir };
  }

  const src = templatesRoot;
  if (!fs.existsSync(src)) {
    return { ok: false, error: 'template_not_found' };
  }

  const added = [];
  visit(src, nosDir, workspacePath, force, dryRun, added);
  ensureActivityFiles(nosDir);

  return { ok: true, added };
}

function visit(srcDir, destDir, workspacePath, force, dryRun, added) {
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      visit(srcPath, destPath, workspacePath, force, dryRun, added);
    } else if (entry.isFile()) {
      if (!fs.existsSync(destPath)) {
        if (!dryRun) {
          fs.copyFileSync(srcPath, destPath);
        }
        added.push(path.relative(workspacePath, destPath));
      } else if (entry.name === 'system-prompt.md' && force) {
        if (!dryRun) {
          fs.copyFileSync(srcPath, destPath);
        }
        added.push(path.relative(workspacePath, destPath));
      }
    }
  }
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

function ensureActivityFiles(nosDir) {
  const workflowsDir = path.join(nosDir, 'workflows');
  if (!fs.existsSync(workflowsDir)) return;

  for (const entry of fs.readdirSync(workflowsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const activityPath = path.join(workflowsDir, entry.name, 'activity.jsonl');
    if (!fs.existsSync(activityPath)) {
      fs.writeFileSync(activityPath, '', 'utf-8');
    }
  }
}

export function listTemplateFiles(templatesRoot, baseDir) {
  const files = [];
  const root = baseDir || templatesRoot;

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTemplateFiles(templatesRoot, entryPath));
    } else if (entry.isFile()) {
      files.push(path.relative(templatesRoot, entryPath));
    }
  }
  return files;
}