/**
 * @muraguchi/camera-planner
 *
 * 3D Camera Position Planner — npm component for the Muraguchi AI film platform.
 *
 * Usage:
 *   import { CameraPlanner } from '@muraguchi/camera-planner'
 *   import '@muraguchi/camera-planner/dist/style.css'
 *
 *   <CameraPlanner
 *     projectId="abc123"
 *     apiUrl="/api/camera-planner"
 *     onCameraChange={handleCameraChange}
 *   />
 */

// Main component
export { CameraPlanner, type CameraPlannerProps, inputManager, outputManager } from './components/CameraPlanner'

// Engine
export {
  SceneEngine, CameraRig, ObjectLib,
  LightSystem, PathSystem, RayPicker,
  calcFOV, calcDOF, calcFOVByPreset,
  deg2rad, rad2deg, generateId, clamp, lerp, easeInOutCubic,
} from './engine'

// I/O
export { InputManager, OutputManager, ApiClient } from './io'

// Store
export { usePlannerStore } from './store/usePlannerStore'

// Types
export type {
  Camera, Position3D, Rotation3D, SensorPreset, DOFResult,
  MovementConfig, MovementType, ScriptBinding,
  SceneConfig, SceneObject, ObjectType, LightingConfig, SceneTemplate,
  StageLight, StageLightType, LightModifier, LightModifierType,
  Actor, ActorKeyframe, ActorRole, ActorAction, ActorBodyType,
  ProjectData, PathPoint, StoryboardConfig, StoryboardCell,
  TimelineConfig, TimelineKeyframe,
  PlannerEventMap, PlannerEvent, EventHandler,
} from './types'
export { createEmptyProject, PROJECT_SCHEMA_VERSION } from './types'

// Styles


// Presets
export { SENSOR_PRESETS, MOVEMENT_PRESETS, LIGHT_PRESETS, SCENE_PRESETS } from './presets'
