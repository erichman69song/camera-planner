import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

test('repository entry embeds the independent workspace under a relative GitHub Pages path', async () => {
  const html = await readFile(path.join(root, '../index.html'), 'utf8');
  assert.match(html, /<html[^>]*lang="zh-CN"/);
  assert.match(html, /<iframe[^>]*src="\.\/web\/public\/planner\/index\.html"/);
  const source = html.match(/<iframe[^>]*src="([^"]+)"/)[1];
  const served = new URL(source, 'https://example.invalid/camera-planner/');
  assert.equal(served.pathname, '/camera-planner/web/public/planner/index.html');
  await access(path.resolve(root, '..', source));
});

test('built entry and planner styles remain local below an arbitrary hosting subdirectory', async () => {
  const html = await readFile(path.join(dist, 'index.html'), 'utf8');
  assert.match(html, /<title>Camera Planner · 场景摄影工作台<\/title>/);
  assert.match(html, /src="\.\/planner\/index\.html"/);
  assert.doesNotMatch(html, /codex-preview|Starter Project/);
  for (const name of ['index.html', 'planner/index.html']) {
    const source = await readFile(path.join(dist, name), 'utf8');
    const base = new URL(name, 'https://example.invalid/projects/camera/');
    for (const reference of source.matchAll(/(?:src|href)="([^"?#]+)"/g)) {
      const relative = reference[1];
      assert.match(relative, /^\.\//, `${name} must use a relative reference: ${relative}`);
      assert.ok(new URL(relative, base).pathname.startsWith('/projects/camera/'));
      await access(path.resolve(dist, path.dirname(name), relative));
    }
  }
});

test('only the active v6 runtime is packaged and the Three.js license is retained', async () => {
  assert.deepEqual(await readdir(path.join(dist, 'planner/assets')), ['planner-core-v6.js']);
  await access(path.join(dist, 'planner/vendor/TransformControls.mjs'));
  await access(path.join(dist, 'planner/vendor/OctahedronGeometry.mjs'));
  assert.match(await readFile(path.join(dist, 'planner/vendor/THREE-LICENSE.txt'), 'utf8'), /MIT License/);
});

test('static and dynamic relative module imports resolve within the packaged workspace', async () => {
  const files = await readdir(path.join(dist, 'planner'), { recursive: true });
  const modules = files.filter(file => /\.(?:mjs|js)$/.test(file));
  assert.ok(modules.includes('workspace.mjs'));
  assert.ok(modules.includes('lens-planner.mjs'));
  for (const module of modules) {
    const filename = path.join(dist, 'planner', module);
    const source = await readFile(filename, 'utf8');
    const references = [
      ...source.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"](\.{1,2}\/[^'"]+)['"]/g),
      ...source.matchAll(/\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g),
    ];
    for (const reference of references) {
      const resolved = path.resolve(path.dirname(filename), reference[1]);
      assert.ok(resolved.startsWith(`${dist}${path.sep}`), `${module} cannot import outside the package`);
      await access(resolved);
    }
  }
});
