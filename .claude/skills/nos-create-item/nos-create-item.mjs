#!/usr/bin/env node
// nos-create-item: create a new workflow item via the NOS HTTP API.

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
  if (!res.ok) return { ok: false, status: res.status, data, text };
  return { ok: true, status: res.status, data, text };
}

async function listWorkflowIds() {
  const r = await httpJson('GET', '/api/workflows');
  if (!r.ok) return [];
  const arr = Array.isArray(r.data) ? r.data : r.data?.workflows ?? [];
  return arr.map((w) => (typeof w === 'string' ? w : w.id)).filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.workflow || typeof args.workflow !== 'string') {
    const ids = await listWorkflowIds();
    die('missing_args', `--workflow <id> is required. Available workflows: ${ids.join(', ') || '(none)'}`);
  }
  if (!args.title || typeof args.title !== 'string' || !args.title.trim()) {
    die('missing_args', '--title <string> is required and must be non-empty.');
  }

  const payload = { title: args.title };
  if (typeof args.body === 'string') payload.body = args.body;
  if (typeof args.stage === 'string') payload.stage = args.stage;

  const res = await httpJson('POST', `/api/workflows/${encodeURIComponent(args.workflow)}/items`, payload);
  if (!res.ok) {
    const msg = res.data?.error ?? res.text ?? `HTTP ${res.status}`;
    if (res.status === 404) {
      const ids = await listWorkflowIds();
      die('workflow_not_found', `Workflow '${args.workflow}' not found. Available: ${ids.join(', ') || '(none)'}`);
    }
    if (res.status === 400 && /stage/i.test(String(msg))) {
      die('invalid_stage', String(msg));
    }
    die('http_error', `HTTP ${res.status}: ${msg}`);
  }
  const id = res.data?.id;
  if (!id) die('http_error', `Server response missing item id: ${res.text}`);
  process.stdout.write(`${id}\n`);
}

main().catch((err) => die('http_error', err?.message ?? String(err)));
