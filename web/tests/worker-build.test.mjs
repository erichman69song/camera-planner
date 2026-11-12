import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('deployed Worker serves embedded editor assets and keyless DeepSeek route safely',async()=>{
  const folder=await mkdtemp(path.join(os.tmpdir(),'camera-worker-test-'));
  try {
    const output=path.join(folder,'worker.mjs');
    execFileSync(process.execPath,[path.join(root,'scripts/build-worker.mjs'),path.join(root,'dist'),output]);
    const code=await readFile(output,'utf8');
    const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const response=await worker.fetch(new Request('https://example.invalid/'));assert.equal(response.status,200);assert.match(await response.text(),/场景摄影工作台/);
    const editor=await worker.fetch(new Request('https://example.invalid/planner/'));assert.equal(editor.status,200);assert.match(await editor.text(),/reference-workspace.css/);
    const module=await worker.fetch(new Request('https://example.invalid/planner/scene-tools.mjs'));assert.match(module.headers.get('content-type'),/javascript/);assert.match(await module.text(),/createSceneSession/);
    const health=await worker.fetch(new Request('https://example.invalid/api/health'));assert.equal((await health.json()).keyStorage,'request-only');
    const missing=await worker.fetch(new Request('https://example.invalid/api/llm/chat',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}));assert.equal(missing.status,401);
    assert.equal((await worker.fetch(new Request('https://example.invalid/missing.js'))).status,404);
  } finally {await rm(folder,{recursive:true,force:true});}
});
