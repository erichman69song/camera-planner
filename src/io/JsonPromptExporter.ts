/**
 * JsonPromptExporter — 把项目数据转成AI视频模型的JSON Prompt
 *
 * 核心输出模块：读取编辑器里的所有主体（相机/角色/物体），
 * 把它们在量化空间坐标系内的动态数据整理成结构化JSON。
 *
 * 数据来源：
 * - 相机关键帧 ← project.path (PathPoint[], 按 cameraId 过滤)
 * - 角色关键帧 ← project.actors[].keyframes (ActorKeyframe[])
 * - 场景物体   ← project.scene.objects (SceneObject[])
 * - 时间参数   ← project.timeline (duration)
 */

import { ProjectData } from '../types/project'
import { JsonPrompt, JsonSceneBlock, JsonCameraBlock, JsonActorBlock, JsonTimelineBlock } from '../types/prompt'

export class JsonPromptExporter {
  /**
   * 把完整项目数据转成 JSON Prompt
   */
  export(project: ProjectData): JsonPrompt {
    return {
      version: project.version,
      scene: this.exportScene(project),
      cameras: this.exportCameras(project),
      actors: this.exportActors(project),
      timeline: this.exportTimeline(project),
    }
  }

  /**
   * 导出为 JSON 字符串（带缩进）
   */
  exportString(project: ProjectData): string {
    return JSON.stringify(this.export(project), null, 2)
  }

  /** 场景块：环境+物体 */
  private exportScene(project: ProjectData): JsonSceneBlock {
    return {
      template: project.scene.template,
      lighting: {
        position: project.scene.lighting.position,
        intensity: project.scene.lighting.intensity,
        color: project.scene.lighting.color,
        preset: project.scene.lighting.preset,
      },
      objects: project.scene.objects.map(obj => ({
        id: obj.id,
        name: obj.name,
        type: obj.type,
        position: obj.position,
        rotation: obj.rotation,
        scale: obj.scale,
        color: obj.color,
      })),
      lights: (project.scene.lights || []).map(light => ({
        id: light.id,
        name: light.name,
        type: light.type,
        position: light.position,
        rotation: light.rotation,
        scale: light.scale,
        color: light.color,
        intensity: light.intensity,
        distance: light.distance,
        enabled: light.enabled,
      })),
      modifiers: (project.scene.modifiers || []).map(modifier => ({
        id: modifier.id,
        name: modifier.name,
        type: modifier.type,
        position: modifier.position,
        rotation: modifier.rotation,
        scale: modifier.scale,
        transmission: modifier.transmission,
        diffusion: modifier.diffusion,
        enabled: modifier.enabled,
      })),
    }
  }

  /** 相机块：光学参数+运动轨迹 */
  private exportCameras(project: ProjectData): JsonCameraBlock[] {
    const duration = project.timeline.duration || 1

    return project.cameras.map(cam => {
      // 从 path 里取出该相机的关键帧，按 t 排序
      const pathPoints = project.path
        .filter(p => p.cameraId === cam.id)
        .sort((a, b) => a.t - b.t)

      // 把 t(0-1) 转成时间(秒)
      const keyframes = pathPoints.map(p => ({
        time: Math.round(p.t * duration * 100) / 100,
        position: p.position,
        rotation: p.rotation,
      }))

      return {
        id: cam.id,
        name: cam.name,
        optical: {
          focal: cam.focal,
          sensorW: cam.sensorW,
          sensorH: cam.sensorH,
          fstop: cam.fstop,
          focusDist: cam.focusDist,
          fov: cam.fov,
          dof: cam.dof,
        },
        movement: cam.movement ? {
          type: cam.movement.type,
          duration: cam.movement.duration,
        } : undefined,
        keyframes,
      }
    })
  }

  /** 角色块：身份+运动轨迹 */
  private exportActors(project: ProjectData): JsonActorBlock[] {
    return project.actors.map(actor => ({
      id: actor.id,
      name: actor.name,
      role: actor.role,
      bodyType: actor.bodyType,
      action: actor.action,
      scale: actor.scale,
      height: actor.height,
      keyframes: actor.keyframes.map(k => ({
        time: k.time,
        position: k.position,
        rotation: k.rotation,
        action: k.action,
      })),
    }))
  }

  /** 时间线块 */
  private exportTimeline(project: ProjectData): JsonTimelineBlock {
    return {
      duration: project.timeline.duration,
      fps: 24,
    }
  }
}

/** 单例 */
export const jsonPromptExporter = new JsonPromptExporter()
