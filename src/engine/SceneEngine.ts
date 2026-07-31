/**
 * SceneEngine — Three.js scene initialization and management.
 *
 * Handles: renderer, scene, camera, controls, grid, axes, resize, animation loop.
 * This is the foundation that all other engine modules build on top of.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface SceneEngineOptions {
  container: HTMLElement
  antialias?: boolean
  shadows?: boolean
  backgroundColor?: number
  gridSize?: number
  showGrid?: boolean
  showAxes?: boolean
}

export class SceneEngine {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer
  readonly controls: OrbitControls

  private container: HTMLElement
  private animationId: number | null = null
  private gridHelper: THREE.GridHelper | null = null
  private majorGridHelper: THREE.GridHelper | null = null
  private axesHelper: THREE.AxesHelper | null = null
  private stageFloor: THREE.Mesh | null = null
  private originMarker: THREE.Mesh | null = null
  private resizeObserver: ResizeObserver
  private frameCallbacks: Array<(delta: number) => void> = []
  private clock: THREE.Clock

  constructor(options: SceneEngineOptions) {
    const {
      container,
      antialias = true,
      shadows = true,
      backgroundColor = 0x26323d,
      gridSize = 40,
      showGrid = true,
      showAxes = true,
    } = options

    this.container = container
    this.clock = new THREE.Clock()

    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(backgroundColor)
    this.scene.fog = new THREE.FogExp2(backgroundColor, 0.008)

    // Camera
    const aspect = container.clientWidth / container.clientHeight || 1
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 500)
    this.camera.position.set(12, 10, 12)
    this.camera.lookAt(0, 0, 0)

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias,
      preserveDrawingBuffer: true, // needed for PNG export
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    if (shadows) {
      this.renderer.shadowMap.enabled = true
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    }
    container.appendChild(this.renderer.domElement)

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI * 0.48
    this.controls.minDistance = 2
    this.controls.maxDistance = 80

    // Neutral stage floor: separates the blocking space from the application chrome.
    const floorGeometry = new THREE.PlaneGeometry(gridSize + 8, gridSize + 8)
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x18222d,
      roughness: 1,
      metalness: 0,
    })
    this.stageFloor = new THREE.Mesh(floorGeometry, floorMaterial)
    this.stageFloor.rotation.x = -Math.PI / 2
    this.stageFloor.position.y = -0.025
    this.stageFloor.receiveShadow = true
    this.scene.add(this.stageFloor)

    // Two-level metric grid: 1m subdivisions + brighter 5m structure.
    if (showGrid) {
      this.gridHelper = new THREE.GridHelper(gridSize, gridSize, 0x8da2b7, 0x40566b)
      const minorMaterial = this.gridHelper.material as THREE.LineBasicMaterial
      minorMaterial.transparent = true
      minorMaterial.opacity = 0.72
      minorMaterial.depthWrite = false
      this.gridHelper.position.y = 0.015
      this.scene.add(this.gridHelper)

      this.majorGridHelper = new THREE.GridHelper(gridSize, gridSize / 5, 0xd5e1ec, 0x7890a8)
      const majorMaterial = this.majorGridHelper.material as THREE.LineBasicMaterial
      majorMaterial.transparent = true
      majorMaterial.opacity = 0.66
      majorMaterial.depthWrite = false
      this.majorGridHelper.position.y = 0.02
      this.scene.add(this.majorGridHelper)

      const markerGeometry = new THREE.RingGeometry(0.32, 0.42, 32)
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0xf4bf63,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      this.originMarker = new THREE.Mesh(markerGeometry, markerMaterial)
      this.originMarker.rotation.x = -Math.PI / 2
      this.originMarker.position.y = 0.035
      this.scene.add(this.originMarker)
    }

    // Axes
    if (showAxes) {
      this.axesHelper = new THREE.AxesHelper(3)
      this.scene.add(this.axesHelper)
    }

    // Ambient light (base)
    const ambient = new THREE.HemisphereLight(0xd8e8f5, 0x17212b, 0.72)
    this.scene.add(ambient)

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(container)
  }

  /** Start the animation loop */
  start(): void {
    if (this.animationId !== null) return
    this.clock.start()
    const loop = () => {
      this.animationId = requestAnimationFrame(loop)
      const delta = this.clock.getDelta()
      this.frameCallbacks.forEach(cb => cb(delta))
      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }
    loop()
  }

  /** Stop the animation loop */
  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  /** Register a callback to run every frame */
  onFrame(callback: (delta: number) => void): () => void {
    this.frameCallbacks.push(callback)
    return () => {
      const idx = this.frameCallbacks.indexOf(callback)
      if (idx >= 0) this.frameCallbacks.splice(idx, 1)
    }
  }

  /** Toggle grid visibility */
  setGridVisible(visible: boolean): void {
    if (this.gridHelper) this.gridHelper.visible = visible
    if (this.majorGridHelper) this.majorGridHelper.visible = visible
    if (this.originMarker) this.originMarker.visible = visible
  }

  /** Toggle axes visibility */
  setAxesVisible(visible: boolean): void {
    if (this.axesHelper) this.axesHelper.visible = visible
  }

  /** Helper objects for aux views (viewfinder) to temporarily hide */
  getHelperObjects(): THREE.Object3D[] {
    const out: THREE.Object3D[] = []
    if (this.gridHelper) out.push(this.gridHelper)
    if (this.majorGridHelper) out.push(this.majorGridHelper)
    if (this.axesHelper) out.push(this.axesHelper)
    if (this.originMarker) out.push(this.originMarker)
    return out
  }

  /** Export current viewport as PNG data URL */
  exportPNG(): string {
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement.toDataURL('image/png')
  }

  /** Export current viewport as PNG Blob */
  exportPNGBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      this.renderer.render(this.scene, this.camera)
      this.renderer.domElement.toBlob((blob) => resolve(blob), 'image/png')
    })
  }

  /** Get the canvas element */
  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement
  }

  /** Clean up all resources */
  dispose(): void {
    this.stop()
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.frameCallbacks = []

    // Remove canvas from DOM
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement)
    }

    // Dispose scene objects
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose())
        } else {
          object.material.dispose()
        }
      }
    })
  }

  private onResize(): void {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w === 0 || h === 0) return

    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }
}
