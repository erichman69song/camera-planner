/**
 * First-order rectilinear framing. Focal/sensor dimensions: mm; subject/distance/DOF: m.
 * distance is object depth along the optical axis to a perpendicular subject plane,
 * not an arbitrary Euclidean distance to the actor base. For an upright subject,
 * the framing preset assumes a level camera at the chosen composition-center height.
 */
export const SHOTS = Object.freeze([
  { id: 'wide', label: '远景', code: 'LS', coverageRatio: 3, aimRatio: 0.5, description: '环境占主导，画面纵向覆盖约三个主体高度。' },
  { id: 'full', label: '全景', code: 'FS', coverageRatio: 1.15, aimRatio: 0.5, description: '容纳完整主体，并保留适量上下空间。' },
  { id: 'medium-long', label: '中远景', code: 'MLS', coverageRatio: 0.8, aimRatio: 0.62, description: '以站立人物为例，约从头部取至膝部附近。' },
  { id: 'medium', label: '中景', code: 'MS', coverageRatio: 0.58, aimRatio: 0.72, description: '以站立人物为例，约呈现上半身。' },
  { id: 'close', label: '近景', code: 'MCU', coverageRatio: 0.35, aimRatio: 0.83, description: '以站立人物为例，突出头肩及胸部。' },
  { id: 'close-up', label: '特写', code: 'CU', coverageRatio: 0.18, aimRatio: 0.92, description: '以站立人物为例，突出面部。' },
  { id: 'extreme-close-up', label: '大特写', code: 'ECU', coverageRatio: 0.08, aimRatio: 0.95, description: '以站立人物为例，呈现局部细节。' },
].map(Object.freeze));

function positive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name}必须是有限的正数。`);
  }
  return value;
}

function unitInterval(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name}必须是 0 到 1 之间的有限数值（含端点）。`);
  }
  return value;
}

function validDistance(distance, focal) {
  positive(distance, '主体距离');
  positive(focal, '焦距');
  if (distance * 1000 <= focal) throw new Error('主体距离（换算为毫米）必须大于焦距；此工具不用于微距。');
}

function nearestShot(ratio) {
  return SHOTS.reduce((nearest, shot) =>
    Math.abs(Math.log(ratio / shot.coverageRatio)) < Math.abs(Math.log(ratio / nearest.coverageRatio)) ? shot : nearest,
  SHOTS[0]);
}

/** Shot presets are editorial conventions. occupancy may exceed 1 for cropped subjects. */
export function solve(config = {}) {
  const { mode = 'shot', height = 1.7, sensorW = 36, aspect = 16 / 9, shotId = 'medium' } = config;
  if (!['shot', 'distance', 'focal'].includes(mode)) throw new Error('请选择有效的计算模式。');
  positive(height, '主体全高');
  positive(sensorW, '有效画幅宽度');
  positive(aspect, '画面宽高比');
  const sensorH = positive(sensorW / aspect, '有效画幅高度');
  let focal = config.focal;
  let distance = config.distance;
  let coverageRatio;
  if (mode === 'shot') {
    validDistance(distance, focal);
    coverageRatio = distance * sensorH / (focal * height);
  } else {
    const selected = SHOTS.find(shot => shot.id === shotId || shot.code === shotId);
    if (config.coverageRatio === undefined && !selected) throw new Error('请选择有效的构图预设，或输入自定义覆盖比例。');
    coverageRatio = config.coverageRatio === undefined ? selected.coverageRatio : positive(config.coverageRatio, '覆盖比例');
    if (mode === 'distance') {
      positive(focal, '焦距');
      distance = focal * height * coverageRatio / sensorH;
    } else {
      positive(distance, '主体距离');
      focal = distance * sensorH / (height * coverageRatio);
    }
    validDistance(distance, focal);
  }
  positive(coverageRatio, '覆盖比例');
  const coverage = positive(coverageRatio * height, '画面纵向覆盖高度');
  const occupancy = positive(1 / coverageRatio, '主体投影占比');
  return {
    focal, distance, sensorW, sensorH, height, coverage, occupancy, shot: nearestShot(coverageRatio),
    verticalFov: 2 * Math.atan(sensorH / (2 * focal)) * 180 / Math.PI,
    horizontalFov: 2 * Math.atan(sensorW / (2 * focal)) * 180 / Math.PI,
    coverageRatio,
  };
}

/** Thin-lens depth of field with an explicit acceptable circle of confusion. */
export function dof({ focal, aperture, distance, coc = 0.03 } = {}) {
  validDistance(distance, focal);
  positive(aperture, '光圈 f 值');
  positive(coc, '弥散圈直径');
  const d = distance * 1000;
  const h0 = positive(focal * focal / (aperture * coc), '超焦距计算结果');
  const hyperfocal = (h0 + focal) / 1000;
  const near = d * h0 / (h0 + d - focal) / 1000;
  const far = d >= h0 + focal ? Infinity : d * h0 / (h0 - d + focal) / 1000;
  return { near, far, range: far - near, hyperfocal };
}

function fmt(value, digits = 2) { return Number(value.toFixed(digits)).toString(); }

/** Returns {zh,en,notes}. Accepts solve() fields directly or under solution/result/solved. */
export function buildPrompt(config = {}) {
  const source = config.solution ?? config.result ?? config.solved ?? config;
  const result = solve({ mode: 'shot', focal: source.focal, distance: source.distance, height: source.height, sensorW: source.sensorW, aspect: source.sensorW / source.sensorH });
  const aperture = positive(config.aperture, '光圈 f 值');
  const focusDistance = config.focusDistance === undefined ? result.distance : positive(config.focusDistance, '对焦距离');
  validDistance(focusDistance, result.focal);
  const aimRatio = unitInterval(config.aimRatio === undefined ? result.shot.aimRatio : config.aimRatio, '构图中心高度比例');
  const subject = typeof config.subject === 'string' && config.subject.trim() ? config.subject.trim() : '人物';
  const projection = config.projection ?? 'window';
  if (!['window', 'perspective'].includes(projection)) throw new Error('请选择有效的投影方式。');
  const depth = dof({ focal: result.focal, aperture, distance: focusDistance });
  const aimHeight = result.height * aimRatio;
  const equivalent = result.focal * 36 / result.sensorW;
  const ratio = result.sensorW / result.sensorH;
  const farZh = depth.far === Infinity ? '无穷远' : `${fmt(depth.far)} m`;
  const farEn = depth.far === Infinity ? 'infinity' : `${fmt(depth.far)} m`;
  const movementText = typeof config.movementText === 'string' ? config.movementText : '';
  const partsZh = [
    projection === 'window' ? '以下数值描述 180°环视内容中的中心观看窗口，使用直线透视等效取景，不代表整个 180°画面的投影参数。' : '使用直线透视投影取景。',
    `以 36 mm 宽全画幅为等效焦距基准；虚拟有效画幅 ${fmt(result.sensorW)} × ${fmt(result.sensorH)} mm，宽高比 ${fmt(ratio, 4)}:1。`,
    `镜头焦距 ${fmt(result.focal)} mm（水平视角对应全画幅等效 ${fmt(equivalent)} mm）；${subject}实际全高 ${fmt(result.height)} m，镜头光学中心沿光轴至主体基准平面的距离 ${fmt(result.distance)} m。`,
    `构图中心对准距主体底部 ${fmt(aimHeight)} m 的位置（全高的 ${fmt(aimRatio * 100)}%）；参考画面中主体竖直，相机保持水平，光学中心与构图中心等高。主体平面处的画面纵向覆盖 ${fmt(result.coverage)} m，完整主体投影高度约为画面高度的 ${fmt(result.occupancy * 100)}%。`,
    `光圈 f/${fmt(aperture)}，对焦距离 ${fmt(focusDistance)} m；按弥散圈 0.03 mm 估算，可接受清晰范围约 ${fmt(depth.near)} m 至${farZh}。焦距、距离、光圈和对焦设定描述参考时刻的固定画面；随后按运镜补充规定的时序变化。`,
  ];
  const partsEn = [
    projection === 'window' ? 'These values describe a rectilinear-equivalent central viewing window within a 180-degree panorama; they are not projection parameters for the entire panorama.' : 'Use rectilinear perspective projection.',
    `Use a 36 mm-wide full-frame reference for equivalent focal length; virtual active frame ${fmt(result.sensorW)} × ${fmt(result.sensorH)} mm, aspect ratio ${fmt(ratio, 4)}:1.`,
    `Lens focal length ${fmt(result.focal)} mm (${fmt(equivalent)} mm full-frame equivalent by horizontal angle of view); subject (${subject}) full physical height ${fmt(result.height)} m; axial distance from the lens optical center to the subject reference plane ${fmt(result.distance)} m.`,
    `Aim the frame center at ${fmt(aimHeight)} m above the subject base (${fmt(aimRatio * 100)}% of full height). In the reference frame, the subject is upright and the camera is level, with its optical center at the same height as the composition target. Vertical frame coverage at the subject plane ${fmt(result.coverage)} m; the complete subject projection is approximately ${fmt(result.occupancy * 100)}% of frame height.`,
    `Aperture f/${fmt(aperture)}, focus distance ${fmt(focusDistance)} m; estimated acceptable sharpness from ${fmt(depth.near)} m to ${farEn}, using a 0.03 mm circle of confusion. Focal length, distance, aperture and focus describe the fixed reference-time frame; subsequent changes follow the timing in the movement supplement.`,
  ];
  if (movementText.trim()) {
    partsZh.push(`运镜补充（原文）：\n${movementText}`);
    partsEn.push(`Movement supplement (verbatim):\n${movementText}`);
  }
  return { zh: partsZh.join('\n'), en: partsEn.join('\n'), notes: movementText.trim() ? '运镜补充保留原文；若原文含景别词，这些词仍会存在。' : '数值采用一阶透视近似；构图预设与景深范围用于提示词参考。' };
}
