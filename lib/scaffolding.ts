import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getTemplatesRoot(): string {
  return path.resolve(__dirname, '..', 'templates');
}

export function getNosTemplatesRoot(): string {
  return path.join(getTemplatesRoot(), '.nos');
}

export function resolveWorkspacePath(input?: string): string {
  if (input) {
    if (!path.isAbsolute(input)) {
      return path.resolve(process.cwd(), input);
    }
    return fs.realpathSync(input);
  }
  return process.cwd();
}

export interface InitResult {
  ok: true;
  nosDir: string;
}
export type InitError =
  | { ok: false; error: 'already_exists'; nosDir: string }
  | { ok: false; error: 'template_not_found' }
  | { ok: false; error: string };

export function initWorkspace(workspacePath: string, templatesRoot: string): InitResult | InitError {
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

export interface UpdateResult {
  ok: true;
  added: string[];
}
export type UpdateError =
  | { ok: false; error: string }
  | { ok: false; error: 'workspace_not_found'; nosDir: string };

export interface UpdateWorkspaceOptions {
  workspacePath: string;
  templatesRoot: string;
  force?: boolean;
  dryRun?: boolean;
}

export function updateWorkspace(options: UpdateWorkspaceOptions): UpdateResult | UpdateError {
  const { workspacePath, templatesRoot, force = false, dryRun = false } = options;
  const nosDir = path.join(workspacePath, '.nos');

  if (!fs.existsSync(nosDir)) {
    return { ok: false, error: 'workspace_not_found', nosDir };
  }

  const src = templatesRoot;
  if (!fs.existsSync(src)) {
    return { ok: false, error: 'template_not_found' };
  }

  const added: string[] = [];

  function visit(srcDir: string, destDir: string): void {
    fs.mkdirSync(destDir, { recursive: true });

    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (entry.isDirectory()) {
        visit(srcPath, destPath);
      } else if (entry.isFile()) {
        const fileName = entry.name;

        if (fileName === 'system-prompt.md' && !force) {
          continue;
        }

        if (!fs.existsSync(destPath)) {
          if (dryRun) {
            added.push(path.relative(workspacePath, destPath));
          } else {
            fs.copyFileSync(srcPath, destPath);
            added.push(path.relative(workspacePath, destPath));
          }
        }
      }
    }
  }

  visit(src, nosDir);

  ensureActivityFiles(nosDir);

  return { ok: true, added };
}

function copyDirRecursive(src: string, dest: string): void {
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

function ensureActivityFiles(nosDir: string): void {
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

export function listTemplateFiles(templatesRoot: string, baseDir?: string): string[] {
  const files: string[] = [];
  const root = baseDir ?? templatesRoot;

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
