import { TransformControls } from './vendor/TransformControls.mjs';
import { findEntity,entityTransform,transformChanged,metadataSelection,constraintFromKey,playbackChanged } from './transform-state.mjs';

const radians=v=>v*Math.PI/180,degrees=v=>v*180/Math.PI,clone=value=>structuredClone(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const structural=entity=>{const result={...entity};delete result.position;delete result.rotation;delete result.scale;delete result.hidden;return result;};

/** Scene-only controller; project data and history remain in the original store. */
export function createSceneController({container,monitorCanvas,bridge,onSelect=()=>{},onHover=()=>{},onModeChange=()=>{},onTransform=()=>{},onTransformStart=()=>{},onTransformEnd=()=>{},onMonitor=()=>{}}) {
  const T=bridge.three;
  const Engine=bridge.SceneEngine||bridge.PM,CameraRig=bridge.CameraRig||bridge.BM,ObjectLibrary=bridge.ObjectLibrary||bridge.FM;
  const ActorRig=bridge.ActorRig||bridge.ZM,LightingSystem=bridge.LightingSystem||bridge.jM,PathSystem=bridge.PathSystem||bridge.WM,Viewfinder=bridge.Viewfinder||bridge.JM;
  const engine=new Engine({container,antialias:true,shadows:true,backgroundColor:0x10171c,showGrid:true,showAxes:false});
  const cameras=new CameraRig(engine.scene),objects=new ObjectLibrary(engine.scene),actors=new ActorRig(engine.scene),lighting=new LightingSystem(engine.scene),paths=new PathSystem(engine.scene);
  const canvas=engine.getCanvas();canvas.dataset.sceneCanvas='';canvas.setAttribute('aria-label','三维场景，可选择和变换物体');canvas.tabIndex=0;
  engine.controls.mouseButtons.LEFT=null;engine.controls.mouseButtons.MIDDLE=0;engine.controls.mouseButtons.RIGHT=2;
  engine.controls.maxPolarAngle=Math.PI*.95;engine.controls.minDistance=.25;engine.controls.maxDistance=160;
  const proxy=new T.Object3D();proxy.name='transform-proxy';proxy.rotation.order='YXZ';engine.scene.add(proxy);
  const transform=new TransformControls(engine.camera,canvas);transform.setSize(.92);transform.setSpace('world');transform.enabled=false;
  const helper=transform.getHelper();helper.name='transform-controls';engine.scene.add(helper);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2();raycaster.params.Line.threshold=.035;
  const monitor=monitorCanvas?new Viewfinder(engine.scene,monitorCanvas):null;
  const outline=new T.Object3D();outline.name='selection-outline';engine.scene.add(outline);
  const outlineMaterial=new T.LineBasicMaterial({color:0xc6d9ba,transparent:true,opacity:.7,depthTest:false,depthWrite:false});
  for(let i=0;i<12;i++){const geometry=new T.BufferGeometry().setFromPoints([new T.Vector3(),new T.Vector3()]),line=new T.Line(geometry,outlineMaterial);line.renderOrder=999;outline.add(line);}
  let project=null,cache=null,selection=null,mode='select',space='world',monitorId=null;
  let transaction=null,pendingProject=null,cancelling=false,keyboardOperation=false,disposed=false,forceTransforms=false;
  let pointerDown=null,suppressClick=false,lastPointer={x:0,y:0,clientX:0,clientY:0},lastTimelineTime=null,lastHoverKey='',altNavigation=false;
  const subscriptions=[];
  const getEntity=()=>findEntity(project,selection);

  function groupFor(value=selection) {
    if(!value)return null;
    if(value.type==='camera')return cameras.getMeshGroup(value.id);
    if(value.type==='actor')return actors.getMeshGroup(value.id);
    if(value.type==='object')return objects.getMesh(value.id);
    if(value.type==='light')return lighting.lights.get(value.id)?.group;
    if(value.type==='modifier')return lighting.modifiers.get(value.id)?.group;
    if(value.type==='path')return paths.getMarkerGroups().find(group=>group.userData.pathPointId===value.id);
    return null;
  }
  function applyToGroup(group,value) {
    if(!group||!value)return;
    const t=entityTransform(value);group.position.set(t.position.x,t.position.y,t.position.z);
    group.rotation.order='YXZ';group.rotation.set(radians(t.rotation.pitch),radians(t.rotation.yaw),radians(t.rotation.roll));
    group.scale.set(t.scale.x,t.scale.y,t.scale.z);group.visible=!value.hidden&&value.enabled!==false;group.updateMatrixWorld(true);
  }
  function proxyFromSelection() {
    const entity=getEntity(),group=groupFor();
    if(!entity||!group||entity.hidden||entity.enabled===false){transform.detach();transform.enabled=false;outline.visible=false;return;}
    proxy.position.copy(group.position);proxy.quaternion.copy(group.quaternion);proxy.scale.copy(group.scale);proxy.updateMatrixWorld(true);
    transform.attach(proxy);transform.enabled=mode!=='select';helper.visible=mode!=='select';updateOutline();
  }
  function updateOutline() {
    const group=groupFor();if(!group||!selection||!group.visible){outline.visible=false;return;}
    const box=new T.Box3().setFromObject(group);if(box.isEmpty()){outline.visible=false;return;}
    const min=box.min,max=box.max,corners=[[min.x,min.y,min.z],[max.x,min.y,min.z],[max.x,max.y,min.z],[min.x,max.y,min.z],[min.x,min.y,max.z],[max.x,min.y,max.z],[max.x,max.y,max.z],[min.x,max.y,max.z]];
    [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(([a,b],i)=>{const attr=outline.children[i].geometry.attributes.position;attr.setXYZ(0,...corners[a]);attr.setXYZ(1,...corners[b]);attr.needsUpdate=true;outline.children[i].geometry.computeBoundingSphere();});
    outline.visible=true;
  }
  function displayedTransform(value=selection) {
    const group=groupFor(value);if(!group)return null;
    return {position:{x:group.position.x,y:group.position.y,z:group.position.z},rotation:{yaw:degrees(group.rotation.y),pitch:degrees(group.rotation.x),roll:degrees(group.rotation.z)},scale:{x:group.scale.x,y:group.scale.y,z:group.scale.z}};
  }
  function proxyTransform(){return {position:{x:proxy.position.x,y:proxy.position.y,z:proxy.position.z},rotation:{yaw:degrees(proxy.rotation.y),pitch:degrees(proxy.rotation.x),roll:degrees(proxy.rotation.z)},scale:{x:proxy.scale.x,y:proxy.scale.y,z:proxy.scale.z}};}
  function notifyTransform(){onTransform(transaction?{mode,space,axis:transform.axis||'XYZ',keyboard:keyboardOperation,selection:{...selection},...proxyTransform()}:null);}
  function beginTransform() {
    if(cancelling||!selection||transaction)return;
    const current=bridge.getState().project,entity=findEntity(current,selection);if(!entity)return;
    transaction={project:clone(current),transform:entityTransform(entity),displayTransform:proxyTransform(),selection:{...selection}};
    bridge.getState().setTimelinePlaying?.(false);engine.controls.enabled=false;suppressClick=true;onHover(null);onTransformStart({selection:{...selection},mode});notifyTransform();
  }
  function changedTransform() {
    if(cancelling||!transaction||!selection)return;
    const value=proxyTransform();
    if(Object.values(value).some(components=>Object.values(components).some(v=>!Number.isFinite(v)))){finishTransform(true);return;}
    applyToGroup(groupFor(),value);bridge.setEntityTransform(selection.type,selection.id,value);updateOutline();notifyTransform();
  }
  function finishTransform(cancelled=false) {
    if(!transaction)return;
    const current=transaction,wasKeyboard=keyboardOperation;transaction=null;keyboardOperation=false;
    const moved=transformChanged(current.displayTransform,proxyTransform());
    if(cancelled||!moved) {
      cancelling=true;transform.dragging=false;transform.axis=null;forceTransforms=true;lastTimelineTime=null;
      bridge.setState({project:clone(current.project)});pendingProject=null;syncProject(bridge.getState().project);forceTransforms=false;cancelling=false;
    } else {
      const entity=findEntity(bridge.getState().project,current.selection);
      if(entity&&transformChanged(current.transform,entityTransform(entity)))bridge.pushHistory(current.project);
      const latest=pendingProject||bridge.getState().project;pendingProject=null;syncProject(latest);
    }
    if(wasKeyboard){suppressClick=false;pointerDown=null;}
    engine.controls.enabled=true;onTransform(null);onTransformEnd({cancelled,selection:current.selection});
  }
  transform.addEventListener('mouseDown',beginTransform);transform.addEventListener('objectChange',changedTransform);
  transform.addEventListener('mouseUp',()=>finishTransform(false));
  transform.addEventListener('dragging-changed',event=>{engine.controls.enabled=!event.value;});transform.addEventListener('axis-changed',notifyTransform);

  function syncCollection(items,previous,add,remove,getData,update,getGroup) {
    const before=new Map((previous||[]).map(value=>[value.id,value])),ids=new Set(items.map(value=>value.id));
    for(const value of previous||[])if(!ids.has(value.id))remove(value.id);
    for(const value of items) {
      const old=before.get(value.id);
      if(!old)add(clone(value));
      else if(!same(old,value)){if(!same(structural(old),structural(value)))update(value.id,clone(value));else Object.assign(getData(value.id)||{},clone(value));}
      if(!old||!same(old,value)||forceTransforms)applyToGroup(getGroup(value.id),value);
    }
  }
  function syncProject(next) {
    if(disposed||!next)return;project=next;if(transaction){pendingProject=next;return;}
    const previous=cache;
    syncCollection(next.cameras||[],previous?.cameras,v=>cameras.addCamera(v),id=>cameras.deleteCamera(id),id=>cameras.getCamera(id),(id,v)=>cameras.updateCamera(id,v),id=>cameras.getMeshGroup(id));
    syncCollection(next.actors||[],previous?.actors,v=>actors.addActor(v),id=>actors.deleteActor(id),id=>actors.getActor(id),(id,v)=>actors.updateActor(id,v),id=>actors.getMeshGroup(id));
    syncCollection(next.scene.objects||[],previous?.scene?.objects,v=>objects.addObject(v),id=>objects.deleteObject(id),id=>objects.getObject(id),(id,v)=>objects.updateObject(id,v),id=>objects.getMesh(id));
    const equipmentChanged=!same((next.scene.lights||[]).map(structural),(previous?.scene?.lights||[]).map(structural))||!same((next.scene.modifiers||[]).map(structural),(previous?.scene?.modifiers||[]).map(structural));
    if(!previous||equipmentChanged)lighting.syncEquipment(clone(next.scene.lights||[]),clone(next.scene.modifiers||[]));
    for(const [list,map]of [[next.scene.lights||[],lighting.lights],[next.scene.modifiers||[],lighting.modifiers]])for(const value of list){const entry=map.get(value.id);if(entry){Object.assign(entry.data,clone(value));applyToGroup(entry.group,value);}}
    if(!previous||!same(next.scene.lighting,previous.scene.lighting))lighting.update(next.scene.lighting);
    if(!previous||!same(next.path,previous.path)){paths.importKeyframes(next.path||[],null);for(const value of next.path||[])applyToGroup(groupFor({type:'path',id:value.id}),value);}
    const time=next.timeline?.currentTime||0;
    // New/edited keys and duration changes need resampling even at an unchanged playhead.
    // Plain base-pose edits do not, so posing a subject before recording remains possible.
    if(lastTimelineTime!==time||playbackChanged(previous,next)) {
      cameras.updatePlayback((next.path||[]).filter(value=>!value.hidden),next.timeline?.duration>0?time/next.timeline.duration:0);
      actors.updatePlayback(time);lastTimelineTime=time;
    }
    cache=clone(next);
    if(selection&&!findEntity(next,selection)){selection=null;onSelect(null);}
    if(!monitorId||!next.cameras.some(c=>c.id===monitorId&&!c.hidden))monitorId=next.cameras.find(c=>!c.hidden)?.id||null;
    proxyFromSelection();
  }
  function setSelection(value) {
    if(transaction)finishTransform(true);selection=value?.id?{type:value.type,id:value.id}:null;
    if(selection?.type==='camera')monitorId=selection.id;
    cameras.selectCamera(selection?.type==='camera'?selection.id:null);actors.selectActor(selection?.type==='actor'?selection.id:null);
    lighting.setSelection(selection?.type==='light'?selection.id:null,selection?.type==='modifier'?selection.id:null);paths.setSelectedId(selection?.type==='path'?selection.id:null);proxyFromSelection();
  }
  function setMode(value) {
    if(!['select','translate','rotate','scale'].includes(value))return;if(transaction)finishTransform(true);
    mode=value;if(value!=='select')transform.setMode(value);transform.enabled=!!transform.object&&value!=='select';helper.visible=!!transform.object&&value!=='select';onModeChange(mode);notifyTransform();
  }
  function setSpace(value){space=value==='local'?'local':'world';transform.setSpace(space);notifyTransform();}
  function setHelpers({grid,axes}={}){if(grid!==undefined)engine.setGridVisible(!!grid);if(axes!==undefined)engine.setAxesVisible(!!axes);}
  function normalizedPointer(event){const bounds=canvas.getBoundingClientRect();return {x:(event.clientX-bounds.left)/bounds.width*2-1,y:-(event.clientY-bounds.top)/bounds.height*2+1,button:event.button,clientX:event.clientX,clientY:event.clientY};}
  function pick(event) {
    const p=normalizedPointer(event);pointer.set(p.x,p.y);engine.camera.updateMatrixWorld();raycaster.setFromCamera(pointer,engine.camera);
    const groups=[...cameras.getAllMeshGroups(),...actors.getAllMeshGroups(),...objects.getAllMeshes(),...lighting.getLightGroups(),...lighting.getModifierGroups(),...paths.getMarkerGroups()].filter(g=>g.visible);
    for(const hit of raycaster.intersectObjects(groups,true)) {
      if(hit.object.isLine||hit.object.isLineSegments||hit.object.name==='actor-footprint'||hit.object.userData?.part==='frustum')continue;
      const value=metadataSelection(hit.object),entity=findEntity(project,value);
      if(value&&entity&&!entity.hidden&&entity.enabled!==false)return {...value,point:hit.point,clientX:event.clientX,clientY:event.clientY};
    }
    return null;
  }
  function pointerCapture(event) {
    lastPointer=normalizedPointer(event);
    if(keyboardOperation){event.preventDefault();event.stopImmediatePropagation();suppressClick=true;if(event.button===2)finishTransform(true);else if(event.button===0){transform.pointerUp({button:0});finishTransform(false);}return;}
    if(event.altKey&&event.button===0){altNavigation=true;engine.controls.mouseButtons.LEFT=0;transform.enabled=false;return;}
    pointerDown={clientX:event.clientX,clientY:event.clientY,button:event.button,time:performance.now()};
    if(event.button===0&&mode!=='select'&&selection){helper.updateMatrixWorld(true);transform.pointerHover(lastPointer);if(transform.axis){engine.controls.enabled=false;suppressClick=true;}}
  }
  function pointerMove(event) {
    lastPointer=normalizedPointer(event);
    if(keyboardOperation){const offset=transaction?.pointerOffset||{x:0,y:0};transform.pointerMove({...lastPointer,x:lastPointer.x+offset.x,y:lastPointer.y+offset.y,button:-1});return;}
    if(transaction||transform.dragging||event.buttons)return;
    if(mode!=='select'&&selection&&transform.axis){if(lastHoverKey){lastHoverKey='';onHover(null);}return;}
    const hit=pick(event),key=hit?`${hit.type}:${hit.id}`:'';if(key!==lastHoverKey||hit){lastHoverKey=key;onHover(hit);}
  }
  function pointerUp(event) {
    if(altNavigation){altNavigation=false;engine.controls.mouseButtons.LEFT=null;transform.enabled=mode!=='select'&&!!transform.object;engine.controls.enabled=true;pointerDown=null;return;}
    if(keyboardOperation)return;if(transaction&&!transform.dragging)finishTransform(false);
    if(suppressClick){suppressClick=false;pointerDown=null;return;}
    const down=pointerDown;pointerDown=null;
    if(!down||down.button!==0||event.button!==0||Math.hypot(event.clientX-down.clientX,event.clientY-down.clientY)>5)return;
    canvas.focus({preventScroll:true});onSelect(pick(event));
  }
  function keyboardStart(value) {
    if(!selection||!getEntity())return;if(transaction)finishTransform(true);setMode(value);keyboardOperation=true;
    transform.axis=value==='rotate'?'E':'XYZ';proxy.updateMatrixWorld(true);helper.updateMatrixWorld(true);
    const center=proxy.getWorldPosition(new T.Vector3()).project(engine.camera),offset=value!=='translate'&&Math.hypot(lastPointer.x-center.x,lastPointer.y-center.y)<.035?{x:.1,y:.06}:{x:0,y:0};
    const start={...lastPointer,x:lastPointer.x+offset.x,y:lastPointer.y+offset.y,button:0};transform.pointerDown(start);
    if(transaction){transaction.startPointer=start;transaction.pointerOffset=offset;}else{keyboardOperation=false;engine.controls.enabled=true;}
  }
  function keyboardConstraint(axis) {
    if(!keyboardOperation||!transaction)return;
    const original=transaction.displayTransform;proxy.position.set(original.position.x,original.position.y,original.position.z);proxy.rotation.set(radians(original.rotation.pitch),radians(original.rotation.yaw),radians(original.rotation.roll));proxy.scale.set(original.scale.x,original.scale.y,original.scale.z);
    transform.dragging=false;transform.axis=axis;proxy.updateMatrixWorld(true);helper.updateMatrixWorld(true);transform.pointerDown({...transaction.startPointer||lastPointer,button:0});changedTransform();notifyTransform();
  }
  function keyDown(event) {
    if(disposed||event.target.closest?.('input,textarea,select,[contenteditable="true"],dialog,[role="dialog"]')||document.querySelector('dialog[open]'))return;
    if(event.key==='Control'){transform.setTranslationSnap(.1);transform.setRotationSnap(Math.PI/12);transform.setScaleSnap(.1);return;}
    if(event.ctrlKey||event.metaKey)return;const key=event.key.toLowerCase();
    if(key==='escape'){if(transaction){event.preventDefault();event.stopPropagation();finishTransform(true);}else if(selection){event.preventDefault();onSelect(null);}return;}
    if(key==='enter'&&keyboardOperation){event.preventDefault();transform.pointerUp({button:0});finishTransform(false);return;}
    if(key==='r'&&keyboardOperation&&mode==='rotate'&&!event.repeat){event.preventDefault();keyboardConstraint(transform.axis==='XYZE'?'E':'XYZE');return;}
    if(['g','r','s'].includes(key)&&selection){event.preventDefault();if(!event.repeat)keyboardStart({g:'translate',r:'rotate',s:'scale'}[key]);return;}
    if(['x','y','z'].includes(key)&&keyboardOperation){event.preventDefault();keyboardConstraint(constraintFromKey(key,event.shiftKey&&mode!=='rotate'));return;}
    if(key==='f'&&selection){event.preventDefault();focusSelection();}
  }
  function keyUp(event){if(event.key==='Control'){transform.setTranslationSnap(null);transform.setRotationSnap(null);transform.setScaleSnap(null);}}
  function focusSelection() {
    const group=groupFor();if(!group)return;
    const box=new T.Box3().setFromObject(group),center=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3()),direction=engine.camera.position.clone().sub(engine.controls.target).normalize();
    engine.controls.target.copy(center);engine.camera.position.copy(center).addScaledVector(direction,Math.max(2.5,Math.min(35,size.length()*1.6)));engine.controls.update();
  }
  function resetView(){engine.camera.position.set(12,10,12);engine.controls.target.set(0,0,0);engine.controls.update();}
  function setView(value) {
    const target=engine.controls.target,distance=Math.max(5,engine.camera.position.distanceTo(target)),dirs={front:[0,.08,1],back:[0,.08,-1],left:[-1,.08,0],right:[1,.08,0],top:[0,1,.001],perspective:[1,.8,1]},d=new T.Vector3(...(dirs[value]||dirs.perspective)).normalize();
    engine.camera.position.copy(target).addScaledVector(d,distance);engine.controls.update();
  }
  function screenPosition(value=selection){const group=groupFor(value);if(!group)return null;const point=group.getWorldPosition(new T.Vector3()).project(engine.camera),bounds=canvas.getBoundingClientRect();return {clientX:bounds.left+(point.x+1)/2*bounds.width,clientY:bounds.top+(1-point.y)/2*bounds.height,visible:point.z<1};}
  const bind=(target,event,handler,options)=>{target.addEventListener(event,handler,options);subscriptions.push(()=>target.removeEventListener(event,handler,options));};
  bind(canvas,'pointerdown',pointerCapture,true);bind(canvas,'pointermove',pointerMove);bind(window,'pointerup',pointerUp);
  bind(canvas,'pointerleave',()=>{lastHoverKey='';onHover(null);});bind(canvas,'contextmenu',event=>event.preventDefault());
  bind(canvas,'dblclick',event=>{const hit=pick(event);if(hit){onSelect(hit);focusSelection();}});bind(window,'keydown',keyDown);bind(window,'keyup',keyUp);
  bind(window,'pointermove',event=>{if(keyboardOperation&&event.target!==canvas)pointerMove(event);});
  const unsubscribeFrame=engine.onFrame(()=>{
    if(disposed)return;if(selection)updateOutline();
    if(monitor&&project) {
      const camera=cameras.getCamera(monitorId),group=cameras.getMeshGroup(monitorId),data=camera&&group?{...camera,position:{x:group.position.x,y:group.position.y,z:group.position.z},rotation:{yaw:degrees(group.rotation.y),pitch:degrees(group.rotation.x),roll:degrees(group.rotation.z)}}:null;
      const helpers=[...engine.getHelperObjects(),...cameras.getAllMeshGroups(),...paths.getVisualObjects(),...actors.getHelperObjects(),...lighting.getHelperObjects(),helper,outline,proxy];
      onMonitor({cameraId:monitorId,text:monitor.render({selectedCamera:data,helpers,actorPosition:null})});
    }
  });
  engine.start();syncProject(bridge.getState().project);
  function captureMonitor({cameraId,width=960}={}) {
    if(!monitor||disposed)return null;
    const id=cameraId||project?.referenceScene?.referenceCameraId||monitorId;
    const camera=cameras.getCamera(id),group=cameras.getMeshGroup(id);
    if(!camera||!group)return null;
    const data={...camera,position:{x:group.position.x,y:group.position.y,z:group.position.z},rotation:{yaw:degrees(group.rotation.y),pitch:degrees(group.rotation.x),roll:degrees(group.rotation.z)}};
    const helpers=[...engine.getHelperObjects(),...cameras.getAllMeshGroups(),...paths.getVisualObjects(),...actors.getHelperObjects(),...lighting.getHelperObjects(),helper,outline,proxy];
    const previousMode=monitor.getMode(),visibility=helpers.map(obj=>({obj,visible:obj.visible}));
    const aspect=data.sensorW/data.sensorH;
    if(!Number.isFinite(aspect)||aspect<=0)throw new Error('摄影机画幅比例无效');
    let snapshotWidth=Math.max(256,Math.min(1280,Math.round(Number(width)||960))),snapshotHeight=Math.max(1,Math.round(snapshotWidth/aspect));
    if(snapshotHeight>1280){snapshotHeight=1280;snapshotWidth=Math.max(1,Math.round(snapshotHeight*aspect));}
    try {
      monitor.setMode('rgb');monitor.syncCamera(data);
      monitor.renderer.setPixelRatio(1);monitor.renderer.setSize(snapshotWidth,snapshotHeight,false);
      helpers.forEach(obj=>{obj.visible=false;});
      monitor.renderer.render(engine.scene,monitor.camera);
      return {dataUrl:monitor.renderer.domElement.toDataURL('image/jpeg',.9),width:snapshotWidth,height:snapshotHeight,cameraId:id,name:data.name};
    } finally {
      visibility.forEach(({obj,visible})=>{obj.visible=visible;});monitor.setMode(previousMode);
      monitor.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));monitor.syncCamera(data);
    }
  }
  return {
    canvas,engine,setMode,setSpace,setSelection,syncProject,setHelpers,focusSelection,resetView,setView,
    cancelTransform:()=>finishTransform(true),
    applyBaseTransform:(value=selection)=>{const entity=findEntity(bridge.getState().project,value);if(entity)applyToGroup(groupFor(value),entity);proxyFromSelection();},
    setGridVisible:value=>engine.setGridVisible(value),setAxesVisible:value=>engine.setAxesVisible(value),setMonitorMode:value=>monitor?.setMode(value),setMonitorCamera:id=>{monitorId=id;},
    getInsertionPoint:()=>({x:engine.controls.target.x,y:0,z:engine.controls.target.z}),getSelectionScreenPosition:screenPosition,getSelectionWorldPosition:()=>groupFor()?.getWorldPosition(new T.Vector3())||null,
    getDisplayedTransform:displayedTransform,
    getTransformState:()=>({mode,space,axis:transform.axis,dragging:!!transaction,keyboard:keyboardOperation,selection:selection?{...selection}:null}),
    takeScreenshot:()=>engine.exportPNGBlob(),captureMonitor,
    dispose(){if(disposed)return;if(transaction)finishTransform(true);disposed=true;subscriptions.forEach(fn=>fn());unsubscribeFrame();transform.dispose();monitor?.dispose();outline.children.forEach(line=>line.geometry.dispose());outlineMaterial.dispose();actors.dispose();paths.dispose();lighting.dispose();objects.clearAll();cameras.clearAll();engine.dispose();},
  };
}
