/** Scene edits shared by the floating workspace and transform controls. */
const TYPES = Object.freeze({
  camera: { collection: 'cameras', selected: 'selectedCameraId', label: '机位' },
  actor: { collection: 'actors', selected: 'selectedActorId', label: '角色' },
  object: { collection: 'objects', selected: 'selectedObjectId', label: '置景', scene: true },
  light: { collection: 'lights', selected: 'selectedLightId', label: '灯具', scene: true },
  modifier: { collection: 'modifiers', selected: 'selectedModifierId', label: '控光设备', scene: true },
  path: { collection: 'path', selected: 'selectedPathPointId', label: '路径点' },
});
const selectionOrder = ['path', 'camera', 'actor', 'object', 'light', 'modifier'];
const vectorFields = { position: ['x', 'y', 'z'], rotation: ['yaw', 'pitch', 'roll'], scale: ['x', 'y', 'z'] };
const positiveFields = new Set(['focal', 'sensorW', 'sensorH', 'fstop', 'focusDist', 'height', 'distance']);
const clone = value => structuredClone(value);
const list = (project, type) => {
  const meta = TYPES[type];
  return meta ? (meta.scene ? project?.scene?.[meta.collection] : project?.[meta.collection]) || [] : [];
};
const selectedFields = selection => Object.fromEntries(Object.entries(TYPES).map(([type, meta]) => [meta.selected, selection?.type === type ? selection.id : null]));
const newId = type => `${type}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`}`;
function finite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${field}必须是有限数值`);
  return value;
}
function checkNumbers(value, prefix = '') {
  if (typeof value === 'number') finite(value, prefix || '参数');
  else if (Array.isArray(value)) value.forEach((v, i) => checkNumbers(v, `${prefix}[${i}]`));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, v]) => checkNumbers(v, prefix ? `${prefix}.${key}` : key));
}
function checkPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('请输入有效的对象参数');
  checkNumbers(patch);
  for (const [key, axes] of Object.entries(vectorFields)) {
    if (patch[key] === undefined) continue;
    if (!patch[key] || typeof patch[key] !== 'object' || Array.isArray(patch[key])) throw new Error(`${key}须为坐标对象`);
    for (const [axis, value] of Object.entries(patch[key])) {
      if (!axes.includes(axis)) throw new Error(`${key}.${axis}不是有效轴向`);
      if (value !== undefined) finite(value, `${key}.${axis}`);
    }
  }
  for (const key of positiveFields) if (patch[key] !== undefined && finite(patch[key], key) <= 0) throw new Error(`${key}必须大于 0`);
  if (patch.intensity !== undefined && finite(patch.intensity, '亮度') < 0) throw new Error('亮度不能小于 0');
  for (const key of ['transmission', 'diffusion', 't']) if (patch[key] !== undefined && (finite(patch[key], key) < 0 || patch[key] > 1)) throw new Error(`${key}须在 0 到 1 之间`);
}
function replaceList(project, type, values) {
  const meta = TYPES[type];
  return meta.scene ? { ...project, scene: { ...project.scene, [meta.collection]: values } } : { ...project, [meta.collection]: values };
}
function commit(bridge, updateProject, { snapshot = true, selection } = {}) {
  const state = bridge.getState();
  if (snapshot && typeof state.snapshot === 'function') state.snapshot();
  bridge.setState(current => ({
    project: updateProject(current.project),
    ...(selection === undefined ? {} : selectedFields(selection)),
  }));
}
function optics(bridge, entity, fresh = false) {
  const result = { ...entity };
  if (typeof bridge.Ps === 'function') result.fov = bridge.Ps(result.sensorH, result.focal);
  else if (fresh) result.fov = 2 * Math.atan(result.sensorH / (2 * result.focal)) * 180 / Math.PI;
  if (typeof bridge.Rl === 'function') result.dof = bridge.Rl(result.focal, result.fstop, result.focusDist, result.sensorH);
  else if (fresh) {
    const d = result.focusDist * 1000, h = result.focal ** 2 / (result.fstop * .03);
    const near = d * h / (h + d - result.focal) / 1000;
    const far = d >= h + result.focal ? Infinity : d * h / (h - d + result.focal) / 1000;
    result.dof = { near, far, range: far - near };
  }
  return result;
}

export function entityEntries(project) {
  return Object.keys(TYPES).flatMap(type => list(project, type).map(entity => ({ type, id: entity.id, entity })));
}
export function entityFor(project, selection) {
  return selection ? list(project, selection.type).find(entity => entity.id === selection.id) || null : null;
}
export function selectionFromState(state) {
  for (const type of selectionOrder) {
    const id = state?.[TYPES[type].selected];
    if (id && entityFor(state.project, { type, id })) return { type, id };
  }
  return null;
}
export function selectEntity(bridge, selection) {
  const valid = selection && entityFor(bridge.getState().project, selection) ? { type: selection.type, id: selection.id } : null;
  bridge.setState(selectedFields(valid));
  return valid;
}

export function applyEntityPatch(bridge, selection, patch, { snapshot = true } = {}) {
  const entity = entityFor(bridge.getState().project, selection);
  if (!entity) return null;
  checkPatch(patch);
  if (patch.id !== undefined && patch.id !== entity.id) throw new Error('对象标识不能更改');
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  let updated = { ...entity, ...clone(defined) };
  for (const key of Object.keys(vectorFields)) if (defined[key]) updated[key] = { ...entity[key], ...Object.fromEntries(Object.entries(defined[key]).filter(([, value]) => value !== undefined)) };
  if (defined.script && typeof defined.script === 'object' && !Array.isArray(defined.script)) updated.script = { ...entity.script, ...clone(defined.script) };
  if (selection.type === 'camera') {
    if (defined.position) updated.height = updated.position.y;
    if (['focal', 'sensorW', 'sensorH', 'fstop', 'focusDist'].some(key => defined[key] !== undefined)) updated = optics(bridge, updated);
  }
  commit(bridge, project => replaceList(project, selection.type, list(project, selection.type).map(value => value.id === selection.id ? updated : value)), { snapshot });
  return updated;
}

export function removeEntity(bridge, selection) {
  const entity = entityFor(bridge.getState().project, selection);
  if (!entity) return false;
  commit(bridge, project => {
    let next = replaceList(project, selection.type, list(project, selection.type).filter(value => value.id !== selection.id));
    if (selection.type === 'camera') {
      next = {
        ...next,
        path: (next.path || []).filter(value => value.cameraId !== selection.id),
        storyboard: next.storyboard ? { ...next.storyboard, cells: (next.storyboard.cells || []).map(cell => cell.cameraId === selection.id ? { ...cell, cameraId: undefined } : cell) } : next.storyboard,
        timeline: next.timeline ? { ...next.timeline, keyframes: (next.timeline.keyframes || []).filter(value => value.cameraId !== selection.id) } : next.timeline,
      };
    } else if (selection.type === 'actor' && next.timeline) {
      next = { ...next, timeline: { ...next.timeline, keyframes: (next.timeline.keyframes || []).filter(value => value.actorId !== selection.id) } };
    }
    return next;
  }, { selection: null });
  return true;
}

export function duplicateEntity(bridge, selection) {
  const entity = entityFor(bridge.getState().project, selection);
  if (!entity) return null;
  const copy = clone(entity);
  copy.id = newId(selection.type);
  copy.name = `${entity.name || TYPES[selection.type].label} 副本`;
  if (copy.position) copy.position = { ...copy.position, x: finite(copy.position.x, '位置 X') + .6, z: finite(copy.position.z, '位置 Z') + .6 };
  if (selection.type === 'actor') copy.keyframes = [];
  if (selection.type === 'path') copy.t = Math.min(1, Math.max(0, finite(copy.t ?? 0, '路径时间') + .05));
  const selected = { type: selection.type, id: copy.id };
  commit(bridge, project => replaceList(project, selection.type, [...list(project, selection.type), copy]), { selection: selected });
  return selected;
}

const fallbackLight = {
  point: { type: 'point', color: 16765347, intensity: 220, distance: 12 },
  area: { type: 'area', color: 16773338, intensity: 18, distance: 15 },
  line: { type: 'line', color: 14281983, intensity: 280, distance: 10 },
};
const fallbackModifier = {
  flag: { type: 'flag', color: 1119255, transmission: 0, diffusion: .05 },
  butterfly: { type: 'butterfly', color: 15920868, transmission: .68, diffusion: .88 },
  blackout: { type: 'blackout', color: 658189, transmission: .01, diffusion: .12 },
};

/** position is a ground/drop anchor; each new model adds its normal base/eye height. */
export function makeEntity(bridge, type, subtype, position = { x: 0, y: 0, z: 0 }) {
  if (!TYPES[type]) throw new Error('请选择有效的对象类型');
  const anchor = { x: 0, y: 0, z: 0, ...position };
  checkPatch({ position: anchor });
  const state = bridge.getState(), project = state.project, count = list(project, type).length + 1;
  const id = newId(type), rotation = { yaw: 0, pitch: 0, roll: 0 }, scale = { x: 1, y: 1, z: 1 };
  let entity;
  if (type === 'camera') {
    entity = optics(bridge, { id, name: `CAM-${String(count).padStart(2, '0')}`, body: 'FF35', focal: 50, sensorW: 36, sensorH: 20.25, fstop: 2.8, focusDist: 5, height: anchor.y + 1.6, color: 6080767, position: { ...anchor, y: anchor.y + 1.6 }, rotation }, true);
  } else if (type === 'actor') {
    const bodyType = ['adult_male', 'adult_female', 'child'].includes(subtype) ? subtype : 'adult_male';
    entity = { id, name: `角色 ${count}`, role: 'principal', bodyType, action: 'stand', height: bodyType === 'child' ? 1.2 : bodyType === 'adult_female' ? 1.65 : 1.7, color: 5164484, position: anchor, rotation, scale, keyframes: [] };
  } else if (type === 'object') {
    const model = subtype || 'box';
    const fallbackY = ['box', 'sphere', 'cone', 'cylinder'].includes(model) ? .5 : model === 'torus' ? .15 : model === 'plane' ? .01 : model === 'prop' ? .18 : 0;
    const info = typeof bridge.assetInfo === 'function' ? bridge.assetInfo(model) || {} : {};
    const offsetY = info.y === undefined ? fallbackY : finite(info.y, '模型底部高度');
    entity = { id, name: `${info.name || model} ${count}`, type: model, color: info.color ?? 8947848, position: { ...anchor, y: anchor.y + offsetY }, rotation: { ...rotation, pitch: model === 'plane' ? -90 : 0 }, scale };
  } else if (type === 'light' || type === 'modifier') {
    const model = subtype || (type === 'light' ? 'area' : 'flag');
    const source = type === 'light' ? bridge.lightDefaults?.[model] || fallbackLight[model] : bridge.modifierDefaults?.[model] || fallbackModifier[model];
    if (!source) throw new Error('请选择有效的灯光或控光模型');
    const labels = { point: '点光源', area: '面光源', line: '线光源', flag: '黑旗', butterfly: '蝶布', blackout: '黑幕' };
    entity = { rotation, scale, enabled: true, ...clone(source), id, name: `${labels[model] || model} ${count}`, position: { ...anchor, y: anchor.y + 2.42 } };
  } else {
    const camera = (project.cameras || []).find(value => value.id === state.selectedCameraId) || project.cameras?.[0];
    if (!camera) throw new Error('添加路径点前请先创建机位');
    const duration = project.timeline?.duration || 1, time = project.timeline?.currentTime || 0;
    entity = { id, name: `路径点 ${count}`, cameraId: camera.id, position: anchor, rotation: { ...camera.rotation }, t: Math.max(0, Math.min(1, time / duration)) };
  }
  // Infinity is a valid derived far-DOF bound; editable entity values stay finite.
  checkNumbers({ ...entity, dof: undefined });
  const selection = { type, id };
  commit(bridge, current => replaceList(current, type, [...list(current, type), entity]), { selection });
  return selection;
}
