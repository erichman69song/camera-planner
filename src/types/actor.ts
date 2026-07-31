/**
 * Actor types — 角色调度数据模型
 *
 * 角色在3D空间中的静态位置 + 运动关键帧。
 * 每个关键帧记录某个时间点的位置、朝向和动作。
 * 关键帧之间通过插值生成连续运动轨迹。
 */

import { Position3D, Rotation3D } from './camera'

/** 角色类型 */
export type ActorRole =
  | 'principal'    // 主角
  | 'supporting'   // 配角
  | 'extra'        // 群众演员

/** 角色动作 */
export type ActorAction =
  | 'stand'    // 站立
  | 'walk'     // 行走
  | 'run'      // 奔跑
  | 'sit'      // 坐
  | 'turn'     // 转身
  | 'gesture'  // 手势
  | 'leave'    // 离场

export type ActorBodyType =
  | 'adult_male'
  | 'adult_female'
  | 'child'

/** 角色运动关键帧 */
export interface ActorKeyframe {
  id: string
  time: number            // 秒，在时间线上的位置
  position: Position3D
  rotation: Rotation3D
  action: ActorAction
}

/** 角色 */
export interface Actor {
  id: string
  name: string
  role: ActorRole
  bodyType: ActorBodyType
  action: ActorAction
  position: Position3D     // 当前/初始位置
  rotation: Rotation3D     // 当前/初始朝向
  scale: Position3D        // 自由调整人物宽度/高度/厚度
  height: number           // 米
  color: number            // hex
  keyframes: ActorKeyframe[]  // 运动轨迹关键帧
}
