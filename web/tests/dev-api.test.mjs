import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceServer } from '../scripts/dev.mjs';
test('local workspace serves the real editor and a keyless API health check', async () => {
  const server = createWorkspaceServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await fetch(`${base}/planner/`); assert.equal(html.status, 200); assert.match(await html.text(), /planner-core-v6/);
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true, provider: 'deepseek', keyStorage: 'request-only' });
    const missing = await fetch(`${base}/api/llm/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(missing.status, 401); assert.match((await missing.json()).error, /DeepSeek/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
