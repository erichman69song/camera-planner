import assert from 'node:assert/strict';
import test from 'node:test';
import { handleLLMRequest } from '../server/llm-proxy.mjs';
const fakeKey = 'test-local-not-a-real-key';
const payload = { model: 'deepseek-flash', messages: [{ role: 'user', content: '编辑场景' }], tools: [] };
const request = (body = payload, headers = {}) => new Request('https://example.invalid/api/llm/chat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${fakeKey}`, ...headers }, body: JSON.stringify(body) });

test('relay only forwards the fixed DeepSeek endpoint and allowed request fields', async () => {
  let target, received;
  const response = await handleLLMRequest(request({ ...payload, apiKey: 'never-forward', baseUrl: 'http://localhost/private', stream: false }), { fetchImpl: async (url, options) => { target = url; received = JSON.parse(options.body); assert.equal(options.headers.authorization, `Bearer ${fakeKey}`); assert.equal(options.redirect, 'error'); return Response.json({ choices: [{ message: { role: 'assistant', content: '完成' }, finish_reason: 'stop' }], usage: { total_tokens: 1 }, provider_request_headers: { secret: 'not-forwarded' } }); } });
  assert.equal(response.status, 200); assert.equal(target, 'https://api.deepseek.com/chat/completions');
  assert.equal(received.apiKey, undefined); assert.equal(received.baseUrl, undefined); assert.equal(received.thinking.type, 'disabled');
  assert.equal((await response.json()).provider_request_headers, undefined);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('rejects missing keys, cross-site requests and malformed inputs before network', async () => {
  const never = async () => { throw new Error('network must not be called'); };
  assert.equal((await handleLLMRequest(request(payload, { authorization: '' }), { fetchImpl: never })).status, 401);
  assert.equal((await handleLLMRequest(request(payload, { origin: 'https://other.invalid' }), { fetchImpl: never })).status, 403);
  assert.equal((await handleLLMRequest(request({ ...payload, model: 'unverified-model' }), { fetchImpl: never })).status, 400);
  assert.equal((await handleLLMRequest(request({ ...payload, tools: [{ type: 'shell' }] }), { fetchImpl: never })).status, 400);
  assert.equal((await handleLLMRequest(request(payload, { 'content-length': String(13 * 1024 * 1024) }), { fetchImpl: never })).status, 413);
});
test('provider errors cannot echo keys or request bodies to the page', async () => {
  for (const status of [401, 402, 429, 500]) {
    const response = await handleLLMRequest(request(), { fetchImpl: async () => new Response(`secret=${fakeKey}`, { status }) });
    assert.doesNotMatch(await response.text(), new RegExp(fakeKey));
    assert.equal(response.status, status === 500 ? 502 : status);
  }
});
test('relay cancels a bounded slow provider and returns a safe timeout message', async () => {
  const response = await handleLLMRequest(request(), { timeoutMs: 5, fetchImpl: async (_url, { signal }) => await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  assert.equal(response.status, 504); assert.match((await response.json()).error, /取消或超时/);
});
test('malformed provider completion is not treated as success', async () => {
  const response = await handleLLMRequest(request(), { fetchImpl: async () => Response.json({ choices: [] }) });
  assert.equal(response.status, 502);
});
