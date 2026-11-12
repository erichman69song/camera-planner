/** Numeric motion references from Camera Planner's existing scene and path data. */
const number = (value, label, positive = false) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive && value <= 0)) {
    throw new Error(`${label}必须是${positive ? '大于零的' : ''}有限数值`);
  }
  return value;
};
const vector = (value, label) => {
  if (!value || typeof value !== 'object') throw new Error(`${label}缺少坐标`);
  return Object.fromEntries(['x', 'y', 'z'].map(k => [k, number(value[k], `${label}.${k}`)]));
};
const rotation = (value, label) => {
  if (!value || typeof value !== 'object') throw new Error(`${label}缺少角度`);
  return Object.fromEntries(['yaw', 'pitch', 'roll'].map(k => [k, number(value[k], `${label}.${k}`)]));
};
const ease = t => {
  t = Math.max(0, Math.min(1, t));
  return t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};
const mixVector = (a, b, t) => Object.fromEntries(['x', 'y', 'z'].map(k => [k, a[k] + (b[k] - a[k]) * t]));
const fmt = n => String(Number(n.toFixed(3)));
const xyz = p => `(${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)})`;
const angles = r => `(${fmt(r.yaw)}, ${fmt(r.pitch)}, ${fmt(r.roll)})`;

function actorPositionAt(actor, keyframes, time) {
  if (!keyframes.length) return vector(actor.position, '主体位置');
  if (keyframes.length === 1 || time <= keyframes[0].time) return { ...keyframes[0].position };
  const last = keyframes.at(-1);
  if (time >= last.time) return { ...last.position };
  const end = keyframes.findIndex(k => k.time >= time);
  const a = keyframes[end - 1], b = keyframes[end];
  return mixVector(a.position, b.position, ease((time - a.time) / (b.time - a.time)));
}

/**
 * Distances are measured from the camera to a height-based composition target.
 * This is a numerical reference; it does not run or alter the 3D animation.
 */
export function exportMotion(project, {
  cameraId,
  actorId,
  aperture,
  focusMode = 'subject',
  projection = 'window',
  aimRatio = .72,
  subjectHeightM,
} = {}) {
  if (!project || !Array.isArray(project.cameras)) throw new Error('项目缺少机位数据');
  const camera = project.cameras.find(c => c.id === cameraId);
  if (!camera) throw new Error('请选择有效机位');
  const actor = (project.actors || []).find(a => a.id === actorId);
  if (!actor) throw new Error('请选择有效主体');
  if (!['subject', 'manual'].includes(focusMode)) throw new Error('对焦策略无效');
  if (!['window', 'perspective'].includes(projection)) throw new Error('投影模式无效');
  number(aimRatio, '取景中心高度比例');
  if (aimRatio < 0 || aimRatio > 1) throw new Error('取景中心高度比例须在 0 到 1 之间');

  const focal = number(camera.focal, '焦段', true);
  const sensorW = number(camera.sensorW, '画幅宽度', true);
  const sensorH = number(camera.sensorH, '画幅高度', true);
  const fstop = number(aperture ?? camera.fstop, '光圈', true);
  const height = subjectHeightM === undefined
    ? number(number(actor.height, '主体高度', true) * number(actor.scale?.y ?? 1, '主体纵向缩放', true), '缩放后的主体高度', true)
    : number(subjectHeightM, '已应用的主体高度', true);
  const manualFocus = focusMode === 'manual' ? number(camera.focusDist, '对焦距离', true) : null;
  if (manualFocus !== null && manualFocus * 1000 <= focal) throw new Error('对焦距离须大于焦段对应的米数');

  const warnings = [];
  const path = (project.path || []).filter(p => p.cameraId === cameraId).map((p, index) => {
    const t = number(p.t, `路径点 ${index + 1} 时间`);
    if (t < 0 || t > 1) throw new Error('路径点时间须在 0 到 1 之间');
    return { t, position: vector(p.position, `路径点 ${index + 1} 位置`), rotation: rotation(p.rotation, `路径点 ${index + 1} 角度`) };
  }).sort((a, b) => a.t - b.t);
  const duration = path.length ? number(project.timeline?.duration, '时间线时长', true) : 0;
  if (path.some((p, i) => i > 0 && p.t === path[i - 1].t)) {
    warnings.push('存在同一时刻的多个路径点；已保留原始点，请检查是否需要瞬间跳变。');
  }
  const actorKeys = (actor.keyframes || []).map((k, index) => ({
    time: number(k.time, `主体关键帧 ${index + 1} 时间`),
    position: vector(k.position, `主体关键帧 ${index + 1} 位置`),
  })).sort((a, b) => a.time - b.time);
  if (actorKeys.some((k, i) => k.time < 0 || (i > 0 && k.time === actorKeys[i - 1].time))) {
    throw new Error('主体关键帧时间须非负且不能重复');
  }

  if (!path.length) {
    warnings.push(camera.movement?.type
      ? `机位的 movement.type「${camera.movement.type}」仅为运镜标签，未记录轨迹；当前导出为固定机位参考。`
      : '该机位没有路径关键帧，当前导出为固定机位参考。');
    path.push({ t: 0, position: vector(camera.position, '机位位置'), rotation: rotation(camera.rotation, '机位角度') });
  } else {
    warnings.push('仅导出已记录的路径参考点；点间坐标及角度按现有预演的 easeInOutCubic 插值，未推断额外弧形轨迹。');
  }
  if (actorKeys.length > 1) warnings.push('主体位置按已有动作关键帧及 easeInOutCubic 插值估算；未模拟骨骼姿态。');
  warnings.push('取景中心按主体高度比例估算；坐姿、弯腰及局部肢体动作可能改变实际对焦点。');
  if (focusMode === 'subject') {
    warnings.push('逐点对焦主体是本次导出的跟焦策略；现有三维预演不会因此自动改变对焦。');
    if (path.length > 1) warnings.push('所列对焦距离仅为参考点数值；沿程应先插值相机与主体位置，再重算两者距离，不能直接插值端点距离。');
  }
  if (projection === 'window') warnings.push('光学参数描述 180° 内容的中心观看窗口；未解算完整半球投影。');

  const samples = path.map(p => {
    const timeSeconds = p.t * duration;
    const base = actorPositionAt(actor, actorKeys, timeSeconds);
    const target = vector({ x: base.x, y: base.y + height * aimRatio, z: base.z }, '主体目标点');
    const subjectDistanceM = number(Math.hypot(p.position.x - target.x, p.position.y - target.y, p.position.z - target.z), '至主体距离', true);
    if (subjectDistanceM * 1000 <= focal) throw new Error(`时间 ${fmt(timeSeconds)} 秒：机位与主体距离须大于焦段对应的米数`);
    return {
      timeSeconds,
      focalMm: focal,
      subjectDistanceM,
      focusDistanceM: focusMode === 'subject' ? subjectDistanceM : manualFocus,
      aperture: fstop,
      position: { ...p.position },
      rotation: { ...p.rotation },
      subjectTarget: target,
    };
  });
  const zh = [
    projection === 'window' ? '180° 内容中心观看窗口的等效镜头参考。' : '直线透视镜头参考。',
    `画幅 ${fmt(sensorW)} × ${fmt(sensorH)} mm；主体高度 ${fmt(height)} m；取景中心为主体基点上方 ${fmt(height * aimRatio)} m。`,
    '坐标单位 m；角度单位 °；旋转顺序 yaw / pitch / roll；沿用原场景坐标系。',
    ...samples.map(s => `t=${fmt(s.timeSeconds)} s：焦段 ${fmt(s.focalMm)} mm，机位 ${xyz(s.position)}，旋转 ${angles(s.rotation)}，主体目标点 ${xyz(s.subjectTarget)}，至主体距离 ${fmt(s.subjectDistanceM)} m，f/${fmt(s.aperture)}，对焦距离 ${fmt(s.focusDistanceM)} m。`),
    focusMode === 'subject' ? '参考时刻对焦主体；相机朝向保持记录角度。' : '保持记录的对焦距离；相机朝向保持记录角度。',
  ];
  const en = [
    projection === 'window' ? 'Equivalent lens reference for the central viewing window of 180-degree content.' : 'Rectilinear perspective lens reference.',
    `Image gate ${fmt(sensorW)} × ${fmt(sensorH)} mm; subject height ${fmt(height)} m; composition target ${fmt(height * aimRatio)} m above the subject base.`,
    'Positions in m; angles in degrees; rotation order yaw / pitch / roll; preserve the original scene coordinate system.',
    ...samples.map(s => `t=${fmt(s.timeSeconds)} s: focal length ${fmt(s.focalMm)} mm; camera ${xyz(s.position)}; rotation ${angles(s.rotation)}; subject target ${xyz(s.subjectTarget)}; subject distance ${fmt(s.subjectDistanceM)} m; f/${fmt(s.aperture)}; focus distance ${fmt(s.focusDistanceM)} m.`),
    focusMode === 'subject' ? 'Focus on the subject at each reference time; preserve recorded camera orientations.' : 'Keep the recorded focus distance and camera orientations.',
  ];
  if (samples.length > 1) {
    zh.push('相机位置、朝向在参考点之间使用 easeInOutCubic 插值；主体位置按其独立动作关键帧以同样缓动插值。保持焦段与光圈固定。');
    en.push('Interpolate camera positions and orientations between reference points using easeInOutCubic. Interpolate subject positions independently on their own action keyframe times using the same easing. Keep focal length and aperture constant.');
    if (focusMode === 'subject') {
      zh.push('沿程持续跟焦：先取得每一时刻插值后的相机位置与主体目标点，再以两者的实时几何距离设置对焦。端点对焦距离仅供参考，不对端点距离作直接插值。');
      en.push('For continuous tracking focus, first interpolate camera and subject target positions at each time, then recompute their Euclidean distance. Endpoint focus distances are references; do not interpolate those distances directly.');
    }
  } else {
    zh.push('保持相机位置、朝向、焦段与光圈固定；本参考没有定义后续相机位移。主体动作由另行提供的动作提示或主体关键帧定义。');
    en.push('Hold camera position, orientation, focal length and aperture fixed; this reference defines no subsequent camera displacement. Subject actions follow separately supplied action instructions or subject keyframes.');
  }
  return {
    schemaVersion: 'camera-planner.numeric-motion.v1',
    cameraId,
    subject: {
      id: actorId, name: actor.name || '', heightM: height, aimRatio,
      basePosition: actorKeys.length ? { ...actorKeys[0].position } : vector(actor.position, '主体位置'),
      positionKeyframes: actorKeys.map(k => ({ timeSeconds: k.time, position: { ...k.position } })),
    },
    projection,
    sensor: { widthMm: sensorW, heightMm: sensorH },
    focusMode,
    units: { time: 's', focalLength: 'mm', distance: 'm', position: 'm', rotation: 'degrees', aperture: 'f-number' },
    interpolation: 'easeInOutCubic',
    focusDistanceRule: focusMode === 'subject'
      ? 'recompute-euclidean-distance-after-camera-and-subject-position-interpolation'
      : 'constant-recorded-focus-distance',
    samples,
    warnings,
    promptZh: zh.join('\n'),
    promptEn: en.join('\n'),
  };
}
