import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export function atomicWriteFile(filePath: string, contents: string): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf-8');
  fs.renameSync(tmp, filePath);
}

export function atomicWriteFileWithDir(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  atomicWriteFile(filePath, contents);
}

export function readYamlFile<T = Record<string, unknown>>(
  filePath: string,
): T | null {
  try {
    const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as T;
  } catch {
    return null;
  }
}

export const META_FILE = 'meta.yml';
export const CONTENT_FILE = 'index.md';
