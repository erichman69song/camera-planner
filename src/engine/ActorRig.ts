/**
 * ActorRig — articulated procedural performers for blocking and action preview.
 *
 * Each actor is built from a lightweight joint hierarchy with recognisable
 * clothing, face, hands and shoes. Action states drive genuinely different
 * silhouettes instead of changing only a label.
 */

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Actor, ActorAction, ActorBodyType, ActorKeyframe } from '../types/actor'
import { Position3D, Rotation3D } from '../types/camera'
import { deg2rad, generateId, lerp, easeInOutCubic } from './calc'

const DEFAULT_ACTOR_COLOR = 0x4ecdc4
const SELECTED_ACTOR_COLOR = 0xffc45d

type Rot = [number, number, number]

interface Pose {
  bodyY?: number
  torso?: Rot
  head?: Rot
  leftArm?: Rot
  rightArm?: Rot
  leftElbow?: Rot
  rightElbow?: Rot
  leftLeg?: Rot
  rightLeg?: Rot
  leftKnee?: Rot
  rightKnee?: Rot
}

const POSES: Record<ActorAction, Pose> = {
  stand: {
    leftArm: [0.08, 0, 0.08],
    rightArm: [-0.08, 0, -0.08],
  },
  walk: {
    torso: [0.06, 0.03, 0],
    leftArm: [0.6, 0, 0.08],
    rightArm: [-0.6, 0, -0.08],
    leftElbow: [-0.28, 0, 0],
    rightElbow: [-0.18, 0, 0],
    leftLeg: [-0.5, 0, 0],
    rightLeg: [0.5, 0, 0],
    leftKnee: [0.22, 0, 0],
    rightKnee: [0.45, 0, 0],
  },
  run: {
    torso: [0.28, 0, 0],
    leftArm: [1.0, 0, 0.08],
    rightArm: [-1.0, 0, -0.08],
    leftElbow: [-1.12, 0, 0],
    rightElbow: [-1.12, 0, 0],
    leftLeg: [-0.9, 0, 0.04],
    rightLeg: [0.72, 0, -0.04],
    leftKnee: [0.5, 0, 0],
    rightKnee: [1.08, 0, 0],
  },
  sit: {
    bodyY: -0.28,
    torso: [0.06, 0, 0],
    leftArm: [-0.18, 0, 0.14],
    rightArm: [-0.18, 0, -0.14],
    leftElbow: [-0.72, 0, 0],
    rightElbow: [-0.72, 0, 0],
    leftLeg: [-1.45, 0, 0],
    rightLeg: [-1.45, 0, 0],
    leftKnee: [1.45, 0, 0],
    rightKnee: [1.45, 0, 0],
  },
  turn: {
    torso: [0, 0.45, 0],
    head: [0, 0.75, 0],
    leftArm: [0.18, 0.1, 0.06],
    rightArm: [-0.18, -0.2, -0.06],
    leftLeg: [-0.12, 0.22, 0],
    rightLeg: [0.1, -0.18, 0],
  },
  gesture: {
    torso: [0, -0.12, 0],
    head: [0, -0.18, 0],
    leftArm: [0.05, 0, 0.1],
    rightArm: [-0.2, 0, -1.35],
    rightElbow: [-0.45, 0.18, 0],
  },
  leave: {
    torso: [0.12, 0.12, 0],
    head: [0, -0.48, 0],
    leftArm: [0.72, 0, 0.08],
    rightArm: [-0.72, 0, -0.08],
    leftElbow: [-0.24, 0, 0],
    rightElbow: [-0.24, 0, 0],
    leftLeg: [-0.58, 0, 0],
    rightLeg: [0.5, 0, 0],
    leftKnee: [0.3, 0, 0],
    rightKnee: [0.55, 0, 0],
  },
}

interface ActorEntry {
  actor: Actor
  group: THREE.Group
  pathLine: THREE.Line | null
  pathMarkers: THREE.Mesh[]
  displayedAction: ActorAction
}

export class ActorRig {
  private scene: THREE.Scene
  private actors: Map<string, ActorEntry> = new Map()
  private selectedId: string | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  addActor(params: Partial<Actor> = {}): Actor {
    const id = params.id || generateId()
    const actor: Actor = {
      id,
      name: params.name || `角色${this.actors.size + 1}`,
      role: params.role || 'principal',
      bodyType: params.bodyType || 'adult_male',
      action: params.action || 'stand',
      position: params.position || { x: 0, y: 0, z: 0 },
      rotation: params.rotation || { yaw: 0, pitch: 0, roll: 0 },
      scale: params.scale || { x: 1, y: 1, z: 1 },
      height: params.height || 1.7,
      color: params.color ?? DEFAULT_ACTOR_COLOR,
      keyframes: params.keyframes || [],
    }

    const group = this.createActorMesh(actor)
    this.scene.add(group)
    this.actors.set(id, {
      actor,
      group,
      pathLine: null,
      pathMarkers: [],
      displayedAction: actor.action,
    })
    this.refreshPath(id)
    return actor
  }

  updateActor(id: string, params: Partial<Actor>): Actor | null {
    const entry = this.actors.get(id)
    if (!entry) return null

    const rebuild =
      (params.height !== undefined && params.height !== entry.actor.height) ||
      (params.color !== undefined && params.color !== entry.actor.color) ||
      (params.bodyType !== undefined && params.bodyType !== entry.actor.bodyType)
    const positionChanged = params.position !== undefined
    const rotationChanged = params.rotation !== undefined
    const scaleChanged = params.scale !== undefined
    const actionChanged = params.action !== undefined
    const keyframesChanged = params.keyframes !== undefined

    Object.assign(entry.actor, params)

    if (rebuild) {
      this.scene.remove(entry.group)
      this.disposeGroup(entry.group)
      entry.group = this.createActorMesh(entry.actor)
      entry.displayedAction = entry.actor.action
      this.scene.add(entry.group)
    } else {
      if (positionChanged) {
        entry.group.position.set(
          entry.actor.position.x,
          entry.actor.position.y,
          entry.actor.position.z
        )
      }
      if (rotationChanged) {
        entry.group.rotation.set(
          deg2rad(entry.actor.rotation.pitch),
          deg2rad(entry.actor.rotation.yaw),
          deg2rad(entry.actor.rotation.roll)
        )
      }
      if (scaleChanged) {
        entry.group.scale.set(
          entry.actor.scale.x,
          entry.actor.scale.y,
          entry.actor.scale.z
        )
      }
      if (actionChanged) {
        this.applyPose(entry.group, entry.actor.action, entry.actor.height)
        entry.displayedAction = entry.actor.action
      }
    }

    if (keyframesChanged || positionChanged || rotationChanged) this.refreshPath(id)
    if (id === this.selectedId) this.highlightActor(id, true)
    return entry.actor
  }

  updatePlayback(time: number): void {
    for (const [id, entry] of this.actors) {
      const sample = this.sampleAtTime(id, time)
      if (!sample) {
        if (entry.displayedAction !== entry.actor.action) {
          this.applyPose(entry.group, entry.actor.action, entry.actor.height)
          entry.displayedAction = entry.actor.action
        }
        continue
      }
      entry.group.position.set(sample.position.x, sample.position.y, sample.position.z)
      entry.group.rotation.set(
        deg2rad(sample.rotation.pitch),
        deg2rad(sample.rotation.yaw),
        deg2rad(sample.rotation.roll)
      )
      const action = sample.action as ActorAction
      if (entry.displayedAction !== action) {
        this.applyPose(entry.group, action, entry.actor.height)
        entry.displayedAction = action
      }
    }
  }

  deleteActor(id: string): boolean {
    const entry = this.actors.get(id)
    if (!entry) return false
    this.scene.remove(entry.group)
    this.disposeGroup(entry.group)
    this.clearPath(entry)
    this.actors.delete(id)
    if (this.selectedId === id) this.selectedId = null
    return true
  }

  selectActor(id: string | null): void {
    if (this.selectedId) this.highlightActor(this.selectedId, false)
    this.selectedId = id
    if (id) this.highlightActor(id, true)
  }

  getActor(id: string): Actor | null {
    return this.actors.get(id)?.actor || null
  }

  getAllActors(): Actor[] {
    return Array.from(this.actors.values()).map(entry => entry.actor)
  }

  getMeshGroup(id: string): THREE.Group | null {
    return this.actors.get(id)?.group || null
  }

  getAllMeshGroups(): THREE.Group[] {
    return Array.from(this.actors.values()).map(entry => entry.group)
  }

  getHelperObjects(): THREE.Object3D[] {
    const helpers: THREE.Object3D[] = []
    for (const entry of this.actors.values()) {
      if (entry.pathLine) helpers.push(entry.pathLine)
      helpers.push(...entry.pathMarkers)
      const footprint = entry.group.getObjectByName('actor-footprint')
      if (footprint) helpers.push(footprint)
    }
    return helpers
  }

  addKeyframe(
    actorId: string,
    keyframe: Partial<ActorKeyframe> & { position: Position3D }
  ): ActorKeyframe | null {
    const entry = this.actors.get(actorId)
    if (!entry) return null
    const next: ActorKeyframe = {
      id: keyframe.id || generateId(),
      time: keyframe.time ?? 0,
      position: keyframe.position,
      rotation: keyframe.rotation || { yaw: 0, pitch: 0, roll: 0 },
      action: keyframe.action || entry.actor.action,
    }
    entry.actor.keyframes.push(next)
    entry.actor.keyframes.sort((a, b) => a.time - b.time)
    this.refreshPath(actorId)
    return next
  }

  removeKeyframe(actorId: string, keyframeId: string): boolean {
    const entry = this.actors.get(actorId)
    if (!entry) return false
    const before = entry.actor.keyframes.length
    entry.actor.keyframes = entry.actor.keyframes.filter(k => k.id !== keyframeId)
    if (entry.actor.keyframes.length === before) return false
    this.refreshPath(actorId)
    return true
  }

  sampleAtTime(
    actorId: string,
    time: number
  ): { position: Position3D; rotation: Rotation3D; action: ActorAction } | null {
    const entry = this.actors.get(actorId)
    if (!entry || entry.actor.keyframes.length === 0) return null
    const keyframes = entry.actor.keyframes
    if (keyframes.length === 1) {
      const only = keyframes[0]
      return { position: only.position, rotation: only.rotation, action: only.action }
    }

    let index = 0
    for (; index < keyframes.length - 1; index++) {
      if (keyframes[index + 1].time >= time) break
    }
    index = Math.min(index, keyframes.length - 2)
    const a = keyframes[index]
    const b = keyframes[index + 1]
    const span = b.time - a.time
    const local = span > 0 ? Math.max(0, Math.min(1, (time - a.time) / span)) : 0
    const t = easeInOutCubic(local)
    return {
      position: {
        x: lerp(a.position.x, b.position.x, t),
        y: lerp(a.position.y, b.position.y, t),
        z: lerp(a.position.z, b.position.z, t),
      },
      rotation: {
        yaw: lerp(a.rotation.yaw, b.rotation.yaw, t),
        pitch: lerp(a.rotation.pitch, b.rotation.pitch, t),
        roll: lerp(a.rotation.roll, b.rotation.roll, t),
      },
      action: local < 0.5 ? a.action : b.action,
    }
  }

  importActors(actors: Actor[]): void {
    this.clearAll()
    actors.forEach(actor => this.addActor(actor))
  }

  clearAll(): void {
    for (const id of Array.from(this.actors.keys())) this.deleteActor(id)
  }

  dispose(): void {
    this.clearAll()
  }

  private createActorMesh(actor: Actor): THREE.Group {
    const root = new THREE.Group()
    root.userData = { actorId: actor.id, type: 'actor' }
    const body = new THREE.Group()
    body.name = 'rig-body'
    root.add(body)

    const h = actor.height
    const proportions = this.getBodyProportions(actor.bodyType)
    const skin = this.material(0xd5a27f, 0.82, 0)
    const shirt = this.material(actor.color, 0.72, 0.02)
    const trousers = this.material(this.offsetColor(actor.color, -0.34), 0.8, 0.01)
    const shoes = this.material(0x20252a, 0.58, 0.08)
    const hair = this.material(0x2a201c, 0.92, 0)

    const hipY = h * 0.52
    const shoulderY = h * 0.77
    const torsoHeight = shoulderY - hipY + h * 0.04
    const torsoWidth = h * proportions.shoulder
    const torsoDepth = h * proportions.depth

    const pelvis = this.rounded(
      body,
      [h * proportions.hip, h * 0.18, torsoDepth * 0.96],
      [0, hipY, 0],
      trousers,
      h * 0.035,
      'actor-surface'
    )
    pelvis.name = 'rig-pelvis'

    const torsoPivot = new THREE.Group()
    torsoPivot.name = 'rig-torso'
    torsoPivot.position.set(0, hipY + h * 0.05, 0)
    body.add(torsoPivot)
    this.rounded(
      torsoPivot,
      [torsoWidth, torsoHeight, torsoDepth],
      [0, torsoHeight / 2, 0],
      shirt,
      h * 0.05,
      'actor-surface'
    )

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.045, h * 0.05, h * 0.095, 16), skin)
    neck.position.set(0, shoulderY + h * 0.105, 0)
    neck.castShadow = true
    neck.userData.actorSurface = true
    body.add(neck)

    const headPivot = new THREE.Group()
    headPivot.name = 'rig-head'
    headPivot.position.set(0, h * 0.885, 0)
    body.add(headPivot)
    const headRadius = h * proportions.head
    const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 28, 20), skin)
    head.scale.set(0.88, 1.08, 0.9)
    head.castShadow = true
    head.userData.actorSurface = true
    headPivot.add(head)
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(headRadius * 0.91, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.54),
      hair
    )
    hairCap.position.y = headRadius * 0.24
    hairCap.scale.set(0.9, 0.75, 0.92)
    hairCap.castShadow = true
    hairCap.userData.actorSurface = true
    headPivot.add(hairCap)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(h * 0.025, h * 0.07, 12), skin)
    nose.rotation.x = Math.PI / 2
    nose.position.set(0, 0, headRadius * 0.88)
    nose.userData.actorSurface = true
    headPivot.add(nose)

    const upperArm = h * 0.18
    const forearm = h * 0.17
    const armX = torsoWidth / 2 + h * 0.025
    this.createArm(body, 'left', -armX, shoulderY, upperArm, forearm, shirt, skin)
    this.createArm(body, 'right', armX, shoulderY, upperArm, forearm, shirt, skin)

    const thigh = h * 0.235
    const shin = h * 0.235
    const legX = h * proportions.hip * 0.24
    this.createLeg(body, 'left', -legX, hipY, thigh, shin, trousers, shoes)
    this.createLeg(body, 'right', legX, hipY, thigh, shin, trousers, shoes)

    const footprint = new THREE.Mesh(
      new THREE.RingGeometry(h * 0.19, h * 0.235, 36),
      new THREE.MeshBasicMaterial({
        color: actor.color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
    footprint.name = 'actor-footprint'
    footprint.rotation.x = -Math.PI / 2
    footprint.position.y = 0.025
    footprint.userData = { actorId: actor.id, part: 'base' }
    root.add(footprint)

    root.position.set(actor.position.x, actor.position.y, actor.position.z)
    root.rotation.set(
      deg2rad(actor.rotation.pitch),
      deg2rad(actor.rotation.yaw),
      deg2rad(actor.rotation.roll)
    )
    root.scale.set(actor.scale.x, actor.scale.y, actor.scale.z)
    root.traverse(child => {
      child.userData = { ...child.userData, actorId: actor.id }
    })
    this.applyPose(root, actor.action, actor.height)
    return root
  }

  private createArm(
    parent: THREE.Group,
    side: 'left' | 'right',
    x: number,
    y: number,
    upperLength: number,
    lowerLength: number,
    sleeve: THREE.Material,
    skin: THREE.Material
  ): void {
    const upper = new THREE.Group()
    upper.name = `rig-${side}-arm`
    upper.position.set(x, y, 0)
    parent.add(upper)
    this.limb(upper, upperLength, upperLength * 0.17, sleeve)

    const elbow = new THREE.Group()
    elbow.name = `rig-${side}-elbow`
    elbow.position.y = -upperLength
    upper.add(elbow)
    const joint = new THREE.Mesh(new THREE.SphereGeometry(upperLength * 0.18, 14, 10), skin)
    joint.userData.actorSurface = true
    elbow.add(joint)
    this.limb(elbow, lowerLength, lowerLength * 0.15, skin)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(lowerLength * 0.16, 14, 10), skin)
    hand.scale.set(0.76, 1.18, 0.62)
    hand.position.y = -lowerLength
    hand.castShadow = true
    hand.userData.actorSurface = true
    elbow.add(hand)
  }

  private createLeg(
    parent: THREE.Group,
    side: 'left' | 'right',
    x: number,
    y: number,
    thighLength: number,
    shinLength: number,
    trousers: THREE.Material,
    shoes: THREE.Material
  ): void {
    const upper = new THREE.Group()
    upper.name = `rig-${side}-leg`
    upper.position.set(x, y, 0)
    parent.add(upper)
    this.limb(upper, thighLength, thighLength * 0.18, trousers)

    const knee = new THREE.Group()
    knee.name = `rig-${side}-knee`
    knee.position.y = -thighLength
    upper.add(knee)
    const joint = new THREE.Mesh(new THREE.SphereGeometry(thighLength * 0.17, 14, 10), trousers)
    joint.userData.actorSurface = true
    knee.add(joint)
    this.limb(knee, shinLength, shinLength * 0.15, trousers)
    const shoe = new THREE.Mesh(
      new RoundedBoxGeometry(shinLength * 0.32, shinLength * 0.18, shinLength * 0.52, 3, shinLength * 0.05),
      shoes
    )
    shoe.position.set(0, -shinLength, shinLength * 0.12)
    shoe.castShadow = true
    shoe.userData.actorSurface = true
    knee.add(shoe)
  }

  private limb(parent: THREE.Group, length: number, radius: number, material: THREE.Material): void {
    const segment = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 5, 10),
      material
    )
    segment.position.y = -length / 2
    segment.castShadow = true
    segment.userData.actorSurface = true
    parent.add(segment)
  }

  private applyPose(root: THREE.Group, action: ActorAction, height: number): void {
    const pose = POSES[action] || POSES.stand
    const body = root.getObjectByName('rig-body') as THREE.Group | undefined
    if (!body) return
    body.position.y = (pose.bodyY || 0) * height
    this.setRotation(root, 'rig-torso', pose.torso)
    this.setRotation(root, 'rig-head', pose.head)
    this.setRotation(root, 'rig-left-arm', pose.leftArm)
    this.setRotation(root, 'rig-right-arm', pose.rightArm)
    this.setRotation(root, 'rig-left-elbow', pose.leftElbow)
    this.setRotation(root, 'rig-right-elbow', pose.rightElbow)
    this.setRotation(root, 'rig-left-leg', pose.leftLeg)
    this.setRotation(root, 'rig-right-leg', pose.rightLeg)
    this.setRotation(root, 'rig-left-knee', pose.leftKnee)
    this.setRotation(root, 'rig-right-knee', pose.rightKnee)
  }

  private setRotation(root: THREE.Object3D, name: string, rotation: Rot = [0, 0, 0]): void {
    root.getObjectByName(name)?.rotation.set(...rotation)
  }

  private getBodyProportions(type: ActorBodyType): {
    shoulder: number
    hip: number
    depth: number
    head: number
  } {
    if (type === 'adult_female') return { shoulder: 0.25, hip: 0.23, depth: 0.13, head: 0.105 }
    if (type === 'child') return { shoulder: 0.23, hip: 0.21, depth: 0.14, head: 0.125 }
    return { shoulder: 0.28, hip: 0.22, depth: 0.14, head: 0.105 }
  }

  private rounded(
    group: THREE.Group,
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
    radius: number,
    marker?: string
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(...size, 3, Math.min(radius, Math.min(...size) / 2)),
      material
    )
    mesh.position.set(...position)
    mesh.castShadow = true
    mesh.receiveShadow = true
    if (marker) mesh.userData[marker] = true
    group.add(mesh)
    return mesh
  }

  private material(color: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness })
  }

  private offsetColor(color: number, amount: number): number {
    const next = new THREE.Color(color)
    next.offsetHSL(0, 0, amount)
    return next.getHex()
  }

  private refreshPath(actorId: string): void {
    const entry = this.actors.get(actorId)
    if (!entry) return
    this.clearPath(entry)
    const keyframes = entry.actor.keyframes
    if (keyframes.length === 0) return

    const markerGeometry = new THREE.SphereGeometry(0.1, 12, 8)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: entry.actor.color })
    for (const keyframe of keyframes) {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.position.set(keyframe.position.x, keyframe.position.y, keyframe.position.z)
      marker.userData = {
        actorId,
        keyframeId: keyframe.id,
        type: 'actor-keyframe',
      }
      this.scene.add(marker)
      entry.pathMarkers.push(marker)
    }

    if (keyframes.length >= 2) {
      const points = keyframes.map(
        keyframe => new THREE.Vector3(
          keyframe.position.x,
          keyframe.position.y,
          keyframe.position.z
        )
      )
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineDashedMaterial({
          color: entry.actor.color,
          dashSize: 0.3,
          gapSize: 0.2,
        })
      )
      line.computeLineDistances()
      this.scene.add(line)
      entry.pathLine = line
    }
  }

  private clearPath(entry: ActorEntry): void {
    if (entry.pathLine) {
      this.scene.remove(entry.pathLine)
      entry.pathLine.geometry.dispose()
      const material = entry.pathLine.material
      if (Array.isArray(material)) material.forEach(m => m.dispose())
      else material.dispose()
      entry.pathLine = null
    }
    if (entry.pathMarkers.length > 0) {
      const geometry = entry.pathMarkers[0].geometry
      const material = entry.pathMarkers[0].material
      entry.pathMarkers.forEach(marker => this.scene.remove(marker))
      geometry.dispose()
      if (Array.isArray(material)) material.forEach(m => m.dispose())
      else material.dispose()
      entry.pathMarkers = []
    }
  }

  private highlightActor(id: string, highlight: boolean): void {
    const entry = this.actors.get(id)
    if (!entry) return
    entry.group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return
      if (child.name === 'actor-footprint') {
        ;(child.material as THREE.MeshBasicMaterial).color.setHex(
          highlight ? SELECTED_ACTOR_COLOR : entry.actor.color
        )
        return
      }
      const material = child.material
      const materials = Array.isArray(material) ? material : [material]
      materials.forEach(mat => {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          mat.emissive.setHex(highlight ? 0x4d3511 : 0x000000)
          mat.emissiveIntensity = highlight ? 0.32 : 0
        }
      })
    })
  }

  private disposeGroup(group: THREE.Group): void {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    group.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return
      geometries.add(child.geometry)
      if (Array.isArray(child.material)) child.material.forEach(m => materials.add(m))
      else materials.add(child.material)
    })
    geometries.forEach(g => g.dispose())
    materials.forEach(m => m.dispose())
  }
}
