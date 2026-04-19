import fs from 'fs';
import path from 'path';

export function loadSystemPrompt(projectRoot: string): string | null {
  const filePath = path.join(projectRoot, '.nos', 'system-prompt.md');
  try {
    return fs.readFileSync(filePath, 'utf-8').trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export function saveSystemPrompt(projectRoot: string, content: string): void {
  const filePath = path.join(projectRoot, '.nos', 'system-prompt.md');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function buildAgentPrompt(input: {
  systemPrompt: string | null;
  stagePrompt: string;
  memberPrompt?: string | null;
  title: string;
  body: string | null | undefined;
  comments?: string[] | null;
  workflowId: string;
  itemId: string;
}): string {
  const { systemPrompt, stagePrompt, memberPrompt, title, body, comments, workflowId, itemId } =
    input;
  const bodySection = body ? `\n${body}\n` : '';
  const commentsSection = renderCommentsSection(comments);
  const itemContent = `# ${title}\n${bodySection}${commentsSection}\nworkflowId: ${workflowId}\nitemId: ${itemId}`;

  const parts: string[] = [];
  if (systemPrompt !== null) {
    parts.push(`<system-prompt>\n${systemPrompt}\n</system-prompt>`);
  }
  if (typeof memberPrompt === 'string' && memberPrompt.trim().length > 0) {
    parts.push(`<member-prompt>\n${memberPrompt}\n</member-prompt>`);
  }
  parts.push(`<stage-prompt>\n${stagePrompt}\n</stage-prompt>`);
  parts.push(`<item-content>\n${itemContent}\n</item-content>`);
  return parts.join('\n') + '\n';
}

function renderCommentsSection(comments: string[] | null | undefined): string {
  if (!Array.isArray(comments) || comments.length === 0) return '';
  const entries = comments
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    .map((c) => c.replace(/\s+$/, ''));
  if (entries.length === 0) return '';
  const body = entries.map((c, i) => `### Comment ${i + 1}\n${c}`).join('\n\n');
  return `\n## Comments\n\n${body}\n`;
}
