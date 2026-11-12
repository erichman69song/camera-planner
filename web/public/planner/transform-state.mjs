export const TRANSFORM_TYPES = Object.freeze(['camera','actor','object','light','modifier','path']);

export function findEntity(project, selection) {
  if (!project || !selection?.id) return null;
  const lists = { camera: project.cameras, actor: project.actors, object: project.scene?.objects, light: project.scene?.lights, modifier: project.scene?.modifiers, path: project.path };
  return lists[selection.type]?.find(entity => entity.id === selection.id) ?? null;
}

export function entityTransform(entity) {
  const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
  return {
    position: Object.fromEntries(['x','y','z'].map(k => [k, finite(entity?.position?.[k], 0)])),
    rotation: Object.fromEntries(['yaw','pitch','roll'].map(k => [k, finite(entity?.rotation?.[k], 0)])),
    scale: Object.fromEntries(['x','y','z'].map(k => [k, finite(entity?.scale?.[k], 1)])),
  };
}

export function transformChanged(a,b,tolerance=1e-7) {
  return ['position','rotation','scale'].some(field => Object.keys(a[field]).some(k => Math.abs(a[field][k]-b[field][k]) > tolerance));
}

export function metadataSelection(object) {
  for(let current=object;current;current=current.parent) {
    const d=current.userData||{};
    for(const [key,type] of [['cameraId','camera'],['actorId','actor'],['objectId','object'],['lightId','light'],['modifierId','modifier'],['pathPointId','path']]) {
      if(d[key])return {type,id:d[key]};
    }
  }
  return null;
}

export const constraintFromKey = (key, plane=false) => {
  const axis=String(key).toUpperCase();
  if(!['X','Y','Z'].includes(axis))return null;
  return plane ? ['X','Y','Z'].filter(k=>k!==axis).join('') : axis;
};

/** Animation keys and their time mapping can change at an unchanged playhead. */
export function playbackChanged(previous,next) {
  if(!previous)return true;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  return previous.timeline?.duration!==next.timeline?.duration||!same(previous.path,next.path)||!same((previous.actors||[]).map(a=>({id:a.id,keyframes:a.keyframes})),(next.actors||[]).map(a=>({id:a.id,keyframes:a.keyframes})));
}
