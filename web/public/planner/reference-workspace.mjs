import { createSceneSession } from './scene-tools.mjs';
import { runSceneAgent } from './scene-llm.mjs';

export const REFERENCE_LIMIT_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateReferenceFile(file) {
  if (!file || !IMAGE_TYPES.has(file.type)) throw new Error('请选择 JPG、PNG 或 WebP 图片。');
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error('这张图片是空文件。');
  if (file.size > REFERENCE_LIMIT_BYTES) throw new Error('参考图不能超过 8 MB，请先压缩图片。');
  return file;
}

export function resizedImageDimensions(width, height, longest = 1600) {
  if (![width, height, longest].every(v => Number.isFinite(v) && v > 0)) throw new Error('无法读取参考图的尺寸。');
  if (width * height > 60000000) throw new Error('图片像素过大，请缩小后重新上传。');
  const factor = Math.min(1, longest / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

export function parseSceneToolCalls(text) {
  let calls;
  try { calls = JSON.parse(text); } catch { throw new Error('工具调用不是有效 JSON。请输入调用数组。'); }
  if (!Array.isArray(calls) || calls.length < 1 || calls.length > 40) throw new Error('请输入 1–40 条工具调用组成的数组。');
  return calls.map((call, i) => {
    if (!call || typeof call !== 'object' || Array.isArray(call)) throw new Error(`第 ${i + 1} 条调用格式不正确。`);
    const name = call.name ?? call.function?.name;
    let args = call.arguments ?? call.function?.arguments;
    if (typeof name !== 'string' || !/^scene_[a-z_]+$/.test(name)) throw new Error(`第 ${i + 1} 条调用缺少有效工具名称。`);
    if (typeof args === 'string') {
      try { args = JSON.parse(args); } catch { throw new Error(`第 ${i + 1} 条工具参数不是有效 JSON。`); }
    }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error(`第 ${i + 1} 条工具参数须为 JSON 对象。`);
    return { name, arguments: args };
  });
}

export function sceneInstruction({ description = '', scale = '', projection = 'unknown', mode = 'generate', target = 'new', textOnly = false } = {}) {
  const lines = [description.trim() || (mode === 'correct' ? '根据参考图和当前机位画面校正主要空间关系。' : '还原参考图中主要物体的空间关系，建立可编辑三维草模和参考机位。')];
  if (mode === 'correct') lines.push('这是对当前场景的局部校正。保留人工调整和未涉及的物体，不重建整个场景。');
  else lines.push(target === 'new' ? '建立新的参考场景。当前操作发生在独立草稿，应用后才替换原布景。请创建参考摄影机。' : '编辑当前场景，保留未要求修改的物体与机位。');
  if (scale.trim()) lines.push(`用户提供的尺度或约束：${scale.trim()}`);
  lines.push(`参考图投影：${projection}。${projection === 'perspective' ? '按普通透视对齐构图。' : '未完成投影标定；只给近似布局，不声称恢复完整全景或精确机位。'}`);
  if (textOnly) lines.push('本次只使用文字和场景数据，没有向你发送参考图或对照截图。不要声称已经看图。');
  lines.push('主要物体需要能单独编辑，优先简单体块；保留前后、左右、遮挡、落地和贴墙关系。区分观察与推测，不宣称达到已测量的还原率。');
  return lines.join('\n');
}

export function referenceCompareNotice(reference, capture) {
  if (!reference) return '当前没有参考图，可先按文字建场。';
  if (reference.projection !== 'perspective') return '全景或未知投影仅作视觉参考，叠加不代表经过投影校准。';
  if (capture && Math.abs((reference.width / reference.height) / (capture.width / capture.height) - 1) > .01) return '参考图与机位画幅比例不同，画面按完整内容显示；请先校正画幅与裁切，再比较位置。';
  return '对照显示完整画面。请同时检查前后层次；单帧接近不能证明隐藏空间正确。';
}

function saveJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function progressMessage(progress) {
  if (typeof progress === 'string') return progress;
  if (progress?.message) return progress.message;
  return progress?.round ? `第 ${progress.round} 轮 · 已调用 ${progress.toolCalls || 0} 个场景工具` : '正在规划空间布局…';
}

function changeSummary(changes) {
  if (!changes) return '检查待应用的场景更改。';
  const counts = [];
  for (const [key, label] of [['added', '新增'], ['created', '新增'], ['updated', '调整'], ['removed', '删除'], ['deleted', '删除']]) {
    if (Array.isArray(changes[key]) && changes[key].length) counts.push(`${label} ${changes[key].length} 项`);
    else if (Number.isFinite(changes[key]) && changes[key] > 0) counts.push(`${label} ${changes[key]} 项`);
  }
  return counts.length ? [...new Set(counts)].join(' · ') : '场景草稿已准备好，应用后可在三维场景中检查。';
}

export function mountReferenceWorkspace({ bridge, controller, notify = () => {} }) {
  const workspace = document.getElementById('workspace');
  if (!workspace) return { open() {}, dispose() {} };
  const launch = document.createElement('button');
  launch.type = 'button'; launch.className = 'rs-launch'; launch.setAttribute('data-tip', '上传参考图，生成与校正可编辑场景');
  launch.setAttribute('aria-label', '参考图建场');
  launch.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 5-5 4 4 3-3 6 6M16 7v4M14 9h4"/></svg><span>参考图建场</span>';
  (workspace.querySelector('.ws-top-actions') || workspace).prepend(launch);
  const dialog = document.createElement('dialog');
  dialog.className = 'rs-dialog'; dialog.setAttribute('aria-labelledby', 'rs-title');
  dialog.innerHTML = `<header class="rs-header"><div><span class="rs-eyebrow">REFERENCE → SCENE</span><h2 id="rs-title">把参考图变成可编辑场景</h2><p>先生成草稿，再应用到场景。物体沿用现有三轴工具。</p></div><button type="button" class="rs-close" aria-label="关闭参考图建场" data-rs="close">×</button></header>
    <div class="rs-content"><section class="rs-setup"><h3><b>01</b> 参考与约束</h3><label class="rs-upload"><input type="file" accept="image/jpeg,image/png,image/webp" data-rs="file"><span class="rs-upload-icon">＋</span><strong>上传参考图片</strong><small>JPG / PNG / WebP · 最大 8 MB</small></label><div class="rs-image-meta" hidden><span data-rs="image-meta"></span><button type="button" class="rs-text-button" data-rs="clear-image">移除</button></div><label class="rs-field"><span>参考图投影</span><select data-rs="projection"><option value="perspective">普通透视图片</option><option value="equirectangular180">180° 全景参考</option><option value="unknown">未知 / 其他投影</option></select></label><label class="rs-field rs-stack"><span>描述场景或本次调整</span><textarea data-rs="instruction" rows="4" maxlength="6000" placeholder="例如：沙发靠左墙，桌子在前方，人物站在窗边；优先还原距离和遮挡关系。也可以不上传图片，直接描述场景。"></textarea></label><label class="rs-field rs-stack"><span>已知尺寸 / 要保留的关系 <small>可选</small></span><input data-rs="scale" type="text" maxlength="1000" placeholder="例如：桌宽 1.6 米；人物位置不动"></label><label class="rs-field"><span>生成到哪里</span><select data-rs="target"><option value="new">新建参考场景（可撤销）</option><option value="edit">编辑当前场景</option></select></label><p class="rs-note" data-rs="target-note">应用时替换当前布景，可一次撤销；生成期间保留原场景。</p>
    <details class="rs-settings"><summary>DeepSeek 模型设置 <span>自行填写密钥</span></summary><label class="rs-field rs-stack"><span>API Key <small>仅本次页面有效</small></span><input type="password" data-rs="key" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="在此输入你的 DeepSeek Key"></label><label class="rs-field"><span>模型</span><select data-rs="model"><option value="deepseek-flash">DeepSeek Flash · 识图 / 工具</option><option value="deepseek-v4-pro">DeepSeek V4 Pro · 文字 / 工具</option></select></label><label class="rs-checkbox"><input data-rs="text-only" type="checkbox"><span>只使用文字和场景数据，不发送图片</span></label><p class="rs-note">点击生成或校正时，内容才会发给 DeepSeek。密钥不写入场景文件。</p><p class="rs-note rs-model-warning" hidden>此模型不处理图片。请切换 Flash，或勾选仅使用文字。</p></details>
    <div class="rs-run-actions"><button type="button" class="rs-primary" data-rs="generate">生成场景草稿</button><button type="button" class="rs-button" data-rs="cancel" hidden>停止</button></div><p class="rs-status" role="status" aria-live="polite" data-rs="status">可以先用文字测试 LLM 场景工具。</p><p class="rs-error" role="alert" data-rs="error" hidden></p>
    <section class="rs-draft" hidden><span class="rs-eyebrow">待应用更改 · 尚未修改场景</span><h4 data-rs="change-summary"></h4><p data-rs="draft-summary"></p><p class="rs-note" data-rs="replace-note" hidden>应用后替换当前布景；可以使用撤销回到应用前。</p><div class="rs-run-actions"><button type="button" class="rs-primary" data-rs="apply">应用到场景</button><button type="button" class="rs-button" data-rs="discard">放弃草稿</button></div></section>
    <details class="rs-debug"><summary>LLM 工具测试 <span>无需模型密钥</span></summary><p class="rs-note">导出工具定义和当前场景供 LLM 使用，再粘贴返回的调用数组。调用先进入草稿，检查后再应用。</p><button type="button" class="rs-text-button" data-rs="download-tools">下载工具与场景 JSON ↗</button><label class="rs-field rs-stack"><span>工具调用 JSON</span><textarea data-rs="tool-calls" rows="5" spellcheck="false" placeholder='[{"name":"scene_get_state","arguments":{}}]'></textarea></label><button type="button" class="rs-button" data-rs="run-tools">运行工具草稿</button><pre class="rs-tool-results" data-rs="tool-results" aria-label="工具执行结果" hidden></pre></details></section>
    <section class="rs-review"><div class="rs-review-heading"><h3><b>02</b> 对照与校正</h3><button type="button" class="rs-text-button" data-rs="capture">刷新当前机位 ↻</button></div><div class="rs-compare-controls"><label><input type="radio" name="rs-compare-mode" value="side" checked> 并排</label><label><input type="radio" name="rs-compare-mode" value="overlay"> 叠加</label><label class="rs-opacity" hidden>参考透明度 <input type="range" data-rs="opacity" min="0" max="100" value="50" aria-label="参考图透明度"></label></div><div class="rs-comparison"><figure class="rs-reference"><figcaption>原始参考图</figcaption><div class="rs-image-frame"><img data-rs="reference-preview" alt="原始参考图" hidden><span data-rs="reference-empty">上传图片后在此对照</span></div></figure><figure class="rs-candidate"><figcaption data-rs="capture-label">当前参考机位 · 尚未截取</figcaption><div class="rs-image-frame"><img data-rs="capture-preview" alt="当前场景参考机位画面" hidden><span data-rs="capture-empty">应用场景后，刷新机位画面</span></div></figure></div><p class="rs-note" data-rs="compare-notice">对照展示当前已应用场景，不代表待应用草稿。</p><div class="rs-correction-footer"><button type="button" class="rs-button" data-rs="correct">根据对照校正草稿</button><button type="button" class="rs-text-button" data-rs="edit">回到三轴编辑 ↗</button></div><p class="rs-note">调整物体后重新打开此页，刷新机位，再描述要校正的部分。不会自动给出还原率。</p></section></div>`;
  workspace.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const field = name => $(`[data-rs="${name}"]`);
  const state = { image: null, capture: null, draft: null, draftTarget: 'edit', busy: false, abort: null, disposed: false, uploadToken: 0 };
  let lastFocus;
  function error(message) { field('error').textContent = message; field('error').hidden = !message; }
  function status(message) { field('status').textContent = String(message); }
  function setBusy(value) {
    state.busy = value; dialog.setAttribute('aria-busy', String(value));
    for (const element of dialog.querySelectorAll('button,input,select,textarea')) {
      if (element === field('cancel') || element === field('close')) continue;
      element.disabled = value;
    }
    field('cancel').hidden = !value;
  }
  function currentReference() {
    return state.image ? { id: state.image.id, name: state.image.name.slice(0, 240), width: state.image.width, height: state.image.height, projection: field('projection').value } : undefined;
  }
  function clearDraft() {
    state.draft?.discard?.(); state.draft = null; $('.rs-draft').hidden = true;
  }
  function beginSession(options = {}) {
    controller?.cancelTransform?.();
    const current = bridge.getState();
    if (current.project.timeline?.playing) current.setTimelinePlaying?.(false);
    return createSceneSession(bridge, options);
  }
  function showDraft(session, summary, target) {
    if (!session.hasChanges()) { session.discard(); state.draft = null; $('.rs-draft').hidden = true; status(`没有场景更改。${summary || ''}`); return; }
    state.draft = session; state.draftTarget = target;
    field('change-summary').textContent = changeSummary(session.getChanges());
    field('draft-summary').textContent = summary || '请应用后从参考机位与侧视检查空间关系。';
    field('replace-note').hidden = target !== 'new'; $('.rs-draft').hidden = false;
    status('草稿已准备好。应用后可以直接使用现有三轴工具编辑。');
  }
  function updateComparison() {
    const reference = state.image; const capture = state.capture;
    field('reference-preview').hidden = !reference; field('reference-empty').hidden = !!reference;
    if (reference) field('reference-preview').src = reference.url; else field('reference-preview').removeAttribute('src');
    field('capture-preview').hidden = !capture; field('capture-empty').hidden = !!capture;
    if (capture) field('capture-preview').src = capture.dataUrl; else field('capture-preview').removeAttribute('src');
    field('capture-label').textContent = capture ? `当前机位 · ${capture.name || capture.cameraId || '参考摄影机'}` : '当前参考机位 · 尚未截取';
    field('compare-notice').textContent = `${referenceCompareNotice(currentReference(), capture)} 对照展示当前已应用场景。`;
    const overlay = $('input[name="rs-compare-mode"]:checked').value === 'overlay';
    $('.rs-comparison').classList.toggle('is-overlay', overlay); $('.rs-opacity').hidden = !overlay;
    $('.rs-comparison').style.setProperty('--rs-opacity', Number(field('opacity').value) / 100);
    field('correct').disabled = state.busy || !capture;
  }
  async function capture() {
    if (typeof controller?.captureMonitor !== 'function') throw new Error('当前版本暂不支持机位截图。');
    const result = await controller.captureMonitor();
    if (!result?.dataUrl) throw new Error('场景中需要一台可用摄影机，才能生成对照画面。');
    state.capture = result; updateComparison(); return result;
  }
  function modelMode() {
    const textOnly = field('text-only').checked;
    $('.rs-model-warning').hidden = field('model').value !== 'deepseek-v4-pro' || textOnly;
  }
  async function loadImage(file) {
    validateReferenceFile(file);
    const token = ++state.uploadToken; const url = URL.createObjectURL(file); const img = new Image(); img.src = url;
    try {
      await img.decode();
      const size = resizedImageDimensions(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('无法处理图片，请重试。');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size.width, size.height); ctx.drawImage(img, 0, 0, size.width, size.height);
      const dataUrl = canvas.toDataURL('image/jpeg', .87);
      if (token !== state.uploadToken || state.disposed) { URL.revokeObjectURL(url); return; }
      if (state.image) URL.revokeObjectURL(state.image.url);
      clearDraft(); state.image = { id: `reference-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)}`, name: file.name, url, dataUrl, width: img.naturalWidth, height: img.naturalHeight, modelWidth: size.width, modelHeight: size.height };
      field('image-meta').textContent = `${file.name} · ${img.naturalWidth} × ${img.naturalHeight}`; $('.rs-image-meta').hidden = false;
      updateComparison(); status('参考图已就绪。点击生成后才会发送给所选模型。');
    } catch (cause) { URL.revokeObjectURL(url); throw new Error(cause?.message?.includes('像素') ? cause.message : '无法解码这张图片，请换一张 JPG、PNG 或 WebP。'); }
  }
  async function run(mode) {
    if (state.busy) return; error('');
    const key = field('key').value.trim();
    if (!key) { $('.rs-settings').open = true; field('key').focus(); error('请先填写自己的 DeepSeek API Key，或使用下方无需密钥的工具测试。'); return; }
    const textOnly = field('text-only').checked;
    if (field('model').value === 'deepseek-v4-pro' && !textOnly && (state.image || mode === 'correct')) { $('.rs-settings').open = true; error('V4 Pro 只处理文字。请选择 Flash，或明确勾选“只使用文字和场景数据”。'); return; }
    if (!state.image && !field('instruction').value.trim()) { error('请上传参考图，或先描述需要的场景。'); field('instruction').focus(); return; }
    clearDraft(); setBusy(true); state.abort = new AbortController(); let session;
    try {
      const comparison = mode === 'correct' ? await capture() : null;
      const target = mode === 'correct' ? 'edit' : field('target').value;
      session = beginSession({ reference: currentReference(), reset: target === 'new' });
      const referenceImage = state.image && !textOnly ? { dataUrl: state.image.dataUrl, name: state.image.name, width: state.image.modelWidth, height: state.image.modelHeight, projection: field('projection').value } : undefined;
      const result = await runSceneAgent({ session, instruction: sceneInstruction({ description: field('instruction').value, scale: field('scale').value, projection: state.image ? field('projection').value : 'unknown', mode, target, textOnly }), apiKey: key, model: field('model').value, referenceImage, comparisonImage: !textOnly && comparison ? comparison : undefined, mode, signal: state.abort.signal, onProgress: value => { if (!state.disposed) status(progressMessage(value)); } });
      if (state.disposed || state.abort.signal.aborted) { session.discard(); return; }
      showDraft(session, result.summary, target);
    } catch (cause) { session?.discard?.(); if (!state.disposed) { error(cause?.name === 'AbortError' || state.abort?.signal.aborted ? '已停止。当前场景未被修改。' : cause?.message || '生成未完成，请检查模型设置后重试。'); status('当前场景保持原样。'); } }
    finally { state.abort = null; if (!state.disposed) { setBusy(false); updateComparison(); } }
  }
  function close() {
    if (state.busy) state.abort?.abort(); dialog.close(); launch.setAttribute('aria-expanded', 'false'); lastFocus?.focus?.();
  }
  function open() {
    if (state.disposed) return;
    lastFocus = document.activeElement; controller?.cancelTransform?.();
    if (!dialog.open) dialog.showModal(); launch.setAttribute('aria-expanded', 'true');
    updateComparison(); field('instruction').focus();
  }
  launch.addEventListener('click', open);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  field('file').addEventListener('change', () => {
    const file = field('file').files?.[0]; if (!file) return;
    error(''); loadImage(file).catch(cause => error(cause.message)); field('file').value = '';
  });
  field('projection').addEventListener('change', updateComparison);
  field('target').addEventListener('change', () => { field('target-note').textContent = field('target').value === 'new' ? '应用时替换当前布景，可一次撤销；生成期间保留原场景。' : '根据描述编辑当前场景，保留未涉及的物体。'; });
  field('model').addEventListener('change', modelMode); field('text-only').addEventListener('change', modelMode);
  for (const element of dialog.querySelectorAll('input[name="rs-compare-mode"]')) element.addEventListener('change', updateComparison);
  field('opacity').addEventListener('input', updateComparison);
  dialog.addEventListener('click', async event => {
    const action = event.target.closest('[data-rs]')?.dataset.rs;
    try {
      if (action === 'close' || action === 'edit') close();
      if (action === 'cancel') { state.abort?.abort(); status('正在停止…'); }
      if (action === 'generate') await run('generate');
      if (action === 'correct') await run('correct');
      if (action === 'clear-image' && !state.busy) { ++state.uploadToken; if (state.image) URL.revokeObjectURL(state.image.url); state.image = null; $('.rs-image-meta').hidden = true; clearDraft(); updateComparison(); }
      if (action === 'capture') { error(''); await capture(); status('已刷新当前已应用场景的机位画面。'); }
      if (action === 'discard') { clearDraft(); status('已放弃草稿。当前场景未被修改。'); }
      if (action === 'apply' && state.draft) {
        error(''); state.draft.commit(); state.draft = null; $('.rs-draft').hidden = true;
        status('已应用到场景，可一次撤销。关闭此页即可继续三轴编辑。'); notify('参考场景已应用，可继续三轴编辑');
        try { await capture(); } catch (cause) { error(cause.message); }
      }
      if (action === 'download-tools') {
        const session = beginSession();
        saveJson({ format: 'camera-planner-tools-v1', tools: session.tools, scene: await session.execute('scene_get_state', { offset: 0, limit: 200 }) }, 'camera-planner-tools.json'); session.discard();
      }
      if (action === 'run-tools' && !state.busy) {
        error(''); const calls = parseSceneToolCalls(field('tool-calls').value); clearDraft();
        const session = beginSession({ reference: currentReference(), reset: false });
        try {
          const results = [];
          for (const call of calls) results.push(await session.execute(call.name, call.arguments));
          field('tool-results').textContent = JSON.stringify(results, null, 2).slice(0, 200000); field('tool-results').hidden = false;
          showDraft(session, `已执行 ${calls.length} 条工具调用；更改尚未应用。`, 'edit');
        } catch (cause) { session.discard(); throw cause; }
      }
    } catch (cause) { error(cause?.message || '操作未完成。'); }
  });
  updateComparison(); modelMode();
  return { open, close, capture, getReference: currentReference, dispose() { if (state.disposed) return; state.disposed = true; ++state.uploadToken; state.abort?.abort(); clearDraft(); if (state.image) URL.revokeObjectURL(state.image.url); field('key').value = ''; launch.removeEventListener('click', open); launch.remove(); dialog.remove(); } };
}
