# 场景工具接口 v1

三种入口共用 `workspace-state.mjs` 的真实编辑动作；基础体以中心为原点，单位米，Y 向上，摄影机朝局部 -Z，旋转采用工作台的 YXZ 欧拉角（度）。人物位置仍是脚底锚点，既有家具的比例与原点以场景中实际资产为准。

## 页面内 LLM

“参考图建场”调用 DeepSeek，再按返回的 function tool calls 操作草稿。工具会校验参数，拒绝未知指令、锁定物体修改和非有限坐标。整组草稿只有应用时才进入当前场景，产生一次撤销记录；生成期间发生手工编辑会拒绝过期草稿。

提供 `scene_get_state`、`scene_add_object`、`scene_update_entity`、`scene_remove_entity`、`scene_set_camera`、`scene_finish`。查看和下载页面中的工具定义可获得精确参数。最多 6 轮模型交互、40 次工具调用，不会无限重试；超时和失败不应用草稿。

无需 API 时，将“LLM 工具测试”下载的工具及场景数据交给任意识别 JSON 的 LLM，要求输出调用数组。粘贴后点击“运行工具草稿”，核对改动再应用。此入口编辑当前场景，不清空原有内容：

```json
[
  {"name":"scene_add_object","arguments":{"name":"桌子代理","primitive":"box","position":{"x":0,"y":0.4,"z":0},"size":{"x":1.6,"y":0.8,"z":0.8},"color":"#99745b"}},
  {"name":"scene_finish","arguments":{"summary":"新增可编辑桌子代理","assumptions":["桌面与桌腿使用整体外包体积近似。"]}}
]
```

## 浏览器 Agent / WebMCP

支持 `document.modelContext` 的浏览器会注册同名六项工具，页面打开时可发现。**浏览器工具逐次执行会立即应用，每次一个撤销记录**；这里的 `scene_finish` 只确认已完成，不应用额外修改。注册不可用时，正常 UI 和页面接口仍可使用。

页面全局 `window.cameraPlannerScene` 提供 `list()`、`read({offset,limit})`、`execute(name,args)`、`batch(calls)`、`capture({cameraId,width})`。`batch` 整组校验通过后才一次应用；失败不会留下部分修改。正在拖动三轴工具时，外部编辑调用会拒绝，以保护当前操作。读取接口只返回允许的场景参数，不返回图片、Key 或任意项目附加内容。

该接口访问当前打开页面的浏览器本地场景。没有对外暴露共享的全局场景，也没有远程持久化会话；关闭页面后不能继续编辑。独立 HTTP 客户端可使用 `/api/llm/chat` 获取工具调用，但仍需通过打开页面的工具执行器或粘贴入口应用。

## 模型 HTTP 转发

`POST /api/llm/chat`，请求头 `Authorization: Bearer <用户自己输入的 DeepSeek Key>`，JSON 请求包含 `model`、`messages`、`tools`。接口固定转发到 `https://api.deepseek.com/chat/completions`，支持当前验证过的 `deepseek-flash` 与 `deepseek-v4-pro`；不开启思考模式或流式返回。Key 不写入任何场景或持久存储。

普通静态托管不提供该路由。本地运行开发服务或发布 Worker 构建后可调用；没有密钥时返回 401，不执行实际模型请求。工具结构兼容与实测空间还原质量是两个独立检查。
