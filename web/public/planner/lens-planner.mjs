import { SHOTS, solve, dof, buildPrompt } from './optics.mjs';
import { planMotion, replaceShotWords, describeFocus } from './prompt-tools.mjs';
import { exportMotion } from './motion.mjs';

const fmt=(n,d=2)=>Number.isFinite(n)?Number(n.toFixed(d)).toString():'∞';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const settingsKey='cp-lens-planner-v1';
const defaults={aimManual:false,mode:'shot',focal:50,distance:3,shotId:SHOTS[3].id,height:1.7,sensorW:36,aspect:16/9,aperture:2.8,focusMode:'subject',focusDistance:3,aimRatio:.72,projection:'window',movement:'fixed',duration:5,endDistance:1.5,endFocal:85,angle:90,movementText:'',subject:'人物',cameraId:'',actorId:'',language:'zh',replaceAnchor:'focal',sourceText:'',customCoverage:false,coverage:1};

export function mountLensPlanner(bridge) {
  let saved={};try{saved=JSON.parse(localStorage.getItem(settingsKey)||'{}');}catch{}
  let state={...defaults,...saved},result=null,output=null,lastFocus=null,toastTimer;
  const root=document.createElement('div');root.id='lens-planner';document.body.append(root);
  root.innerHTML=`<dialog aria-labelledby="lp-title" class="lp-dialog">
    <header class="lp-header"><div><span class="lp-eyebrow">CAMERA PLANNER / OPTICS LAB</span><h1 id="lp-title">镜头换算<span>数值定义画面</span></h1></div><button class="lp-close" aria-label="关闭镜头换算">×</button></header>
    <div class="lp-intro">输入任意两项，求出第三项。光圈独立控制景深，数值镜头可直接搭配运镜描述。</div>
    <div class="lp-layout">
      <section class="lp-inputs" aria-label="镜头参数">
        <div class="lp-section-head"><b>01</b><h2>选择已知条件</h2></div>
        <div class="lp-modes" role="group" aria-label="求解模式"><button data-mode="shot">焦段 + 距离<small>求景别</small></button><button data-mode="distance">焦段 + 景别<small>求距离</small></button><button data-mode="focal">景别 + 距离<small>求焦段</small></button></div>
        <div class="lp-fields lp-main-fields">
          <label>焦段 <span>mm</span><input data-field="focal" type="number" min="1" max="2000" step="1" aria-label="焦段 mm"></label>
          <label>主体距离 <span>m</span><input data-field="distance" type="number" min="0.01" max="10000" step="0.1" aria-label="主体距离 m"></label>
        </div>
        <label class="lp-label">景别预设 <span>以直立人物为基准</span><select data-field="shotId" aria-label="景别预设">${SHOTS.map(s=>`<option value="${s.id}">${s.label} · ${s.code}</option>`).join('')}</select></label>
        <div class="lp-shot-note"></div>
        <label class="lp-check"><input data-field="customCoverage" type="checkbox">自定义画面覆盖高度</label>
        <label class="lp-custom-coverage lp-label" hidden>主体平面纵向覆盖 <span>m</span><input data-field="coverage" type="number" min="0.01" step="0.01"></label>
        <details class="lp-details"><summary>画幅与主体基准 <span>可调整</span></summary><div class="lp-fields">
          <label>主体高度 <span>m</span><input data-field="height" type="number" min="0.01" step="0.05" aria-label="主体高度 m"></label>
          <label>画幅宽度 <span>mm</span><input data-field="sensorW" type="number" min="1" step="0.1" aria-label="画幅宽度 mm"></label>
          <label>画面比例<select data-field="aspect" aria-label="画面比例"><option value="${16/9}">16:9 横幅</option><option value="${2.39}">2.39:1 宽银幕</option><option value="${3/2}">3:2</option><option value="1">1:1</option><option value="${9/16}">9:16 竖幅</option></select></label>
          <label>取景中心 / 主体高度<input data-field="aimRatio" type="number" min="0" max="1" step="0.01" aria-label="取景中心比例"></label>
        </div><p>画幅宽 36 mm 时按全画幅等效焦段理解；改变宽度后，输入值为该虚拟画幅的实际焦段。近摄、倾斜姿态与畸变不在一阶透视估算内。</p></details>
        <div class="lp-section-head"><b>02</b><h2>附加光圈与对焦</h2><span>独立参数</span></div>
        <div class="lp-fields"><label>光圈 <span>f/</span><input data-field="aperture" type="number" min="0.5" max="64" step="0.1" aria-label="光圈 f 值"></label><label>对焦方式<select data-field="focusMode" aria-label="对焦方式"><option value="subject">对焦主体 / 沿程跟焦</option><option value="manual">固定对焦距离</option></select></label></div>
        <div class="lp-apertures" aria-label="常用光圈">${[1.4,2.8,5.6,8,16].map(v=>`<button data-aperture="${v}">f/${v}</button>`).join('')}</div>
        <label class="lp-manual-focus lp-label" hidden>固定对焦距离 <span>m</span><input data-field="focusDistance" type="number" min="0.01" step="0.1" aria-label="固定对焦距离 m"></label>
        <div class="lp-basis"></div>
      </section>
      <section class="lp-composition" aria-label="构图与换算结果">
        <div class="lp-section-head"><b>03</b><h2>固定画面</h2><span class="lp-live">实时换算</span></div>
        <div class="lp-result" aria-live="polite"></div>
        <div class="lp-viewfinder"><svg viewBox="0 0 400 225" role="img" aria-label="主体构图比例示意"><defs><clipPath id="lp-clip"><rect class="lp-frame-clip" width="400" height="225"/></clipPath><linearGradient id="lp-bg" x2="0" y2="1"><stop stop-color="#16292c"/><stop offset="1" stop-color="#0c171b"/></linearGradient></defs><rect class="lp-frame-bg" width="400" height="225" fill="url(#lp-bg)"/><path class="lp-grid" d="M133 0V225M267 0V225M0 75H400M0 150H400" stroke="#6d959c" stroke-opacity=".18"/><g clip-path="url(#lp-clip)"><g class="lp-person" fill="#b2c9bd" stroke="#b2c9bd" stroke-linejoin="round" stroke-width="0"><circle cx="0" cy="-.91" r=".075"/><path d="M-.08 -.81 Q0 -.85 .08 -.81 L.12 -.49 L.08 -.43 L.065 0 L-.015 0 L-.025 -.41 L-.06 -.41 L-.085 0 L-.165 0 L-.12 -.49 Z" stroke="none"/><path d="M-.075 -.78 L-.2 -.47 M.075 -.78 L.2 -.47" stroke-width=".065" stroke-linecap="round"/></g></g><path class="lp-crosshair" d="M190 112.5h20M200 102.5v20" stroke="#f6c880" stroke-width="1"/><text x="14" y="21" fill="#83aaa5" font-size="9" letter-spacing="1.5">FRAMING STUDY</text><text class="lp-vf-label" x="14" y="210" fill="#b7cccf" font-size="10"/></svg></div>
        <div class="lp-metrics"></div><div class="lp-depth"></div>
        <p class="lp-caption">构图示意按直立主体、正对镜头计算。光圈不改变构图；虚化效果还取决于背景距离。</p>
        <details class="lp-details lp-scene"><summary>与三维机位联动 <span>读取 / 应用</span></summary><div class="lp-fields"><label>机位<select data-field="cameraId" aria-label="联动机位"></select></label><label>主体<select data-field="actorId" aria-label="联动主体"></select></label></div><div class="lp-buttons"><button data-action="read-camera">读取机位</button><button data-action="read-actor">读取主体尺寸</button><button data-action="apply" class="lp-primary">应用到机位</button></div><p>应用会将相机移到所选主体的构图中心高度，保持水平来向并朝向主体；更新画幅、焦段、光圈和对焦。已有路径保持原值，播放时由路径控制机位。</p></details>
        <details class="lp-details"><summary>估算口径与来源</summary><p>纵向覆盖高度 ≈ 距离 × 有效画幅高度 ÷ 焦段。景别预设是本工具的构图约定，可用覆盖高度微调。景深以薄透镜、弥散圈 0.03 mm 估算，不模拟镜头呼吸与背景散景。</p><p><a href="https://www.edmundoptics.com/knowledge-center/application-notes/imaging/understanding-focal-length-and-field-of-view/" target="_blank" rel="noopener">Edmund Optics · 视场</a> / <a href="https://www.toshiba-teli.co.jp/en/technology/technical/t0019_DoF_HyperfocalDistance.htm" target="_blank" rel="noopener">Toshiba Teli · 景深</a> / <a href="https://hugin.sourceforge.io/docs/manual/Projections.html" target="_blank" rel="noopener">Hugin · 全景投影</a></p></details>
      </section>
      <section class="lp-output" aria-label="运镜与生成提示词">
        <div class="lp-section-head"><b>04</b><h2>搭配运镜，导出提示</h2></div>
        <label class="lp-label">输出适配<select data-field="projection" aria-label="输出适配"><option value="window">180°全景模型 · 中心观看窗口等效</option><option value="perspective">普通透视镜头</option></select></label>
        <p class="lp-projection-note"></p>
        <label class="lp-label">运镜来源<select data-field="movement" aria-label="运镜来源"><option value="fixed">固定镜头</option><option value="push">推进 · 焦段固定</option><option value="pull">拉出 · 焦段固定</option><option value="zoom">变焦 · 机位固定</option><option value="dollyzoom">移动变焦 · 保持主体占比</option><option value="orbit">环绕 · 距离与焦段固定</option><option value="custom">外部运镜描述</option><option value="path">当前机位的路径参考</option></select></label>
        <div class="lp-motion-fields lp-fields"><label>时长 <span>s</span><input data-field="duration" type="number" min="0.1" step="0.5" aria-label="运镜时长 s"></label><label class="lp-end-distance">结束主体距离 <span>m</span><input data-field="endDistance" type="number" min="0.01" step="0.1" aria-label="结束主体距离 m"></label><label class="lp-end-focal">结束焦段 <span>mm</span><input data-field="endFocal" type="number" min="1" step="1" aria-label="结束焦段 mm"></label><label class="lp-orbit-angle">环绕角度 <span>°</span><input data-field="angle" type="number" min="-360" max="360" step="5" aria-label="环绕角度"></label></div>
        <div class="lp-path-note" hidden>读取上方所选机位与主体，以原路径、机位光圈和固定对焦值为准；主体高度和构图中心使用已应用的参数（否则读取场景尺寸）。请先把需要的参数应用到机位。</div>
        <label class="lp-label">主体 / 内容称谓<input data-field="subject" type="text" aria-label="主体称谓" placeholder="人物、产品或场景中的主体"></label>
        <label class="lp-label">运镜补充 <span>可粘贴任意影视运镜描述</span><textarea data-field="movementText" rows="2" aria-label="运镜补充" placeholder="例如：缓慢横移，保持人物在画面右侧，平滑起步与停下"></textarea></label>
        <div class="lp-output-head"><div role="group" aria-label="提示词语言"><button data-language="zh">中文</button><button data-language="en">English</button></div><span>数值镜头提示词</span></div>
        <textarea class="lp-prompt" aria-label="生成提示词" readonly rows="10"></textarea>
        <div class="lp-warnings" role="status"></div>
        <div class="lp-buttons"><button data-action="copy" class="lp-primary">复制提示词</button><button data-action="download-txt">下载 TXT</button><button data-action="download-json">参数 JSON</button></div>
        <details class="lp-details lp-replace"><summary>替换已有分镜中的景别词 <span>保留动作与运镜</span></summary><p>按当前主体与画幅，把每处景别换成焦段、距离、光圈和取景中心。转换采用下方锁定项；复合构图、多人场面及已有相冲突的数值需要人工校对。</p><label class="lp-label">锁定项<select data-field="replaceAnchor" aria-label="分镜替换锁定项"><option value="focal">锁定当前焦段，换算每处距离</option><option value="distance">锁定当前距离，换算每处焦段</option></select></label><textarea data-field="sourceText" rows="4" aria-label="原分镜提示词" placeholder="例如：中景，人物走向窗边；镜头缓慢推进至特写。"></textarea><button data-action="replace" class="lp-secondary">转换景别词</button><textarea class="lp-replaced" aria-label="替换后的分镜提示词" readonly rows="4" hidden></textarea><div class="lp-replaced-count"></div><button data-action="copy-replaced" hidden>复制转换结果</button></details>
      </section>
    </div><footer class="lp-footer"><span class="lp-status" aria-live="polite"></span><span>生成模型对数值的响应需通过样片标定；计算结果为提示词构图参考。</span></footer>
  </dialog><div class="lp-toast" role="status" hidden></div>`;
  const $=s=>root.querySelector(s), $$=s=>[...root.querySelectorAll(s)],dialog=$('dialog');
  const toast=message=>{ $('.lp-toast').textContent=message;$('.lp-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('.lp-toast').hidden=true,3300);};
  const persist=()=>{try{localStorage.setItem(settingsKey,JSON.stringify(state));}catch{}};
  function syncFields(){
    for(const el of $$('[data-field]')){const v=state[el.dataset.field];if(el.type==='checkbox')el.checked=!!v;else el.value=el.type==='number'?(Number.isFinite(v)?fmt(v,4):''):String(v??'');}
  }
  function sceneOptions(){
    const p=bridge.getState().project;
    if(!p.cameras.some(c=>c.id===state.cameraId)) state.cameraId=bridge.getState().selectedCameraId||p.cameras[0]?.id||'';
    if(!p.actors.some(a=>a.id===state.actorId)) state.actorId=p.actors[0]?.id||'';
    $('[data-field="cameraId"]').innerHTML=p.cameras.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')||'<option value="">无机位</option>';
    $('[data-field="actorId"]').innerHTML=p.actors.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')||'<option value="">无主体</option>';
    $('[data-field="cameraId"]').value=state.cameraId;$('[data-field="actorId"]').value=state.actorId;
  }
  function getResult(){return solve({...state,coverageRatio:state.customCoverage?state.coverage/state.height:undefined});}
  function render(){
    persist();
    $$('[data-mode]').forEach(el=>{el.classList.toggle('active',el.dataset.mode===state.mode);el.setAttribute('aria-pressed',String(el.dataset.mode===state.mode));});
    $$('[data-language]').forEach(el=>el.classList.toggle('active',el.dataset.language===state.language));
    $$('[data-aperture]').forEach(el=>el.classList.toggle('active',Number(el.dataset.aperture)===state.aperture));
    $('[data-field="focal"]').disabled=state.mode==='focal';$('[data-field="distance"]').disabled=state.mode==='distance';$('[data-field="shotId"]').disabled=state.mode==='shot'||state.customCoverage;
    $('[data-field="customCoverage"]').disabled=state.mode==='shot';$('.lp-custom-coverage').hidden=!state.customCoverage||state.mode==='shot';$('.lp-manual-focus').hidden=state.focusMode!=='manual';
    $('.lp-motion-fields').hidden=['fixed','custom','path'].includes(state.movement);$('.lp-end-distance').hidden=!['push','pull','dollyzoom'].includes(state.movement);$('.lp-end-focal').hidden=state.movement!=='zoom';$('.lp-orbit-angle').hidden=state.movement!=='orbit';$('.lp-path-note').hidden=state.movement!=='path';
    $('.lp-projection-note').textContent=state.projection==='window'?'焦段描述中心观看窗口的透视效果；完整 180°投影仍由生成模型决定。':'按当前虚拟画幅的普通直线透视估算。';
    $('.lp-basis').textContent=`基准：${fmt(state.sensorW)} × ${fmt(state.sensorW/state.aspect)} mm · 主体 ${fmt(state.height)} m`;
    try{
      result=getResult();if(state.mode==='shot'&&!state.aimManual){state.aimRatio=result.shot.aimRatio;$('[data-field="aimRatio"]').value=state.aimRatio;}if(!Number.isFinite(state.aimRatio)||state.aimRatio<0||state.aimRatio>1)throw new Error('取景中心比例须在 0–1 之间');
      const focus=state.focusMode==='subject'?result.distance:state.focusDistance;
      const depth=dof({focal:result.focal,aperture:state.aperture,distance:focus});
      for(const key of ['focal','distance'])if((key==='focal'&&state.mode==='focal')||(key==='distance'&&state.mode==='distance'))$(`[data-field="${key}"]`).value=fmt(result[key],3);
      if(state.mode==='shot')$('[data-field="shotId"]').value=result.shot.id;
      const derived=state.mode==='shot'?result.shot.label:state.mode==='distance'?`${fmt(result.distance,3)} <small>m</small>`:`${fmt(result.focal,2)} <small>mm</small>`;
      $('.lp-result').innerHTML=`<small>${state.mode==='shot'?'估计景别':state.mode==='distance'?'推荐主体距离':'推荐焦段'}</small><strong>${derived}</strong><span>${state.mode==='shot'?`完整主体投影 / 画面高度 ${fmt(result.occupancy*100,1)}%`:`对应 ${esc(result.shot.label)} · 覆盖高度 ${fmt(result.coverage)} m`}</span>`;
      const preset=SHOTS.find(s=>s.id===state.shotId)||result.shot;
      $('.lp-shot-note').textContent=state.mode==='shot'?`${result.shot.description}；按最近构图预设归类。`:`${preset.description}；目标覆盖高度约 ${fmt((state.customCoverage?state.coverage:state.height*preset.coverageRatio))} m。`;
      const frame=$('svg'),frameH=400/state.aspect,h=frameH/result.coverage*state.height,aim=state.aimRatio;
      frame.setAttribute('viewBox',`0 0 400 ${frameH}`);
      $('.lp-frame-clip').setAttribute('height',frameH);$('.lp-frame-bg').setAttribute('height',frameH);
      $('.lp-grid').setAttribute('d',`M133 0V${frameH}M267 0V${frameH}M0 ${frameH/3}H400M0 ${frameH*2/3}H400`);
      $('.lp-crosshair').setAttribute('d',`M190 ${frameH/2}h20M200 ${frameH/2-10}v20`);
      $('.lp-person').setAttribute('transform',`translate(${200+h*.04} ${frameH/2+h*aim}) scale(${h})`);
      $('.lp-vf-label').setAttribute('y',frameH-15);
      $('.lp-vf-label').textContent=`${fmt(result.focal)} mm / ${fmt(result.distance)} m / ${fmt(state.aspect)}:1`;
      $('.lp-metrics').innerHTML=`<div><small>焦段</small><b>${fmt(result.focal)} <em>mm</em></b></div><div><small>主体距离</small><b>${fmt(result.distance)} <em>m</em></b></div><div><small>纵向覆盖</small><b>${fmt(result.coverage)} <em>m</em></b></div><div><small>水平 / 垂直视角</small><b>${fmt(result.horizontalFov,1)}° / ${fmt(result.verticalFov,1)}°</b></div>`;
      $('.lp-depth').innerHTML=`<div><small>f/${fmt(state.aperture)} · 对焦 ${fmt(focus)} m</small><b>清晰范围约 ${fmt(depth.near)}–${fmt(depth.far)} m</b></div><span>景深 ${fmt(depth.range)} m</span>`;
      let warnings=[];let motion=planMotion(result,{type:state.movement,duration:state.duration,endDistance:state.endDistance,endFocal:state.endFocal,angle:state.angle});
      let prompt,structured;
      if(state.movement==='path'){
        const project=bridge.getState().project,cam=project.cameras.find(c=>c.id===state.cameraId);
        const applied=cam?.lensPrompt?.subjectId===state.actorId?cam.lensPrompt:null;
        const data=exportMotion(project,{cameraId:state.cameraId,actorId:state.actorId,focusMode:state.focusMode==='manual'?'manual':'subject',projection:state.projection,aimRatio:applied?.aimRatio??state.aimRatio,subjectHeightM:applied?.heightM});
        warnings.push(...(data.warnings||[]));prompt=state.language==='zh'?data.promptZh:data.promptEn;structured=data;
        if(state.movementText.trim())prompt+=`\n\n${state.language==='zh'?'运镜补充（原文）':'Additional movement (original text)'}：${state.movementText.trim()}`;
      }else{
        const base=buildPrompt({...result,aperture:state.aperture,focusDistance:focus,subject:state.subject||'人物',aimRatio:state.aimRatio,projection:state.projection,movementText:''});
        prompt=state.language==='zh'?base.zh:base.en;
        const movement=state.language==='zh'?motion.zh:motion.en;if(movement)prompt+=`\n\n${movement}\n${state.language==='zh'?(state.focusMode==='subject'?'沿程持续对焦所选主体。':'保持固定对焦距离。'):(state.focusMode==='subject'?'Continuously focus on the selected subject.':'Keep focus distance fixed.')}\n${describeFocus(result,state.aperture,state.focusMode,state.focusDistance,motion,state.language)}`;
        if(state.movementText.trim())prompt+=`\n\n${state.language==='zh'?'运镜补充（原文）':'Additional movement (original text)'}：${state.movementText.trim()}`;
        structured={schemaVersion:'lens-prompt/1',projection:state.projection,calculation:'first-order perspective; local viewing window',units:{focal:'mm',sensor:'mm',distance:'m',aperture:'f-number'},camera:{focalMm:result.focal,subjectDistanceM:result.distance,sensorWidthMm:result.sensorW,sensorHeightMm:result.sensorH,aperture:state.aperture,focusDistanceM:focus,focusMode:state.focusMode,aimHeightAboveSubjectBaseM:state.height*state.aimRatio},subject:{name:state.subject,heightM:state.height},composition:{verticalCoverageM:result.coverage,fullSubjectHeightRatio:result.occupancy},depthOfFieldM:depth,motion:{...motion,samples:motion.samples.map(s=>({...s,aperture:state.aperture,focusDistanceM:state.focusMode==='subject'?s.subjectDistanceM:state.focusDistance}))},additionalMovementText:state.movementText};
      }
      if(state.movementText.trim())warnings.push('运镜补充保留原文；如含景别词，可在下方转换后再粘贴。');
      if(result.distance<.5)warnings.push('接近近摄范围，一阶构图估算可能出现明显误差。');
      if(state.aperture<1||state.aperture>32)warnings.push('当前为特殊光圈值，请确认模型能够响应。');
      if(result.focal<8||result.focal>600)warnings.push('当前为非常规焦段，可调整主体距离或画幅基准。');
      output={prompt,structured:{...structured,prompt,language:state.language,warnings}};
      $('.lp-prompt').value=prompt;$('.lp-warnings').textContent=warnings.join('\n');$('.lp-status').textContent='换算完成 · 导出不依赖景别名称';
      $$('[data-action="copy"],[data-action^="download"],[data-action="apply"],[data-action="replace"]').forEach(e=>e.disabled=false);
    }catch(e){output=null;$('.lp-result').innerHTML='<small>待修正参数</small><strong>—</strong>';$('.lp-prompt').value='';$('.lp-warnings').textContent=e.message;$('.lp-status').textContent='请检查输入参数';$$('[data-action="copy"],[data-action^="download"],[data-action="apply"],[data-action="replace"]').forEach(el=>el.disabled=true);}
  }
  function update(el){
    const key=el.dataset.field;
    if(el.type==='checkbox')state[key]=el.checked;else if(el.type==='number'||key==='aspect')state[key]=el.value===''?NaN:Number(el.value);else state[key]=el.value;
    if(key==='aimRatio')state.aimManual=true;
    if(key==='shotId'){state.aimManual=false;const p=SHOTS.find(s=>s.id===state.shotId);state.aimRatio=p.aimRatio;$('[data-field="aimRatio"]').value=state.aimRatio;}
    if(key==='movement'&&result){if(state.movement==='push')state.endDistance=result.distance*.5;if(state.movement==='pull')state.endDistance=result.distance*2;$('[data-field="endDistance"]').value=fmt(state.endDistance,3);}
    if(key==='sourceText'){persist();return;}
    render();
  }
  for(const el of $$('[data-field]'))el.addEventListener(el.tagName==='SELECT'||el.type==='checkbox'?'change':'input',()=>update(el));
  for(const el of $$('[data-mode]'))el.addEventListener('click',()=>{
    if(result){state.focal=result.focal;state.distance=result.distance;state.shotId=result.shot.id;}
    state.mode=el.dataset.mode;state.customCoverage=false;state.aimManual=false;state.aimRatio=SHOTS.find(s=>s.id===state.shotId).aimRatio;syncFields();render();
  });
  for(const el of $$('[data-aperture]'))el.addEventListener('click',()=>{state.aperture=Number(el.dataset.aperture);$('[data-field="aperture"]').value=state.aperture;render();});
  for(const el of $$('[data-language]'))el.addEventListener('click',()=>{state.language=el.dataset.language;render();});
  function open(){lastFocus=document.activeElement;sceneOptions();const selected=bridge.getState().selectedCameraId;if(selected){state.cameraId=selected;$('[data-field="cameraId"]').value=selected;}syncFields();render();dialog.showModal();}
  $('.lp-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>lastFocus?.focus());dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
  const download=(content,type,ext)=>{const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`camera-planner-lens-${Date.now()}.${ext}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  async function copy(value){try{await navigator.clipboard.writeText(value);toast('已复制');}catch{toast('无法自动复制，请选中输出文字手动复制');}}
  root.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action)return;
    try{
      const store=bridge.getState(),project=store.project,cam=project.cameras.find(c=>c.id===state.cameraId),actor=project.actors.find(a=>a.id===state.actorId);
      if(action==='copy'&&output)copy(output.prompt);
      if(action==='download-txt'&&output)download(output.prompt,'text/plain;charset=utf-8','txt');
      if(action==='download-json'&&output)download(JSON.stringify(output.structured,(k,v)=>typeof v==='number'&&!Number.isFinite(v)?'infinity':v,2),'application/json','json');
      if(action==='read-actor'){
        if(!actor)throw new Error('请先选择主体');state.height=actor.height*(actor.scale?.y||1);state.subject=actor.name;syncFields();render();toast('已读取主体尺寸；坐姿或弯腰请手动校正高度');
      }
      if(action==='read-camera'){
        if(!cam)throw new Error('请先选择机位');state.focal=cam.focal;state.sensorW=cam.sensorW;state.aspect=cam.sensorW/cam.sensorH;state.aperture=cam.fstop;state.focusDistance=cam.focusDist;state.focusMode='manual';state.mode='shot';
        if(actor){const target={...actor.position,y:actor.position.y+actor.height*(actor.scale?.y||1)*state.aimRatio};state.distance=Math.hypot(cam.position.x-target.x,cam.position.y-target.y,cam.position.z-target.z);state.height=actor.height*(actor.scale?.y||1);state.subject=actor.name;}
        else{state.distance=cam.focusDist;toast('场景无主体，暂以对焦距离作为主体距离');}
        const aspect=$('[data-field="aspect"]');if(![...aspect.options].some(o=>Number(o.value)===state.aspect)){const o=document.createElement('option');o.value=state.aspect;o.textContent=`${fmt(state.aspect,3)}:1 · 当前机位`;aspect.append(o);}
        syncFields();render();toast('已读取机位；距离按所选主体构图中心估算；旧机位有俯仰时仅作参考');
      }
      if(action==='apply'){
        if(!cam||!actor)throw new Error('请先选择机位和主体');if(!result||!output)throw new Error('请先修正参数');
        const target={...actor.position,y:actor.position.y+state.height*state.aimRatio},dx=cam.position.x-target.x,dz=cam.position.z-target.z,len=Math.hypot(dx,dz),ux=len>1e-6?dx/len:0,uz=len>1e-6?dz/len:1;
        store.updateCamera(cam.id,{focal:result.focal,sensorW:result.sensorW,sensorH:result.sensorH,fstop:state.aperture,focusDist:state.focusMode==='subject'?result.distance:state.focusDistance,position:{x:target.x+ux*result.distance,y:target.y,z:target.z+uz*result.distance},rotation:{yaw:Math.atan2(ux,uz)*180/Math.PI,pitch:0,roll:0},lensPrompt:{subjectId:actor.id,heightM:state.height,aimRatio:state.aimRatio,projection:state.projection}});store.selectCamera(cam.id);toast('已应用到三维机位，可关闭面板查看；支持撤销');
      }
      if(action==='replace'){
        const replacement=replaceShotWords(state.sourceText,{...state,focal:result.focal,distance:result.distance},{anchor:state.replaceAnchor,aperture:state.aperture,language:state.language});$('.lp-replaced').hidden=false;$('.lp-replaced').value=replacement.text;$('.lp-replaced-count').textContent=`已替换 ${replacement.matches.length} 处；其余文字按原文保留。数值仍按当前画幅与主体高度估算。`;$('[data-action="copy-replaced"]').hidden=false;
      }
      if(action==='copy-replaced')copy($('.lp-replaced').value);
    }catch(e){toast(e.message);}
  });
  const installButton=()=>{
    const header=document.querySelector('header');if(!header||header.querySelector('.lp-launch'))return false;
    const button=document.createElement('button');button.className='lp-launch';button.type='button';button.innerHTML='<span>ƒ</span> 镜头换算';button.title='焦段 / 距离 / 景别互算与数值提示词';button.addEventListener('click',open);header.insertBefore(button,header.lastElementChild);return true;
  };
  if(!installButton()){const observer=new MutationObserver(()=>{if(installButton())observer.disconnect();});observer.observe(document.getElementById('root'),{childList:true,subtree:true});}
  bridge.subscribe((next,prev)=>{if(dialog.open&&next.project!==prev.project){sceneOptions();render();}});
  // Export dialog entry: open the same numerical prompt workflow with the selected camera.
  window.addEventListener('cp-open-lens',open);
  syncFields();
}
