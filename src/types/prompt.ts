/**
 * JsonPrompt schema — AI视频模型输入格式
 *
 * 把3D编辑器里的所有主体（相机/角色/物体）的
 * 量化空间坐标和动态运动数据，整理成结构化JSON。
 * 这个JSON直接作为prompt喂给AI视频生成模型。
 */

/** JSON Prompt 顶层结构 */
export interface JsonPrompt {
  version: string
  scene: JsonSceneBlock
  cameras: JsonCameraBlock[]
  actors: JsonActorBlock[]
  timeline: JsonTimelineBlock
}

/** 场景块：环境+物体 */
export interface JsonSceneBlock {
  template: string
  lighting: {
    position: { x: number; y: number; z: number }
    intensity: number
    color: number
    preset: string
  }
  objects: Array<{
    id: string
    name?: string
    type: string
    position: { x: number; y: number; z: number }
    rotation: { yaw: number; pitch: number; roll: number }
    scale: { x: number; y: number; z: number }
    color: number
  }>
  lights: Array<{
    id: string
    name: string
    type: string
    position: { x: number; y: number; z: number }
    rotation: { yaw: number; pitch: number; roll: number }
    scale: { x: number; y: number; z: number }
    color: number
    intensity: number
    distance: number
    enabled: boolean
  }>
  modifiers: Array<{
    id: string
    name: string
    type: string
    position: { x: number; y: number; z: number }
    rotation: { yaw: number; pitch: number; roll: number }
    scale: { x: number; y: number; z: number }
    transmission: number
    diffusion: number
    enabled: boolean
  }>
}

/** 相机块：光学参数+运动轨迹 */
export interface JsonCameraBlock {
  id: string
  name: string
  optical: {
    focal: number        // mm
    sensorW: number      // mm
    sensorH: number      // mm
    fstop: number
    focusDist: number    // m
    fov: number          // degrees, calculated
    dof: { near: number; far: number; range: number }
  }
  movement?: {
    type: string
    duration: number
  }
  keyframes: Array<{
    time: number         // seconds
    position: { x: number; y: number; z: number }
    rotation: { yaw: number; pitch: number; roll: number }
  }>
}

/** 角色块：身份+运动轨迹 */
export interface JsonActorBlock {
  id: string
  name: string
  role: string
  bodyType: string
  action: string
  scale: { x: number; y: number; z: number }
  height: number
  keyframes: Array<{
    time: number         // seconds
    position: { x: number; y: number; z: number }
    rotation: { yaw: number; pitch: number; roll: number }
    action: string
  }>
}

/** 时间线块 */
export interface JsonTimelineBlock {
  duration: number      // total seconds
  fps: number           // frames per second (default 24)
}
