/** Validated, transactional access to the same entity actions used by the editor. */
import { entityEntries, entityFor, makeEntity, applyEntityPatch, removeEntity } from './workspace-state.mjs';

const clone = value => structuredClone(value);
const TYPES = ['camera', 'object', 'actor', 'light', 'modifier'];
const REMOVE_TYPES = ['object', 'actor', 'light', 'modifier'];
const PRIMITIVES = ['box', 'sphere', 'cylinder'];
const MAX_ENTITIES = 500;
const MAX_CALLS = 160;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const fields = {
  camera: ['name', 'position', 'rotation', 'color', 'focal', 'sensorW', 'sensorH', 'fstop', 'focusDist'],
  object: ['name', 'position', 'rotation', 'scale', 'color'],
  actor: ['name', 'position', 'rotation', 'scale', 'color', 'height'],
  light: ['name', 'position', 'rotation', 'scale', 'color', 'intensity', 'distance', 'enabled'],
  modifier: ['name', 'position', 'rotation', 'scale', 'color', 'transmission', 'diffusion', 'enabled'],
};
const xyz = { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } }, additionalProperties: false };
const rotationSchema = { type: 'object', properties: { pitch: { type: 'number' }, yaw: { type: 'number' }, roll: { type: 'number' } }, additionalProperties: false, description: 'Degrees, intrinsic YXZ; pitch X, yaw Y, roll Z. Camera looks along local -Z.' };
const colorSchema = { anyOf: [{ type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, { type: 'integer', minimum: 0, maximum: 16777215 }] };
const positive = { type: 'number', exclusiveMinimum: 0 };
const patchSchema = { type: 'object', additionalProperties: false, properties: {
  name: { type: 'string' }, position: xyz, rotation: rotationSchema, scale: xyz, color: colorSchema,
  focal: positive, sensorW: positive, sensorH: positive, fstop: positive, focusDist: positive, height: positive,
  intensity: { type: 'number', minimum: 0 }, distance: positive, enabled: { type: 'boolean' },
  transmission: { type: 'number', minimum: 0, maximum: 1 }, diffusion: { type: 'number', minimum: 0, maximum: 1 },
} };
function tool(name, description, properties, required = []) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } };
}
export const SCENE_TOOL_DEFINITIONS = Object.freeze([
  tool('scene_get_state', 'Read the editable scene: stable IDs, transforms and optics. Coordinates are meters, +Y up, camera -Z, rotations intrinsic YXZ degrees. Actor positions are foot anchors; primitive object positions are centers. Use IDs from this output for edits.', { offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200 } }),
  tool('scene_add_object', 'Add an independently editable primitive object. position is its CENTER in meters, size is full local X/Y/Z dimensions before rotation. A thin box represents a wall or floor; cylinders run along local Y. No existing objects are replaced.', {
    name: { type: 'string' }, primitive: { type: 'string', enum: PRIMITIVES },
    position: { ...xyz, required: ['x', 'y', 'z'] }, size: { ...xyz, required: ['x', 'y', 'z'] }, rotation: rotationSchema, color: colorSchema,
  }, ['name', 'primitive', 'position', 'size']),
  tool('scene_update_entity', 'Update a known entity using its existing editor ID. Only supplied fields change. Scale must stay positive. Camera fields use focal/sensorW/sensorH in millimeters, focusDist in meters, fstop as f-number. Locked entities cannot be changed.', {
    type: { type: 'string', enum: TYPES }, id: { type: 'string' }, patch: patchSchema,
  }, ['type', 'id', 'patch']),
  tool('scene_remove_entity', 'Remove one explicitly identified object, actor, light or modifier. Cameras and their authored motion cannot be removed through this tool. Locked entities cannot be removed.', {
    type: { type: 'string', enum: REMOVE_TYPES }, id: { type: 'string' },
  }, ['type', 'id']),
  tool('scene_set_camera', 'Create a reference camera when id is omitted, or update the named existing camera. Keep existing authored cameras unless the user requested editing them. patch accepts name,position,rotation,color,focal,sensorW,sensorH,fstop,focusDist. Camera position is the optical center; +Y up, local -Z forward; rotations YXZ degrees. Estimate equivalent framing rather than claiming to recover the original lens/aperture.', {
    id: { type: 'string' }, patch: { ...patchSchema, properties: Object.fromEntries(fields.camera.map(key => [key, patchSchema.properties[key]])) },
  }, ['patch']),
  tool('scene_finish', 'Mark the staged layout ready and describe assumptions/uncertainties. This does not apply or publish edits. Do not claim a measured reconstruction percentage or visual comparison that was not performed.', {
    summary: { type: 'string' }, assumptions: { type: 'array', items: { type: 'string' } },
  }, ['summary']),
]);

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label}必须是参数对象`);
  for (const key of Object.keys(value)) if (forbidden.has(key)) throw new Error(`${label}包含无效字段 ${key}`);
  return value;
}
function keys(value, allowed, required, label) {
  record(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label}不支持字段 ${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) throw new Error(`${label}缺少 ${key}`);
}
function text(value, label, maximum = 240) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new Error(`${label}须为 1 到 ${maximum} 个字符`);
  return value.trim();
}
function number(value, label, { min = -1e6, max = 1e6, positive = false, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || positive && value <= 0 || integer && !Number.isInteger(value)) throw new Error(`${label}须为有效${positive ? '正' : ''}${integer ? '整数' : '数值'}`);
  return value;
}
function vector(value, label, { complete = false, positive = false, rotation = false } = {}) {
  const axes = rotation ? ['pitch', 'yaw', 'roll'] : ['x', 'y', 'z'];
  keys(value, axes, complete ? axes : [], label);
  if (!Object.keys(value).length) throw new Error(`${label}不能为空`);
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, number(v, `${label}.${key}`, { positive })]));
}
function color(value) {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return parseInt(value.slice(1), 16);
  return number(value, '颜色', { min: 0, max: 0xffffff, integer: true });
}
function checkPatch(value, type) {
  keys(value, fields[type], [], '修改参数');
  if (!Object.keys(value).length) throw new Error('修改参数不能为空');
  return Object.fromEntries(Object.entries(value).map(([key, v]) => {
    if (key === 'name') return [key, text(v, '名称')];
    if (key === 'position') return [key, vector(v, '位置')];
    if (key === 'rotation') return [key, vector(v, '旋转', { rotation: true })];
    if (key === 'scale') return [key, vector(v, '尺寸', { positive: true })];
    if (key === 'color') return [key, color(v)];
    if (key === 'enabled') {
      if (typeof v !== 'boolean') throw new Error('enabled 须为布尔值');
      return [key, v];
    }
    if (['transmission', 'diffusion'].includes(key)) return [key, number(v, key, { min: 0, max: 1 })];
    return [key, number(v, key, { positive: key !== 'intensity', min: 0 })];
  }));
}
function referenceMetadata(reference) {
  if (reference === undefined || reference === null) return null;
  keys(reference, ['id', 'name', 'width', 'height', 'projection'], ['id'], '参考图信息');
  const result = { id: text(reference.id, '参考图 ID') };
  if (reference.name !== undefined) result.name = text(reference.name, '参考图名称');
  for (const key of ['width', 'height']) if (reference[key] !== undefined) result[key] = number(reference[key], key, { positive: true, integer: true, max: 100000 });
  if (reference.projection !== undefined) {
    if (!['perspective', 'equirectangular180', 'equirectangular360', 'fisheye', 'unknown'].includes(reference.projection)) throw new Error('参考图投影无效');
    result.projection = reference.projection;
  }
  return result;
}
function equal(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
}
const editableEntries = project => entityEntries(project).filter(entry => TYPES.includes(entry.type));
const entityKey = entry => `${entry.type}:${entry.id}`;
function changesBetween(before, after) {
  const previous = new Map(editableEntries(before).map(entry => [entityKey(entry), entry]));
  const next = new Map(editableEntries(after).map(entry => [entityKey(entry), entry]));
  const summary = entry => ({ type: entry.type, id: entry.id, name: typeof entry.entity.name === 'string' ? entry.entity.name.slice(0, 240) : entry.id });
  const added = [...next].filter(([key]) => !previous.has(key)).map(([, entry]) => summary(entry));
  const updated = [...next].filter(([key, entry]) => previous.has(key) && !equal(entry.entity, previous.get(key).entity)).map(([, entry]) => summary(entry));
  const removed = [...previous].filter(([key]) => !next.has(key)).map(([, entry]) => summary(entry));
  return { added, updated, removed, count: added.length + updated.length + removed.length };
}
function publicEntity({ type, id, entity }) {
  const result = { type, id, locked: entity.locked === true };
  for (const key of ['name', 'bodyType']) if (typeof entity[key] === 'string') result[key] = entity[key].slice(0, 240);
  if (typeof entity.type === 'string') result.model = entity.type.slice(0, 80);
  for (const key of ['position', 'rotation', 'scale']) {
    const axes = key === 'rotation' ? ['pitch', 'yaw', 'roll'] : ['x', 'y', 'z'];
    if (entity[key] && typeof entity[key] === 'object') result[key] = Object.fromEntries(axes.filter(axis => typeof entity[key][axis] === 'number' && Number.isFinite(entity[key][axis])).map(axis => [axis, entity[key][axis]]));
  }
  for (const key of fields[type]) {
    if (typeof entity[key] === 'number' && Number.isFinite(entity[key]) || typeof entity[key] === 'boolean') result[key] = entity[key];
  }
  return result;
}
function isLocked(project, entry) {
  const source = project.referenceScene;
  return entry.entity.locked === true || (Array.isArray(source?.lockedEntityIds) && source.lockedEntityIds.includes(entry.id)) ||
    (Array.isArray(source?.source?.entities) && source.source.entities.some(entity => entity.id === entry.id && entity.locked === true));
}
function jsonOutput(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createSceneSession(bridge, { reference, reset = false } = {}) {
  if (typeof bridge?.getState !== 'function' || typeof bridge?.setState !== 'function') throw new Error('缺少场景编辑连接');
  const metadata = referenceMetadata(reference);
  if (typeof reset !== 'boolean') throw new Error('reset 须为布尔值');
  const liveInitial = bridge.getState();
  if (!liveInitial?.project?.scene || !Array.isArray(liveInitial.project.cameras)) throw new Error('当前场景尚未就绪');
  const base = clone(liveInitial.project);
  let state = { ...liveInitial, project: clone(base), snapshot: () => {} };
  if (reset) {
    const previous = state.project;
    state.project = { ...previous, cameras: [], actors: [],
      scene: { ...previous.scene, objects: [], lights: [], modifiers: [] }, path: [],
      storyboard: { ...previous.storyboard, cells: [] },
      timeline: { ...previous.timeline, currentTime: 0, playing: false, keyframes: [] },
      referenceScene: { generatedObjectIds: [], referenceCameraId: null },
    };
  }
  let status = 'active', callCount = 0, finished = false, summary = '', assumptions = [], referenceCameraId = reset ? null : base.referenceScene?.referenceCameraId || null;
  const staged = {
    getState: () => state,
    setState: update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; },
  };
  for (const key of ['Ps', 'Rl', 'assetInfo', 'lightDefaults', 'modifierDefaults']) if (bridge[key] !== undefined) staged[key] = bridge[key];
  if (typeof staged.Ps !== 'function') staged.Ps = (height, focal) => 2 * Math.atan(height / (2 * focal)) * 180 / Math.PI;
  if (typeof staged.Rl !== 'function') staged.Rl = (focal, aperture, focus) => {
    const d = focus * 1000, h = focal ** 2 / (aperture * .03);
    const near = d * h / (h + d - focal) / 1000;
    const far = d >= h + focal ? Infinity : d * h / (h - d + focal) / 1000;
    return { near, far, range: far - near };
  };
  function active() { if (status !== 'active') throw new Error(status === 'committed' ? '这组修改已经应用' : '这组修改已经取消'); }
  function target(type, id) {
    if (!TYPES.includes(type)) throw new Error('不支持的元素类型');
    text(id, '元素 ID');
    const entity = entityFor(state.project, { type, id });
    if (!entity) throw new Error(`找不到元素 ${id}`);
    const entry = { type, id, entity };
    if (isLocked(state.project, entry)) throw new Error(`元素 ${id} 已锁定，不能由模型修改`);
    return entry;
  }
  function getChanges() {
    return { ...changesBetween(base, state.project), referenceCameraId, summary, assumptions: [...assumptions], finished };
  }
  function applyPatch(type, id, patch) {
    target(type, id);
    const updated = applyEntityPatch(staged, { type, id }, patch, { snapshot: false });
    return publicEntity({ type, id, entity: updated });
  }
  function execute(name, args = {}) {
    active();
    if (!SCENE_TOOL_DEFINITIONS.some(tool => tool.function.name === name)) throw new Error(`未知场景工具：${name}`);
    if (++callCount > MAX_CALLS) throw new Error('已达到本次场景工具调用上限');
    const previous = clone(state.project), oldState = state, previousMeta = { finished, summary, assumptions, referenceCameraId };
    try {
      record(args, '工具参数');
      let result;
      if (name === 'scene_get_state') {
        keys(args, ['offset', 'limit'], [], '读取参数');
        const offset = args.offset === undefined ? 0 : number(args.offset, 'offset', { min: 0, max: 1e6, integer: true });
        const limit = args.limit === undefined ? 100 : number(args.limit, 'limit', { min: 1, max: 200, integer: true });
        const entries = editableEntries(state.project);
        result = { coordinateSystem: { lengthUnit: 'm', up: '+Y', cameraForward: '-Z', rotationOrder: 'YXZ', angles: 'degrees', primitiveOrigin: 'center', actorOrigin: 'feet' },
          entities: entries.slice(offset, offset + limit).map(entry => ({ ...publicEntity(entry), locked: isLocked(state.project, entry) })),
          total: entries.length, offset, limit, hasMore: offset + limit < entries.length,
          reference: metadata || (() => { try { return referenceMetadata(state.project.referenceScene?.activeReference); } catch { return null; } })(),
          referenceCameraId, changes: getChanges() };
      } else if (name === 'scene_add_object') {
        keys(args, ['name', 'primitive', 'position', 'size', 'rotation', 'color'], ['name', 'primitive', 'position', 'size'], '创建参数');
        if (!PRIMITIVES.includes(args.primitive)) throw new Error('primitive 须为 box、sphere 或 cylinder');
        const patch = { name: text(args.name, '名称'), position: vector(args.position, '位置', { complete: true }), scale: vector(args.size, '尺寸', { complete: true, positive: true }) };
        if (args.rotation !== undefined) patch.rotation = vector(args.rotation, '旋转', { rotation: true });
        if (args.color !== undefined) patch.color = color(args.color);
        if (editableEntries(state.project).length >= MAX_ENTITIES) throw new Error('本场景的元素数量已达到上限');
        const selection = makeEntity(staged, 'object', args.primitive);
        result = applyPatch('object', selection.id, patch);
      } else if (name === 'scene_update_entity') {
        keys(args, ['type', 'id', 'patch'], ['type', 'id', 'patch'], '修改参数');
        if (!TYPES.includes(args.type)) throw new Error('不支持的元素类型');
        result = applyPatch(args.type, args.id, checkPatch(args.patch, args.type));
      } else if (name === 'scene_remove_entity') {
        keys(args, ['type', 'id'], ['type', 'id'], '删除参数');
        if (!REMOVE_TYPES.includes(args.type)) throw new Error('此工具不能删除摄影机或路径');
        target(args.type, args.id);
        removeEntity(staged, { type: args.type, id: args.id });
        result = { removed: true, type: args.type, id: args.id };
      } else if (name === 'scene_set_camera') {
        keys(args, ['id', 'patch'], ['patch'], '摄影机参数');
        const patch = checkPatch(args.patch, 'camera');
        let id = args.id;
        if (id === undefined) {
          if (editableEntries(state.project).length >= MAX_ENTITIES) throw new Error('本场景的元素数量已达到上限');
          id = makeEntity(staged, 'camera').id;
        }
        result = applyPatch('camera', id, patch);
        referenceCameraId = id;
      } else {
        keys(args, ['summary', 'assumptions'], ['summary'], '完成参数');
        const note = text(args.summary, '摘要', 2000);
        const notes = args.assumptions === undefined ? [] : args.assumptions;
        if (!Array.isArray(notes) || notes.length > 30) throw new Error('推测说明须为最多 30 项的文本列表');
        const normalized = notes.map(value => text(value, '推测说明', 1000));
        summary = note; assumptions = normalized; finished = true;
        result = { ready: true, ...getChanges() };
      }
      if (name !== 'scene_get_state' && name !== 'scene_finish') finished = false;
      return jsonOutput(result);
    } catch (error) {
      state = { ...oldState, project: previous };
      ({ finished, summary, assumptions, referenceCameraId } = previousMeta);
      throw error;
    }
  }
  function commit() {
    active();
    const changes = getChanges();
    if (!changes.count) { status = 'committed'; return { applied: false, ...changes }; }
    if (!equal(bridge.getState().project, base)) throw new Error('场景在生成期间已有手工修改，请保留当前修改并重新生成');
    if (reset && !state.project.cameras.length) throw new Error('新建参考场景需要先创建参考摄影机');
    let next = clone(state.project);
    const createdObjects = changes.added.filter(entry => entry.type === 'object').map(entry => entry.id);
    const previousReference = next.referenceScene && typeof next.referenceScene === 'object' && !Array.isArray(next.referenceScene) ? next.referenceScene : {};
    next.referenceScene = { ...previousReference,
      ...(metadata ? { activeReference: metadata } : {}),
      generatedObjectIds: [...new Set([...(Array.isArray(previousReference.generatedObjectIds) ? previousReference.generatedObjectIds : []), ...createdObjects])].filter(id => next.scene.objects.some(object => object.id === id)),
      referenceCameraId, ...(finished ? { lastSummary: summary, assumptions: [...assumptions] } : {}),
    };
    // Existing derived DOF may legitimately contain Infinity. This is not a
    // model-editable value and is kept exactly as in normal editor actions.
    const selection = changes.added.at(-1) || changes.updated.at(-1) || null;
    const selected = Object.fromEntries(['Camera', 'Actor', 'Object', 'Light', 'Modifier', 'PathPoint'].map(type => [`selected${type}Id`, null]));
    if (selection) selected[`selected${selection.type[0].toUpperCase()}${selection.type.slice(1)}Id`] = selection.id;
    const current = bridge.getState();
    if (typeof current.snapshot === 'function') current.snapshot();
    bridge.setState({ project: next, ...selected });
    status = 'committed';
    return { applied: true, ...changes };
  }
  return { tools: clone(SCENE_TOOL_DEFINITIONS), execute, getProject: () => clone(state.project), getChanges,
    hasChanges: () => getChanges().count > 0, commit,
    discard() { active(); status = 'discarded'; state = { ...state, project: clone(base) }; },
    get status() { return status; } };
}

export function applyToolBatch(bridge, { calls, reference } = {}) {
  if (!Array.isArray(calls) || !calls.length || calls.length > MAX_CALLS) throw new Error('工具调用列表无效');
  const session = createSceneSession(bridge, { reference });
  try {
    const results = calls.map(call => {
      keys(call, ['name', 'arguments'], ['name', 'arguments'], '工具调用');
      return session.execute(call.name, call.arguments);
    });
    return { ...session.commit(), results };
  } catch (error) {
    if (session.status === 'active') session.discard();
    throw error;
  }
}
