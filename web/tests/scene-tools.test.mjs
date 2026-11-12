import test from 'node:test';
import assert from 'node:assert/strict';
import { applyToolBatch, createSceneSession, SCENE_TOOL_DEFINITIONS } from '../public/planner/scene-tools.mjs';

const position = (x = 0, y = 0, z = 0) => ({ x, y, z });
const rotation = () => ({ pitch: 0, yaw: 0, roll: 0 });
const project = () => ({
  version: '4.1', name: 'Existing set', custom: { keep: true },
  cameras: [{ id: 'cam1', name: 'CAM-01', position: position(0, 1.6, 5), rotation: rotation(), focal: 50, sensorW: 36, sensorH: 20.25, fstop: 2.8, focusDist: 5, fov: 22, dof: { near: 4, far: Infinity }, height: 1.6 }],
  actors: [{ id: 'actor1', name: 'Existing actor', position: position(), rotation: rotation(), scale: position(1, 1, 1), height: 1.7 }],
  scene: { objects: [{ id: 'object1', name: 'Existing box', type: 'box', position: position(2, .5, 0), rotation: rotation(), scale: position(1, 1, 1), color: 123 }], lights: [], modifiers: [], lighting: { color: 123, intensity: 1.2 } },
  path: [{ id: 'path1', cameraId: 'cam1', t: .5, position: position(0, 1, 3), rotation: rotation() }],
  storyboard: { grid: '3x3', cells: [{ cameraId: 'cam1' }] },
  timeline: { duration: 20, currentTime: 4, playing: true, keyframes: [{ cameraId: 'cam1' }, { actorId: 'actor1' }] },
});
function fake(custom = {}) {
  const snapshots = [];
  let state = { project: project(), selectedObjectId: 'object1', selectedActorId: 'actor1', selectedCameraId: 'cam1', snapshot: () => snapshots.push(structuredClone(state.project)), ...custom };
  let updates = 0;
  const bridge = { getState: () => state, setState: update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; updates++; }, assetInfo: () => ({ y: 77, color: 123 }) };
  return { bridge, snapshots, updates: () => updates };
}
const addArgs = () => ({ name: 'Reference table', primitive: 'box', position: position(-1, .4, -2), size: position(1.6, .8, 1), rotation: { yaw: 20 }, color: '#ffaa00' });

test('tool definitions are complete, JSON serializable and identify camera axes/centers', () => {
  const definitions = JSON.parse(JSON.stringify(SCENE_TOOL_DEFINITIONS));
  assert.equal(definitions.length, 6);
  assert.equal(new Set(definitions.map(tool => tool.function.name)).size, 6);
  assert.ok(definitions.every(tool => tool.type === 'function' && tool.function.parameters.additionalProperties === false));
  assert.match(definitions.find(tool => tool.function.name === 'scene_add_object').function.description, /CENTER/);
});

test('creating a primitive uses absolute center and real actions, stages until one undoable commit', () => {
  const { bridge, snapshots, updates } = fake();
  const before = structuredClone(bridge.getState().project);
  const session = createSceneSession(bridge, { reference: { id: 'ref1', name: 'room.png', width: 1280, height: 720, projection: 'perspective' } });
  const entity = session.execute('scene_add_object', addArgs());
  assert.equal(entity.type, 'object');
  assert.equal(entity.model, 'box');
  assert.deepEqual(entity.position, position(-1, .4, -2));
  assert.deepEqual(entity.scale, position(1.6, .8, 1));
  assert.equal(entity.color, 0xffaa00);
  assert.equal(updates(), 0);
  assert.deepEqual(bridge.getState().project, before);
  session.execute('scene_update_entity', { type: 'object', id: entity.id, patch: { position: { z: -3 } } });
  session.execute('scene_finish', { summary: 'Table layout', assumptions: ['Depth is estimated'] });
  assert.equal(session.getChanges().finished, true);
  const result = session.commit();
  assert.equal(result.applied, true);
  assert.equal(result.count, 1);
  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0], before);
  const next = bridge.getState().project;
  assert.equal(next.scene.objects.length, before.scene.objects.length + 1);
  assert.deepEqual(next.scene.objects[0], before.scene.objects[0]);
  assert.deepEqual(next.path, before.path);
  assert.deepEqual(next.timeline, before.timeline);
  assert.deepEqual(next.referenceScene.activeReference, { id: 'ref1', name: 'room.png', width: 1280, height: 720, projection: 'perspective' });
  assert.deepEqual(next.referenceScene.generatedObjectIds, [entity.id]);
  assert.equal(bridge.getState().selectedObjectId, entity.id);
  assert.equal(bridge.getState().selectedCameraId, null);
  assert.throws(() => session.commit(), /已经应用/);
});

test('new reference camera preserves old cameras and motion, refreshes derived optics', () => {
  const { bridge } = fake();
  const session = createSceneSession(bridge);
  const camera = session.execute('scene_set_camera', { patch: { name: 'Reference camera', position: position(1, 2, 6), rotation: { yaw: 20, pitch: -5 }, focal: 28, fstop: 5.6, focusDist: 6 } });
  assert.deepEqual(camera.position, position(1, 2, 6));
  assert.equal(camera.height, undefined); // state tool exposes optics, editable transforms
  assert.equal(session.getProject().cameras.find(value => value.id === camera.id).height, 2);
  assert.equal(session.getProject().cameras.find(value => value.id === camera.id).fov, 2 * Math.atan(20.25 / 56) * 180 / Math.PI);
  session.commit();
  assert.equal(bridge.getState().project.cameras.length, 2);
  assert.equal(bridge.getState().project.path[0].cameraId, 'cam1');
  assert.equal(bridge.getState().project.referenceScene.referenceCameraId, camera.id);
});

test('invalid tool calls leave both draft and live scene unchanged', () => {
  const { bridge, snapshots } = fake();
  const session = createSceneSession(bridge);
  const before = session.getProject();
  const calls = [
    ['arbitrary_eval', { code: 'anything' }],
    ['scene_add_object', { ...addArgs(), primitive: 'furniture' }],
    ['scene_add_object', { ...addArgs(), size: position(1, 0, 1) }],
    ['scene_add_object', { ...addArgs(), position: position(NaN, 1, 2) }],
    ['scene_add_object', { ...addArgs(), size: position(1, true, 2) }],
    ['scene_add_object', { ...addArgs(), source: 'https://invalid/' }],
    ['scene_update_entity', { type: 'object', id: 'object1', patch: { position: { x: Infinity } } }],
    ['scene_update_entity', { type: 'object', id: 'object1', patch: { id: 'renamed' } }],
    ['scene_update_entity', { type: 'object', id: 'object1', patch: { scale: { x: -1 } } }],
    ['scene_update_entity', { type: 'object', id: 'object1', patch: { focal: 35 } }],
    ['scene_update_entity', { type: 'camera', id: 'cam1', patch: { fstop: 0 } }],
    ['scene_update_entity', { type: 'object', id: 'missing', patch: { name: 'Lost' } }],
    ['scene_remove_entity', { type: 'camera', id: 'cam1' }],
    ['scene_get_state', { limit: 1000 }],
    ['scene_finish', { summary: 'Fine', assumptions: 'not an array' }],
    ['scene_add_object', JSON.parse('{"__proto__":{"polluted":true}}')],
  ];
  for (const [name, args] of calls) {
    assert.throws(() => session.execute(name, args));
    assert.deepEqual(session.getProject(), before, name);
  }
  assert.deepEqual(bridge.getState().project, before);
  assert.equal(snapshots.length, 0);
  assert.equal({}.polluted, undefined);
});

test('batch commits only after every action validates and snapshots once', () => {
  const { bridge, snapshots } = fake();
  const before = structuredClone(bridge.getState().project);
  assert.throws(() => applyToolBatch(bridge, { calls: [
    { name: 'scene_add_object', arguments: addArgs() },
    { name: 'scene_update_entity', arguments: { type: 'object', id: 'missing', patch: { name: 'No' } } },
  ] }));
  assert.deepEqual(bridge.getState().project, before);
  assert.equal(snapshots.length, 0);
  const result = applyToolBatch(bridge, { calls: [
    { name: 'scene_add_object', arguments: addArgs() },
    { name: 'scene_update_entity', arguments: { type: 'object', id: 'object1', patch: { position: { x: 5 } } } },
  ] });
  assert.equal(result.count, 2);
  assert.equal(snapshots.length, 1);
});

test('concurrent manual changes cannot be overwritten by a staged model draft', () => {
  const { bridge, snapshots } = fake();
  const session = createSceneSession(bridge);
  session.execute('scene_add_object', addArgs());
  bridge.setState(current => ({ project: { ...current.project, name: 'Manual adjustment' } }));
  const manual = structuredClone(bridge.getState().project);
  assert.throws(() => session.commit(), /手工修改/);
  assert.deepEqual(bridge.getState().project, manual);
  assert.equal(snapshots.length, 0);
});

test('locked objects cannot be changed or removed through any model path', () => {
  for (const mode of ['entity', 'ids', 'source']) {
    const { bridge } = fake();
    const source = bridge.getState().project;
    if (mode === 'entity') source.scene.objects[0].locked = true;
    if (mode === 'ids') source.referenceScene = { lockedEntityIds: ['object1'] };
    if (mode === 'source') source.referenceScene = { source: { entities: [{ id: 'object1', locked: true }] } };
    const session = createSceneSession(bridge);
    assert.equal(session.execute('scene_get_state').entities.find(value => value.id === 'object1').locked, true);
    assert.throws(() => session.execute('scene_update_entity', { type: 'object', id: 'object1', patch: { position: { x: 1 } } }), /锁定/);
    assert.throws(() => session.execute('scene_remove_entity', { type: 'object', id: 'object1' }), /锁定/);
    assert.equal(session.hasChanges(), false);
  }
});

test('state context is paginated, serializable and excludes arbitrary metadata or secrets', () => {
  const { bridge } = fake();
  const source = bridge.getState().project;
  source.api_key = 'hidden'; source.scene.objects[0].api_key = 'hidden'; source.cameras[0].script = { private: 'hidden' };
  source.referenceScene = { activeReference: { id: 'reference', api_key: 'hidden' } };
  const session = createSceneSession(bridge);
  const result = session.execute('scene_get_state', { limit: 1, offset: 0 });
  assert.equal(result.entities.length, 1);
  assert.equal(result.total, 3);
  assert.equal(result.hasMore, true);
  assert.equal(result.entities[0].type, 'camera');
  assert.equal(JSON.stringify(result).includes('hidden'), false);
  assert.equal(result.reference, null);
  result.entities[0].position.x = 90;
  assert.equal(session.getProject().cameras[0].position.x, 0);
});

test('discard and metadata-only finish make no live edits or undo records', () => {
  const { bridge, snapshots } = fake();
  const session = createSceneSession(bridge);
  session.execute('scene_add_object', addArgs());
  session.discard();
  assert.equal(session.status, 'discarded');
  assert.throws(() => session.execute('scene_get_state'), /取消/);
  assert.equal(bridge.getState().project.scene.objects.length, 1);
  const empty = createSceneSession(bridge);
  empty.execute('scene_finish', { summary: 'No changes' });
  assert.equal(empty.commit().applied, false);
  assert.equal(snapshots.length, 0);
});

test('ordinary staged edits preserve previous reference evidence and object lists', () => {
  const { bridge } = fake();
  bridge.getState().project.referenceScene = { lastSummary: 'Previous observed layout', assumptions: ['Hidden part inferred'], generatedObjectIds: ['object1'], opaque: { preserve: true } };
  const session = createSceneSession(bridge);
  session.execute('scene_update_entity', { type: 'object', id: 'object1', patch: { position: { z: 3 } } });
  session.commit();
  const metadata = bridge.getState().project.referenceScene;
  assert.equal(metadata.lastSummary, 'Previous observed layout');
  assert.deepEqual(metadata.assumptions, ['Hidden part inferred']);
  assert.deepEqual(metadata.opaque, { preserve: true });
  assert.deepEqual(metadata.generatedObjectIds, ['object1']);
});

test('explicit reset stages a clean new scene, cancel preserves original and apply is one undo', () => {
  const { bridge, snapshots } = fake();
  const before = structuredClone(bridge.getState().project);
  const cancelled = createSceneSession(bridge, { reset: true });
  assert.equal(cancelled.getProject().scene.objects.length, 0);
  assert.equal(cancelled.getProject().cameras.length, 0);
  assert.equal(cancelled.getProject().timeline.currentTime, 0);
  assert.deepEqual(cancelled.getProject().scene.lighting, before.scene.lighting);
  cancelled.discard();
  assert.deepEqual(bridge.getState().project, before);
  const session = createSceneSession(bridge, { reset: true });
  session.execute('scene_add_object', addArgs());
  assert.throws(() => session.commit(), /参考摄影机/);
  assert.equal(snapshots.length, 0);
  session.execute('scene_set_camera', { patch: { name: 'Reference camera', position: position(0, 1.6, 5) } });
  const result = session.commit();
  assert.equal(result.applied, true);
  assert.equal(snapshots.length, 1);
  assert.deepEqual(snapshots[0], before);
  const next = bridge.getState().project;
  assert.equal(next.scene.objects.length, 1);
  assert.equal(next.cameras.length, 1);
  assert.equal(next.actors.length, 0);
  assert.equal(next.path.length, 0);
  assert.equal(next.timeline.duration, 20);
  assert.deepEqual(next.timeline.keyframes, []);
  assert.deepEqual(next.storyboard.cells, []);
  assert.deepEqual(next.custom, { keep: true });
});
