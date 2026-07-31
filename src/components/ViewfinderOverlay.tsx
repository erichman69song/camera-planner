/**
 * ViewfinderOverlay — PiP RGB/depth monitor over the 3D viewport.
 */

import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Viewfinder, ViewfinderMode } from '../engine/Viewfinder'
import { SceneEngine } from '../engine/SceneEngine'
import { CameraRig } from '../engine/CameraRig'
import { ActorRig } from '../engine/ActorRig'
import { PathSystem } from '../engine/PathSystem'
import { LightSystem } from '../engine/LightSystem'
import { usePlannerStore } from '../store/usePlannerStore'
import { sampleActorAtTime, rad2deg } from '../engine/calc'
import { Camera } from '../types/camera'
import css from '../styles.module.css'

interface ViewfinderOverlayProps {
  scene: SceneEngine
  cameraRig: CameraRig
  actorRig: ActorRig
  pathSystem: PathSystem
  lightSystem: LightSystem
}

/** Prefer live mesh pose (path playback updates mesh / store). */
function resolveLiveCamera(cam: Camera, cameraRig: CameraRig): Camera {
  const group = cameraRig.getMeshGroup(cam.id)
  if (!group) return cam
  return {
    ...cam,
    position: {
      x: group.position.x,
      y: group.position.y,
      z: group.position.z,
    },
    rotation: {
      pitch: rad2deg(group.rotation.x),
      yaw: rad2deg(group.rotation.y),
      roll: rad2deg(group.rotation.z),
    },
  }
}

export const ViewfinderOverlay: React.FC<ViewfinderOverlayProps> = ({
  scene,
  cameraRig,
  actorRig,
  pathSystem,
  lightSystem,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vfRef = useRef<Viewfinder | null>(null)
  const modeRef = useRef<ViewfinderMode>('rgb')
  const [mode, setMode] = useState<ViewfinderMode>('rgb')
  const [info, setInfo] = useState('未选择机位')

  modeRef.current = mode

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const vf = new Viewfinder(scene.scene, canvas)
    vfRef.current = vf

    const collectHelpers = (): THREE.Object3D[] => {
      const list: THREE.Object3D[] = [
        ...scene.getHelperObjects(),
        ...cameraRig.getAllMeshGroups(),
        ...pathSystem.getVisualObjects(),
        ...actorRig.getHelperObjects(),
        ...lightSystem.getHelperObjects(),
      ]
      return Array.from(new Set(list))
    }

    const unsub = scene.onFrame(() => {
      const state = usePlannerStore.getState()
      const { cameras, actors, timeline } = state.project
      const base = state.selectedCameraId
        ? cameras.find(c => c.id === state.selectedCameraId) ?? null
        : null
      const cam = base ? resolveLiveCamera(base, cameraRig) : null

      let actorPos: { x: number; y: number; z: number } | null = null
      const first = actors[0]
      if (first) {
        const sample = sampleActorAtTime(first.keyframes, timeline.currentTime)
        actorPos = sample?.position ?? first.position
      }

      vf.setMode(modeRef.current)
      const text = vf.render({
        selectedCamera: cam,
        helpers: collectHelpers(),
        actorPosition: actorPos,
      })
      setInfo(prev => (prev === text ? prev : text))
    })

    return () => {
      unsub()
      vf.dispose()
      vfRef.current = null
    }
  }, [scene, cameraRig, actorRig, pathSystem, lightSystem])

  return (
    <div className={css.cpVfWindow}>
      <div className={css.cpVfToolbar}>
        <span className={css.cpVfTitle}><i>VF</i> 取景监视器</span>
        <div className={css.cpVfModes}>
          <button
            type="button"
            className={`${css.cpVfModeBtn} ${mode === 'rgb' ? css.active : ''}`}
            onClick={() => setMode('rgb')}
          >彩图</button>
          <button
            type="button"
            className={`${css.cpVfModeBtn} ${mode === 'depth' ? css.active : ''}`}
            onClick={() => setMode('depth')}
          >深度</button>
        </div>
      </div>
      <canvas ref={canvasRef} className={css.cpVfCanvas} width={256} height={144} />
      <div className={css.cpVfInfo}>{info}</div>
    </div>
  )
}
