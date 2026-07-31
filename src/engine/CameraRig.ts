/**
 * CameraRig — Camera cone visualization and management.
 *
 * Each "camera" in the planner is represented as a 3D cone (frustum visualization)
 * with a position, rotation, and optical properties. This module handles:
 * - Creating/updating/deleting camera 3D objects
 * - Visualizing FOV as cone angle
 * - Highlighting selected camera
 * - Displaying camera name labels
 */

import * as THREE from 'three'
import { Camera, Position3D, Rotation3D } from '../types/camera'
import { PathPoint } from '../types/project'
import { calcFOV, calcDOF, deg2rad, generateId, sampleCameraPathAtTime } from './calc'
import { SENSOR_PRESETS } from '../presets/sensors'

const DEFAULT_CAMERA_COLOR = 0x5cc8ff
const SELECTED_CAMERA_COLOR = 0xffc45d

export class CameraRig {
  private scene: THREE.Scene
  private cameras: Map<string, CameraData> = new Map()
  private selectedId: string | null = null

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /** Add a new camera to the scene */
  addCamera(params: Partial<Camera> = {}): Camera {
    const id = params.id || generateId()
    const sensor = SENSOR_PRESETS.find(p => p.name === 'full_frame')!

    const camera: Camera = {
      id,
      name: params.name || `CAM-${this.cameras.size + 1}`,
      focal: params.focal || 50,
      sensorW: params.sensorW || sensor.w,
      sensorH: params.sensorH || sensor.h,
      fstop: params.fstop || 2.8,
      focusDist: params.focusDist || 5,
      height: params.height || 1.6,
      position: params.position || { x: 0, y: 1.6, z: 5 },
      rotation: params.rotation || { yaw: 0, pitch: 0, roll: 0 },
      fov: 0,
      dof: { near: 0, far: Infinity, range: Infinity },
      color: params.color || DEFAULT_CAMERA_COLOR,
      movement: params.movement,
      script: params.script,
    }

    // Calculate optical properties
    camera.fov = calcFOV(camera.sensorH, camera.focal)
    camera.dof = calcDOF(camera.focal, camera.fstop, camera.focusDist, camera.sensorH)

    // Create 3D representation
    const group = this.createCameraMesh(camera)
    this.scene.add(group)

    this.cameras.set(id, { camera, group })
    return camera
  }

  /** Update camera parameters and refresh 3D visualization */
  updateCamera(id: string, params: Partial<Camera>): Camera | null {
    const data = this.cameras.get(id)
    if (!data) return null

    // Merge params
    Object.assign(data.camera, params)

    // Recalculate optics
    data.camera.fov = calcFOV(data.camera.sensorH, data.camera.focal)
    data.camera.dof = calcDOF(
      data.camera.focal, data.camera.fstop,
      data.camera.focusDist, data.camera.sensorH
    )

    // Rebuild mesh
    this.scene.remove(data.group)
    data.group = this.createCameraMesh(data.camera)
    this.scene.add(data.group)

    // Update selection highlight
    if (id === this.selectedId) {
      this.highlightCamera(id)
    }

    return data.camera
  }

  /** Delete a camera */
  deleteCamera(id: string): boolean {
    const data = this.cameras.get(id)
    if (!data) return false

    this.scene.remove(data.group)
    data.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose())
        } else {
          child.material.dispose()
        }
      }
    })
    this.cameras.delete(id)

    if (this.selectedId === id) {
      this.selectedId = null
    }

    return true
  }

  /** Select a camera by ID */
  selectCamera(id: string | null): void {
    // Remove previous highlight
    if (this.selectedId) {
      this.highlightCamera(this.selectedId, false)
    }
    this.selectedId = id
    if (id) {
      this.highlightCamera(id, true)
    }
  }

  /** Get selected camera ID */
  getSelectedId(): string | null {
    return this.selectedId
  }

  /** Get camera data by ID */
  getCamera(id: string): Camera | null {
    return this.cameras.get(id)?.camera || null
  }

  /** Get all cameras */
  getAllCameras(): Camera[] {
    return Array.from(this.cameras.values()).map(d => d.camera)
  }

  /** Get 3D group for a camera (used by RayPicker) */
  getMeshGroup(id: string): THREE.Group | null {
    return this.cameras.get(id)?.group || null
  }

  /** Get all mesh groups (used by RayPicker) */
  getAllMeshGroups(): THREE.Group[] {
    return Array.from(this.cameras.values()).map(d => d.group)
  }

  /** Set camera position directly (e.g., from drag) */
  setCameraPosition(id: string, position: Position3D): void {
    const data = this.cameras.get(id)
    if (!data) return
    data.camera.position = position
    data.group.position.set(position.x, position.y, position.z)
  }

  /** Set camera rotation (e.g., from property panel) */
  setCameraRotation(id: string, rotation: Rotation3D): void {
    const data = this.cameras.get(id)
    if (!data) return
    data.camera.rotation = rotation
    data.group.rotation.order = 'YXZ'
    data.group.rotation.set(
      deg2rad(rotation.pitch),
      deg2rad(rotation.yaw),
      deg2rad(rotation.roll)
    )
  }

  /** Timeline playback: move cameras along their path keyframes */
  updatePlayback(pathPoints: PathPoint[], normalizedTime: number): void {
    for (const [id] of this.cameras) {
      const sample = sampleCameraPathAtTime(pathPoints, id, normalizedTime)
      if (!sample) continue
      this.setCameraPosition(id, sample.position)
      this.setCameraRotation(id, sample.rotation)
    }
  }

  /** Clear all cameras */
  clearAll(): void {
    for (const [id] of this.cameras) {
      this.deleteCamera(id)
    }
  }

  // --- Private helpers ---

  private createCameraMesh(camera: Camera): THREE.Group {
    const group = new THREE.Group()
    group.userData = { cameraId: camera.id }
    // Match PerspectiveCamera / viewfinder: look down local -Z, Euler YXZ
    group.rotation.order = 'YXZ'

    // Camera body (small box)
    const bodyGeo = new THREE.BoxGeometry(0.3, 0.2, 0.4)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: camera.color,
      metalness: 0.6,
      roughness: 0.3,
    })
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.castShadow = true
    body.userData = { cameraId: camera.id, part: 'body' }
    group.add(body)

    // Lens (points local -Z, same as Three.js camera forward)
    const lensGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.2, 16)
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.8,
      roughness: 0.2,
    })
    const lens = new THREE.Mesh(lensGeo, lensMat)
    lens.rotation.x = Math.PI / 2
    lens.position.z = -0.3
    lens.userData = { cameraId: camera.id, part: 'lens' }
    group.add(lens)

    // Field-of-view frustum: the primary spatial cue for camera planning.
    const depth = 3.6
    const verticalFov = deg2rad(calcFOV(camera.sensorH, camera.focal))
    const halfHeight = Math.tan(verticalFov / 2) * depth
    const halfWidth = halfHeight * (camera.sensorW / camera.sensorH)
    const origin = new THREE.Vector3(0, 0, -0.42)
    const corners = [
      new THREE.Vector3(-halfWidth, halfHeight, -depth),
      new THREE.Vector3(halfWidth, halfHeight, -depth),
      new THREE.Vector3(halfWidth, -halfHeight, -depth),
      new THREE.Vector3(-halfWidth, -halfHeight, -depth),
    ]
    const frustumPoints: THREE.Vector3[] = []
    corners.forEach(corner => frustumPoints.push(origin, corner))
    for (let i = 0; i < corners.length; i++) {
      frustumPoints.push(corners[i], corners[(i + 1) % corners.length])
    }
    const frustumGeo = new THREE.BufferGeometry().setFromPoints(frustumPoints)
    const frustumMat = new THREE.LineBasicMaterial({
      color: camera.color,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
    const frustum = new THREE.LineSegments(frustumGeo, frustumMat)
    frustum.userData = { cameraId: camera.id, part: 'frustum' }
    group.add(frustum)

    const aimGeo = new THREE.BufferGeometry().setFromPoints([
      origin,
      new THREE.Vector3(0, 0, -depth - 0.8),
    ])
    const aimMat = new THREE.LineDashedMaterial({
      color: camera.color,
      dashSize: 0.22,
      gapSize: 0.14,
      transparent: true,
      opacity: 0.9,
    })
    const aimLine = new THREE.Line(aimGeo, aimMat)
    aimLine.computeLineDistances()
    aimLine.userData = { cameraId: camera.id, part: 'aim' }
    group.add(aimLine)

    group.position.set(camera.position.x, camera.position.y, camera.position.z)
    group.rotation.set(
      deg2rad(camera.rotation.pitch),
      deg2rad(camera.rotation.yaw),
      deg2rad(camera.rotation.roll)
    )

    return group
  }

  private highlightCamera(id: string, highlight = true): void {
    const data = this.cameras.get(id)
    if (!data) return

    const color = highlight ? SELECTED_CAMERA_COLOR : data.camera.color
    data.group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.part === 'body') {
        (child.material as THREE.MeshStandardMaterial).color.setHex(color)
      }
      if (
        (child instanceof THREE.Line || child instanceof THREE.LineSegments) &&
        (child.userData.part === 'frustum' || child.userData.part === 'aim')
      ) {
        (child.material as THREE.LineBasicMaterial).color.setHex(color)
      }
    })
  }
}

interface CameraData {
  camera: Camera
  group: THREE.Group
}
