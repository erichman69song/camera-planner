/**
 * RayPicker — Raycasting for object/camera/path selection and drag interaction.
 *
 * Handles mouse/touch ray casting against scene objects, camera meshes,
 * and path keyframe ghosts. Supports: click-to-select, drag-to-move.
 */

import * as THREE from 'three'

export type PickTarget = 'camera' | 'object' | 'actor' | 'path' | 'ground' | null

export interface PickResult {
  target: PickTarget
  id: string | null          // camera / object / actor / pathPoint ID
  point: THREE.Vector3       // intersection point in world space
  groundPoint: THREE.Vector3 | null  // projection onto y=0 plane
}

export class RayPicker {
  private camera: THREE.Camera
  private scene: THREE.Scene
  private raycaster: THREE.Raycaster
  private mouse: THREE.Vector2
  private groundPlane: THREE.Plane

  private onPickCallback: ((result: PickResult) => void) | null = null
  private onHoverCallback: ((result: PickResult | null) => void) | null = null
  private onDragEndCallback: (() => void) | null = null

  private isDragging = false
  private dragTarget: { type: 'camera' | 'object' | 'actor' | 'path'; id: string } | null = null
  private dragPlane: THREE.Plane
  private dragOffset: THREE.Vector3

  private cameraGroups: THREE.Group[] = []
  private objectMeshes: THREE.Object3D[] = []
  private actorGroups: THREE.Group[] = []
  private pathGroups: THREE.Group[] = []

  constructor(camera: THREE.Camera, scene: THREE.Scene) {
    this.camera = camera
    this.scene = scene
    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    this.dragOffset = new THREE.Vector3()
  }

  setCameraGroups(groups: THREE.Group[]): void {
    this.cameraGroups = groups
  }

  setObjectMeshes(meshes: THREE.Object3D[]): void {
    this.objectMeshes = meshes
  }

  setActorGroups(groups: THREE.Group[]): void {
    this.actorGroups = groups
  }

  setPathGroups(groups: THREE.Group[]): void {
    this.pathGroups = groups
  }

  enable(canvas: HTMLElement): void {
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerUp)
  }

  disable(canvas: HTMLElement): void {
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerup', this.onPointerUp)
    canvas.removeEventListener('pointercancel', this.onPointerUp)
  }

  onPick(callback: (result: PickResult) => void): void {
    this.onPickCallback = callback
  }

  onHover(callback: (result: PickResult | null) => void): void {
    this.onHoverCallback = callback
  }

  onDragEnd(callback: () => void): void {
    this.onDragEndCallback = callback
  }

  /** Public helper to perform a raycast at a specific mouse/pointer event */
  pickAtEvent(event: MouseEvent | PointerEvent): PickResult {
    this.updateMouse(event as PointerEvent)
    return this.raycast()
  }

  private onPointerDown = (event: PointerEvent): void => {
    this.updateMouse(event)
    const result = this.raycast()

    if (
      result.target === 'camera' ||
      result.target === 'object' ||
      result.target === 'actor' ||
      result.target === 'path'
    ) {
      this.isDragging = true
      this.dragTarget = {
        type: result.target,
        id: result.id!,
      }
      const pointerTarget = event.currentTarget as HTMLElement
      pointerTarget.setPointerCapture?.(event.pointerId)

      const worldPos = this.getWorldPosition(result.target, result.id!)
      if (worldPos) {
        this.dragPlane.set(new THREE.Vector3(0, 1, 0), -worldPos.y)
        const intersection = new THREE.Vector3()
        this.raycaster.ray.intersectPlane(this.dragPlane, intersection)
        this.dragOffset.copy(worldPos).sub(intersection)
      }
    }

    if (this.onPickCallback) {
      this.onPickCallback(result)
    }
  }

  private onPointerMove = (event: PointerEvent): void => {
    this.updateMouse(event)

    if (this.isDragging && this.dragTarget) {
      const intersection = new THREE.Vector3()
      this.raycaster.ray.intersectPlane(this.dragPlane, intersection)
      intersection.add(this.dragOffset)

      if (this.onPickCallback) {
        this.onPickCallback({
          target: this.dragTarget.type,
          id: this.dragTarget.id,
          point: intersection.clone(),
          groundPoint: new THREE.Vector3(intersection.x, 0, intersection.z),
        })
      }
      return
    }

    const result = this.raycast()
    if (this.onHoverCallback) {
      this.onHoverCallback(result.target ? result : null)
    }
  }

  private onPointerUp = (event: PointerEvent): void => {
    const wasDragging = this.isDragging
    this.isDragging = false
    this.dragTarget = null
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    if (wasDragging) {
      this.onDragEndCallback?.()
    }
  }

  private updateMouse(event: PointerEvent): void {
    const rect = (event.target as HTMLElement).getBoundingClientRect?.()
    if (!rect) return
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.mouse, this.camera)
  }

  private raycast(): PickResult {
    const empty: PickResult = {
      target: null,
      id: null,
      point: new THREE.Vector3(),
      groundPoint: null,
    }

    const allMeshes: THREE.Object3D[] = []
    // Path ghosts first so they win over live cameras when overlapping
    for (const group of this.pathGroups) {
      group.traverse(child => {
        if (child instanceof THREE.Mesh) allMeshes.push(child)
      })
    }
    for (const group of this.cameraGroups) {
      group.traverse(child => {
        if (child instanceof THREE.Mesh) allMeshes.push(child)
      })
    }
    for (const obj of this.objectMeshes) {
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) allMeshes.push(child)
      })
    }
    for (const group of this.actorGroups) {
      group.traverse(child => {
        if (child instanceof THREE.Mesh) allMeshes.push(child)
      })
    }

    const intersects = this.raycaster.intersectObjects(allMeshes, false)

    if (intersects.length > 0) {
      const hit = intersects[0]
      const userData = hit.object.userData
      const groundPoint = new THREE.Vector3()
      this.raycaster.ray.intersectPlane(this.groundPlane, groundPoint)

      if (userData.pathPointId) {
        return {
          target: 'path',
          id: userData.pathPointId,
          point: hit.point.clone(),
          groundPoint,
        }
      }
      if (userData.cameraId) {
        return {
          target: 'camera',
          id: userData.cameraId,
          point: hit.point.clone(),
          groundPoint,
        }
      }
      if (userData.objectId) {
        return {
          target: 'object',
          id: userData.objectId,
          point: hit.point.clone(),
          groundPoint,
        }
      }
      if (userData.actorId) {
        return {
          target: 'actor',
          id: userData.actorId,
          point: hit.point.clone(),
          groundPoint,
        }
      }
    }

    const groundPoint = new THREE.Vector3()
    const groundHit = this.raycaster.ray.intersectPlane(this.groundPlane, groundPoint)
    if (groundHit) {
      return {
        target: 'ground',
        id: null,
        point: groundPoint.clone(),
        groundPoint: groundPoint.clone(),
      }
    }

    return empty
  }

  private getWorldPosition(
    type: 'camera' | 'object' | 'actor' | 'path',
    id: string
  ): THREE.Vector3 | null {
    if (type === 'camera') {
      const group = this.cameraGroups.find(g => g.userData.cameraId === id)
      return group ? group.position.clone() : null
    }
    if (type === 'actor') {
      const group = this.actorGroups.find(g => g.userData.actorId === id)
      return group ? group.position.clone() : null
    }
    if (type === 'path') {
      const group = this.pathGroups.find(g => g.userData.pathPointId === id)
      return group ? group.position.clone() : null
    }
    const mesh = this.objectMeshes.find(m => m.userData.objectId === id)
    return mesh ? mesh.position.clone() : null
  }
}
