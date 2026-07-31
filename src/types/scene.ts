// Scene types

import { Position3D, Rotation3D } from './camera'

export interface SceneObject {
  id: string
  name?: string
  type: ObjectType
  position: Position3D
  rotation: Rotation3D
  scale: Position3D
  color: number
}

export type ObjectType =
  | 'box' | 'sphere' | 'cone' | 'cylinder' | 'torus' | 'plane'
  | 'person' | 'building' | 'car' | 'tree' | 'chair' | 'prop'
  | 'sofa' | 'bookshelf' | 'table' | 'wall' | 'window' | 'door'

export type StageLightType = 'point' | 'area' | 'line'

export type LightModifierType = 'flag' | 'butterfly' | 'blackout'

/** A practical, freely transformable light placed inside the blocking stage. */
export interface StageLight {
  id: string
  name: string
  type: StageLightType
  position: Position3D
  rotation: Rotation3D
  scale: Position3D
  color: number
  intensity: number
  distance: number
  enabled: boolean
}

/** Grip equipment used to cut, diffuse or block light. */
export interface LightModifier {
  id: string
  name: string
  type: LightModifierType
  position: Position3D
  rotation: Rotation3D
  scale: Position3D
  color: number
  transmission: number
  diffusion: number
  enabled: boolean
}

export interface LightingConfig {
  position: Position3D
  intensity: number     // 0-2
  color: number         // hex
  preset: string
}

export interface SceneConfig {
  template: SceneTemplate
  objects: SceneObject[]
  lighting: LightingConfig
  lights: StageLight[]
  modifiers: LightModifier[]
}

export type SceneTemplate =
  | 'studio'
  | 'living_room'
  | 'street'
  | 'cafe'
  | 'empty'
