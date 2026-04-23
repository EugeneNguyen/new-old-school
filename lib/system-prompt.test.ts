import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildAgentPrompt } from './system-prompt.ts';
import type { Comment } from '@/types/workflow';

const BASE = {
  systemPrompt: 'sys',
  stagePrompt: 'stage',
  title: 'Hello',
  body: 'original body',
  workflowId: 'wf',
  itemId: 'it',
};

function makeComment(text: string, author = 'agent'): Comment {
  const now = new Date().toISOString();
  return { text, createdAt: now, updatedAt: now, author };
}

function extractItemContent(prompt: string): string {
  const match = prompt.match(/<item-content>\n([\s\S]*?)\n<\/item-content>/);
  if (!match) throw new Error('no <item-content> block found');
  return match[1];
}

test('no-comments output is unchanged (undefined)', () => {
  const got = buildAgentPrompt({ ...BASE });
  const expected = [
    '<system-prompt>',
    'sys',
    '</system-prompt>',
    '<stage-prompt>',
    'stage',
    '</stage-prompt>',
    '<item-content>',
    '# Hello',
    '',
    'original body',
    '',
    'workflowId: wf',
    'itemId: it',
    '</item-content>',
    '',
  ].join('\n');
  assert.equal(got, expected);
});

test('empty array produces byte-identical output to undefined', () => {
  const baseline = buildAgentPrompt({ ...BASE });
  assert.equal(buildAgentPrompt({ ...BASE, comments: [] }), baseline);
  assert.equal(buildAgentPrompt({ ...BASE, comments: null }), baseline);
});

test('all-blank comments produce byte-identical output to undefined', () => {
  const baseline = buildAgentPrompt({ ...BASE });
  assert.equal(
    buildAgentPrompt({ ...BASE, comments: [makeComment(''), makeComment('   '), makeComment('\n\t\n')] }),
    baseline
  );
});

test('comments render between body and trailing ID lines, numbered from 1', () => {
  const prompt = buildAgentPrompt({
    ...BASE,
    comments: [makeComment('first comment'), makeComment('second comment')],
  });
  const item = extractItemContent(prompt);
  const expected = [
    '# Hello',
    '',
    'original body',
    '',
    '## Comments',
    '',
    '### Comment 1',
    'first comment',
    '',
    '### Comment 2',
    'second comment',
    '',
    'workflowId: wf',
    'itemId: it',
  ].join('\n');
  assert.equal(item, expected);

  const lines = item.split('\n');
  assert.equal(lines[lines.length - 2], 'workflowId: wf');
  assert.equal(lines[lines.length - 1], 'itemId: it');
});

test('blank comments are skipped and do not consume a number', () => {
  const prompt = buildAgentPrompt({
    ...BASE,
    comments: [makeComment('first'), makeComment(''), makeComment('   '), makeComment('second')],
  });
  const item = extractItemContent(prompt);
  assert.ok(item.includes('### Comment 1\nfirst'));
  assert.ok(item.includes('### Comment 2\nsecond'));
  assert.ok(!item.includes('### Comment 3'));
  assert.ok(!item.includes('### Comment 4'));
});

test('multi-line markdown inside a comment is preserved verbatim', () => {
  const complex = [
    '## a heading inside a comment',
    '',
    '```ts',
    'const x = 1;',
    '```',
    '',
    'and a trailing paragraph',
  ].join('\n');
  const prompt = buildAgentPrompt({ ...BASE, comments: [makeComment(complex)] });
  const item = extractItemContent(prompt);
  assert.ok(item.includes(`### Comment 1\n${complex}`));
  const lines = item.split('\n');
  assert.equal(lines[lines.length - 2], 'workflowId: wf');
  assert.equal(lines[lines.length - 1], 'itemId: it');
});

test('comments render even when body is absent', () => {
  const prompt = buildAgentPrompt({
    ...BASE,
    body: undefined,
    comments: [makeComment('only a comment')],
  });
  const item = extractItemContent(prompt);
  const expected = [
    '# Hello',
    '',
    '## Comments',
    '',
    '### Comment 1',
    'only a comment',
    '',
    'workflowId: wf',
    'itemId: it',
  ].join('\n');
  assert.equal(item, expected);
});

test('member prompt block is placed between system-prompt and stage-prompt', () => {
  const prompt = buildAgentPrompt({
    ...BASE,
    memberPrompt: 'act as research bot',
  });
  const sysIdx = prompt.indexOf('<system-prompt>');
  const memberIdx = prompt.indexOf('<member-prompt>');
  const stageIdx = prompt.indexOf('<stage-prompt>');
  const itemIdx = prompt.indexOf('<item-content>');
  assert.ok(sysIdx >= 0 && memberIdx > sysIdx && stageIdx > memberIdx && itemIdx > stageIdx);
  assert.ok(prompt.includes('<member-prompt>\nact as research bot\n</member-prompt>'));
});

test('empty/whitespace member prompt produces byte-identical output to omitted', () => {
  const baseline = buildAgentPrompt({ ...BASE });
  assert.equal(buildAgentPrompt({ ...BASE, memberPrompt: undefined }), baseline);
  assert.equal(buildAgentPrompt({ ...BASE, memberPrompt: '' }), baseline);
  assert.equal(buildAgentPrompt({ ...BASE, memberPrompt: '   \n\t ' }), baseline);
  assert.equal(buildAgentPrompt({ ...BASE, memberPrompt: null }), baseline);
});
