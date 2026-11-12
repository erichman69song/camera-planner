import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { handleLLMRequest } from '../server/llm-proxy.mjs';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const port = Number(process.env.PORT || 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain; charset=utf-8',
};

export function createWorkspaceServer() { return createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
  if (url.pathname === '/api/health') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ ok: true, provider: 'deepseek', keyStorage: 'request-only' }));
    return;
  }
  if (url.pathname === '/api/llm/chat') {
    const controller = new AbortController();
    const abort = () => controller.abort(); request.once('aborted', abort);
    try {
      const result = await handleLLMRequest(new Request(url, {
        method: request.method, headers: request.headers, signal: controller.signal,
        ...(!['GET', 'HEAD'].includes(request.method) ? { body: Readable.toWeb(request), duplex: 'half' } : {}),
      }));
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ error: '模型接口暂时不可用。' })); }
    finally { request.removeListener('aborted', abort); }
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/') {
      response.writeHead(302, { location: './planner/' }).end();
      return;
    }
    let target = path.resolve(publicRoot, `.${pathname}`);
    if (pathname.includes('\0') || !target.startsWith(`${publicRoot}${path.sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
    const content = await readFile(target);
    response.writeHead(200, {
      'content-type': contentTypes[path.extname(target)] || 'application/octet-stream',
      'content-length': content.byteLength,
      'cache-control': 'no-store',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404).end('Not found');
  }
}); }

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createWorkspaceServer().listen(port, '127.0.0.1', () => console.log(`Camera Planner workspace: http://127.0.0.1:${port}/planner/`));
}
