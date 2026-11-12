import assert from 'node:assert/strict';
import test from 'node:test';
import { exportMotion } from '../public/planner/motion.mjs';

const point = (cameraId, t, x = 0, y = 1.224, z = 5) => ({ cameraId, t, position: { x, y, z }, rotation: { yaw: 0, pitch: 0, roll: 0 } });
const scene = () => ({
  cameras: [{ id: 'c1', name: 'A', focal: 50, sensorW: 36, sensorH: 20.25, fstop: 2.8, focusDist: 4, position: { x: 0, y: 1.224, z: 5 }, rotation: { yaw: 0, pitch: 0, roll: 0 }, movement: { type: 'push_in', duration: 3 } }],
  actors: [{ id: 'a1', name: 'A', height: 1.7, scale: { y: 1 }, position: { x: 0, y: 0, z: 0 }, action: 'stand', keyframes: [] }],
  path: [],
  timeline: { duration: 8 },
});
const options = { cameraId: 'c1', actorId: 'a1' };

test('filters and sorts camera points, maps normalized time to seconds', () => {
  const project = scene();
  project.path = [point('other', .1), point('c1', 1, 0, 1.224, 2), point('c1', .25)];
  const result = exportMotion(project, options);
  assert.deepEqual(result.samples.map(s => s.timeSeconds), [2, 8]);
  assert.equal(result.samples[0].subjectDistanceM, 5);
  assert.equal(result.samples[1].subjectDistanceM, 2);
  assert.equal(result.samples[1].focusDistanceM, 2);
  assert.equal(result.samples[0].focalMm, 50);
  assert.match(result.promptZh, /t=8 s/);
  assert.doesNotMatch(result.promptZh + result.promptEn, /景别|近景|中景|全景|close-up|wide shot/i);
});

test('uses original eased actor interpolation and composition target height', () => {
  const project = scene();
  project.path = [point('c1', .25)];
  project.actors[0].keyframes = [
    { time: 0, position: { x: 0, y: 0, z: 0 } },
    { time: 8, position: { x: 8, y: 0, z: 0 } },
  ];
  const result = exportMotion(project, options);
  assert.equal(result.samples[0].subjectTarget.x, .5);
  assert.equal(result.samples[0].subjectTarget.y, 1.224);
  assert.ok(Math.abs(result.samples[0].subjectDistanceM - Math.hypot(.5, 5)) < 1e-12);
});

test('no path remains one static reference; movement tag never fabricates displacement', () => {
  const result = exportMotion(scene(), options);
  assert.equal(result.samples.length, 1);
  assert.equal(result.samples[0].timeSeconds, 0);
  assert.deepEqual(result.samples[0].position, { x: 0, y: 1.224, z: 5 });
  assert.ok(result.warnings.some(w => /仅为运镜标签/.test(w)));
  assert.doesNotMatch(result.promptZh, /push_in/);
  assert.match(result.promptZh, /保持相机位置、朝向、焦段与光圈固定/);
  assert.match(result.promptEn, /Hold camera position/);
});

test('manual focus and independent aperture preserve camera state', () => {
  const project = scene();
  const result = exportMotion(project, { ...options, focusMode: 'manual', aperture: 8 });
  assert.equal(result.samples[0].focusDistanceM, 4);
  assert.equal(result.samples[0].aperture, 8);
  assert.equal(project.cameras[0].fstop, 2.8);
});

test('rejects invalid positions, times, distances and missing selection', () => {
  assert.throws(() => exportMotion(scene(), { ...options, actorId: 'missing' }), /主体/);
  const bad = scene();
  bad.path = [point('c1', Infinity)];
  assert.throws(() => exportMotion(bad, options), /有限/);
  bad.path = [point('c1', 1.1)];
  assert.throws(() => exportMotion(bad, options), /0 到 1/);
  bad.path = [point('c1', 0, NaN)];
  assert.throws(() => exportMotion(bad, options), /有限/);
  bad.path = [point('c1', 0, 0, 1.224, 0)];
  assert.throws(() => exportMotion(bad, options), /距离/);
  assert.throws(() => exportMotion(scene(), { ...options, aperture: 0 }), /光圈/);
  const overflow = scene();
  overflow.actors[0].height = 1e308;
  overflow.actors[0].scale.y = 1e308;
  assert.throws(() => exportMotion(overflow, options), /有限/);
});

test('duplicate path times are retained with warning; duplicate actor times rejected', () => {
  const project = scene();
  project.path = [point('c1', .5), point('c1', .5, 0, 1.224, 4)];
  const result = exportMotion(project, options);
  assert.equal(result.samples.length, 2);
  assert.ok(result.warnings.some(w => /同一时刻/.test(w)));
  project.actors[0].keyframes = [
    { time: 0, position: { x: 0, y: 0, z: 0 } },
    { time: 0, position: { x: 1, y: 0, z: 0 } },
  ];
  assert.throws(() => exportMotion(project, options), /不能重复/);
});

test('continuous focus uses interpolated geometry rather than endpoint distance interpolation', () => {
  const project = scene();
  project.path = [point('c1', 0, -2), point('c1', 1, 2)];
  const result = exportMotion(project, options);
  assert.equal(result.samples[0].focusDistanceM, result.samples[1].focusDistanceM);
  assert.equal(result.focusDistanceRule, 'recompute-euclidean-distance-after-camera-and-subject-position-interpolation');
  assert.match(result.promptZh, /不对端点距离作直接插值/);
  assert.match(result.promptEn, /do not interpolate those distances directly/);
  assert.deepEqual(result.subject.basePosition, { x: 0, y: 0, z: 0 });
});
