# @muraguchi/camera-planner

3D 机位规划组件，为 Muraguchi AI 影视创作平台构建。纯前端 npm 包，数据由 Muraguchi 主项目后端管理。

- 当前 npm 包版本：`0.4.0`
- 当前项目数据 Schema：`4.0`

## 快速开始

```bash
npm install @muraguchi/camera-planner three react react-dom
```

```tsx
import { CameraPlanner } from '@muraguchi/camera-planner'
import '@muraguchi/camera-planner/dist/style.css'

function MyPage() {
  return (
    <CameraPlanner
      projectId="my-project"
      apiUrl="/api/camera-planner"
      onCameraChange={(camera) => console.log('changed:', camera)}
      onCameraSelect={(id) => console.log('selected:', id)}
    />
  )
}
```

## 功能

- 3D 场景渲染（Three.js r160+）+ 自由导航
- 多机位管理：添加/删除/选择，锥体可视化 FOV
- 真实光学参数：焦距 8-300mm、7 种传感器预设、光圈、FOV/DOF 实时计算
- 12 种预设物体（方块、球体、人物、建筑、车辆、树木等）
- 5 种场景模板（摄影棚、客厅、街道、咖啡馆、空白）
- 8 种运镜预设（推进、拉出、摇镜、环绕、升降等）
- 5 种灯光预设（日光、室内、夜景、柔和、戏剧）
- 分镜表（3×3 / 5×5 网格）
- 时间线播放 + 关键帧路径
- JSON 项目导出 / PNG 视口截图
- 撤销/重做（Ctrl+Z / Ctrl+Y）

## 五面板布局

```
┌──────────────────────────────────────────────┐
│  A: TopToolbar                               │
│  模式 · 工具 · 撤销/重做 · 网格 · 导出        │
├────────┬─────────────────────┬───────────────┤
│ B:     │  C: Viewport        │ D:            │
│ Side-  │  (3D 场景)          │ Property      │
│ bar    │                     │ Panel         │
│        │                     │               │
│ 机位   │                     │ 焦距 · 光圈   │
│ 物体   │                     │ 位置 · 旋转   │
│ 场景   │                     │ FOV · DOF     │
│ 角色   │                     │               │
├────────┴─────────────────────┴───────────────┤
│  E: BottomPanel                              │
│  时间线 · 分镜表 · 关键帧                      │
└──────────────────────────────────────────────┘
```

## 架构

```
src/
├── engine/          # Three.js 3D 引擎（纯 Three.js，无 React 依赖）
│   ├── calc.ts      # FOV/DOF 纯数学计算
│   ├── SceneEngine  # 场景/渲染器/控制器/动画循环
│   ├── CameraRig    # 摄像机锥体可视化 + 管理
│   ├── ObjectLib    # 12 种物体工厂
│   ├── LightSystem  # 灯光 + 预设
│   ├── PathSystem   # 运镜路径关键帧插值
│   └── RayPicker    # 射线拾取 + 拖拽交互
│
├── components/      # React UI 组件
│   ├── CameraPlanner  # 主入口（五面板布局）
│   ├── Viewport       # 3D 视口容器
│   ├── TopToolbar     # A区：模式/工具/导出
│   ├── Sidebar        # B区：标签切换
│   ├── CameraList     # 机位列表
│   ├── ObjectPalette  # 物体库网格
│   ├── SceneTemplates # 场景模板卡片
│   ├── PropertyPanel  # D区：参数编辑
│   ├── BottomPanel    # E区：标签切换
│   ├── StoryboardGrid # 分镜表
│   ├── Timeline       # 时间线播放
│   └── ExportDialog   # 导出弹窗
│
├── store/           # Zustand 状态管理
│   └── usePlannerStore  # 全部状态 + undo/redo
│
├── io/              # I/O 通信协议
│   ├── InputManager   # 主项目 → Camera Planner
│   ├── OutputManager  # Camera Planner → 主项目（事件）
│   └── ApiClient      # REST 客户端
│
├── types/           # TypeScript 类型定义
│   ├── camera.ts    # Camera, SensorPreset, DOFResult, MovementConfig
│   ├── scene.ts     # SceneConfig, SceneObject, LightingConfig
│   ├── project.ts   # ProjectData, PathPoint, StoryboardConfig
│   └── events.ts    # PlannerEventMap
│
├── presets/         # 预设数据
│   ├── sensors.ts   # 7 种传感器（全画幅/ARRI/RED/Sony/Canon/BMPCC/MFT）
│   ├── movements.ts # 8 种运镜（推进/拉出/摇镜/俯仰/跟踪/环绕/升降）
│   ├── lights.ts    # 5 种灯光
│   └── templates.ts # 5 种场景模板
│
├── index.ts         # 包入口
└── styles.css       # 深色主题样式
```

## I/O 协议

Camera Planner 通过两个管道与主项目通信：

### InputManager（主项目 → Planner）

```typescript
import { inputManager } from '@muraguchi/camera-planner'

inputManager.loadProject(projectData)        // 加载完整项目
inputManager.loadCameras(cameras)            // 仅加载机位
inputManager.loadScene(sceneConfig)          // 加载场景
inputManager.updateCamera(id, { focal: 85 }) // 更新参数
inputManager.selectCamera(id)                // 外部选中
```

### OutputManager（Planner → 主项目）

```typescript
import { outputManager } from '@muraguchi/camera-planner'

outputManager.on('camera:change', (camera) => {
  // 用户修改了摄像机参数 → 同步到后端
  await api.saveCamera(projectId, camera.id, camera)
})

outputManager.on('camera:select', (id) => { ... })
outputManager.on('camera:add', (camera) => { ... })
outputManager.on('camera:delete', (id) => { ... })
outputManager.on('scene:change', (scene) => { ... })
outputManager.on('project:export', (data) => { ... })

// 同步获取
const data = outputManager.exportProject()
const png = await outputManager.exportStoryboardPNG()
```

### 事件流

```
主项目                           Camera Planner
──────                           ──────────────

页面加载
  │
  ├─ GET /api/.../projects/{id}
  │       │
  │       ▼
  │ input.loadProject(data) ────→ 渲染 3D + UI
  │
用户拖拽摄像机
  │
  │ output.emit('camera:change') ←── 参数变更
  │       │
  ├─ PUT /api/.../cameras/{id}
  │
用户点击分镜格
  │
  │ output.emit('camera:select') ←── 选中 CAM-02
  └─ 主项目响应
```

## 开发

```bash
git clone https://github.com/adcam040708-source/camera-planner.git
cd camera-planner
npm install
npm run dev          # 启动 Vite 开发服务器 (demo/)
npm run build        # 构建 npm 包
npx tsx src/engine/__tests__/calc.test.ts  # 运行单元测试
```

## 传感器预设

| 名称 | 传感器尺寸 (mm) |
|------|----------------|
| 全画幅 | 36 × 24 |
| ARRI Alexa 35 | 29.9 × 22.2 |
| RED V-Raptor | 40.96 × 21.6 |
| Sony FX6 | 35.7 × 23.8 |
| Canon C70 (S35) | 26.2 × 13.8 |
| BMPCC 6K (S35) | 23.1 × 12.95 |
| MFT | 17.3 × 13 |

## 技术栈

| 层 | 选型 |
|---|---|
| 3D | Three.js r160+ |
| UI | React 19 |
| 状态 | Zustand 4 |
| 语言 | TypeScript 5 |
| 构建 | Vite 5 (Library Mode) |
| 测试 | tsx + 自定义 runner |

## CHANGELOG

### v0.4.0 (2026-07-29)

- 统一 npm 包版本与 v4 项目数据 Schema 说明
- 开始稳定化工程：项目历史隔离、拖拽写回与关联数据清理

### v0.2.0 (2026-07-03)

- 新增 10 个 React UI 组件，完成五面板布局
- 新增深色主题 CSS 样式
- 新增 demo 演示页（含 3 个示例摄像机）
- 新增 calc.ts 单元测试（25 项，全部通过）
- Vite Library Mode 构建：ES 113KB / UMD 80KB / CSS 10KB
- TypeScript 类型声明文件自动生成

### v0.1.0 (2026-07-02)

- 初始架构：纯前端 npm 包
- Three.js r160+ 引擎层（SceneEngine、CameraRig、ObjectLib、LightSystem、PathSystem、RayPicker）
- FOV/DOF 纯数学计算模块
- 类型定义 + 预设数据
- Zustand 状态管理 + undo/redo
- I/O 协议（InputManager / OutputManager / ApiClient）

## License

MIT
