import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOTS, solve, dof, buildPrompt } from '../public/planner/optics.mjs';

const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test('three modes are reciprocal for every preset and landscape/portrait frames', () => {
  for (const aspect of [16 / 9, 3 / 2, 9 / 16]) {
    for (const preset of SHOTS) {
      const a = solve({ mode: 'distance', focal: 50, shotId: preset.id, height: 1.7, sensorW: 36, aspect });
      const b = solve({ mode: 'focal', distance: a.distance, shotId: preset.id, height: 1.7, sensorW: 36, aspect });
      const c = solve({ mode: 'shot', focal: a.focal, distance: a.distance, height: 1.7, sensorW: 36, aspect });
      close(b.focal, 50);
      close(c.coverageRatio, preset.coverageRatio);
      assert.equal(c.shot.id, preset.id);
    }
  }
});

test('known geometry: 50mm at 3m covers 1.215m on 36mm-wide 16:9', () => {
  const result = solve({ mode: 'shot', focal: 50, distance: 3, height: 1.7, sensorW: 36, aspect: 16 / 9 });
  close(result.sensorH, 20.25);
  close(result.coverage, 1.215);
  close(result.horizontalFov, 39.597752709049864);
  assert.ok(result.occupancy > 1, 'cropped complete-subject projection can exceed 100%');
});

test('custom coverage solves exactly and uses nearest logarithmic preset', () => {
  const a = solve({ mode: 'distance', focal: 35, height: 2, sensorW: 36, aspect: 2, coverageRatio: 0.6 });
  close(a.distance, 35 * 2 * 0.6 / 18);
  assert.equal(a.shot.id, 'medium');
  const b = solve({ mode: 'focal', distance: a.distance, height: 2, sensorW: 36, aspect: 2, coverageRatio: 0.6 });
  close(b.focal, 35);
});

test('aperture changes depth of field independently from framing', () => {
  const wide = dof({ focal: 50, aperture: 2.8, distance: 3 });
  const stopped = dof({ focal: 50, aperture: 8, distance: 3 });
  close(wide.near, 3000 * 2500 / (2500 + 0.084 * 2950) / 1000);
  close(wide.far, 3000 * 2500 / (2500 - 0.084 * 2950) / 1000);
  assert.ok(stopped.near < wide.near);
  assert.ok(stopped.far > wide.far);
  assert.ok(stopped.range > wide.range);
});

test('hyperfocal gives infinity and half-hyperfocal near limit', () => {
  const setup = { focal: 35, aperture: 8, distance: 3 };
  const h = dof(setup).hyperfocal;
  const atH = dof({ ...setup, distance: h });
  assert.equal(atH.far, Infinity);
  assert.equal(atH.range, Infinity);
  close(atH.near, h / 2);
  assert.ok(Number.isFinite(dof({ ...setup, distance: h - 0.001 }).far));
});

test('invalid numbers and macro-invalid combinations fail with readable errors', () => {
  for (const value of [0, -1, NaN, Infinity, '50']) {
    assert.throws(() => solve({ mode: 'shot', focal: value, distance: 3 }), /必须/);
    assert.throws(() => dof({ focal: 50, aperture: value, distance: 3 }), /必须/);
  }
  assert.throws(() => solve({ mode: 'shot', focal: 50, distance: 0.05 }), /大于焦距/);
  assert.throws(() => solve({ mode: 'focal', distance: 1, coverageRatio: 0.0001 }), /大于焦距/);
  assert.throws(() => solve({ mode: 'distance', focal: 50, shotId: 'missing' }), /有效/);
  assert.throws(() => dof({ focal: 50, aperture: 2.8, distance: 0.03 }), /大于焦距/);
});

test('numeric bilingual prompts omit shot names and preserve user movement text', () => {
  const solution = solve({ mode: 'distance', focal: 50, shotId: 'close-up' });
  const base = buildPrompt({ solution, aperture: 2.8, subject: '演员', projection: 'window' });
  assert.match(base.zh, /全画幅/);
  assert.match(base.zh, /36 × 20.25 mm/);
  assert.match(base.zh, /对焦距离/);
  assert.match(base.en, /full-frame/);
  for (const preset of SHOTS) {
    assert.ok(!base.zh.includes(preset.label), `no Chinese shot term ${preset.label}`);
    assert.ok(!new RegExp(`\\b${preset.code}\\b`).test(base.en), `no English shot code ${preset.code}`);
  }
  const movementText = '  0–3秒：从中景推向特写。\n保持速度。  ';
  const extended = buildPrompt({ ...solution, aperture: 2.8, movementText });
  assert.ok(extended.zh.endsWith(movementText));
  assert.ok(extended.en.endsWith(movementText));
  assert.match(extended.notes, /原文含景别词/);
});

test('different active frame states its full-frame equivalent and focus override', () => {
  const solution = solve({ mode: 'shot', focal: 50, distance: 3, sensorW: 24, aspect: 16 / 9 });
  const prompt = buildPrompt({ ...solution, aperture: 4, focusDistance: 4, projection: 'perspective' });
  assert.match(prompt.zh, /全画幅等效 75 mm/);
  assert.match(prompt.zh, /对焦距离 4 m/);
});

test('composition center accepts both endpoints and rejects values outside finite [0,1]', () => {
  const solution = solve({ mode: 'shot', focal: 50, distance: 3 });
  const base = { ...solution, aperture: 2.8 };
  assert.match(buildPrompt({ ...base, aimRatio: 0 }).zh, /底部 0 m/);
  assert.match(buildPrompt({ ...base, aimRatio: 1 }).zh, /底部 1.7 m/);
  for (const aimRatio of [-0.01, 1.01, NaN, Infinity, '0']) {
    assert.throws(() => buildPrompt({ ...base, aimRatio }), /0 到 1/);
  }
});

test('reference-frame prompts distinguish optical-axis distance from arbitrary 3D distance', () => {
  const solution = solve({ mode: 'shot', focal: 50, distance: 3 });
  const prompt = buildPrompt({ ...solution, aperture: 2.8 });
  assert.match(prompt.zh, /沿光轴至主体基准平面的距离 3 m/);
  assert.match(prompt.zh, /相机保持水平，光学中心与构图中心等高/);
  assert.match(prompt.en, /axial distance/);
  assert.match(prompt.en, /camera is level/);
});
