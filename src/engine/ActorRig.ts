/**
 * ActorRig — 角色3D可视化 + 运动路径管理
 *
 * 每个角色在3D场景里是一个人形实体（胶囊体+球头）。
 * 角色的运动关键帧显示为路径标记+连线。
 * 选中角色时高亮显示。
 *
 * 功能对标 CameraRig + PathSystem 的合体：
 * - 角色CRUD + 3D实体
 * - 运动关键帧路径可视化
 * - 时间轴播放时的位置插值
 */

import * as THREE from 'three'
import { Actor, ActorKeyframe } from '../types/actor'
import { Position3D, Rotation3D } from '../types/camera'
import { deg2rad, generateId, lerp, easeInOutCubic } from './calc'

const DEFAULT_ACTOR_COLOR = 0x4ecdc4
const SELECTED_ACTOR_COLOR = 0xffd93d
const PATH_COLOR = 0x4ecdc4

interface ActorEntry {
  actor: Actor
  group: THREE.Group
  pathLine: THREE.Line | null
  pathMarkers: THREE.Mesh[]
}

export class ActorRig {
  private scene: THREE.Scene
  private actors: Map<string, ActorEntry> = new Map()
  private selectedId: string | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /** 添加角色 */
  addActor(params: Partial<Actor> = {}): Actor {
    const id = params.id || generateId()
    const actor: Actor = {
      id,
      name: params.name || `角色${this.actors.size + 1}`,
      role: params.role || 'principal',
      position: params.position || { x: 0, y: 0, z: 0 },
      rotation: params.rotation || { yaw: 0, pitch: 0, roll: 0 },
      height: params.height || 1.7,
      color: params.color ?? DEFAULT_ACTOR_COLOR,
      keyframes: params.keyframes || [],
    }

    const group = this.createActorMesh(actor)
    this.scene.add(group)

    const entry: ActorEntry = { actor, group, pathLine: null, pathMarkers: [] }
    this.actors.set(id, entry)
    this.refreshPath(id)

    return actor
  }

  /** 更新角色 */
  updateActor(id: string, params: Partial<Actor>): Actor | null {
    const entry = this.actors.get(id)
    if (!entry) return null

    // Check which properties actually changed
    const heightChanged = params.height !== undefined && params.height !== entry.actor.height
    const colorChanged = params.color !== undefined && params.color !== entry.actor.color
    const posChanged = params.position !== undefined
    const rotChanged = params.rotation !== undefined
    const kfChanged = params.keyframes !== undefined

    // Update data
    Object.assign(entry.actor, params)

    // Only rebuild mesh if visual properties changed (height, color)
    if (heightChanged || colorChanged) {
      // Dispose old mesh before creating new one
      this.disposeGroup(entry.group)
      this.scene.remove(entry.group)
      entry.group = this.createActorMesh(entry.actor)
      this.scene.add(entry.group)
    } else {
      // Just update position/rotation on existing mesh
      if (posChanged) {
        entry.group.position.set(entry.actor.position.x, entry.actor.position.y, entry.actor.position.z)
      }
      if (rotChanged) {
        entry.group.rotation.set(0, deg2rad(entry.actor.rotation.yaw), 0)
      }
    }

    // Refresh path if keyframes or position changed
    if (kfChanged || posChanged || rotChanged) {
      this.refreshPath(id)
    }

    if (id === this.selectedId) {
      this.highlightActor(id, true)
    }

    return entry.actor
  }

  /** 时间轴播放：更新所有角色在指定时间的位置 */
  updatePlayback(time: number): void {
    for (const [id, entry] of this.actors) {
      const sample = this.sampleAtTime(id, time)
      if (sample) {
        entry.group.position.set(sample.position.x, sample.position.y, sample.position.z)
        entry.group.rotation.set(0, deg2rad(sample.rotation.yaw), 0)
      }
    }
  }

  /** 释放Group内所有Mesh的geometry和material */
  private disposeGroup(group: THREE.Group): void {
    group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose()
        const mat = child.material
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat?.dispose()
      }
    })
  }

  /** 删除角色 */
  deleteActor(id: string): boolean {
    const entry = this.actors.get(id)
    if (!entry) return false

    this.disposeGroup(entry.group)
    this.scene.remove(entry.group)
    this.clearPath(entry)
    this.actors.delete(id)

    if (this.selectedId === id) this.selectedId = null
    return true
  }

  /** 选中角色 */
  selectActor(id: string | null): void {
    if (this.selectedId) this.highlightActor(this.selectedId, false)
    this.selectedId = id
    if (id) this.highlightActor(id, true)
  }

  /** 获取角色数据 */
  getActor(id: string): Actor | null {
    return this.actors.get(id)?.actor || null
  }

  /** 获取所有角色 */
  getAllActors(): Actor[] {
    return Array.from(this.actors.values()).map(e => e.actor)
  }

  /** 获取3D Group（给RayPicker用） */
  getMeshGroup(id: string): THREE.Group | null {
    return this.actors.get(id)?.group || null
  }

  /** 获取所有Mesh Groups */
  getAllMeshGroups(): THREE.Group[] {
    return Array.from(this.actors.values()).map(e => e.group)
  }

  /** 路径线 / 路点标记 / 骨骼锚点 — 取景器渲染时临时隐藏 */
  getHelperObjects(): THREE.Object3D[] {
    const out: THREE.Object3D[] = []
    for (const entry of this.actors.values()) {
      if (entry.pathLine) out.push(entry.pathLine)
      out.push(...entry.pathMarkers)
      entry.group.traverse(o => {
        if (o.name && o.name.startsWith('bone_')) out.push(o)
      })
    }
    return out
  }

  /** 添加关键帧 */
  addKeyframe(actorId: string, kf: Partial<ActorKeyframe> & { position: Position3D }): ActorKeyframe | null {
    const entry = this.actors.get(actorId)
    if (!entry) return null

    const keyframe: ActorKeyframe = {
      id: kf.id || generateId(),
      time: kf.time ?? 0,
      position: kf.position,
      rotation: kf.rotation || { yaw: 0, pitch: 0, roll: 0 },
      action: kf.action || 'stand',
    }

    entry.actor.keyframes.push(keyframe)
    entry.actor.keyframes.sort((a, b) => a.time - b.time)
    this.refreshPath(actorId)
    return keyframe
  }

  /** 删除关键帧 */
  removeKeyframe(actorId: string, keyframeId: string): boolean {
    const entry = this.actors.get(actorId)
    if (!entry) return false

    const before = entry.actor.keyframes.length
    entry.actor.keyframes = entry.actor.keyframes.filter(k => k.id !== keyframeId)
    if (entry.actor.keyframes.length === before) return false
    this.refreshPath(actorId)
    return true
  }

  /** 获取某时间点的插值位置（播放用） */
  sampleAtTime(actorId: string, time: number): { position: Position3D; rotation: Rotation3D; action: string } | null {
    const entry = this.actors.get(actorId)
    if (!entry || entry.actor.keyframes.length === 0) return null

    const kfs = entry.actor.keyframes
    if (kfs.length === 1) {
      return {
        position: kfs[0].position,
        rotation: kfs[0].rotation,
        action: kfs[0].action,
      }
    }

    // 找到 time 前后的两个关键帧
    let i = 0
    for (; i < kfs.length - 1; i++) {
      if (kfs[i + 1].time >= time) break
    }
    i = Math.min(i, kfs.length - 2)

    const a = kfs[i]
    const b = kfs[i + 1]
    const span = b.time - a.time
    const localT = span > 0 ? (time - a.time) / span : 0
    const eased = easeInOutCubic(localT)

    return {
      position: {
        x: lerp(a.position.x, b.position.x, eased),
        y: lerp(a.position.y, b.position.y, eased),
        z: lerp(a.position.z, b.position.z, eased),
      },
      rotation: {
        yaw: lerp(a.rotation.yaw, b.rotation.yaw, eased),
        pitch: lerp(a.rotation.pitch, b.rotation.pitch, eased),
        roll: lerp(a.rotation.roll, b.rotation.roll, eased),
      },
      action: localT < 0.5 ? a.action : b.action,
    }
  }

  /** 导入角色列表（批量） */
  importActors(actors: Actor[]): void {
    this.clearAll()
    for (const a of actors) {
      this.addActor(a)
    }
  }

  /** 清空 */
  clearAll(): void {
    for (const [id] of this.actors) {
      this.deleteActor(id)
    }
  }

  // --- Private ---

  /** 创建角色3D实体 */
  private createActorMesh(actor: Actor): THREE.Group {
    const group = new THREE.Group()
    group.userData = { actorId: actor.id, type: 'actor' }

    const h = actor.height
    const color = actor.color

    // 身体（胶囊体）
    const bodyGeo = new THREE.CapsuleGeometry(0.25, h * 0.5, 4, 8)
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.1,
      roughness: 0.7,
    })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.position.y = h * 0.4
    body.castShadow = true
    body.userData = { actorId: actor.id, part: 'body' }
    group.add(body)

    // 头部（球体）
    const headGeo = new THREE.SphereGeometry(0.18, 16, 16)
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffdbac,
      roughness: 0.6,
    })
    const head = new THREE.Mesh(headGeo, headMat)
    head.position.y = h - 0.15
    head.castShadow = true
    head.userData = { actorId: actor.id, part: 'head' }
    group.add(head)

    // 朝向指示（小箭头）
    const arrowGeo = new THREE.ConeGeometry(0.08, 0.25, 4)
    const arrowMat = new THREE.MeshBasicMaterial({ color })
    const arrow = new THREE.Mesh(arrowGeo, arrowMat)
    arrow.rotation.x = Math.PI / 2
    arrow.position.set(0, h * 0.4, 0.3)
    arrow.userData = { actorId: actor.id, part: 'arrow' }
    group.add(arrow)

    // Ground footprint keeps actors readable against busy sets.
    const baseGeo = new THREE.RingGeometry(0.34, 0.42, 32)
    const baseMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const base = new THREE.Mesh(baseGeo, baseMat)
    base.rotation.x = -Math.PI / 2
    base.position.y = 0.025
    base.userData = { actorId: actor.id, part: 'base' }
    group.add(base)

    // 设置位置和朝向
    group.position.set(actor.position.x, actor.position.y, actor.position.z)
    group.rotation.set(0, deg2rad(actor.rotation.yaw), 0)

    return group
  }

  /** 刷新路径可视化 */
  private refreshPath(actorId: string): void {
    const entry = this.actors.get(actorId)
    if (!entry) return

    this.clearPath(entry)

    const kfs = entry.actor.keyframes
    if (kfs.length === 0) return

    const markerGeo = new THREE.SphereGeometry(0.1, 8, 8)
    const markerMat = new THREE.MeshBasicMaterial({ color: entry.actor.color })

    for (const kf of kfs) {
      const marker = new THREE.Mesh(markerGeo, markerMat)
      marker.position.set(kf.position.x, kf.position.y, kf.position.z)
      marker.userData = { actorId, keyframeId: kf.id, type: 'actor-keyframe' }
      this.scene.add(marker)
      entry.pathMarkers.push(marker)
    }

    if (kfs.length >= 2) {
      const points = kfs.map(k => new THREE.Vector3(k.position.x, k.position.y, k.position.z))
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points)
      const lineMat = new THREE.LineDashedMaterial({
        color: entry.actor.color,
        dashSize: 0.3,
        gapSize: 0.2,
      })
      const line = new THREE.Line(lineGeo, lineMat)
      line.computeLineDistances()
      this.scene.add(line)
      entry.pathLine = line
    }
  }

  /** 清除路径可视化 */
  private clearPath(entry: ActorEntry): void {
    if (entry.pathLine) {
      this.scene.remove(entry.pathLine)
      entry.pathLine.geometry?.dispose()
      const mat = entry.pathLine.material
      if (Array.isArray(mat)) mat.forEach(m => m.dispose())
      else mat?.dispose()
      entry.pathLine = null
    }
    if (entry.pathMarkers.length > 0) {
      // All markers share the same geometry and material — dispose only once
      const sharedGeo = entry.pathMarkers[0].geometry
      const sharedMat = entry.pathMarkers[0].material
      for (const m of entry.pathMarkers) {
        this.scene.remove(m)
      }
      sharedGeo?.dispose()
      if (Array.isArray(sharedMat)) sharedMat.forEach(m => m.dispose())
      else (sharedMat as THREE.Material)?.dispose()
      entry.pathMarkers = []
    }
  }

  /** 高亮角色 */
  private highlightActor(id: string, highlight: boolean): void {
    const entry = this.actors.get(id)
    if (!entry) return

    const color = highlight ? SELECTED_ACTOR_COLOR : entry.actor.color
    entry.group.traverse(child => {
      if (child instanceof THREE.Mesh && child.userData.part === 'body') {
        (child.material as THREE.MeshStandardMaterial).color.setHex(color)
      }
      if (child instanceof THREE.Mesh && child.userData.part === 'arrow') {
        (child.material as THREE.MeshBasicMaterial).color.setHex(color)
      }
      if (child instanceof THREE.Mesh && child.userData.part === 'base') {
        (child.material as THREE.MeshBasicMaterial).color.setHex(color)
      }
    })
  }

  /** 释放资源 */
  dispose(): void {
    this.clearAll()
  }
}
