/**
 * ObjectLib — procedural previs asset library.
 *
 * The assets intentionally stay dependency-free and lightweight enough for a
 * browser editor, while exposing recognisable construction details at blocking
 * distance. Every root accepts position, rotation and non-uniform XYZ scale.
 */

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { SceneObject, ObjectType } from '../types/scene'
import { deg2rad, generateId } from './calc'

export class ObjectLib {
  private scene: THREE.Scene
  private objects: Map<string, { data: SceneObject; mesh: THREE.Object3D }> = new Map()

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  addObject(params: Partial<SceneObject> & { type: ObjectType }): SceneObject {
    const id = params.id || generateId()
    const data: SceneObject = {
      id,
      name: params.name,
      type: params.type,
      position: params.position || { x: 0, y: 0, z: 0 },
      rotation: params.rotation || { yaw: 0, pitch: 0, roll: 0 },
      scale: params.scale || { x: 1, y: 1, z: 1 },
      color: params.color ?? 0x888888,
    }

    const mesh = this.createMesh(data)
    this.tagObjectId(mesh, id, data.type)
    this.scene.add(mesh)
    this.objects.set(id, { data, mesh })
    return data
  }

  updateObject(id: string, params: Partial<SceneObject>): SceneObject | null {
    const entry = this.objects.get(id)
    if (!entry) return null
    Object.assign(entry.data, params)
    this.scene.remove(entry.mesh)
    this.disposeObject(entry.mesh)
    const next = this.createMesh(entry.data)
    this.tagObjectId(next, id, entry.data.type)
    this.scene.add(next)
    entry.mesh = next
    return entry.data
  }

  deleteObject(id: string): boolean {
    const entry = this.objects.get(id)
    if (!entry) return false
    this.scene.remove(entry.mesh)
    this.disposeObject(entry.mesh)
    this.objects.delete(id)
    return true
  }

  getAllObjects(): SceneObject[] {
    return Array.from(this.objects.values()).map(entry => entry.data)
  }

  getObject(id: string): SceneObject | null {
    return this.objects.get(id)?.data || null
  }

  getMesh(id: string): THREE.Object3D | null {
    return this.objects.get(id)?.mesh || null
  }

  getAllMeshes(): THREE.Object3D[] {
    return Array.from(this.objects.values()).map(entry => entry.mesh)
  }

  clearAll(): void {
    for (const id of Array.from(this.objects.keys())) this.deleteObject(id)
  }

  private tagObjectId(root: THREE.Object3D, id: string, type: ObjectType): void {
    root.userData = { ...root.userData, objectId: id, objectType: type }
    root.traverse(child => {
      child.userData = { ...child.userData, objectId: id, objectType: type }
    })
  }

  private createMesh(data: SceneObject): THREE.Object3D {
    const base = this.standard(data.color, 0.68, 0.06)
    let root: THREE.Object3D

    switch (data.type) {
      case 'person':
        root = this.createPerson(data, base)
        break
      case 'building':
        root = this.createBuilding(data, base)
        break
      case 'car':
        root = this.createCar(data, base)
        break
      case 'tree':
        root = this.createTree(data, base)
        break
      case 'chair':
        root = this.createChair(data, base)
        break
      case 'sofa':
        root = this.createSofa(data, base)
        break
      case 'bookshelf':
        root = this.createBookshelf(data, base)
        break
      case 'table':
        root = this.createTable(data, base)
        break
      case 'wall':
        root = this.createWall(data, base)
        break
      case 'window':
        root = this.createWindow(data, base)
        break
      case 'door':
        root = this.createDoor(data, base)
        break
      default:
        root = this.createPrimitive(data, base)
    }

    this.applyTransform(root, data)
    return root
  }

  private createPrimitive(data: SceneObject, material: THREE.Material): THREE.Mesh {
    let geometry: THREE.BufferGeometry
    switch (data.type) {
      case 'sphere':
        geometry = new THREE.SphereGeometry(0.5, 32, 20)
        break
      case 'cone':
        geometry = new THREE.ConeGeometry(0.5, 1, 24)
        break
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 24)
        break
      case 'torus':
        geometry = new THREE.TorusGeometry(0.5, 0.14, 16, 48)
        break
      case 'plane':
        geometry = new THREE.PlaneGeometry(1, 1)
        break
      case 'prop':
        geometry = new RoundedBoxGeometry(0.36, 0.36, 0.36, 3, 0.045)
        break
      default:
        geometry = new RoundedBoxGeometry(1, 1, 1, 3, 0.035)
    }
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = data.type !== 'plane'
    mesh.receiveShadow = true
    return mesh
  }

  private createSofa(_data: SceneObject, upholstery: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    const darkFabric = this.standard(this.offsetColor((_data.color || 0x777777), -0.17), 0.9, 0)
    const wood = this.standard(0x39271d, 0.72, 0.04)

    this.rounded(group, [2.35, 0.28, 0.9], [0, 0.3, 0], darkFabric, 0.08)
    this.rounded(group, [2.18, 0.22, 0.76], [0, 0.55, 0.04], upholstery, 0.07)
    this.rounded(group, [2.25, 0.82, 0.22], [0, 0.9, -0.38], darkFabric, 0.06, [-0.08, 0, 0])
    this.rounded(group, [0.25, 0.64, 0.92], [-1.18, 0.63, 0], upholstery, 0.075)
    this.rounded(group, [0.25, 0.64, 0.92], [1.18, 0.63, 0], upholstery, 0.075)

    for (let i = 0; i < 3; i++) {
      const x = -0.72 + i * 0.72
      this.rounded(group, [0.66, 0.16, 0.69], [x, 0.72, 0.06], upholstery, 0.055)
      this.rounded(group, [0.66, 0.62, 0.15], [x, 1.03, -0.25], upholstery, 0.055, [-0.14, 0, 0])
    }
    for (const x of [-0.92, 0.92]) {
      for (const z of [-0.28, 0.28]) {
        this.rounded(group, [0.09, 0.19, 0.09], [x, 0.1, z], wood, 0.02)
      }
    }
    return group
  }

  private createBookshelf(data: SceneObject, wood: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    const back = this.standard(this.offsetColor(data.color, -0.2), 0.8, 0)
    const shelf = this.standard(this.offsetColor(data.color, 0.06), 0.66, 0.02)
    this.box(group, [1.6, 2.25, 0.12], [0, 1.125, -0.25], back)
    this.rounded(group, [0.13, 2.35, 0.52], [-0.77, 1.175, 0], wood, 0.025)
    this.rounded(group, [0.13, 2.35, 0.52], [0.77, 1.175, 0], wood, 0.025)
    this.rounded(group, [1.66, 0.13, 0.54], [0, 0.07, 0], wood, 0.025)
    this.rounded(group, [1.66, 0.13, 0.54], [0, 2.28, 0], wood, 0.025)

    const colors = [0x99574b, 0x3d6f83, 0xb08b4b, 0x687a53, 0x72567d]
    for (let row = 0; row < 4; row++) {
      const shelfY = 0.56 + row * 0.54
      this.rounded(group, [1.48, 0.09, 0.5], [0, shelfY, 0], shelf, 0.02)
      for (let i = 0; i < 6; i++) {
        const width = 0.1 + (i % 3) * 0.025
        const height = 0.29 + ((row + i) % 3) * 0.055
        const book = this.standard(colors[(row + i) % colors.length], 0.78, 0)
        this.rounded(
          group,
          [width, height, 0.27],
          [-0.58 + i * 0.205, shelfY + 0.07 + height / 2, 0.02],
          book,
          0.01,
          [0, 0, (i % 4 === 0 ? -0.07 : 0)]
        )
      }
    }
    return group
  }

  private createTable(data: SceneObject, top: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    const edge = this.standard(this.offsetColor(data.color, -0.18), 0.6, 0.06)
    const metal = this.standard(0x313a41, 0.3, 0.68)
    this.rounded(group, [1.8, 0.11, 0.92], [0, 0.78, 0], top, 0.045)
    this.rounded(group, [1.6, 0.12, 0.72], [0, 0.68, 0], edge, 0.02)
    for (const x of [-0.73, 0.73]) {
      for (const z of [-0.31, 0.31]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 0.67, 12), metal)
        leg.position.set(x, 0.335, z)
        leg.castShadow = true
        group.add(leg)
        this.rounded(group, [0.14, 0.035, 0.14], [x, 0.02, z], metal, 0.015)
      }
    }
    return group
  }

  private createChair(data: SceneObject, upholstery: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    const frame = this.standard(this.offsetColor(data.color, -0.3), 0.54, 0.14)
    this.rounded(group, [0.54, 0.12, 0.54], [0, 0.48, 0], upholstery, 0.055)
    this.rounded(group, [0.52, 0.55, 0.11], [0, 0.78, -0.23], upholstery, 0.055, [-0.08, 0, 0])
    for (const x of [-0.21, 0.21]) {
      for (const z of [-0.2, 0.2]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.45, 10), frame)
        leg.position.set(x, 0.225, z)
        leg.castShadow = true
        group.add(leg)
      }
    }
    return group
  }

  private createWall(data: SceneObject, finish: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    const baseboard = this.standard(this.offsetColor(data.color, -0.24), 0.6, 0.05)
    this.box(group, [4, 3, 0.18], [0, 1.5, 0], finish)
    this.rounded(group, [4.05, 0.16, 0.08], [0, 0.08, 0.12], baseboard, 0.018)
    this.rounded(group, [4.05, 0.09, 0.08], [0, 2.94, 0.12], baseboard, 0.014)
    return group
  }

  private createWindow(data: SceneObject, frame: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    const frameMat = this.standard(this.offsetColor(data.color, -0.2), 0.35, 0.48)
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x9ec9d8,
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.28,
      transmission: 0.56,
      side: THREE.DoubleSide,
    })
    const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.32), glass)
    glassMesh.position.set(0, 1.52, 0)
    glassMesh.receiveShadow = true
    group.add(glassMesh)
    this.rounded(group, [1.9, 0.11, 0.12], [0, 0.8, 0], frameMat, 0.02)
    this.rounded(group, [1.9, 0.11, 0.12], [0, 2.24, 0], frameMat, 0.02)
    this.rounded(group, [0.11, 1.55, 0.12], [-0.895, 1.52, 0], frameMat, 0.02)
    this.rounded(group, [0.11, 1.55, 0.12], [0.895, 1.52, 0], frameMat, 0.02)
    this.rounded(group, [0.07, 1.38, 0.08], [0, 1.52, 0.02], frameMat, 0.015)
    this.rounded(group, [1.74, 0.07, 0.08], [0, 1.52, 0.02], frameMat, 0.015)
    this.rounded(group, [2.04, 0.13, 0.28], [0, 0.75, 0.04], frame, 0.025)
    return group
  }

  private createDoor(data: SceneObject, slab: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    const trim = this.standard(this.offsetColor(data.color, -0.22), 0.62, 0.04)
    const metal = this.standard(0xc7a45b, 0.25, 0.72)
    this.rounded(group, [1.02, 2.16, 0.12], [0, 1.08, 0], slab, 0.025)
    this.rounded(group, [1.2, 0.1, 0.15], [0, 2.22, 0], trim, 0.02)
    this.rounded(group, [0.1, 2.28, 0.15], [-0.56, 1.11, 0], trim, 0.02)
    this.rounded(group, [0.1, 2.28, 0.15], [0.56, 1.11, 0], trim, 0.02)
    for (const y of [0.55, 1.5]) {
      this.rounded(group, [0.72, 0.56, 0.035], [0, y, 0.08], trim, 0.018)
    }
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 18, 12), metal)
    handle.position.set(0.37, 1.02, 0.12)
    handle.castShadow = true
    group.add(handle)
    return group
  }

  private createBuilding(data: SceneObject, facade: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    const trim = this.standard(this.offsetColor(data.color, -0.2), 0.72, 0.03)
    const glass = this.standard(0x29465b, 0.18, 0.42)
    this.box(group, [3.4, 4.8, 2.5], [0, 2.4, 0], facade)
    this.box(group, [3.55, 0.18, 2.65], [0, 4.88, 0], trim)
    for (let floor = 0; floor < 4; floor++) {
      for (let bay = 0; bay < 3; bay++) {
        const win = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.7, 0.04, 2, 0.02), glass)
        win.position.set(-0.82 + bay * 0.82, 1.0 + floor * 1.02, 1.27)
        group.add(win)
        this.rounded(group, [0.7, 0.055, 0.08], [win.position.x, win.position.y - 0.4, 1.3], trim, 0.012)
      }
    }
    this.rounded(group, [0.86, 1.15, 0.08], [0, 0.58, 1.29], trim, 0.02)
    return group
  }

  private createCar(data: SceneObject, body: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    const glass = this.standard(0x5b7f91, 0.16, 0.48)
    const rubber = this.standard(0x17191c, 0.84, 0.03)
    const chrome = this.standard(0xb8c2c8, 0.2, 0.78)
    this.rounded(group, [2.65, 0.54, 1.18], [0, 0.48, 0], body, 0.16)
    this.rounded(group, [1.35, 0.56, 1.05], [-0.12, 0.91, 0], glass, 0.12)
    this.rounded(group, [0.42, 0.12, 1.08], [1.27, 0.48, 0], chrome, 0.03)
    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.16, 24)
    for (const x of [-0.82, 0.82]) {
      for (const z of [-0.62, 0.62]) {
        const wheel = new THREE.Mesh(wheelGeo, rubber)
        wheel.position.set(x, 0.28, z)
        wheel.rotation.x = Math.PI / 2
        wheel.castShadow = true
        group.add(wheel)
      }
    }
    return group
  }

  private createTree(_data: SceneObject, foliage: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    const bark = this.standard(0x6b4930, 0.94, 0)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.8, 14), bark)
    trunk.position.y = 0.9
    trunk.castShadow = true
    group.add(trunk)
    for (const [x, y, z, s] of [
      [0, 2.1, 0, 0.82],
      [-0.45, 2.0, 0.05, 0.58],
      [0.42, 2.15, -0.08, 0.62],
      [0.05, 2.55, 0.05, 0.56],
    ] as const) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 2), foliage)
      crown.position.set(x, y, z)
      crown.castShadow = true
      group.add(crown)
    }
    return group
  }

  private createPerson(data: SceneObject, clothing: THREE.Material): THREE.Group {
    const group = new THREE.Group()
    const skin = this.standard(0xd6aa85, 0.82, 0)
    const dark = this.standard(this.offsetColor(data.color, -0.34), 0.78, 0)
    this.rounded(group, [0.46, 0.66, 0.25], [0, 1.2, 0], clothing, 0.1)
    this.rounded(group, [0.38, 0.24, 0.24], [0, 0.83, 0], dark, 0.07)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), skin)
    head.position.y = 1.68
    head.castShadow = true
    group.add(head)
    for (const x of [-0.18, 0.18]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.56, 5, 10), clothing)
      arm.position.set(x, 1.1, 0)
      arm.castShadow = true
      group.add(arm)
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.62, 5, 10), dark)
      leg.position.set(x * 0.6, 0.43, 0)
      leg.castShadow = true
      group.add(leg)
    }
    return group
  }

  private standard(color: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness })
  }

  private rounded(
    group: THREE.Group,
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material,
    radius: number,
    rotation: [number, number, number] = [0, 0, 0]
  ): THREE.Mesh {
    const [x, y, z] = size
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(x, y, z, 3, Math.min(radius, Math.min(x, y, z) / 2)),
      material
    )
    mesh.position.set(...position)
    mesh.rotation.set(...rotation)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  private box(
    group: THREE.Group,
    size: [number, number, number],
    position: [number, number, number],
    material: THREE.Material
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
    mesh.position.set(...position)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  private offsetColor(color: number, amount: number): number {
    const c = new THREE.Color(color)
    c.offsetHSL(0, 0, amount)
    return c.getHex()
  }

  private applyTransform(object: THREE.Object3D, data: SceneObject): void {
    object.position.set(data.position.x, data.position.y, data.position.z)
    object.rotation.set(
      deg2rad(data.rotation.pitch),
      deg2rad(data.rotation.yaw),
      deg2rad(data.rotation.roll)
    )
    object.scale.set(data.scale.x, data.scale.y, data.scale.z)
  }

  private disposeObject(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    root.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return
      geometries.add(child.geometry)
      if (Array.isArray(child.material)) child.material.forEach(m => materials.add(m))
      else materials.add(child.material)
    })
    geometries.forEach(g => g.dispose())
    materials.forEach(m => m.dispose())
  }
}
