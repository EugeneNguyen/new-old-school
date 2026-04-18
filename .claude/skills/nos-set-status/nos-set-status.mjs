#!/usr/bin/env node
// nos-set-status: change a workflow item's status.

const VALID_STATUSES = ['Todo', 'In Progress', 'Done'];

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

async function httpJson(method, path, body) {
  let res;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workflow || typeof args.workflow !== 'string') die('missing_args', '--workflow <id> is required.');
  if (!args.item || typeof args.item !== 'string') die('missing_args', '--item <itemId> is required.');
  if (!args.status || typeof args.status !== 'string') {
    die('missing_args', `--status <value> is required. Valid: ${VALID_STATUSES.join(', ')}`);
  }
  if (!VALID_STATUSES.includes(args.status)) {
    die('invalid_status', `Invalid status '${args.status}'. Valid: ${VALID_STATUSES.join(', ')}`);
  }

  const wf = encodeURIComponent(args.workflow);
  const item = encodeURIComponent(args.item);
  const res = await httpJson('PATCH', `/api/workflows/${wf}/items/${item}`, { status: args.status });
  if (!res.ok) {
    const msg = res.data?.error ?? res.text ?? `HTTP ${res.status}`;
    if (res.status === 404) {
      if (/workflow/i.test(String(msg))) die('workflow_not_found', String(msg));
      die('item_not_found', String(msg));
    }
    die('http_error', `HTTP ${res.status}: ${msg}`);
  }
  process.stdout.write('ok\n');
}

main().catch((err) => die('http_error', err?.message ?? String(err)));
