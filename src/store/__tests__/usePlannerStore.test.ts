/**
 * Unit tests for store/usePlannerStore.ts
 * Tests: undo/redo, camera CRUD, object CRUD, state sync
 *
 * Run: npx tsx src/store/__tests__/usePlannerStore.test.ts
 */

import { usePlannerStore, PlannerState } from '../usePlannerStore'
import { createEmptyProject } from '../../types/project'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  // Reset project and module-level history before each test
  usePlannerStore.getState().loadProject(createEmptyProject())
  usePlannerStore.setState({
    mode: 'select',
    tool: 'camera',
    sideTab: 'cameras',
    bottomTab: 'timeline',
    selectedCameraId: null,
    selectedObjectId: null,
    selectedActorId: null,
    selectedPathPointId: null,
    pendingObjectType: null,
    showGrid: true,
    showAxes: true,
    showFovCones: true,
  })

  try {
    fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${name}`)
    console.error(`    ${(e as Error).message}`)
  }
}

function assertEqual(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${msg || ''} Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed')
}

const makeCamera = (overrides: Record<string, unknown> = {}) => ({
  id: `cam-${Math.random().toString(36).slice(2, 8)}`,
  name: 'CAM-TEST',
  focal: 50,
  sensorW: 36,
  sensorH: 24,
  fstop: 2.8,
  focusDist: 5,
  height: 1.6,
  position: { x: 0, y: 1.6, z: 0 },
  rotation: { yaw: 0, pitch: 0, roll: 0 },
  fov: 27,
  dof: { near: 4, far: 6, range: 2 },
  color: 0x7c83ff,
  ...overrides,
})

const makeObject = (overrides: Record<string, unknown> = {}) => ({
  id: `obj-${Math.random().toString(36).slice(2, 8)}`,
  type: 'box' as const,
  position: { x: 0, y: 0, z: 0 },
  rotation: { yaw: 0, pitch: 0, roll: 0 },
  scale: { x: 1, y: 1, z: 1 },
  color: 0x888888,
  ...overrides,
})

// ============================================================
// Camera CRUD
// ============================================================

console.log('\nCamera CRUD:')

test('addCamera adds to project', () => {
  const cam = makeCamera()
  usePlannerStore.getState().addCamera(cam)
  assertEqual(usePlannerStore.getState().project.cameras.length, 1)
  assertEqual(usePlannerStore.getState().project.cameras[0].id, cam.id)
})

test('addCamera multiple cameras', () => {
  usePlannerStore.getState().addCamera(makeCamera({ name: 'A' }))
  usePlannerStore.getState().addCamera(makeCamera({ name: 'B' }))
  usePlannerStore.getState().addCamera(makeCamera({ name: 'C' }))
  assertEqual(usePlannerStore.getState().project.cameras.length, 3)
})

test('updateCamera modifies correct camera', () => {
  const cam = makeCamera({ focal: 50 })
  usePlannerStore.getState().addCamera(cam)
  usePlannerStore.getState().updateCamera(cam.id, { focal: 85 })
  assertEqual(usePlannerStore.getState().project.cameras[0].focal, 85)
})

test('deleteCamera removes camera', () => {
  const cam = makeCamera()
  usePlannerStore.getState().addCamera(cam)
  usePlannerStore.getState().deleteCamera(cam.id)
  assertEqual(usePlannerStore.getState().project.cameras.length, 0)
})

test('deleteCamera clears selection if deleted was selected', () => {
  const cam = makeCamera()
  usePlannerStore.getState().addCamera(cam)
  usePlannerStore.getState().selectCamera(cam.id)
  assertTrue(usePlannerStore.getState().selectedCameraId === cam.id)
  usePlannerStore.getState().deleteCamera(cam.id)
  assertEqual(usePlannerStore.getState().selectedCameraId, null)
})

test('deleteCamera clears associated paths, storyboard cells and timeline keyframes', () => {
  const cam = makeCamera()
  usePlannerStore.getState().addCamera(cam)
  const project = usePlannerStore.getState().getProjectData()
  usePlannerStore.getState().loadProject({
    ...project,
    path: [{
      id: 'path-1',
      cameraId: cam.id,
      position: { x: 0, y: 1.6, z: 0 },
      rotation: { yaw: 0, pitch: 0, roll: 0 },
      t: 0,
    }],
    storyboard: {
      grid: '3x3',
      cells: [{ index: 0, cameraId: cam.id, label: 'Shot 1' }],
    },
    timeline: {
      ...project.timeline,
      keyframes: [{
        id: 'timeline-1',
        time: 0,
        cameraId: cam.id,
        type: 'position',
        value: { x: 0, y: 1.6, z: 0 },
      }],
    },
  })
  usePlannerStore.getState().selectCamera(cam.id)
  usePlannerStore.getState().selectPathPoint('path-1')

  usePlannerStore.getState().deleteCamera(cam.id)

  const next = usePlannerStore.getState()
  assertEqual(next.project.path.length, 0)
  assertEqual(next.project.storyboard.cells[0].cameraId, undefined)
  assertEqual(next.project.storyboard.cells[0].label, 'Shot 1')
  assertEqual(next.project.timeline.keyframes.length, 0)
  assertEqual(next.selectedPathPointId, null)
})

test('selectCamera sets selectedCameraId', () => {
  const cam = makeCamera()
  usePlannerStore.getState().addCamera(cam)
  usePlannerStore.getState().selectCamera(cam.id)
  assertEqual(usePlannerStore.getState().selectedCameraId, cam.id)
})

test('selectCamera clears object selection', () => {
  const cam = makeCamera()
  const obj = makeObject()
  usePlannerStore.getState().addCamera(cam)
  usePlannerStore.getState().addObject(obj)
  usePlannerStore.getState().selectObject(obj.id)
  assertTrue(usePlannerStore.getState().selectedObjectId === obj.id)
  usePlannerStore.getState().selectCamera(cam.id)
  assertEqual(usePlannerStore.getState().selectedObjectId, null)
})

// ============================================================
// Object CRUD
// ============================================================

console.log('\nObject CRUD:')

test('addObject adds to scene', () => {
  const obj = makeObject()
  usePlannerStore.getState().addObject(obj)
  assertEqual(usePlannerStore.getState().project.scene.objects.length, 1)
})

test('updateObject modifies correct object', () => {
  const obj = makeObject({ color: 0x888888 })
  usePlannerStore.getState().addObject(obj)
  usePlannerStore.getState().updateObject(obj.id, { color: 0xff0000 })
  assertEqual(usePlannerStore.getState().project.scene.objects[0].color, 0xff0000)
})

test('deleteObject removes object', () => {
  const obj = makeObject()
  usePlannerStore.getState().addObject(obj)
  usePlannerStore.getState().deleteObject(obj.id)
  assertEqual(usePlannerStore.getState().project.scene.objects.length, 0)
})

test('selectObject clears camera selection', () => {
  const cam = makeCamera()
  const obj = makeObject()
  usePlannerStore.getState().addCamera(cam)
  usePlannerStore.getState().addObject(obj)
  usePlannerStore.getState().selectCamera(cam.id)
  usePlannerStore.getState().selectObject(obj.id)
  assertEqual(usePlannerStore.getState().selectedCameraId, null)
  assertEqual(usePlannerStore.getState().selectedObjectId, obj.id)
})

// ============================================================
// Undo / Redo
// ============================================================

console.log('\nUndo/Redo:')

test('undo reverts last camera add', () => {
  usePlannerStore.getState().addCamera(makeCamera())
  assertEqual(usePlannerStore.getState().project.cameras.length, 1)
  usePlannerStore.getState().undo()
  assertEqual(usePlannerStore.getState().project.cameras.length, 0)
})

test('redo restores undone camera add', () => {
  usePlannerStore.getState().addCamera(makeCamera())
  usePlannerStore.getState().undo()
  assertEqual(usePlannerStore.getState().project.cameras.length, 0)
  usePlannerStore.getState().redo()
  assertEqual(usePlannerStore.getState().project.cameras.length, 1)
})

test('undo reverts camera update', () => {
  const cam = makeCamera({ focal: 50 })
  usePlannerStore.getState().addCamera(cam)
  usePlannerStore.getState().updateCamera(cam.id, { focal: 85 })
  assertEqual(usePlannerStore.getState().project.cameras[0].focal, 85)
  usePlannerStore.getState().undo()
  assertEqual(usePlannerStore.getState().project.cameras[0].focal, 50)
})

test('undo reverts camera delete', () => {
  const cam = makeCamera()
  usePlannerStore.getState().addCamera(cam)
  usePlannerStore.getState().deleteCamera(cam.id)
  assertEqual(usePlannerStore.getState().project.cameras.length, 0)
  usePlannerStore.getState().undo()
  assertEqual(usePlannerStore.getState().project.cameras.length, 1)
})

test('redo clears on new action', () => {
  usePlannerStore.getState().addCamera(makeCamera({ name: 'A' }))
  usePlannerStore.getState().undo()
  // New action should clear redo stack
  usePlannerStore.getState().addCamera(makeCamera({ name: 'B' }))
  assertEqual(usePlannerStore.getState().project.cameras.length, 1)
  assertEqual(usePlannerStore.getState().project.cameras[0].name, 'B')
  // Redo should not restore 'A'
  usePlannerStore.getState().redo()
  assertEqual(usePlannerStore.getState().project.cameras.length, 1)
})

test('multiple undo/redo cycle', () => {
  usePlannerStore.getState().addCamera(makeCamera({ name: '1' }))
  usePlannerStore.getState().addCamera(makeCamera({ name: '2' }))
  usePlannerStore.getState().addCamera(makeCamera({ name: '3' }))
  assertEqual(usePlannerStore.getState().project.cameras.length, 3)

  usePlannerStore.getState().undo() // remove 3
  assertEqual(usePlannerStore.getState().project.cameras.length, 2)
  usePlannerStore.getState().undo() // remove 2
  assertEqual(usePlannerStore.getState().project.cameras.length, 1)
  usePlannerStore.getState().undo() // remove 1
  assertEqual(usePlannerStore.getState().project.cameras.length, 0)

  usePlannerStore.getState().redo() // restore 1
  assertEqual(usePlannerStore.getState().project.cameras.length, 1)
  usePlannerStore.getState().redo() // restore 2
  assertEqual(usePlannerStore.getState().project.cameras.length, 2)
  usePlannerStore.getState().redo() // restore 3
  assertEqual(usePlannerStore.getState().project.cameras.length, 3)
})

test('loadProject clears undo and redo history', () => {
  usePlannerStore.getState().addCamera(makeCamera({ name: 'OLD' }))
  const loaded = createEmptyProject()
  loaded.cameras = [makeCamera({ name: 'LOADED' })]

  usePlannerStore.getState().loadProject(loaded)
  usePlannerStore.getState().undo()

  assertEqual(usePlannerStore.getState().project.cameras.length, 1)
  assertEqual(usePlannerStore.getState().project.cameras[0].name, 'LOADED')
})

test('single snapshot groups repeated camera transforms into one undo step', () => {
  const cam = makeCamera()
  usePlannerStore.getState().addCamera(cam)
  usePlannerStore.getState().snapshot()
  usePlannerStore.getState().setCameraTransform(
    cam.id,
    { x: 1, y: 1.6, z: 1 },
    cam.rotation
  )
  usePlannerStore.getState().setCameraTransform(
    cam.id,
    { x: 2, y: 1.6, z: 2 },
    cam.rotation
  )

  usePlannerStore.getState().undo()
  assertEqual(usePlannerStore.getState().project.cameras[0].position, cam.position)
})

test('single snapshot groups repeated object transforms into one undo step', () => {
  const obj = makeObject()
  usePlannerStore.getState().addObject(obj)
  usePlannerStore.getState().snapshot()
  usePlannerStore.getState().updateObject(obj.id, { position: { x: 1, y: 0, z: 1 } })
  usePlannerStore.getState().updateObject(obj.id, { position: { x: 2, y: 0, z: 2 } })

  usePlannerStore.getState().undo()
  assertEqual(usePlannerStore.getState().project.scene.objects[0].position, obj.position)
})

// ============================================================
// Editor State
// ============================================================

console.log('\nEditor state:')

test('setMode changes mode', () => {
  usePlannerStore.getState().setMode('move')
  assertEqual(usePlannerStore.getState().mode, 'move')
})

test('toggleGrid flips showGrid', () => {
  assertTrue(usePlannerStore.getState().showGrid === true)
  usePlannerStore.getState().toggleGrid()
  assertTrue(usePlannerStore.getState().showGrid === false)
  usePlannerStore.getState().toggleGrid()
  assertTrue(usePlannerStore.getState().showGrid === true)
})

test('loadProject replaces all data', () => {
  usePlannerStore.getState().addCamera(makeCamera())
  usePlannerStore.getState().addObject(makeObject())
  const newProject = createEmptyProject()
  newProject.cameras = [makeCamera({ name: 'LOADED' })]
  usePlannerStore.getState().loadProject(newProject)
  assertEqual(usePlannerStore.getState().project.cameras.length, 1)
  assertEqual(usePlannerStore.getState().project.cameras[0].name, 'LOADED')
  assertEqual(usePlannerStore.getState().project.scene.objects.length, 0)
  assertEqual(usePlannerStore.getState().selectedCameraId, null)
})

test('getProjectData returns current state', () => {
  usePlannerStore.getState().addCamera(makeCamera({ name: 'GET' }))
  const data = usePlannerStore.getState().getProjectData()
  assertEqual(data.cameras.length, 1)
  assertEqual(data.cameras[0].name, 'GET')
})

// ============================================================
// Summary
// ============================================================

console.log(`\n${'='.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`)
console.log(`${'='.repeat(50)}\n`)

if (failed > 0) {
  process.exit(1)
}
