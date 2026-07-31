/**
 * CameraList — List of cameras with add/delete/select.
 */

import React from 'react'
import { usePlannerStore } from '../store/usePlannerStore'
import { outputManager } from './CameraPlanner'
import { calcFOV, calcDOF, generateId } from '../engine/calc'
import { SENSOR_PRESETS } from '../presets/sensors'
import css from '../styles.module.css'

export const CameraList: React.FC = () => {
  const cameras = usePlannerStore(s => s.project.cameras)
  const selectedId = usePlannerStore(s => s.selectedCameraId)
  const selectCamera = usePlannerStore(s => s.selectCamera)
  const addCamera = usePlannerStore(s => s.addCamera)
  const deleteCamera = usePlannerStore(s => s.deleteCamera)

  const handleAdd = () => {
    const sensor = SENSOR_PRESETS[0] // full frame
    const focal = 50
    const fov = calcFOV(sensor.h, focal)
    const dof = calcDOF(focal, 2.8, 5, sensor.h)

    const newCamera = {
      id: generateId(),
      name: `CAM-${cameras.length + 1}`,
      focal,
      sensorW: sensor.w,
      sensorH: sensor.h,
      fstop: 2.8,
      focusDist: 5,
      height: 1.6,
      position: { x: Math.random() * 4 - 2, y: 1.6, z: Math.random() * 4 - 2 },
      rotation: { yaw: Math.random() * 360 - 180, pitch: 0, roll: 0 },
      fov,
      dof,
      color: 0x5cc8ff,
    }

    addCamera(newCamera)
    outputManager.emit('camera:add', newCamera)
    selectCamera(newCamera.id)
  }

  const handleDelete = (id: string) => {
    deleteCamera(id)
    outputManager.emit('camera:delete', id)
  }

  return (
    <div className={css.cpCameraList}>
      <div className={css.cpCameraListHeader}>
        <span>摄像机 ({cameras.length})</span>
        <button className={css.cpBtnSm} onClick={handleAdd}>+ 添加</button>
      </div>
      <div className={css.cpCameraListItems}>
        {cameras.length === 0 && (
          <div className={css.cpEmpty}>暂无摄像机，点击"添加"创建</div>
        )}
        {cameras.map(cam => (
          <div
            key={cam.id}
            className={`${css.cpCameraItem} ${selectedId === cam.id ? css.selected : ''}`}
            onClick={() => selectCamera(cam.id)}
          >
            <div
              className={css.cpCameraColor}
              style={{ backgroundColor: `#${cam.color.toString(16).padStart(6, '0')}` }}
            />
            <div className={css.cpCameraInfo}>
              <div className={css.cpCameraName}>{cam.name}</div>
              <div className={css.cpCameraMeta}>
                {cam.focal}mm · f/{cam.fstop} · FOV {cam.fov.toFixed(1)}°
              </div>
            </div>
            <button
              className={css.cpCameraDelete}
              onClick={(e) => { e.stopPropagation(); handleDelete(cam.id) }}
              title="删除"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
