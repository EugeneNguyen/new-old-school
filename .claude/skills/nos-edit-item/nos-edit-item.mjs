#!/usr/bin/env node
// nos-edit-item: update a workflow item's title and/or markdown body.

function die(code, message) {
  process.stderr.write(JSON.stringify({ error: code, message }) + '\n');
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = val;
      i++;
    }
  }
  return out;
}

const baseUrl = (process.env.NOS_BASE_URL ?? 'http://localhost:30128').replace(/\/+$/, '');
const nosActor = process.env.NOS_ACTOR ?? 'agent:claude';

async function httpJson(method, path, body) {
  let res;
  try {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET') headers['x-nos-actor'] = nosActor;
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    die('server_unreachable', `Cannot reach NOS server at ${baseUrl}. Start it with \`npm run dev\`. (${err.message})`);
  }
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data, text };
}

async function listWorkflowIds() {
  const r = await httpJson('GET', '/api/workflows');
  if (!r.ok) return [];
  const arr = Array.isArray(r.data) ? r.data : [];
  return arr.map((w) => (typeof w === 'string' ? w : w.id)).filter(Boolean);
}

function mapNotFound(res, kind) {
  const msg = res.data?.error ?? res.text ?? `HTTP ${res.status}`;
  if (res.status === 404) {
    if (/workflow/i.test(String(msg))) die('workflow_not_found', String(msg));
    if (/item/i.test(String(msg))) die('item_not_found', String(msg));
    die(kind, String(msg));
  }
  die('http_error', `HTTP ${res.status}: ${msg}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workflow || typeof args.workflow !== 'string') {
    const ids = await listWorkflowIds();
    die('missing_args', `--workflow <id> is required. Available: ${ids.join(', ') || '(none)'}`);
  }
  if (!args.item || typeof args.item !== 'string') {
    die('missing_args', '--item <itemId> is required.');
  }

  const hasTitle = typeof args.title === 'string';
  const hasBody = typeof args.body === 'string';
  if (!hasTitle && !hasBody) {
    die('missing_args', 'no fields to update: provide --title and/or --body.');
  }

  const wf = encodeURIComponent(args.workflow);
  const item = encodeURIComponent(args.item);

  if (hasTitle) {
    const res = await httpJson('PATCH', `/api/workflows/${wf}/items/${item}`, { title: args.title });
    if (!res.ok) mapNotFound(res, 'http_error');
  }
  if (hasBody) {
    const res = await httpJson('PUT', `/api/workflows/${wf}/items/${item}/content`, { body: args.body });
    if (!res.ok) mapNotFound(res, 'http_error');
  }
  process.stdout.write('ok\n');
}

main().catch((err) => die('http_error', err?.message ?? String(err)));
