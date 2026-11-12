import { SHOTS, solve, dof } from './optics.mjs';

const num = (v) => Number(Number(v).toFixed(3));
const positive = (v, label) => { if (!Number.isFinite(v) || v <= 0) throw new Error(`${label}必须大于 0`); return v; };
export function planMotion(r, { type='fixed', duration=5, endDistance=1.5, endFocal=85, angle=90 }={}) {
  if (type === 'fixed' || type === 'custom' || type === 'path') return { type, samples: [], zh:'', en:'' };
  positive(duration, '时长');
  let f1=r.focal, d1=r.distance;
  if (['push','pull','dollyzoom'].includes(type)) d1=positive(endDistance,'结束距离');
  if (type==='push' && d1>=r.distance) throw new Error('推进的结束距离须小于起始距离');
  if (type==='pull' && d1<=r.distance) throw new Error('拉出的结束距离须大于起始距离');
  if (type==='zoom') f1=positive(endFocal,'结束焦段');
  if (type==='dollyzoom') f1=r.focal*d1/r.distance;
  if (d1*1000<=f1) throw new Error('结束距离必须大于镜头焦距');
  const start={timeSeconds:0,focalMm:r.focal,subjectDistanceM:r.distance};
  const end={timeSeconds:duration,focalMm:num(f1),subjectDistanceM:num(d1)};
  let zh='',en='';
  if (['push','pull'].includes(type)) {
    zh=`在 ${duration} 秒内，主体保持静止，相机沿相机与主体构图中心的连线${type==='push'?'向前推进':'向后拉出'}，主体距离从 ${num(r.distance)} m 连续变化至 ${num(d1)} m；全程锁定 ${num(r.focal)} mm 焦段，画面中的主体尺寸随距离变化，镜头持续朝向选定主体。`;
    en=`Over ${duration} seconds, dolly ${type==='push'?'toward':'away from'} the stationary subject from ${num(r.distance)} m to ${num(d1)} m. Hold ${num(r.focal)} mm throughout; subject scale changes with distance. Keep the camera aimed at the selected subject.`;
  } else if(type==='zoom') {
    zh=`在 ${duration} 秒内，机位固定，主体距离保持 ${num(r.distance)} m，焦段从 ${num(r.focal)} mm 连续变为 ${num(f1)} mm，画面中的主体尺寸随焦段变化。`;
    en=`Over ${duration} seconds, keep the camera position fixed at ${num(r.distance)} m from the subject and change focal length continuously from ${num(r.focal)} mm to ${num(f1)} mm. Subject scale changes with focal length.`;
  } else if(type==='dollyzoom') {
    zh=`在 ${duration} 秒内，相机与主体距离从 ${num(r.distance)} m 连续变为 ${num(d1)} m，同时焦段从 ${num(r.focal)} mm 同步变为 ${num(f1)} mm；沿程保持焦段/距离比恒定，近似保持主体画面占比。`;
    en=`Over ${duration} seconds, change subject distance from ${num(r.distance)} m to ${num(d1)} m while synchronously changing focal length from ${num(r.focal)} mm to ${num(f1)} mm. Maintain a constant focal-length-to-distance ratio to approximately preserve subject scale.`;
  } else if(type==='orbit') {
    if(!Number.isFinite(angle)||angle===0||Math.abs(angle)>360) throw new Error('环绕角度须在 −360° 至 360° 之间且不为 0');
    end.orbitAngleDegrees=angle;
    zh=`在 ${duration} 秒内，相机绕选定静止主体水平${angle>0?'顺时针':'逆时针'}环绕 ${Math.abs(angle)}°，半径保持 ${num(r.distance)} m，焦段锁定 ${num(r.focal)} mm，相机持续朝向主体构图中心。`;
    en=`Over ${duration} seconds, orbit the stationary subject horizontally ${angle>0?'clockwise':'counterclockwise'} through ${Math.abs(angle)} degrees, keeping a ${num(r.distance)} m radius and a fixed ${num(r.focal)} mm lens. Continuously aim at the subject framing center.`;
  }
  return {type,duration,samples:[start,end],zh,en,interpolation:'continuous; endpoint plan, not a sampled 3D path'};
}

const aliases = [
  ['大特写',6],['极近特写',6],['特写',5],['中近景',4],['近景',4],['中远景',2],['中景',3],['全景',1],['远景',0],
  ['extreme close-up',6],['extreme close up',6],['medium close-up',4],['medium close up',4],['medium long shot',2],['extreme wide shot',0],['close-up',5],['close up',5],['medium shot',3],['full shot',1],['wide shot',0],
  ['ECU',6],['MCU',4],['MLS',2],['EWS',0],['CU',5],['MS',3],['FS',1],['WS',1],['LS',0],
];
const escaped = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matcher = new RegExp(aliases.map(([s])=>/^[a-z]/i.test(s)?`(?<![a-z])${escaped(s)}(?![a-z])`:escaped(s)).join('|'),'gi');
export function replaceShotWords(text, base, {anchor='focal',aperture=2.8,language='zh'}={}) {
  const matches=[];
  const output=String(text).replace(matcher, (word,offset,original)=>{
    if(word==='全景' && (/(?:180|360)\s*(?:°|度)?\s*$/.test(original.slice(Math.max(0,offset-8),offset)) || /^(?:视频|模型|投影|相机|内容|图像|拼接|摄影|拍摄|格式)/.test(original.slice(offset+word.length))))return word;
    const pair=aliases.find(([s])=>s.toLowerCase()===word.toLowerCase());
    const shot=SHOTS[pair[1]];
    const r=solve({...base,mode:anchor==='focal'?'distance':'focal',shotId:shot.id,coverageRatio:shot.coverageRatio});
    const center=num(base.height*shot.aimRatio);
    matches.push({original:word,focalMm:num(r.focal),distanceM:num(r.distance),aimHeightM:center});
    return language==='en'
      ? `[${num(r.focal)} mm lens on a ${num(r.sensorW)} × ${num(r.sensorH)} mm frame, subject distance ${num(r.distance)} m, f/${aperture}, focus on subject, aim ${center} m above subject base]`
      : `【${num(r.focal)} mm 镜头，画幅 ${num(r.sensorW)}×${num(r.sensorH)} mm，主体距离 ${num(r.distance)} m，f/${aperture}，对焦主体，构图中心距主体底部 ${center} m】`;
  });
  return {text:output,matches};
}

export function describeFocus(r,aperture,focusMode,focusDistance,motion,lang='zh') {
  const distances=motion.samples.length?motion.samples:[{timeSeconds:0,focalMm:r.focal,subjectDistanceM:r.distance}];
  return distances.map(s=>{
    const focus=focusMode==='subject'?s.subjectDistanceM:positive(focusDistance,'对焦距离');
    const range=dof({focal:s.focalMm,aperture,distance:focus});
    return lang==='zh'
      ? `${s.timeSeconds}s：${num(s.focalMm)} mm，主体距离 ${num(s.subjectDistanceM)} m，对焦 ${num(focus)} m，f/${aperture}，估计清晰范围 ${num(range.near)}–${Number.isFinite(range.far)?num(range.far):'∞'} m。`
      : `${s.timeSeconds}s: ${num(s.focalMm)} mm, subject ${num(s.subjectDistanceM)} m away, focus ${num(focus)} m, f/${aperture}, estimated sharp range ${num(range.near)}–${Number.isFinite(range.far)?num(range.far):'infinity'} m.`;
  }).join('\n');
}
