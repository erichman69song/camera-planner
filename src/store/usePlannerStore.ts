/**
 * usePlannerStore — Zustand state management for the entire planner.
 *
 * Single source of truth for all planner state.
 * Components read/write through this store.
 * I/O managers sync with external data through this store.
 */

import { create } from 'zustand'
import { Camera, MovementConfig, Position3D, Rotation3D } from '../types/camera'
import { Actor, ActorKeyframe } from '../types/actor'
import {
  SceneConfig,
  SceneObject,
  LightingConfig,
  ObjectType,
  StageLight,
  StageLightType,
  LightModifier,
  LightModifierType,
} from '../types/scene'
import { ProjectData, PathPoint, StoryboardConfig, TimelineConfig } from '../types/project'
import { createEmptyProject, PROJECT_SCHEMA_VERSION } from '../types/project'
import { calcFOV, calcDOF, generateId } from '../engine/calc'

export type EditorMode = 'select' | 'place' | 'move' | 'rotate'
export type ToolMode = 'camera' | 'object' | 'light' | 'path'
export type SideTab = 'cameras' | 'objects' | 'templates' | 'characters' | 'lighting'
export type BottomTab = 'timeline' | 'storyboard' | 'keyframes'

export interface PlannerState {
  // Project
  project: ProjectData

  // Editor state
  mode: EditorMode
  tool: ToolMode
  sideTab: SideTab
  bottomTab: BottomTab
  selectedCameraId: string | null
  selectedObjectId: string | null
  selectedActorId: string | null
  selectedLightId: string | null
  selectedModifierId: string | null
  selectedPathPointId: string | null
  /** Selected palette type; next ground click places it (tool=object) */
  pendingObjectType: ObjectType | null
  pendingLightType: StageLightType | null
  pendingModifierType: LightModifierType | null

  // UI state
  showGrid: boolean
  showAxes: boolean
  showFovCones: boolean

  // --- Camera actions ---
  addCamera: (camera: Camera) => void
  updateCamera: (id: string, params: Partial<Camera>) => void
  deleteCamera: (id: string) => void
  selectCamera: (id: string | null) => void
  setCameraMovement: (id: string, movement: MovementConfig) => void
  setCameraTransform: (id: string, position: Position3D, rotation: Rotation3D) => void

  // --- Object actions ---
  addObject: (obj: SceneObject) => void
  updateObject: (id: string, params: Partial<SceneObject>) => void
  deleteObject: (id: string) => void
  selectObject: (id: string | null) => void
  setPendingObjectType: (type: ObjectType | null) => void

  // --- Scene actions ---
  setSceneConfig: (config: Partial<SceneConfig>) => void
  setLighting: (config: Partial<LightingConfig>) => void

  // --- Practical light / grip actions ---
  addStageLight: (light: StageLight) => void
  updateStageLight: (id: string, params: Partial<StageLight>) => void
  deleteStageLight: (id: string) => void
  selectStageLight: (id: string | null) => void
  setPendingLightType: (type: StageLightType | null) => void
  addLightModifier: (modifier: LightModifier) => void
  updateLightModifier: (id: string, params: Partial<LightModifier>) => void
  deleteLightModifier: (id: string) => void
  selectLightModifier: (id: string | null) => void
  setPendingModifierType: (type: LightModifierType | null) => void

  // --- Actor actions ---
  addActor: (actor: Actor) => void
  updateActor: (id: string, params: Partial<Actor>) => void
  deleteActor: (id: string) => void
  selectActor: (id: string | null) => void
  addActorKeyframe: (actorId: string, keyframe: ActorKeyframe) => void
  updateActorKeyframe: (actorId: string, keyframeId: string, params: Partial<ActorKeyframe>) => void
  removeActorKeyframe: (actorId: string, keyframeId: string) => void
  setActorPosition: (id: string, position: Position3D) => void
  snapshot: () => void

  // --- Path actions ---
  setPath: (points: PathPoint[]) => void
  addPathPoint: (point: PathPoint) => void
  updatePathPoint: (id: string, params: Partial<PathPoint>) => void
  removePathPoint: (id: string) => void
  selectPathPoint: (id: string | null) => void
  /** Record current camera/actor 6DOF pose at timeline time as a keyframe */
  recordKeyframe: () => { ok: boolean; message: string }

  // --- Timeline actions ---
  setTimelineTime: (time: number) => void
  setTimelinePlaying: (playing: boolean) => void

  // --- Storyboard actions ---
  setStoryboardGrid: (grid: '3x3' | '5x5') => void
  setStoryboardCell: (index: number, cameraId: string | null) => void

  // --- Editor actions ---
  setMode: (mode: EditorMode) => void
  setTool: (tool: ToolMode) => void
  setSideTab: (tab: SideTab) => void
  setBottomTab: (tab: BottomTab) => void
  toggleGrid: () => void
  toggleAxes: () => void
  toggleFovCones: () => void

  // --- Project actions ---
  loadProject: (data: ProjectData) => void
  getProjectData: () => ProjectData

  // --- Undo/Redo ---
  undo: () => void
  redo: () => void
}

// Simple undo/redo via state snapshots
const historyStack: ProjectData[] = []
const redoStack: ProjectData[] = []
const MAX_HISTORY = 50

export const usePlannerStore = create<PlannerState>((set, get) => ({
  // Initial state
  project: createEmptyProject(),
  mode: 'select',
  tool: 'camera',
  sideTab: 'cameras',
  bottomTab: 'timeline',
  selectedCameraId: null,
  selectedObjectId: null,
  selectedActorId: null,
  selectedLightId: null,
  selectedModifierId: null,
  selectedPathPointId: null,
  pendingObjectType: null,
  pendingLightType: null,
  pendingModifierType: null,
  showGrid: true,
  showAxes: true,
  showFovCones: true,

  // --- Camera actions ---
  addCamera: (camera) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        cameras: [...s.project.cameras, camera],
      },
    }
  }),

  updateCamera: (id, params) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        cameras: s.project.cameras.map(c => {
          if (c.id !== id) return c
          const next = { ...c, ...params }
          // Keep optics in sync so property panel + viewfinder react to focal/fstop/etc.
          next.fov = calcFOV(next.sensorH, next.focal)
          next.dof = calcDOF(next.focal, next.fstop, next.focusDist, next.sensorH)
          return next
        }),
      },
    }
  }),

  deleteCamera: (id) => set((s) => {
    pushHistory(s.project)
    const deletedPathIds = new Set(
      s.project.path.filter(point => point.cameraId === id).map(point => point.id)
    )
    return {
      project: {
        ...s.project,
        cameras: s.project.cameras.filter(c => c.id !== id),
        path: s.project.path.filter(point => point.cameraId !== id),
        storyboard: {
          ...s.project.storyboard,
          cells: s.project.storyboard.cells.map(cell =>
            cell.cameraId === id ? { ...cell, cameraId: undefined } : cell
          ),
        },
        timeline: {
          ...s.project.timeline,
          keyframes: s.project.timeline.keyframes.filter(keyframe => keyframe.cameraId !== id),
        },
      },
      selectedCameraId: s.selectedCameraId === id ? null : s.selectedCameraId,
      selectedPathPointId:
        s.selectedPathPointId && deletedPathIds.has(s.selectedPathPointId)
          ? null
          : s.selectedPathPointId,
    }
  }),

  selectCamera: (id) => set({
    selectedCameraId: id,
    selectedObjectId: null,
    selectedActorId: null,
    selectedLightId: null,
    selectedModifierId: null,
    selectedPathPointId: null,
  }),

  setCameraMovement: (id, movement) => set((s) => ({
    project: {
      ...s.project,
      cameras: s.project.cameras.map(c =>
        c.id === id ? { ...c, movement } : c
      ),
    },
  })),

  setCameraTransform: (id, position, rotation) => set((s) => ({
    project: {
      ...s.project,
      cameras: s.project.cameras.map(c =>
        c.id === id ? { ...c, position, rotation } : c
      ),
    },
  })),

  // --- Object actions ---
  addObject: (obj) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        scene: {
          ...s.project.scene,
          objects: [...s.project.scene.objects, obj],
        },
      },
    }
  }),

  updateObject: (id, params) => set((s) => ({
    project: {
      ...s.project,
      scene: {
        ...s.project.scene,
        objects: s.project.scene.objects.map(o =>
          o.id === id ? { ...o, ...params } : o
        ),
      },
    },
  })),

  deleteObject: (id) => set((s) => ({
    project: {
      ...s.project,
      scene: {
        ...s.project.scene,
        objects: s.project.scene.objects.filter(o => o.id !== id),
      },
    },
    selectedObjectId: s.selectedObjectId === id ? null : s.selectedObjectId,
  })),

  selectObject: (id) => set({
    selectedObjectId: id,
    selectedCameraId: null,
    selectedActorId: null,
    selectedLightId: null,
    selectedModifierId: null,
    selectedPathPointId: null,
  }),
  setPendingObjectType: (type) => set({ pendingObjectType: type }),

  // --- Scene actions ---
  setSceneConfig: (config) => set((s) => ({
    project: {
      ...s.project,
      scene: { ...s.project.scene, ...config },
    },
  })),

  setLighting: (config) => set((s) => ({
    project: {
      ...s.project,
      scene: {
        ...s.project.scene,
        lighting: { ...s.project.scene.lighting, ...config },
      },
    },
  })),

  // --- Practical light / grip actions ---
  addStageLight: (light) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        scene: {
          ...s.project.scene,
          lights: [...(s.project.scene.lights || []), light],
        },
      },
    }
  }),

  updateStageLight: (id, params) => set((s) => ({
    project: {
      ...s.project,
      scene: {
        ...s.project.scene,
        lights: (s.project.scene.lights || []).map(light =>
          light.id === id ? { ...light, ...params } : light
        ),
      },
    },
  })),

  deleteStageLight: (id) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        scene: {
          ...s.project.scene,
          lights: (s.project.scene.lights || []).filter(light => light.id !== id),
        },
      },
      selectedLightId: s.selectedLightId === id ? null : s.selectedLightId,
    }
  }),

  selectStageLight: (id) => set({
    selectedLightId: id,
    selectedModifierId: null,
    selectedCameraId: null,
    selectedObjectId: null,
    selectedActorId: null,
    selectedPathPointId: null,
  }),

  setPendingLightType: (type) => set({
    pendingLightType: type,
    pendingModifierType: null,
  }),

  addLightModifier: (modifier) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        scene: {
          ...s.project.scene,
          modifiers: [...(s.project.scene.modifiers || []), modifier],
        },
      },
    }
  }),

  updateLightModifier: (id, params) => set((s) => ({
    project: {
      ...s.project,
      scene: {
        ...s.project.scene,
        modifiers: (s.project.scene.modifiers || []).map(modifier =>
          modifier.id === id ? { ...modifier, ...params } : modifier
        ),
      },
    },
  })),

  deleteLightModifier: (id) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        scene: {
          ...s.project.scene,
          modifiers: (s.project.scene.modifiers || []).filter(modifier => modifier.id !== id),
        },
      },
      selectedModifierId: s.selectedModifierId === id ? null : s.selectedModifierId,
    }
  }),

  selectLightModifier: (id) => set({
    selectedModifierId: id,
    selectedLightId: null,
    selectedCameraId: null,
    selectedObjectId: null,
    selectedActorId: null,
    selectedPathPointId: null,
  }),

  setPendingModifierType: (type) => set({
    pendingModifierType: type,
    pendingLightType: null,
  }),

  // --- Actor actions ---
  addActor: (actor) => set((s) => {
    pushHistory(s.project)
    const normalized: Actor = {
      ...actor,
      bodyType: actor.bodyType || 'adult_male',
      action: actor.action || actor.keyframes?.[0]?.action || 'stand',
      scale: actor.scale || { x: 1, y: 1, z: 1 },
      keyframes: actor.keyframes || [],
    }
    return {
      project: { ...s.project, actors: [...s.project.actors, normalized] },
    }
  }),

  updateActor: (id, params) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        actors: s.project.actors.map(a => a.id === id ? { ...a, ...params } : a),
      },
    }
  }),

  deleteActor: (id) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        actors: s.project.actors.filter(a => a.id !== id),
      },
      selectedActorId: s.selectedActorId === id ? null : s.selectedActorId,
    }
  }),

  selectActor: (id) => set({
    selectedActorId: id,
    selectedCameraId: null,
    selectedObjectId: null,
    selectedLightId: null,
    selectedModifierId: null,
    selectedPathPointId: null,
  }),

  addActorKeyframe: (actorId, keyframe) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        actors: s.project.actors.map(a =>
          a.id === actorId
            ? { ...a, keyframes: [...a.keyframes, keyframe].sort((x, y) => x.time - y.time) }
            : a
        ),
      }
    }
  }),

  updateActorKeyframe: (actorId, keyframeId, params) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        actors: s.project.actors.map(a =>
          a.id === actorId
            ? {
                ...a,
                keyframes: a.keyframes.map(k =>
                  k.id === keyframeId ? { ...k, ...params } : k
                ).sort((x, y) => x.time - y.time)
              }
            : a
        ),
      }
    }
  }),

  removeActorKeyframe: (actorId, keyframeId) => set((s) => {
    pushHistory(s.project)
    return {
      project: {
        ...s.project,
        actors: s.project.actors.map(a =>
          a.id === actorId
            ? { ...a, keyframes: a.keyframes.filter(k => k.id !== keyframeId) }
            : a
        ),
      }
    }
  }),

  setActorPosition: (id, position) => set((s) => ({
    project: {
      ...s.project,
      actors: s.project.actors.map(a => a.id === id ? { ...a, position } : a),
    },
  })),

  snapshot: () => {
    pushHistory(get().project)
  },

  // --- Path actions ---
  setPath: (points) => set((s) => {
    pushHistory(s.project)
    return { project: { ...s.project, path: points } }
  }),

  addPathPoint: (point) => set((s) => {
    pushHistory(s.project)
    return {
      project: { ...s.project, path: [...s.project.path, point] },
      selectedPathPointId: point.id,
      bottomTab: 'keyframes' as BottomTab,
    }
  }),

  updatePathPoint: (id, params) => set((s) => ({
    project: {
      ...s.project,
      path: s.project.path
        .map(p => (p.id === id ? { ...p, ...params } : p))
        .sort((a, b) => a.t - b.t),
    },
  })),

  removePathPoint: (id) => set((s) => {
    pushHistory(s.project)
    return {
      project: { ...s.project, path: s.project.path.filter(p => p.id !== id) },
      selectedPathPointId: s.selectedPathPointId === id ? null : s.selectedPathPointId,
    }
  }),

  selectPathPoint: (id) => set({
    selectedPathPointId: id,
    selectedObjectId: null,
    selectedLightId: null,
    selectedModifierId: null,
  }),

  recordKeyframe: () => {
    const s = get()
    const { currentTime, duration } = s.project.timeline
    const t = duration > 0 ? currentTime / duration : 0

    // Prefer actor when selected → actor motion keyframe
    if (s.selectedActorId) {
      const actor = s.project.actors.find(a => a.id === s.selectedActorId)
      if (!actor) return { ok: false, message: '未找到选中角色' }
      get().addActorKeyframe(actor.id, {
        id: generateId(),
        time: currentTime,
        position: { ...actor.position },
        rotation: { ...actor.rotation },
        action: actor.action,
      })
      set({ bottomTab: 'keyframes' })
      return { ok: true, message: `已记录角色关键帧 @ ${currentTime.toFixed(1)}s` }
    }

    // Camera path keyframe (full 6DOF from current pose)
    const camId = s.selectedCameraId
    if (!camId) return { ok: false, message: '请先选中机位或角色' }
    const cam = s.project.cameras.find(c => c.id === camId)
    if (!cam) return { ok: false, message: '未找到选中机位' }

    const point: PathPoint = {
      id: generateId(),
      position: { ...cam.position },
      rotation: { ...cam.rotation },
      cameraId: camId,
      t,
    }
    get().addPathPoint(point)
    return { ok: true, message: `已记录机位关键帧 @ ${currentTime.toFixed(1)}s` }
  },

  // --- Timeline actions ---
  setTimelineTime: (time) => set((s) => ({
    project: {
      ...s.project,
      timeline: { ...s.project.timeline, currentTime: time },
    },
  })),

  setTimelinePlaying: (playing) => set((s) => ({
    project: {
      ...s.project,
      timeline: { ...s.project.timeline, playing },
    },
  })),

  // --- Storyboard actions ---
  setStoryboardGrid: (grid) => set((s) => ({
    project: {
      ...s.project,
      storyboard: { ...s.project.storyboard, grid },
    },
  })),

  setStoryboardCell: (index, cameraId) => set((s) => {
    const cells = [...s.project.storyboard.cells]
    const existing = cells.findIndex(c => c.index === index)
    if (existing >= 0) {
      cells[existing] = { ...cells[existing], cameraId: cameraId ?? undefined }
    } else {
      cells.push({ index, cameraId: cameraId ?? undefined })
    }
    return {
      project: {
        ...s.project,
        storyboard: { ...s.project.storyboard, cells },
      },
    }
  }),

  // --- Editor actions ---
  setMode: (mode) => set({ mode }),
  setTool: (tool) => set({ tool }),
  setSideTab: (sideTab) => set({ sideTab }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  toggleAxes: () => set((s) => ({ showAxes: !s.showAxes })),
  toggleFovCones: () => set((s) => ({ showFovCones: !s.showFovCones })),

  // --- Project actions ---
  loadProject: (data) => {
    clearHistory()
    set({
      project: normalizeProject(data),
      selectedCameraId: null,
      selectedObjectId: null,
      selectedActorId: null,
      selectedLightId: null,
      selectedModifierId: null,
      selectedPathPointId: null,
    })
  },

  getProjectData: () => get().project,

  // --- Undo/Redo ---
  undo: () => {
    if (historyStack.length === 0) return
    const prev = historyStack.pop()!
    redoStack.push(structuredClone(get().project))
    set({ project: prev })
  },

  redo: () => {
    if (redoStack.length === 0) return
    const next = redoStack.pop()!
    historyStack.push(structuredClone(get().project))
    if (historyStack.length > MAX_HISTORY) historyStack.shift()
    set({ project: next })
  },
}))

function pushHistory(project: ProjectData): void {
  historyStack.push(structuredClone(project))
  if (historyStack.length > MAX_HISTORY) historyStack.shift()
  redoStack.length = 0
}

function clearHistory(): void {
  historyStack.length = 0
  redoStack.length = 0
}

/** Backward-compatible migration for v4.0 projects and embedded demo data. */
function normalizeProject(data: ProjectData): ProjectData {
  const project = structuredClone(data)
  project.version = PROJECT_SCHEMA_VERSION
  project.scene.lights = project.scene.lights || []
  project.scene.modifiers = project.scene.modifiers || []
  project.actors = (project.actors || []).map(actor => ({
    ...actor,
    bodyType: actor.bodyType || 'adult_male',
    action: actor.action || actor.keyframes?.[0]?.action || 'stand',
    scale: actor.scale || { x: 1, y: 1, z: 1 },
    keyframes: actor.keyframes || [],
  }))
  return project
}
