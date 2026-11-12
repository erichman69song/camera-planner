import { createSceneSession, applyToolBatch, SCENE_TOOL_DEFINITIONS } from './scene-tools.mjs';
const BROWSER_TOOL_DEFINITIONS = SCENE_TOOL_DEFINITIONS.map(tool => ({ ...structuredClone(tool), function: {
  ...structuredClone(tool.function), description: tool.function.name === 'scene_finish'
    ? 'Acknowledge completion of browser tool edits that have already been applied. This action changes no scene data. Use the UI tool-batch draft or cameraPlannerScene.batch for one grouped undo.'
    : tool.function.description + (tool.function.name === 'scene_get_state' ? '' : ' In this live browser interface, this single action applies immediately and creates one undo step. The UI generation workflow stages changes separately.'),
} }));

/** Same validated actions for the UI, in-page LLM harnesses and WebMCP agents. */
export function createSceneToolInterface({ bridge, controller, notify = () => {}, host = globalThis.window, registry = globalThis.document?.modelContext } = {}) {
  const lifecycle = new AbortController();
  const previous = host?.cameraPlannerScene;
  const known = new Set(SCENE_TOOL_DEFINITIONS.map(tool => tool.function.name));
  function prepare() {
    const transform=controller?.getTransformState?.();
    if(transform?.dragging||transform?.keyboard)throw new Error('请先完成当前三轴操作，再执行场景工具');
  }
  const api = Object.freeze({
    version: '1.0',
    list: () => structuredClone(BROWSER_TOOL_DEFINITIONS),
    read: (args = {}) => createSceneSession(bridge).execute('scene_get_state', args),
    execute(name, args = {}) {
      if (!known.has(name)) throw new Error('未知场景工具');
      if (name === 'scene_get_state') return api.read(args);
      if (name === 'scene_finish') {
        const session=createSceneSession(bridge);const result=session.execute(name,args);session.discard();
        return {acknowledged:true,applied:false,summary:result.summary,assumptions:result.assumptions};
      }
      prepare();
      const session = createSceneSession(bridge);
      try {
        const result = session.execute(name, args);
        const applied = session.commit();
        if (applied.applied) notify('已执行场景工具，可撤销');
        return { result, changes: applied };
      } catch (error) { if (session.status === 'active') session.discard(); throw error; }
    },
    batch(calls) {
      prepare();
      const result = applyToolBatch(bridge, { calls });
      if (result.applied) notify('已应用工具指令，可一次撤销');
      return result;
    },
    capture: options => controller?.captureMonitor?.(options) || null,
  });
  if (host) host.cameraPlannerScene = api;
  let registrationErrors = 0;
  if (typeof registry?.registerTool === 'function') {
    for (const definition of BROWSER_TOOL_DEFINITIONS) {
      const item = definition.function;
      try {
        Promise.resolve(registry.registerTool({
          name: item.name, description: item.description, inputSchema: item.parameters,
          annotations: { readOnlyHint: item.name === 'scene_get_state', destructiveHint: item.name === 'scene_remove_entity' },
          execute: input => api.execute(item.name, input),
        }, { signal: lifecycle.signal })).catch(() => { registrationErrors++; });
      } catch { registrationErrors++; }
    }
  }
  return {
    api, get registrationErrors() { return registrationErrors; },
    dispose() { lifecycle.abort(); if (host?.cameraPlannerScene === api) { if (previous === undefined) delete host.cameraPlannerScene; else host.cameraPlannerScene = previous; } },
  };
}
