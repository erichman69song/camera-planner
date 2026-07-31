/**
 * LightSystem — editable practical lights and grip equipment.
 *
 * Point, area and line lights affect the renderer. Flags, butterfly silk and
 * blackout cloth are physical scene meshes with adjustable transmission,
 * diffusion and XYZ scale so the blocking plan describes the actual lighting
 * setup, not only an ambient preset.
 */

import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import {
  LightingConfig,
  StageLight,
  LightModifier,
  StageLightType,
  LightModifierType,
} from '../types/scene'
import { LIGHT_PRESETS } from '../presets/lights'
import { deg2rad } from './calc'

type EquipmentEntry<T> = {
  data: T
  group: THREE.Group
}

export class LightSystem {
  private scene: THREE.Scene
  private mainLight: THREE.DirectionalLight
  private fillLight: THREE.PointLight
  private helper: THREE.DirectionalLightHelper | null = null
  private config: LightingConfig
  private lights = new Map<string, EquipmentEntry<StageLight>>()
  private modifiers = new Map<string, EquipmentEntry<LightModifier>>()
  private selectedLightId: string | null = null
  private selectedModifierId: string | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
    RectAreaLightUniformsLib.init()

    this.mainLight = new THREE.DirectionalLight(0xfff5e0, 1.2)
    this.mainLight.position.set(10, 20, 10)
    this.mainLight.castShadow = true
    this.mainLight.shadow.mapSize.set(2048, 2048)
    this.mainLight.shadow.camera.near = 0.5
    this.mainLight.shadow.camera.far = 60
    this.mainLight.shadow.camera.left = -20
    this.mainLight.shadow.camera.right = 20
    this.mainLight.shadow.camera.top = 20
    this.mainLight.shadow.camera.bottom = -20
    scene.add(this.mainLight)

    this.fillLight = new THREE.PointLight(0x6688cc, 0.3, 50)
    this.fillLight.position.set(-8, 8, -8)
    scene.add(this.fillLight)

    this.config = {
      position: { x: 10, y: 20, z: 10 },
      intensity: 1.2,
      color: 0xfff5e0,
      preset: 'daylight',
    }
  }

  applyPreset(name: string): void {
    const preset = LIGHT_PRESETS.find(item => item.name === name)
    if (!preset) return
    this.config = {
      position: { ...preset.position },
      intensity: preset.intensity,
      color: preset.color,
      preset: name,
    }
    this.mainLight.position.set(preset.position.x, preset.position.y, preset.position.z)
    this.mainLight.intensity = preset.intensity
    this.mainLight.color.setHex(preset.color)
  }

  update(config: Partial<LightingConfig>): LightingConfig {
    if (config.position) {
      this.config.position = config.position
      this.mainLight.position.set(config.position.x, config.position.y, config.position.z)
    }
    if (config.intensity !== undefined) {
      this.config.intensity = config.intensity
      this.mainLight.intensity = config.intensity
    }
    if (config.color !== undefined) {
      this.config.color = config.color
      this.mainLight.color.setHex(config.color)
    }
    if (config.preset) this.config.preset = config.preset
    return { ...this.config }
  }

  getConfig(): LightingConfig {
    return { ...this.config }
  }

  syncEquipment(lights: StageLight[] = [], modifiers: LightModifier[] = []): void {
    const currentLightIds = new Set(lights.map(item => item.id))
    const currentModifierIds = new Set(modifiers.map(item => item.id))

    for (const id of Array.from(this.lights.keys())) {
      if (!currentLightIds.has(id)) this.removeLight(id)
    }
    for (const id of Array.from(this.modifiers.keys())) {
      if (!currentModifierIds.has(id)) this.removeModifier(id)
    }

    for (const light of lights) {
      const existing = this.lights.get(light.id)
      if (!existing) {
        const group = this.createLightRig(light)
        this.scene.add(group)
        this.lights.set(light.id, { data: structuredClone(light), group })
      } else if (JSON.stringify(existing.data) !== JSON.stringify(light)) {
        this.scene.remove(existing.group)
        this.disposeGroup(existing.group)
        const group = this.createLightRig(light)
        this.scene.add(group)
        this.lights.set(light.id, { data: structuredClone(light), group })
      }
    }

    for (const modifier of modifiers) {
      const existing = this.modifiers.get(modifier.id)
      if (!existing) {
        const group = this.createModifierRig(modifier)
        this.scene.add(group)
        this.modifiers.set(modifier.id, { data: structuredClone(modifier), group })
      } else if (JSON.stringify(existing.data) !== JSON.stringify(modifier)) {
        this.scene.remove(existing.group)
        this.disposeGroup(existing.group)
        const group = this.createModifierRig(modifier)
        this.scene.add(group)
        this.modifiers.set(modifier.id, { data: structuredClone(modifier), group })
      }
    }

    this.applySelection()
  }

  setSelection(lightId: string | null, modifierId: string | null): void {
    this.selectedLightId = lightId
    this.selectedModifierId = modifierId
    this.applySelection()
  }

  getLightGroups(): THREE.Group[] {
    return Array.from(this.lights.values()).map(entry => entry.group)
  }

  getModifierGroups(): THREE.Group[] {
    return Array.from(this.modifiers.values()).map(entry => entry.group)
  }

  getHelperObjects(): THREE.Object3D[] {
    const helpers: THREE.Object3D[] = []
    for (const group of [...this.getLightGroups(), ...this.getModifierGroups()]) {
      group.traverse(child => {
        if (child.name === 'equipment-helper') helpers.push(child)
      })
    }
    return helpers
  }

  setHelperVisible(visible: boolean): void {
    if (visible && !this.helper) {
      this.helper = new THREE.DirectionalLightHelper(this.mainLight, 2)
      this.scene.add(this.helper)
    }
    if (this.helper) this.helper.visible = visible
  }

  dispose(): void {
    for (const id of Array.from(this.lights.keys())) this.removeLight(id)
    for (const id of Array.from(this.modifiers.keys())) this.removeModifier(id)
    if (this.helper) {
      this.scene.remove(this.helper)
      this.helper.dispose()
    }
    this.scene.remove(this.mainLight)
    this.scene.remove(this.fillLight)
  }

  private createLightRig(light: StageLight): THREE.Group {
    const group = new THREE.Group()
    group.userData = { lightId: light.id, equipmentType: light.type }
    group.position.set(light.position.x, light.position.y, light.position.z)
    group.rotation.set(
      deg2rad(light.rotation.pitch),
      deg2rad(light.rotation.yaw),
      deg2rad(light.rotation.roll)
    )
    group.scale.set(light.scale.x, light.scale.y, light.scale.z)
    group.visible = light.enabled

    const frame = this.material(0x252b30, 0.36, 0.72)
    const accent = this.material(0xf0ae39, 0.4, 0.42)
    const emitter = new THREE.MeshStandardMaterial({
      color: light.color,
      emissive: light.color,
      emissiveIntensity: 2.8,
      roughness: 0.28,
      metalness: 0.08,
    })

    this.createStand(group, frame)
    if (light.type === 'point') {
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.32, 24), frame)
      housing.rotation.x = Math.PI / 2
      housing.position.z = 0.08
      housing.castShadow = true
      housing.userData.rigFrame = true
      group.add(housing)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), emitter)
      bulb.position.z = 0.25
      bulb.userData.rigEmitter = true
      group.add(bulb)
      const source = new THREE.PointLight(
        light.color,
        Math.max(0, light.intensity),
        Math.max(0, light.distance),
        2
      )
      source.position.z = 0.25
      source.castShadow = true
      source.shadow.mapSize.set(1024, 1024)
      source.shadow.bias = -0.0004
      group.add(source)
    } else if (light.type === 'area') {
      const body = new THREE.Mesh(new RoundedBoxGeometry(1.25, 0.82, 0.16, 3, 0.055), frame)
      body.userData.rigFrame = true
      body.castShadow = true
      group.add(body)
      const face = new THREE.Mesh(new RoundedBoxGeometry(1.12, 0.7, 0.035, 3, 0.04), emitter)
      face.position.z = 0.095
      face.userData.rigEmitter = true
      group.add(face)
      const source = new THREE.RectAreaLight(
        light.color,
        Math.max(0, light.intensity),
        1.12,
        0.7
      )
      source.position.z = 0.12
      source.lookAt(0, 0, 1)
      group.add(source)
      for (const x of [-0.54, 0.54]) {
        const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.98, 12), accent)
        yoke.position.x = x
        yoke.userData.rigFrame = true
        group.add(yoke)
      }
    } else {
      const tube = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 1.65, 8, 16), emitter)
      tube.rotation.z = Math.PI / 2
      tube.userData.rigEmitter = true
      group.add(tube)
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.07, 0.11), frame)
      rail.position.z = -0.08
      rail.userData.rigFrame = true
      rail.castShadow = true
      group.add(rail)
      for (let i = 0; i < 5; i++) {
        const source = new THREE.PointLight(
          light.color,
          Math.max(0, light.intensity) / 5,
          Math.max(0, light.distance),
          2
        )
        source.position.set(-0.72 + i * 0.36, 0, 0.08)
        source.castShadow = i === 2
        group.add(source)
      }
    }

    this.createGroundMarker(group, 0xf0ae39)
    this.tagGroup(group, { lightId: light.id })
    return group
  }

  private createModifierRig(modifier: LightModifier): THREE.Group {
    const group = new THREE.Group()
    group.userData = { modifierId: modifier.id, equipmentType: modifier.type }
    group.position.set(modifier.position.x, modifier.position.y, modifier.position.z)
    group.rotation.set(
      deg2rad(modifier.rotation.pitch),
      deg2rad(modifier.rotation.yaw),
      deg2rad(modifier.rotation.roll)
    )
    group.scale.set(modifier.scale.x, modifier.scale.y, modifier.scale.z)
    group.visible = modifier.enabled

    const frame = this.material(0x252a2f, 0.34, 0.76)
    const cloth = new THREE.MeshPhysicalMaterial({
      color: modifier.color,
      roughness: Math.max(0.12, modifier.diffusion),
      metalness: 0,
      transparent: modifier.transmission > 0.01,
      opacity: modifier.transmission > 0.01
        ? Math.max(0.22, 1 - modifier.transmission * 0.68)
        : 1,
      transmission: Math.min(0.9, Math.max(0, modifier.transmission)),
      side: THREE.DoubleSide,
      depthWrite: modifier.transmission < 0.45,
    })

    if (modifier.type === 'flag') {
      this.createStand(group, frame, -0.56)
      this.createPanelFrame(group, 1.2, 0.74, frame)
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.62), cloth)
      panel.position.z = 0.015
      panel.castShadow = true
      panel.userData.rigSurface = true
      group.add(panel)
    } else if (modifier.type === 'butterfly') {
      this.createButterflyFrame(group, 2.6, 2.6, frame)
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 2.45, 4, 4), cloth)
      panel.position.z = 0.015
      panel.castShadow = true
      panel.userData.rigSurface = true
      group.add(panel)
      this.createStand(group, frame, -1.5)
    } else {
      this.createButterflyFrame(group, 3.8, 3.1, frame)
      for (let i = 0; i < 9; i++) {
        const width = 3.65 / 9
        const curtain = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.12, 2.95, 1, 10), cloth)
        curtain.position.set(-1.62 + i * width, 0, i % 2 === 0 ? 0.03 : -0.03)
        curtain.rotation.y = i % 2 === 0 ? 0.06 : -0.06
        curtain.castShadow = true
        curtain.userData.rigSurface = true
        group.add(curtain)
      }
      this.createStand(group, frame, -1.78)
    }

    this.createGroundMarker(group, modifier.type === 'butterfly' ? 0x92d9ff : 0xe38a4a)
    this.tagGroup(group, { modifierId: modifier.id })
    return group
  }

  private createStand(group: THREE.Group, material: THREE.Material, x = 0): void {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.035, 2.15, 12), material)
    pole.position.set(x, -1.08, -0.16)
    pole.castShadow = true
    pole.userData.rigFrame = true
    group.add(pole)
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.1, 16), material)
    collar.position.set(x, -2.1, -0.16)
    collar.userData.rigFrame = true
    group.add(collar)
    for (let i = 0; i < 3; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.72, 10), material)
      const angle = i * Math.PI * 2 / 3
      leg.position.set(
        x + Math.cos(angle) * 0.27,
        -2.28,
        -0.16 + Math.sin(angle) * 0.27
      )
      leg.rotation.z = Math.PI / 2.9
      leg.rotation.y = -angle
      leg.castShadow = true
      leg.userData.rigFrame = true
      group.add(leg)
    }
  }

  private createPanelFrame(
    group: THREE.Group,
    width: number,
    height: number,
    material: THREE.Material
  ): void {
    for (const y of [-height / 2, height / 2]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, width, 12), material)
      rail.rotation.z = Math.PI / 2
      rail.position.y = y
      rail.userData.rigFrame = true
      group.add(rail)
    }
    for (const x of [-width / 2, width / 2]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, height, 12), material)
      rail.position.x = x
      rail.userData.rigFrame = true
      group.add(rail)
    }
  }

  private createButterflyFrame(
    group: THREE.Group,
    width: number,
    height: number,
    material: THREE.Material
  ): void {
    this.createPanelFrame(group, width, height, material)
    for (const [x, y] of [
      [-width / 2, -height / 2],
      [width / 2, -height / 2],
      [-width / 2, height / 2],
      [width / 2, height / 2],
    ]) {
      const corner = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), material)
      corner.position.set(x, y, 0)
      corner.userData.rigFrame = true
      group.add(corner)
    }
  }

  private createGroundMarker(group: THREE.Group, color: number): void {
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.28, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    )
    marker.name = 'equipment-helper'
    marker.rotation.x = -Math.PI / 2
    marker.position.y = -2.42
    group.add(marker)
  }

  private tagGroup(group: THREE.Group, tag: Record<string, string>): void {
    group.userData = { ...group.userData, ...tag }
    group.traverse(child => {
      child.userData = { ...child.userData, ...tag }
    })
  }

  private applySelection(): void {
    const selectedColor = new THREE.Color(0xffc45d)
    const apply = (group: THREE.Group, selected: boolean) => {
      group.traverse(child => {
        if (!(child instanceof THREE.Mesh) || !child.userData.rigFrame) return
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach(material => {
          if (material instanceof THREE.MeshStandardMaterial) {
            material.emissive.copy(selected ? selectedColor : new THREE.Color(0x000000))
            material.emissiveIntensity = selected ? 0.45 : 0
          }
        })
      })
    }
    for (const [id, entry] of this.lights) apply(entry.group, id === this.selectedLightId)
    for (const [id, entry] of this.modifiers) apply(entry.group, id === this.selectedModifierId)
  }

  private material(color: number, roughness: number, metalness: number): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness })
  }

  private removeLight(id: string): void {
    const entry = this.lights.get(id)
    if (!entry) return
    this.scene.remove(entry.group)
    this.disposeGroup(entry.group)
    this.lights.delete(id)
  }

  private removeModifier(id: string): void {
    const entry = this.modifiers.get(id)
    if (!entry) return
    this.scene.remove(entry.group)
    this.disposeGroup(entry.group)
    this.modifiers.delete(id)
  }

  private disposeGroup(group: THREE.Group): void {
    const geometries = new Set<THREE.BufferGeometry>()
    const materials = new Set<THREE.Material>()
    group.traverse(child => {
      if (child instanceof THREE.Light) child.dispose()
      if (!(child instanceof THREE.Mesh)) return
      geometries.add(child.geometry)
      if (Array.isArray(child.material)) child.material.forEach(m => materials.add(m))
      else materials.add(child.material)
    })
    geometries.forEach(g => g.dispose())
    materials.forEach(m => m.dispose())
  }
}

export const DEFAULT_STAGE_LIGHTS: Record<StageLightType, Omit<StageLight, 'id' | 'name' | 'position'>> = {
  point: {
    type: 'point',
    rotation: { yaw: 0, pitch: 0, roll: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: 0xffd1a3,
    intensity: 220,
    distance: 12,
    enabled: true,
  },
  area: {
    type: 'area',
    rotation: { yaw: 0, pitch: 0, roll: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: 0xfff0da,
    intensity: 18,
    distance: 15,
    enabled: true,
  },
  line: {
    type: 'line',
    rotation: { yaw: 0, pitch: 0, roll: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: 0xd9ecff,
    intensity: 280,
    distance: 10,
    enabled: true,
  },
}

export const DEFAULT_LIGHT_MODIFIERS: Record<
  LightModifierType,
  Omit<LightModifier, 'id' | 'name' | 'position'>
> = {
  flag: {
    type: 'flag',
    rotation: { yaw: 0, pitch: 0, roll: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: 0x111417,
    transmission: 0,
    diffusion: 0.05,
    enabled: true,
  },
  butterfly: {
    type: 'butterfly',
    rotation: { yaw: 0, pitch: 0, roll: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: 0xf2eee4,
    transmission: 0.68,
    diffusion: 0.88,
    enabled: true,
  },
  blackout: {
    type: 'blackout',
    rotation: { yaw: 0, pitch: 0, roll: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: 0x0a0b0d,
    transmission: 0.01,
    diffusion: 0.12,
    enabled: true,
  },
}
