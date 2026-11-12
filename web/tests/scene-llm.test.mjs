import test from 'node:test';
import assert from 'node:assert/strict';
import { runSceneAgent, SceneAgentError } from '../public/planner/scene-llm.mjs';
import { createSceneSession } from '../public/planner/scene-tools.mjs';

const key = 'test-key-only-memory-123';
const image = { dataUrl: 'data:image/png;base64,aGVsbG8=', width: 1280, height: 720, name: 'reference.png', projection: 'perspective' };
const tool = name => ({ type: 'function', function: { name, description: name, parameters: { type: 'object', properties: {}, additionalProperties: true } } });
const call = (id, name, args = {}) => ({ id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
const completion = (message, finish_reason = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason, message: { role: 'assistant', ...message } }] }), { status: 200 });
function fakeSession() {
  const executions = [];
  let count = 0, finished = false, commits = 0, discards = 0;
  return {
    tools: ['scene_get_state', 'scene_add_object', 'scene_finish'].map(tool), executions,
    execute(name, args) {
      executions.push([name, args]);
      if (name === 'scene_get_state') return { entities: [], counts: { objects: 0 } };
      if (name === 'scene_add_object') {
        if (args.fail) throw new Error('invalid dimensions');
        count++; return { id: `object-${count}`, name: args.name || 'box' };
      }
      if (name === 'scene_finish') { finished = true; return { ready: true }; }
      throw new Error('unknown tool');
    },
    getChanges: () => ({ count, finished, added: [], updated: [], removed: [], summary: 'draft changes', assumptions: [] }),
    commit: () => { commits++; }, discard: () => { discards++; },
    mutations: () => ({ commits, discards }),
  };
}
function requestsWith(responses) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options, payload: JSON.parse(options.body) });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected fetch');
    return typeof next === 'function' ? next(url, options) : next;
  };
  return { fetchImpl, requests };
}
const options = (session, fetchImpl, extra = {}) => ({ session, fetchImpl, apiKey: key, instruction: '桌子在门前方，搭建可编辑草模。', ...extra });

test('runs draft tools over multiple rounds and preserves reasoning fields without auto-commit', async () => {
  const session = fakeSession(), progress = [];
  const { fetchImpl, requests } = requestsWith([
    completion({ content: null, reasoning_content: 'private provider reasoning', tool_calls: [call('t1', 'scene_add_object', { name: 'table' })] }, 'tool_calls'),
    completion({ content: null, tool_calls: [call('t2', 'scene_finish', { summary: '完成', assumptions: ['尺度待确认'] })] }, 'tool_calls'),
    completion({ content: '已生成桌子草稿；尺寸为估计值。' }),
  ]);
  const result = await runSceneAgent(options(session, fetchImpl, { onProgress: value => progress.push(value) }));
  assert.equal(result.rounds, 3); assert.equal(result.toolCalls, 2); assert.equal(result.changes.count, 1);
  assert.deepEqual(session.mutations(), { commits: 0, discards: 0 });
  assert.deepEqual(session.executions[0], ['scene_get_state', { offset: 0, limit: 100 }]);
  assert.equal(requests[0].url, '/api/llm/chat');
  assert.equal(requests[0].options.headers.authorization, `Bearer ${key}`);
  assert.equal(requests[0].options.cache, 'no-store');
  assert.deepEqual(requests[0].payload.thinking, { type: 'disabled' });
  assert.equal(requests[2].payload.messages.find(m => m.reasoning_content)?.reasoning_content, 'private provider reasoning');
  assert.equal(requests[1].payload.messages.at(-1).tool_call_id, 't1');
  assert.equal(progress.at(-1).stage, 'complete');
  assert.ok(!JSON.stringify(progress).includes(key));
  assert.ok(!requests.some(r => JSON.stringify(r.payload).includes(key)));
});

test('sends original and comparison as distinct actual image parts only to vision model', async () => {
  const session = fakeSession();
  const { fetchImpl, requests } = requestsWith([completion({ content: '无需改动。' })]);
  await runSceneAgent(options(session, fetchImpl, { referenceImage: image, comparisonImage: { ...image, name: undefined, cameraId: 'cam-1' }, mode: 'correct' }));
  const content = requests[0].payload.messages[1].content;
  assert.equal(content.filter(p => p.type === 'image_url').length, 2);
  assert.match(content[1].text, /ORIGINAL REFERENCE/);
  assert.match(content[3].text, /CURRENT CAMERA RENDER/);
  assert.match(requests[0].payload.messages[0].content, /local correction/);
  assert.equal(content[2].image_url.url, image.dataUrl);
  await assert.rejects(runSceneAgent(options(fakeSession(), fetchImpl, { model: 'deepseek-v4-pro', referenceImage: image })), e => e.code === 'vision');
  assert.equal(requests.length, 1);
});

test('supports explicit text-only model without inventing image observations', async () => {
  const { fetchImpl, requests } = requestsWith([completion({ content: '按描述整理。' })]);
  await runSceneAgent(options(fakeSession(), fetchImpl, { model: 'deepseek-v4-pro' }));
  assert.equal(requests[0].payload.model, 'deepseek-v4-pro');
  assert.match(requests[0].payload.messages[0].content, /No original image is attached/);
  assert.equal(typeof requests[0].payload.messages[1].content, 'string');
});

test('malformed arguments, unknown tools and runtime validation errors are fed back without execution', async () => {
  const session = fakeSession();
  const { fetchImpl, requests } = requestsWith([
    completion({ tool_calls: [call('x1', 'scene_add_object', '{broken'), call('x2', 'shell_exec', { command: 'no' }), call('x3', 'scene_add_object', { fail: true })] }, 'tool_calls'),
    completion({ content: '参数错误，未做修改。' }),
  ]);
  const result = await runSceneAgent(options(session, fetchImpl));
  assert.equal(result.changes.count, 0);
  assert.equal(session.executions.filter(([name]) => name === 'shell_exec').length, 0);
  assert.equal(session.executions.filter(([name]) => name === 'scene_add_object').length, 1);
  const toolResults = requests[1].payload.messages.filter(m => m.role === 'tool');
  assert.equal(toolResults.length, 3);
  assert.ok(toolResults.every(m => typeof JSON.parse(m.content).error === 'string'));
});

test('prototype-bearing parameters are rejected before reaching scene tools', async () => {
  const session = fakeSession();
  const { fetchImpl } = requestsWith([
    completion({ tool_calls: [call('p1', 'scene_add_object', '{"__proto__":{"polluted":true}}')] }, 'tool_calls'),
    completion({ content: '参数已拒绝。' }),
  ]);
  await runSceneAgent(options(session, fetchImpl));
  assert.equal(session.executions.length, 1);
  assert.equal({}.polluted, undefined);
});

test('a provider cannot write the entered key into a scene name or reveal it in progress', async () => {
  const session = fakeSession(), progress = [];
  const { fetchImpl, requests } = requestsWith([
    completion({ tool_calls: [call('secret-name', 'scene_add_object', { name: key })] }, 'tool_calls'),
    completion({ content: `Echo ${key}` }),
  ]);
  const result = await runSceneAgent(options(session, fetchImpl, { onProgress: value => progress.push(value) }));
  assert.equal(session.executions.length, 1);
  assert.ok(!result.summary.includes(key));
  assert.ok(!JSON.stringify(progress).includes(key));
  assert.ok(!requests[1].payload.messages.filter(m => m.role === 'tool').some(m => m.content.includes(key)));
});

test('authentication, rate limits and provider payload errors never expose key or raw body', async () => {
  for (const [status, code] of [[401, 'authentication'], [402, 'credits'], [403, 'permission'], [429, 'rate_limit'], [504, 'timeout'], [502, 'service']]) {
    const session = fakeSession();
    const fetchImpl = async () => new Response(JSON.stringify({ error: `Bearer ${key}` }), { status });
    await assert.rejects(runSceneAgent(options(session, fetchImpl)), error => error instanceof SceneAgentError && error.code === code && !error.message.includes(key));
    assert.deepEqual(session.mutations(), { commits: 0, discards: 0 });
  }
  await assert.rejects(runSceneAgent(options(fakeSession(), async () => { throw new Error(`network leaked ${key}`); })), error => error.code === 'network' && !error.message.includes(key));
});

test('rejects truncated, incomplete, malformed and duplicate-call responses before success', async () => {
  const fixtures = [
    [() => completion({ content: 'partial' }, 'length'), 'truncated'],
    [() => completion({ content: 'partial' }, null), 'incomplete'],
    [() => new Response('not json'), 'response'],
    [() => new Response(JSON.stringify({ choices: [] })), 'response'],
    [() => completion({ tool_calls: [call('same', 'scene_finish'), call('same', 'scene_finish')] }, 'tool_calls'), 'response'],
  ];
  for (const [fetchImpl, code] of fixtures) {
    const session = fakeSession();
    await assert.rejects(runSceneAgent(options(session, fetchImpl)), e => e.code === code);
    assert.deepEqual(session.mutations(), { commits: 0, discards: 0 });
  }
});

test('changed draft requires scene_finish followed by complete final response', async () => {
  const session = fakeSession();
  const { fetchImpl } = requestsWith([
    completion({ tool_calls: [call('u1', 'scene_add_object', { name: 'unfinished' })] }, 'tool_calls'),
    completion({ content: '完成了' }),
  ]);
  await assert.rejects(runSceneAgent(options(session, fetchImpl)), e => e.code === 'unfinished');
  assert.equal(session.getChanges().count, 1);
  assert.deepEqual(session.mutations(), { commits: 0, discards: 0 });
});

test('bounded rounds and tool calls stop without applying draft', async () => {
  let id = 0;
  const endless = async () => completion({ tool_calls: [call(`limit-${++id}`, 'scene_finish')] }, 'tool_calls');
  await assert.rejects(runSceneAgent(options(fakeSession(), endless, { maxRounds: 2 })), e => e.code === 'round_limit');
  const session = fakeSession();
  const tooMany = async () => completion({ tool_calls: [call('a', 'scene_add_object'), call('b', 'scene_add_object')] }, 'tool_calls');
  await assert.rejects(runSceneAgent(options(session, tooMany, { maxToolCalls: 1 })), e => e.code === 'tool_limit');
  assert.equal(session.getChanges().count, 0);
});

test('pre-aborted and in-flight requests stop promptly and retain live transaction boundaries', async () => {
  const before = new AbortController(); before.abort();
  let requested = false;
  await assert.rejects(runSceneAgent(options(fakeSession(), async () => { requested = true; }, { signal: before.signal })), e => e.code === 'aborted');
  assert.equal(requested, false);
  const during = new AbortController();
  const session = fakeSession();
  const fetchImpl = async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    during.abort();
  });
  await assert.rejects(runSceneAgent(options(session, fetchImpl, { signal: during.signal })), e => e.code === 'aborted');
  assert.deepEqual(session.mutations(), { commits: 0, discards: 0 });
});

test('request timeout is distinguishable from user cancellation', async () => {
  const fetchImpl = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  await assert.rejects(runSceneAgent(options(fakeSession(), fetchImpl, { requestTimeoutMs: 5 })), e => e.code === 'timeout');
});

test('input validation fails before scene reads or model requests', async () => {
  for (const extra of [{ apiKey: '' }, { apiKey: 'bad\nkey' }, { model: 'unknown' }, { instruction: '' }, { referenceImage: { ...image, width: 0 } }, { referenceImage: { ...image, dataUrl: 'https://example.invalid/private.png' } }, { maxRounds: 0 }]) {
    const session = fakeSession(); let requested = false;
    await assert.rejects(runSceneAgent(options(session, async () => { requested = true; }, extra)), e => e instanceof SceneAgentError);
    assert.equal(requested, false); assert.equal(session.executions.length, 0);
  }
});

test('progress callback failures do not alter successful tool transaction', async () => {
  const { fetchImpl } = requestsWith([completion({ content: '无需修改。' })]);
  const result = await runSceneAgent(options(fakeSession(), fetchImpl, { onProgress: () => { throw new Error('UI callback'); } }));
  assert.equal(result.changes.count, 0);
});

test('real scene tools remain draft-only through LLM completion and apply as one editable transaction', async () => {
  let snapshots = 0;
  let state = { project: {
    version: '4.1', cameras: [{ id: 'cam-real', name: 'Original camera', position: { x: 0, y: 1.6, z: 5 }, rotation: { pitch: 0, yaw: 0, roll: 0 }, sensorW: 36, sensorH: 20.25, focal: 50, fstop: 2.8, focusDist: 5 }],
    actors: [], scene: { objects: [], lights: [], modifiers: [], lighting: { color: 0xffffff, intensity: 1 } },
    path: [], timeline: { duration: 30, currentTime: 0, playing: false, keyframes: [] }, storyboard: { cells: [] },
  }, snapshot: () => { snapshots++; } };
  const bridge = { getState: () => state, setState: update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; } };
  const session = createSceneSession(bridge);
  const { fetchImpl } = requestsWith([
    completion({ tool_calls: [call('real-add', 'scene_add_object', { name: 'Desk proxy', primitive: 'box', position: { x: 0, y: .4, z: -1 }, size: { x: 1.6, y: .8, z: .9 } }), call('real-camera', 'scene_set_camera', { id: 'cam-real', patch: { focal: 35 } })] }, 'tool_calls'),
    completion({ tool_calls: [call('real-finish', 'scene_finish', { summary: '桌子与参考机位已就绪', assumptions: ['深度为假定值'] })] }, 'tool_calls'),
    completion({ content: '请检查桌子和机位草稿。' }),
  ]);
  const result = await runSceneAgent(options(session, fetchImpl));
  assert.equal(result.changes.count, 2);
  assert.equal(state.project.scene.objects.length, 0);
  assert.equal(state.project.cameras[0].focal, 50);
  assert.equal(snapshots, 0);
  session.commit();
  assert.equal(snapshots, 1);
  assert.equal(state.project.scene.objects.length, 1);
  assert.deepEqual(state.project.scene.objects[0].scale, { x: 1.6, y: .8, z: .9 });
  assert.deepEqual(state.project.scene.objects[0].position, { x: 0, y: .4, z: -1 });
  assert.equal(state.project.cameras[0].focal, 35);
});
