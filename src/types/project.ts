// Project-level types

import { Camera } from './camera'
import { Actor } from './actor'
import { SceneConfig, SceneObject } from './scene'

/** Current serialized project schema version. */
export const PROJECT_SCHEMA_VERSION = '4.1'

export interface ProjectData {
  version: string
  cameras: Camera[]
  actors: Actor[]
  scene: SceneConfig
  path: PathPoint[]
  storyboard: StoryboardConfig
  timeline: TimelineConfig
}

export interface PathPoint {
  id: string
  position: { x: number; y: number; z: number }
  rotation: { yaw: number; pitch: number; roll: number }
  cameraId?: string       // which camera this keyframe belongs to
  t: number               // time position (0-1)
}

export interface StoryboardConfig {
  grid: '3x3' | '5x5'
  cells: StoryboardCell[]
}

export interface StoryboardCell {
  index: number
  cameraId?: string
  label?: string
  thumbnail?: string      // data URL
}

export interface TimelineConfig {
  duration: number        // total seconds
  currentTime: number     // playback head position
  playing: boolean
  keyframes: TimelineKeyframe[]
}

export interface TimelineKeyframe {
  id: string
  time: number            // seconds
  cameraId: string
  type: string            // 'position' | 'rotation' | 'focal'
  value: unknown
}

export function createEmptyProject(): ProjectData {
  return {
    version: PROJECT_SCHEMA_VERSION,
    cameras: [],
    actors: [],
    scene: {
      template: 'empty',
      objects: [],
      lighting: {
        position: { x: 5, y: 10, z: 5 },
        intensity: 1.0,
        color: 0xffffff,
        preset: 'daylight',
      },
      lights: [],
      modifiers: [],
    },
    path: [],
    storyboard: {
      grid: '3x3',
      cells: [],
    },
    timeline: {
      duration: 30,
      currentTime: 0,
      playing: false,
      keyframes: [],
    },
  }
}
