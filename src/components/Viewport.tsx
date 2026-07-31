/**
 * Viewport — The 3D rendering canvas container.
 *
 * Initializes the Three.js SceneEngine and all engine modules.
 * Connects engine state to the Zustand store.
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  SceneEngine,
  CameraRig,
  ObjectLib,
  LightSystem,
  PathSystem,
  RayPicker,
  ActorRig,
  type PickResult,
} from '../engine'
import { generateId } from '../engine/calc'
import { usePlannerStore } from '../store/usePlannerStore'
import { OutputManager } from '../io/OutputManager'
import { defaultObjectY } from './ObjectPalette'
import { ViewfinderOverlay } from './ViewfinderOverlay'
import { ContextMenu, ContextMenuAction } from './ContextMenu'
import css from '../styles.module.css'

interface ViewportProps {
  outputManager: OutputManager
}

export const Viewport: React.FC<ViewportProps> = ({ outputManager }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<{
    scene: SceneEngine
    cameraRig: CameraRig
    objectLib: ObjectLib
    lightSystem: LightSystem
    pathSystem: PathSystem
    rayPicker: RayPicker
    actorRig: ActorRig
  } | null>(null)

  // Track actor drag state: { id, historyPushed }
  // - On first pick (pointerdown): just select, set dragRef
  // - On subsequent picks (pointermove during drag): update position
  // - History is pushed only once, on the first actual movement
  const dragRef = useRef<{
    type: 'camera' | 'object' | 'actor' | 'path'
    id: string
    historyPushed: boolean
  } | null>(null)
  const [engineReady, setEngineReady] = useState(false)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    actions: ContextMenuAction[]
  } | null>(null)

  const store = usePlannerStore

  // Initialize engine
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new SceneEngine({
      container,
      antialias: true,
      shadows: true,
      showGrid: true,
      showAxes: true,
    })

    const cameraRig = new CameraRig(scene.scene)
    const objectLib = new ObjectLib(scene.scene)
    const lightSystem = new LightSystem(scene.scene)
    const pathSystem = new PathSystem(scene.scene)
    const rayPicker = new RayPicker(scene.camera, scene.scene)
    const actorRig = new ActorRig(scene.scene)

    rayPicker.setCameraGroups(cameraRig.getAllMeshGroups())
    rayPicker.setObjectMeshes(objectLib.getAllMeshes())
    rayPicker.setActorGroups(actorRig.getAllMeshGroups())
    rayPicker.setPathGroups(pathSystem.getMarkerGroups())
    rayPicker.enable(scene.getCanvas())

    // Set up PNG exporter for output manager
    outputManager.setPNGExporter(() => scene.exportPNGBlob())

    // Ray picker → store sync
    rayPicker.onPick((result) => {
      const state = store.getState()
      const tool = state.tool
      if (
        result.target === 'camera' ||
        result.target === 'object' ||
        result.target === 'actor' ||
        result.target === 'path'
      ) {
        scene.controls.enabled = false
      }

      // Object tool: click ground to place pending palette type
      if (tool === 'object' && state.pendingObjectType && result.target === 'ground' && result.groundPoint) {
        const type = state.pendingObjectType
        const newObj = {
          id: generateId(),
          type,
          position: {
            x: result.groundPoint.x,
            y: defaultObjectY(type),
            z: result.groundPoint.z,
          },
          rotation: {
            yaw: 0,
            pitch: type === 'plane' ? -90 : 0,
            roll: 0,
          },
          scale: { x: 1, y: 1, z: 1 },
          color: 0x888888,
        }
        state.addObject(newObj)
        state.selectObject(newObj.id)
        outputManager.emit('object:add', newObj.id)
        return
      }

      // Path keyframe ghost: select + drag (keeps Y, moves XZ)
      if (result.target === 'path' && result.id) {
        if (
          !dragRef.current ||
          dragRef.current.type !== 'path' ||
          dragRef.current.id !== result.id
        ) {
          dragRef.current = { type: 'path', id: result.id, historyPushed: false }
          store.getState().selectPathPoint(result.id)
          store.getState().setBottomTab('keyframes')
        } else if (result.point) {
          const pt = store.getState().project.path.find(p => p.id === result.id)
          if (pt) {
            const dx = result.point.x - pt.position.x
            const dz = result.point.z - pt.position.z
            if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
              if (!dragRef.current.historyPushed) {
                store.getState().snapshot()
                dragRef.current.historyPushed = true
              }
              store.getState().updatePathPoint(result.id, {
                position: {
                  x: result.point.x,
                  y: pt.position.y,
                  z: result.point.z,
                },
              })
            }
          }
        }
        return
      }

      // Path tool: ground click no longer plants keyframes (use 记录关键帧 / K)
      if (tool === 'path' && result.target === 'ground') {
        dragRef.current = null
        return
      }

      // Normal selection / drag mode
      if (result.target === 'camera' && result.id) {
        if (
          !dragRef.current ||
          dragRef.current.type !== 'camera' ||
          dragRef.current.id !== result.id
        ) {
          dragRef.current = { type: 'camera', id: result.id, historyPushed: false }
          store.getState().selectCamera(result.id)
          outputManager.emit('camera:select', result.id)
        } else if (result.point) {
          const camera = store.getState().project.cameras.find(c => c.id === result.id)
          if (camera) {
            const position = {
              x: result.point.x,
              y: result.point.y,
              z: result.point.z,
            }
            const moved =
              Math.abs(position.x - camera.position.x) > 0.01 ||
              Math.abs(position.y - camera.position.y) > 0.01 ||
              Math.abs(position.z - camera.position.z) > 0.01
            if (moved) {
              if (!dragRef.current.historyPushed) {
                store.getState().snapshot()
                dragRef.current.historyPushed = true
              }
              store.getState().setCameraTransform(result.id, position, camera.rotation)
              outputManager.emit('camera:change', { ...camera, position })
            }
          }
        }
      } else if (result.target === 'object' && result.id) {
        if (
          !dragRef.current ||
          dragRef.current.type !== 'object' ||
          dragRef.current.id !== result.id
        ) {
          dragRef.current = { type: 'object', id: result.id, historyPushed: false }
          store.getState().selectObject(result.id)
        } else if (result.point) {
          const object = store.getState().project.scene.objects.find(o => o.id === result.id)
          if (object) {
            const position = {
              x: result.point.x,
              y: result.point.y,
              z: result.point.z,
            }
            const moved =
              Math.abs(position.x - object.position.x) > 0.01 ||
              Math.abs(position.y - object.position.y) > 0.01 ||
              Math.abs(position.z - object.position.z) > 0.01
            if (moved) {
              if (!dragRef.current.historyPushed) {
                store.getState().snapshot()
                dragRef.current.historyPushed = true
              }
              store.getState().updateObject(result.id, { position })
              outputManager.emit('scene:change', store.getState().project.scene)
            }
          }
        }
      } else if (result.target === 'actor' && result.id) {
        if (
          !dragRef.current ||
          dragRef.current.type !== 'actor' ||
          dragRef.current.id !== result.id
        ) {
          dragRef.current = { type: 'actor', id: result.id, historyPushed: false }
          store.getState().selectActor(result.id)
        } else {
          if (result.groundPoint) {
            const actor = store.getState().project.actors.find(a => a.id === result.id)
            if (actor) {
              const dx = result.groundPoint.x - actor.position.x
              const dz = result.groundPoint.z - actor.position.z
              if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
                if (!dragRef.current.historyPushed) {
                  store.getState().snapshot()
                  dragRef.current.historyPushed = true
                }
                store.getState().setActorPosition(result.id, {
                  x: result.groundPoint.x,
                  y: 0,
                  z: result.groundPoint.z,
                })
              }
            }
          }
        }
      } else {
        dragRef.current = null
      }
    })

    rayPicker.onDragEnd(() => {
      dragRef.current = null
      scene.controls.enabled = true
    })

    scene.start()

    engineRef.current = {
      scene,
      cameraRig,
      objectLib,
      lightSystem,
      pathSystem,
      rayPicker,
      actorRig,
    }
    setEngineReady(true)

    return () => {
      setEngineReady(false)
      rayPicker.disable(scene.getCanvas())
      scene.dispose()
      engineRef.current = null
    }
  }, [outputManager])

  // Sync store → engine
  const project = store(s => s.project)
  const selectedCameraId = store(s => s.selectedCameraId)
  const selectedActorId = store(s => s.selectedActorId)
  const selectedPathPointId = store(s => s.selectedPathPointId)

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    // Sync cameras
    const storeCameras = project.cameras
    const engineCameras = engine.cameraRig.getAllCameras()
    const engineIds = new Set(engineCameras.map(c => c.id))
    const storeIds = new Set(storeCameras.map(c => c.id))

    // Add new cameras
    for (const cam of storeCameras) {
      if (!engineIds.has(cam.id)) {
        engine.cameraRig.addCamera(cam)
      }
    }
    // Remove deleted cameras
    for (const id of engineIds) {
      if (!storeIds.has(id)) {
        engine.cameraRig.deleteCamera(id)
      }
    }
    // Update changed cameras
    for (const cam of storeCameras) {
      const existing = engine.cameraRig.getCamera(cam.id)
      if (!existing) continue

      const opticsChanged =
        existing.focal !== cam.focal ||
        existing.sensorW !== cam.sensorW ||
        existing.sensorH !== cam.sensorH ||
        existing.fstop !== cam.fstop ||
        existing.focusDist !== cam.focusDist

      const transformChanged =
        existing.position.x !== cam.position.x ||
        existing.position.y !== cam.position.y ||
        existing.position.z !== cam.position.z ||
        existing.rotation.yaw !== cam.rotation.yaw ||
        existing.rotation.pitch !== cam.rotation.pitch ||
        existing.rotation.roll !== cam.rotation.roll

      if (opticsChanged) {
        engine.cameraRig.updateCamera(cam.id, cam)
      } else if (transformChanged) {
        engine.cameraRig.setCameraPosition(cam.id, cam.position)
        engine.cameraRig.setCameraRotation(cam.id, cam.rotation)
      }
    }

    // Sync selection
    engine.cameraRig.selectCamera(selectedCameraId)
    engine.rayPicker.setCameraGroups(engine.cameraRig.getAllMeshGroups())

    // Sync actors
    const storeActors = project.actors
    const engineActors = engine.actorRig.getAllActors()
    const engineActorIds = new Set(engineActors.map(a => a.id))
    const storeActorIds = new Set(storeActors.map(a => a.id))

    let actorsChanged = false
    for (const actor of storeActors) {
      if (!engineActorIds.has(actor.id)) {
        engine.actorRig.addActor(actor)
        actorsChanged = true
      } else {
        const existing = engine.actorRig.getActor(actor.id)
        if (existing && (
          existing.name !== actor.name ||
          existing.role !== actor.role ||
          existing.height !== actor.height ||
          existing.color !== actor.color ||
          existing.position.x !== actor.position.x ||
          existing.position.y !== actor.position.y ||
          existing.position.z !== actor.position.z ||
          existing.rotation.yaw !== actor.rotation.yaw ||
          existing.keyframes.length !== actor.keyframes.length
        )) {
          engine.actorRig.updateActor(actor.id, actor)
          actorsChanged = true
        }
      }
    }
    for (const id of engineActorIds) {
      if (!storeActorIds.has(id)) {
        engine.actorRig.deleteActor(id)
        actorsChanged = true
      }
    }

    if (actorsChanged) {
      engine.rayPicker.setActorGroups(engine.actorRig.getAllMeshGroups())
    }

    engine.actorRig.selectActor(selectedActorId)

    // Sync scene objects → ObjectLib
    const storeObjects = project.scene.objects
    const engineObjects = engine.objectLib.getAllObjects()
    const engineObjIds = new Set(engineObjects.map(o => o.id))
    const storeObjIds = new Set(storeObjects.map(o => o.id))

    let objectsChanged = false
    for (const obj of storeObjects) {
      if (!engineObjIds.has(obj.id)) {
        engine.objectLib.addObject(obj)
        objectsChanged = true
      } else {
        const existing = engine.objectLib.getObject(obj.id)
        if (
          existing &&
          (existing.type !== obj.type ||
            existing.color !== obj.color ||
            existing.position.x !== obj.position.x ||
            existing.position.y !== obj.position.y ||
            existing.position.z !== obj.position.z ||
            existing.rotation.yaw !== obj.rotation.yaw ||
            existing.rotation.pitch !== obj.rotation.pitch ||
            existing.rotation.roll !== obj.rotation.roll ||
            existing.scale.x !== obj.scale.x ||
            existing.scale.y !== obj.scale.y ||
            existing.scale.z !== obj.scale.z)
        ) {
          engine.objectLib.updateObject(obj.id, obj)
          objectsChanged = true
        }
      }
    }
    for (const id of engineObjIds) {
      if (!storeObjIds.has(id)) {
        engine.objectLib.deleteObject(id)
        objectsChanged = true
      }
    }
    if (objectsChanged) {
      engine.rayPicker.setObjectMeshes(engine.objectLib.getAllMeshes())
    }

    // Sync path ghosts → PathSystem + RayPicker
    engine.pathSystem.importKeyframes(project.path, selectedCameraId)
    engine.pathSystem.setSelectedId(selectedPathPointId)
    engine.rayPicker.setPathGroups(engine.pathSystem.getMarkerGroups())

    // Sync lighting
    engine.lightSystem.update(project.scene.lighting)
  }, [project.cameras, project.actors, project.path, project.scene.objects, project.scene.lighting, selectedCameraId, selectedActorId, selectedPathPointId])

  // Sync grid/axes visibility
  const showGrid = store(s => s.showGrid)
  const showAxes = store(s => s.showAxes)

  useEffect(() => {
    engineRef.current?.scene.setGridVisible(showGrid)
  }, [showGrid])

  useEffect(() => {
    engineRef.current?.scene.setAxesVisible(showAxes)
  }, [showAxes])

  // Timeline playback: update actor + camera positions based on current time
  const timelineTime = store(s => s.project.timeline.currentTime)
  const timelineDuration = store(s => s.project.timeline.duration)
  const pathPoints = store(s => s.project.path)

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    engine.actorRig.updatePlayback(timelineTime)

    const normalizedTime = timelineDuration > 0 ? timelineTime / timelineDuration : 0
    // Only move 3D meshes during scrub — avoid writing store every frame
    engine.cameraRig.updatePlayback(pathPoints, normalizedTime)
  }, [timelineTime, timelineDuration, pathPoints])

  // Cursor style based on tool
  const tool = store(s => s.tool)
  const engine = engineRef.current

  // Right-click context menu handler
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!engine) return

    const rect = (e.target as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Perform raycast to determine context
    const pickResult = engine.rayPicker.pickAtEvent(e.nativeEvent)
    const actions = buildContextMenuActions(pickResult, e.clientX, e.clientY)

    if (actions.length > 0) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        actions,
      })
    }
  }

  const buildContextMenuActions = (
    result: PickResult,
    screenX: number,
    screenY: number
  ): ContextMenuAction[] => {
    const state = store.getState()

    // Camera context
    if (result.target === 'camera' && result.id) {
      const camera = state.project.cameras.find(c => c.id === result.id)
      return [
        {
          label: `选中机位 "${camera?.name || 'CAM'}"`,
          icon: '📷',
          onClick: () => {
            store.getState().selectCamera(result.id!)
            outputManager.emit('camera:select', result.id!)
          },
        },
        {
          label: '记录关键帧 (K)',
          icon: '◆',
          onClick: () => {
            store.getState().selectCamera(result.id!)
            store.getState().recordKeyframe()
          },
        },
        {
          label: '删除机位',
          icon: '🗑️',
          danger: true,
          onClick: () => {
            store.getState().deleteCamera(result.id!)
            outputManager.emit('camera:delete', result.id!)
          },
        },
      ]
    }

    // Actor context
    if (result.target === 'actor' && result.id) {
      const actor = state.project.actors.find(a => a.id === result.id)
      return [
        {
          label: `选中角色 "${actor?.name || '角色'}"`,
          icon: '🏃',
          onClick: () => {
            store.getState().selectActor(result.id!)
          },
        },
        {
          label: '记录角色动作关键帧',
          icon: '◆',
          onClick: () => {
            store.getState().selectActor(result.id!)
            store.getState().recordKeyframe()
          },
        },
        {
          label: '删除角色',
          icon: '🗑️',
          danger: true,
          onClick: () => {
            store.getState().deleteActor(result.id!)
          },
        },
      ]
    }

    // Object context
    if (result.target === 'object' && result.id) {
      return [
        {
          label: '选中该物体',
          icon: '📦',
          onClick: () => {
            store.getState().selectObject(result.id!)
          },
        },
        {
          label: '删除该物体',
          icon: '🗑️',
          danger: true,
          onClick: () => {
            store.getState().deleteObject(result.id!)
          },
        },
      ]
    }

    // Ground / empty context
    if (result.target === 'ground' && result.groundPoint) {
      const gp = result.groundPoint
      return [
        {
          label: '在此处新增摄像机',
          icon: '➕',
          onClick: () => {
            const newCam = {
              id: generateId(),
              name: `CAM ${state.project.cameras.length + 1}`,
              body: 'FF35' as const,
              focal: 50,
              fstop: 2.8,
              focusDist: 3.0,
              sensorW: 36,
              sensorH: 24,
              fov: 27.0,
              dof: { near: 2.5, far: 3.8, range: 1.3 },
              height: 1.6,
              color: 0x7c83ff,
              position: { x: gp.x, y: 1.6, z: gp.z },
              rotation: { yaw: 0, pitch: 0, roll: 0 },
            }
            store.getState().addCamera(newCam)
            store.getState().selectCamera(newCam.id)
            outputManager.emit('camera:add', newCam)
          },
        },
        {
          label: '在此处放置角色',
          icon: '➕',
          onClick: () => {
            const newActor = {
              id: generateId(),
              name: `角色${state.project.actors.length + 1}`,
              role: 'principal' as const,
              height: 1.75,
              color: 0x6a6a8a,
              position: { x: gp.x, y: 0, z: gp.z },
              rotation: { yaw: 0, pitch: 0, roll: 0 },
              keyframes: [],
            }
            store.getState().addActor(newActor)
            store.getState().selectActor(newActor.id)
          },
        },
      ]
    }

    return []
  }

  return (
    <div
      className={css.cpViewportInner}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        position: 'relative',
      }}
    >
      <div
        ref={containerRef}
        className={css.cameraPlannerViewport}
        style={{
          width: '100%',
          height: '100%',
          cursor: tool === 'object' ? 'crosshair' : 'default',
        }}
        onContextMenu={handleContextMenu}
      />
      {engineReady && engine && (
        <ViewfinderOverlay
          scene={engine.scene}
          cameraRig={engine.cameraRig}
          actorRig={engine.actorRig}
          pathSystem={engine.pathSystem}
        />
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenu.actions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
