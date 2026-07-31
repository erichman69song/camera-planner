import React from 'react'
import ReactDOM from 'react-dom/client'
import { CameraPlanner } from '../src/components/CameraPlanner'
// CSS Modules are imported by components internally

// Demo: load with some sample cameras
const sampleData = {
  version: '4.0',
  cameras: [
    {
      id: 'cam1',
      name: 'CAM-01',
      focal: 50,
      sensorW: 36,
      sensorH: 24,
      fstop: 2.8,
      focusDist: 5,
      height: 1.6,
      position: { x: -3, y: 1.6, z: 5 },
      rotation: { yaw: -20, pitch: 0, roll: 0 },
      fov: 27.0,
      dof: { near: 4.65, far: 5.41, range: 0.76 },
      color: 0x5cc8ff,
    },
    {
      id: 'cam2',
      name: 'CAM-02',
      focal: 85,
      sensorW: 36,
      sensorH: 24,
      fstop: 1.8,
      focusDist: 8,
      height: 1.8,
      position: { x: 4, y: 1.8, z: 6 },
      rotation: { yaw: 15, pitch: -5, roll: 0 },
      fov: 16.1,
      dof: { near: 7.42, far: 8.67, range: 1.25 },
      color: 0xff6b35,
    },
    {
      id: 'cam3',
      name: 'CAM-03',
      focal: 24,
      sensorW: 29.9,
      sensorH: 22.2,
      fstop: 4.0,
      focusDist: 3,
      height: 3.5,
      position: { x: 0, y: 3.5, z: -4 },
      rotation: { yaw: 180, pitch: -15, roll: 0 },
      fov: 26.4,
      dof: { near: 2.42, far: 3.91, range: 1.49 },
      color: 0x35ffa5,
    },
  ],
  actors: [
    {
      id: 'actor1',
      name: '小明',
      role: 'principal' as const,
      position: { x: 0, y: 0, z: 0 },
      rotation: { yaw: 0, pitch: 0, roll: 0 },
      height: 1.75,
      color: 0x4ecdc4,
      keyframes: [
        { id: 'ak1', time: 0, position: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 }, action: 'stand' as const },
        { id: 'ak2', time: 5, position: { x: 2, y: 0, z: -1 }, rotation: { yaw: -30, pitch: 0, roll: 0 }, action: 'walk' as const },
        { id: 'ak3', time: 10, position: { x: 4, y: 0, z: -2 }, rotation: { yaw: 90, pitch: 0, roll: 0 }, action: 'turn' as const },
      ],
    },
    {
      id: 'actor2',
      name: '小红',
      role: 'supporting' as const,
      position: { x: -2, y: 0, z: 1 },
      rotation: { yaw: 30, pitch: 0, roll: 0 },
      height: 1.65,
      color: 0xff6b35,
      keyframes: [
        { id: 'ak4', time: 0, position: { x: -2, y: 0, z: 1 }, rotation: { yaw: 30, pitch: 0, roll: 0 }, action: 'sit' as const },
        { id: 'ak5', time: 8, position: { x: -1, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 }, action: 'stand' as const },
      ],
    },
  ],
  scene: {
    template: 'studio' as const,
    objects: [
      { id: 'floor', type: 'plane' as const, position: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 }, scale: { x: 20, y: 1, z: 20 }, color: 0x2a2a2a },
      { id: 'desk', type: 'box' as const, position: { x: -2, y: 0.35, z: 0 }, rotation: { yaw: 0, pitch: 0, roll: 0 }, scale: { x: 2, y: 0.7, z: 1 }, color: 0x654321 },
    ],
    lighting: {
      position: { x: 5, y: 10, z: 5 },
      intensity: 1.2,
      color: 0xfff5e0,
      preset: 'daylight',
    },
  },
  path: [],
  storyboard: { grid: '3x3' as const, cells: [] },
  timeline: { duration: 30, currentTime: 0, playing: false, keyframes: [] },
}

function App() {
  return (
    <CameraPlanner
      initialData={sampleData}
      onCameraChange={(cam) => console.log('Camera changed:', cam)}
      onCameraSelect={(id) => console.log('Camera selected:', id)}
      onCameraAdd={(cam) => console.log('Camera added:', cam)}
      onCameraDelete={(id) => console.log('Camera deleted:', id)}
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
