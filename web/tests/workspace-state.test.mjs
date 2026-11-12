import test from 'node:test';
import assert from 'node:assert/strict';
import { entityEntries, entityFor, selectionFromState, applyEntityPatch, selectEntity, removeEntity, duplicateEntity, makeEntity } from '../public/planner/workspace-state.mjs';

const vector = (x = 0, y = 0, z = 0) => ({ x, y, z });
const rotation = { yaw: 0, pitch: 0, roll: 0 };
const project = () => ({
  version: '4.1',
  cameras: [
    { id: 'cam1', name: 'CAM-01', focal: 50, sensorW: 36, sensorH: 20.25, fstop: 2.8, focusDist: 5, fov: 22.9, dof: { near: 4, far: 6, range: 2 }, height: 1.6, position: vector(0, 1.6, 5), rotation: { ...rotation } },
    { id: 'cam2', name: 'CAM-02', focal: 35, sensorW: 36, sensorH: 20.25, fstop: 4, focusDist: 3, height: 1.6, position: vector(3, 1.6, 5), rotation: { ...rotation } },
  ],
  actors: [{ id: 'act1', name: '人物', height: 1.7, position: vector(), rotation: { ...rotation }, scale: vector(1, 1, 1), keyframes: [{ id: 'ak1', time: 0, position: vector(), rotation: { ...rotation } }] }],
  scene: { objects: [{ id: 'obj1', name: '方块', type: 'box', position: vector(1, .5, 2), rotation: { ...rotation }, scale: vector(1, 1, 1) }], lights: [{ id: 'light1', name: '灯', position: vector(0, 2, 0), rotation: { ...rotation }, scale: vector(1, 1, 1) }], modifiers: [] },
  path: [{ id: 'path1', cameraId: 'cam1', t: .98, position: vector(0, 1, 3), rotation: { ...rotation } }, { id: 'path2', cameraId: 'cam2', t: .2, position: vector(0, 1, 5), rotation: { ...rotation } }],
  storyboard: { grid: '3x3', cells: [{ index: 0, cameraId: 'cam1' }, { index: 1, cameraId: 'cam2' }] },
  timeline: { duration: 10, currentTime: 5, playing: false, keyframes: [{ cameraId: 'cam1' }, { cameraId: 'cam2' }, { actorId: 'act1' }] },
});
function fake(extra = {}) {
  let snapshots = [], updates = 0;
  let state = { project: project(), selectedCameraId: null, selectedActorId: null, selectedObjectId: null, selectedLightId: null, selectedModifierId: null, selectedPathPointId: null, snapshot: () => snapshots.push(structuredClone(state.project)), ...extra };
  const bridge = {
    getState: () => state,
    setState: update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; updates++; },
    Ps: (height, focal) => 2 * Math.atan(height / (2 * focal)) * 180 / Math.PI,
    Rl: (focal, aperture, focus, height) => ({ near: focus - .1, far: focus + .1, range: .2, test: [focal, aperture, height] }),
  };
  return { bridge, snapshots, updates: () => updates };
}

test('entities include every category and selection resolves paths first without stale IDs', () => {
  const { bridge } = fake({ selectedCameraId: 'cam1', selectedPathPointId: 'path1' });
  assert.equal(entityEntries(bridge.getState().project).length, 7);
  assert.deepEqual(selectionFromState(bridge.getState()), { type: 'path', id: 'path1' });
  bridge.setState({ selectedPathPointId: 'deleted' });
  assert.deepEqual(selectionFromState(bridge.getState()), { type: 'camera', id: 'cam1' });
  assert.equal(entityFor(bridge.getState().project, null), null);
  assert.equal(entityFor(bridge.getState().project, { type: 'unknown', id: 'x' }), null);
});

test('selection clears all other categories and invalid selection clears state', () => {
  const { bridge } = fake({ selectedCameraId: 'cam1', selectedActorId: 'act1' });
  selectEntity(bridge, { type: 'object', id: 'obj1' });
  assert.equal(bridge.getState().selectedCameraId, null);
  assert.equal(bridge.getState().selectedActorId, null);
  assert.equal(bridge.getState().selectedObjectId, 'obj1');
  selectEntity(bridge, { type: 'actor', id: 'gone' });
  assert.equal(selectionFromState(bridge.getState()), null);
});

test('partial transforms merge coordinates immutably and take one snapshot', () => {
  const { bridge, snapshots } = fake();
  const original = bridge.getState().project;
  applyEntityPatch(bridge, { type: 'object', id: 'obj1' }, { position: { x: 8 }, rotation: { yaw: 30 } });
  const changed = entityFor(bridge.getState().project, { type: 'object', id: 'obj1' });
  assert.deepEqual(changed.position, vector(8, .5, 2));
  assert.deepEqual(changed.rotation, { yaw: 30, pitch: 0, roll: 0 });
  assert.deepEqual(original.scene.objects[0].position, vector(1, .5, 2));
  assert.equal(bridge.getState().project.cameras, original.cameras);
  assert.equal(snapshots.length, 1);
  applyEntityPatch(bridge, { type: 'object', id: 'obj1' }, { position: { z: 9 } }, { snapshot: false });
  assert.equal(snapshots.length, 1);
});

test('camera optics refresh through bridge and camera height follows moved Y', () => {
  const { bridge, snapshots } = fake();
  applyEntityPatch(bridge, { type: 'camera', id: 'cam1' }, { focal: 85, fstop: 4, position: { y: 2.1 } });
  const camera = bridge.getState().project.cameras[0];
  assert.equal(camera.height, 2.1);
  assert.deepEqual(camera.position, vector(0, 2.1, 5));
  assert.equal(camera.fov, bridge.Ps(20.25, 85));
  assert.deepEqual(camera.dof.test, [85, 4, 20.25]);
  assert.equal(snapshots.length, 1);
});

test('editing one screenplay field preserves all other camera script contents', () => {
  const { bridge, snapshots } = fake();
  const script = { scene: '客厅', shotId: 'S01', description: '人物站在窗边', action: '转身', dialogue: '早上好' };
  bridge.setState(current => ({ project: { ...current.project, cameras: current.project.cameras.map(camera => camera.id === 'cam1' ? { ...camera, script } : camera) } }));
  applyEntityPatch(bridge, { type: 'camera', id: 'cam1' }, { script: { description: '人物向窗外看' } });
  assert.deepEqual(bridge.getState().project.cameras[0].script, { ...script, description: '人物向窗外看' });
  assert.equal(script.description, '人物站在窗边');
  assert.equal(snapshots.length, 1);
});

test('camera removal cascades associated path, storyboard assignment and timeline references once', () => {
  const { bridge, snapshots } = fake({ selectedCameraId: 'cam1', selectedPathPointId: 'path1' });
  const original = bridge.getState().project;
  assert.equal(removeEntity(bridge, { type: 'camera', id: 'cam1' }), true);
  const next = bridge.getState().project;
  assert.deepEqual(next.cameras.map(v => v.id), ['cam2']);
  assert.deepEqual(next.path.map(v => v.id), ['path2']);
  assert.equal(next.storyboard.cells[0].cameraId, undefined);
  assert.equal(next.storyboard.cells[1].cameraId, 'cam2');
  assert.deepEqual(next.timeline.keyframes, [{ cameraId: 'cam2' }, { actorId: 'act1' }]);
  assert.equal(selectionFromState(bridge.getState()), null);
  assert.equal(original.path.length, 2);
  assert.equal(snapshots.length, 1);
  assert.equal(removeEntity(bridge, { type: 'camera', id: 'cam1' }), false);
  assert.equal(snapshots.length, 1);
});

test('duplicating actors clears motion and creates independent nested objects', () => {
  const { bridge, snapshots } = fake();
  const selected = duplicateEntity(bridge, { type: 'actor', id: 'act1' });
  const copy = entityFor(bridge.getState().project, selected), original = bridge.getState().project.actors[0];
  assert.equal(copy.name, '人物 副本');
  assert.deepEqual(copy.position, vector(.6, 0, .6));
  assert.deepEqual(copy.keyframes, []);
  assert.notEqual(copy.rotation, original.rotation);
  copy.rotation.yaw = 40;
  assert.equal(original.rotation.yaw, 0);
  assert.deepEqual(selectionFromState(bridge.getState()), selected);
  assert.equal(snapshots.length, 1);
});

test('camera duplicate does not clone its path and path duplicate clamps normalized time', () => {
  const { bridge, snapshots } = fake();
  const selected = duplicateEntity(bridge, { type: 'camera', id: 'cam1' });
  assert.equal(bridge.getState().project.path.length, 2);
  assert.equal(bridge.getState().project.path.some(v => v.cameraId === selected.id), false);
  const path = duplicateEntity(bridge, { type: 'path', id: 'path1' });
  assert.equal(entityFor(bridge.getState().project, path).t, 1);
  assert.equal(entityFor(bridge.getState().project, path).cameraId, 'cam1');
  assert.equal(snapshots.length, 2);
});

test('new objects use asset base heights without mutating defaults and remain undoable', () => {
  const { bridge, snapshots } = fake();
  bridge.assetInfo = () => ({ name: '软包椅', y: 0, color: 123 });
  const selected = makeEntity(bridge, 'object', 'chair', vector(2, 0, 3));
  const object = entityFor(bridge.getState().project, selected);
  assert.equal(object.name, '软包椅 2');
  assert.deepEqual(object.position, vector(2, 0, 3));
  assert.equal(object.color, 123);
  assert.equal(snapshots.length, 1);
  const defaults = { area: { type: 'area', rotation: { ...rotation }, scale: vector(1, 1, 1), color: 16773338, intensity: 18, distance: 15, enabled: true } };
  bridge.lightDefaults = defaults;
  const lightSelection = makeEntity(bridge, 'light', 'area', vector(1, 0, 2));
  const light = entityFor(bridge.getState().project, lightSelection);
  assert.equal(light.position.y, 2.42);
  light.rotation.yaw = 30;
  assert.equal(defaults.area.rotation.yaw, 0);
  assert.equal(snapshots.length, 2);
});

test('new camera and path share current timeline and preserve camera metadata', () => {
  const { bridge, snapshots } = fake();
  const selected = makeEntity(bridge, 'camera', null, vector(2, 0, 4));
  const camera = entityFor(bridge.getState().project, selected);
  assert.equal(camera.sensorW, 36);
  assert.equal(camera.sensorH, 20.25);
  assert.equal(camera.position.y, 1.6);
  const pathSelection = makeEntity(bridge, 'path', null, vector(0, 1, 2));
  const point = entityFor(bridge.getState().project, pathSelection);
  assert.equal(point.cameraId, camera.id);
  assert.equal(point.t, .5);
  assert.equal(snapshots.length, 2);
});

test('non-finite coordinates and invalid optical values never mutate state or history', () => {
  const { bridge, snapshots } = fake();
  const before = bridge.getState().project;
  assert.throws(() => applyEntityPatch(bridge, { type: 'object', id: 'obj1' }, { position: { x: Infinity } }), /有限/);
  assert.throws(() => applyEntityPatch(bridge, { type: 'camera', id: 'cam1' }, { focal: 0 }), /大于/);
  assert.throws(() => makeEntity(bridge, 'actor', 'adult_male', vector(NaN, 0, 0)), /有限/);
  assert.equal(bridge.getState().project, before);
  assert.equal(snapshots.length, 0);
});
