/** Stateless DeepSeek relay. User keys exist only in the current request. */
const MAX_BODY = 12 * 1024 * 1024;
const MAX_RESPONSE = 4 * 1024 * 1024;
const MODEL_NAMES = new Set(['deepseek-flash', 'deepseek-v4-pro']);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
});

async function readBounded(stream, limit, signal) {
  if (!stream) return '';
  const reader = stream.getReader(); const chunks = []; let size = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new Error('aborted');
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RangeError('body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function validPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !MODEL_NAMES.has(body.model)) return false;
  if (body.stream === true || !Array.isArray(body.messages) || !body.messages.length || body.messages.length > 100) return false;
  if (!Array.isArray(body.tools) || body.tools.length > 40) return false;
  for (const message of body.messages) {
    if (!message || !['system', 'user', 'assistant', 'tool'].includes(message.role)) return false;
    if (!(typeof message.content === 'string' || Array.isArray(message.content) || message.content === null || message.content === undefined)) return false;
  }
  for (const tool of body.tools) if (tool?.type !== 'function' || typeof tool.function?.name !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(tool.function.name)) return false;
  return true;
}

export async function handleLLMRequest(request, { fetchImpl = fetch, timeoutMs = 90000 } = {}) {
  if (request.method !== 'POST') return json({ error: '请使用 POST 调用模型接口。' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return json({ error: '不接受跨站模型请求。' }, 403);
  const authorization = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9._-]{8,512}$/.test(authorization)) return json({ error: '请先在页面填写 DeepSeek API Key。' }, 401);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: '需要 JSON 请求。' }, 415);
  const length = Number(request.headers.get('content-length'));
  if (length > MAX_BODY) return json({ error: '请求过大，请缩小参考图片。' }, 413);
  let body;
  try { body = JSON.parse(await readBounded(request.body, MAX_BODY, request.signal)); }
  catch (error) { return json({ error: error instanceof RangeError ? '请求过大，请缩小参考图片。' : '无法读取有效的模型请求。' }, error instanceof RangeError ? 413 : 400); }
  if (!validPayload(body)) return json({ error: '模型、消息或工具定义无效。' }, 400);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  request.signal.addEventListener('abort', onAbort, { once: true });
  if (request.signal.aborted) controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstream = await fetchImpl('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers: { 'authorization': authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ model: body.model, messages: body.messages, tools: body.tools,
        tool_choice: 'auto', stream: false, thinking: { type: 'disabled' }, max_tokens: 8192 }),
      signal: controller.signal, redirect: 'error',
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      const status = [400, 401, 402, 403, 429].includes(upstream.status) ? upstream.status : 502;
      const error = { 400: '模型拒绝了这次请求，请检查模型是否支持图片和工具。', 401: 'DeepSeek 密钥无效或已失效。', 402: 'DeepSeek 账户余额不足。', 403: 'DeepSeek 暂不允许这次调用。', 429: 'DeepSeek 请求频率受限，请稍后重试。' }[status] || 'DeepSeek 暂时无法完成请求。';
      return json({ error }, status);
    }
    const data = JSON.parse(await readBounded(upstream.body, MAX_RESPONSE, controller.signal));
    if (!Array.isArray(data.choices) || !data.choices[0]?.message) return json({ error: '模型未返回有效结果。' }, 502);
    // Return only the completion. Never forward request headers or provider error bodies.
    return json({ choices: data.choices, usage: data.usage || null });
  } catch {
    return json({ error: controller.signal.aborted ? '模型请求已取消或超时。' : '暂时无法连接 DeepSeek，请稍后重试。' }, controller.signal.aborted ? 504 : 502);
  } finally { clearTimeout(timer); request.signal.removeEventListener('abort', onAbort); }
}
