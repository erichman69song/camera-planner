/**
 * PropertyPanel — Right panel showing properties of selected camera or object.
 */

import React from 'react'
import { usePlannerStore } from '../store/usePlannerStore'
import { outputManager } from './CameraPlanner'
import { MOVEMENT_PRESETS } from '../presets/movements'
import { Camera } from '../types/camera'
import { Actor, ActorRole } from '../types/actor'
import css from '../styles.module.css'

const ROLE_LABELS: Record<ActorRole, string> = {
  principal: '主角',
  supporting: '配角',
  extra: '群众',
}

const InspectorHeader: React.FC<{ title: string; meta: string }> = ({ title, meta }) => (
  <div className={css.cpInspectorHeader}>
    <span>
      <small>INSPECTOR</small>
      <strong>{title}</strong>
    </span>
    <em>{meta}</em>
  </div>
)

export const PropertyPanel: React.FC = () => {
  const selectedCameraId = usePlannerStore(s => s.selectedCameraId)
  const selectedObjectId = usePlannerStore(s => s.selectedObjectId)
  const selectedActorId = usePlannerStore(s => s.selectedActorId)
  const cameras = usePlannerStore(s => s.project.cameras)
  const sceneObjects = usePlannerStore(s => s.project.scene.objects)
  const actors = usePlannerStore(s => s.project.actors)
  const updateCamera = usePlannerStore(s => s.updateCamera)
  const updateObject = usePlannerStore(s => s.updateObject)
  const updateActor = usePlannerStore(s => s.updateActor)

  const selectedCamera = cameras.find(c => c.id === selectedCameraId)
  const selectedObject = sceneObjects.find(o => o.id === selectedObjectId)
  const selectedActor = actors.find(a => a.id === selectedActorId)

  if (selectedCamera) {
    return <CameraProperties camera={selectedCamera} onUpdate={updateCamera} />
  }

  if (selectedActor) {
    return <ActorProperties actor={selectedActor} onUpdate={updateActor} />
  }

  if (selectedObject) {
    return <ObjectProperties object={selectedObject} onUpdate={updateObject} />
  }

  return (
    <div className={css.cpPropertyPanel}>
      <InspectorHeader title="参数检查器" meta="未选择对象" />
      <div className={css.cpPlaceholder}>
        <span>↖</span>
        <p>从场景或左侧列表选择机位、角色或置景</p>
      </div>
    </div>
  )
}

// --- Actor Properties ---

interface ActorPropsProps {
  actor: Actor
  onUpdate: (id: string, params: Partial<Actor>) => void
}

const ActorProperties: React.FC<ActorPropsProps> = ({ actor, onUpdate }) => {
  const handlePositionChange = (axis: 'x' | 'y' | 'z', value: number) => {
    onUpdate(actor.id, { position: { ...actor.position, [axis]: value } })
  }

  const handleRotationChange = (axis: 'yaw' | 'pitch' | 'roll', value: number) => {
    onUpdate(actor.id, { rotation: { ...actor.rotation, [axis]: value } })
  }

  return (
    <div className={css.cpPropertyPanel}>
      <InspectorHeader title={actor.name} meta={`${ROLE_LABELS[actor.role]} · ${actor.height.toFixed(2)}m`} />
      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>角色属性</div>

        <div className={css.cpField}>
          <label>名称</label>
          <input
            type="text"
            value={actor.name}
            onChange={e => onUpdate(actor.id, { name: e.target.value })}
          />
        </div>

        <div className={css.cpField}>
          <label>类型</label>
          <select
            value={actor.role}
            onChange={e => onUpdate(actor.id, { role: e.target.value as ActorRole })}
          >
            {Object.entries(ROLE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <div className={css.cpField}>
          <label>身高 (m)</label>
          <input
            type="range" min="0.5" max="2.5" step="0.05"
            value={actor.height}
            onChange={e => onUpdate(actor.id, { height: Number(e.target.value) })}
          />
          <span className={css.cpFieldValue}>{actor.height.toFixed(2)}m</span>
        </div>

        <div className={css.cpField}>
          <label>颜色</label>
          <input
            type="color"
            value={`#${actor.color.toString(16).padStart(6, '0')}`}
            onChange={e => onUpdate(actor.id, { color: parseInt(e.target.value.slice(1), 16) })}
          />
        </div>
      </div>

      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>位置</div>
        {(['x', 'y', 'z'] as const).map(axis => (
          <div className={[css.cpField, css.cpFieldRow].join(' ')} key={axis}>
            <label>{axis.toUpperCase()}</label>
            <input
              type="number" step="0.1"
              value={actor.position[axis]}
              onChange={e => handlePositionChange(axis, Number(e.target.value))}
            />
          </div>
        ))}
      </div>

      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>朝向</div>
        {(['yaw', 'pitch', 'roll'] as const).map(axis => (
          <div className={[css.cpField, css.cpFieldRow].join(' ')} key={axis}>
            <label>{axis}</label>
            <input
              type="range" min="-180" max="180" step="1"
              value={actor.rotation[axis]}
              onChange={e => handleRotationChange(axis, Number(e.target.value))}
            />
            <span className={css.cpFieldValue}>{actor.rotation[axis]}°</span>
          </div>
        ))}
      </div>

      <div className={css.cpPanelSection}>
        <div className={css.cpCalcRow}>
          <span>关键帧</span>
          <span className={css.cpCalcValue}>{actor.keyframes.length} 个</span>
        </div>
        <div className={css.cpCalcRow}>
          <span>ID</span>
          <span className={[css.cpCalcValue, css.cpMono].join(' ')}>{actor.id.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  )
}

// --- Camera Properties ---

interface CameraPropsProps {
  camera: Camera
  onUpdate: (id: string, params: Partial<Camera>) => void
}

const CameraProperties: React.FC<CameraPropsProps> = ({ camera, onUpdate }) => {
  const handleChange = (field: keyof Camera, value: number | string) => {
    const params: Partial<Camera> = { [field]: value }
    onUpdate(camera.id, params)
    outputManager.emit('camera:change', { ...camera, ...params } as Camera)
  }

  const handlePositionChange = (axis: 'x' | 'y' | 'z', value: number) => {
    const newPosition = { ...camera.position, [axis]: value }
    onUpdate(camera.id, { position: newPosition })
    outputManager.emit('camera:change', { ...camera, position: newPosition } as Camera)
  }

  const handleRotationChange = (axis: 'yaw' | 'pitch' | 'roll', value: number) => {
    const newRotation = { ...camera.rotation, [axis]: value }
    onUpdate(camera.id, { rotation: newRotation })
    outputManager.emit('camera:change', { ...camera, rotation: newRotation } as Camera)
  }

  return (
    <div className={css.cpPropertyPanel}>
      <InspectorHeader title={camera.name} meta={`${camera.focal}mm · f/${camera.fstop.toFixed(1)}`} />
      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>摄像机参数</div>

        <div className={css.cpField}>
          <label>名称</label>
          <input
            type="text"
            value={camera.name}
            onChange={e => handleChange('name', e.target.value)}
          />
        </div>

        <div className={css.cpField}>
          <label>焦距 (mm)</label>
          <input
            type="range" min="8" max="300" step="1"
            value={camera.focal}
            onChange={e => handleChange('focal', Number(e.target.value))}
          />
          <span className={css.cpFieldValue}>{camera.focal}mm</span>
        </div>

        <div className={css.cpField}>
          <label>光圈 (f/)</label>
          <input
            type="range" min="1.2" max="22" step="0.1"
            value={camera.fstop}
            onChange={e => handleChange('fstop', Number(e.target.value))}
          />
          <span className={css.cpFieldValue}>f/{camera.fstop.toFixed(1)}</span>
        </div>

        <div className={css.cpField}>
          <label>对焦距离 (m)</label>
          <input
            type="range" min="0.3" max="100" step="0.1"
            value={camera.focusDist}
            onChange={e => handleChange('focusDist', Number(e.target.value))}
          />
          <span className={css.cpFieldValue}>{camera.focusDist.toFixed(1)}m</span>
        </div>
      </div>

      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>位置</div>
        {(['x', 'y', 'z'] as const).map(axis => (
          <div className={[css.cpField, css.cpFieldRow].join(' ')} key={axis}>
            <label>{axis.toUpperCase()}</label>
            <input
              type="number" step="0.1"
              value={camera.position[axis]}
              onChange={e => handlePositionChange(axis, Number(e.target.value))}
            />
          </div>
        ))}
      </div>

      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>旋转</div>
        {(['yaw', 'pitch', 'roll'] as const).map(axis => (
          <div className={[css.cpField, css.cpFieldRow].join(' ')} key={axis}>
            <label>{axis}</label>
            <input
              type="range" min="-180" max="180" step="1"
              value={camera.rotation[axis]}
              onChange={e => handleRotationChange(axis, Number(e.target.value))}
            />
            <span className={css.cpFieldValue}>{camera.rotation[axis]}°</span>
          </div>
        ))}
      </div>

      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>计算值</div>
        <div className={css.cpCalcRow}>
          <span>FOV</span>
          <span className={css.cpCalcValue}>{camera.fov.toFixed(1)}°</span>
        </div>
        <div className={css.cpCalcRow}>
          <span>景深范围</span>
          <span className={css.cpCalcValue}>
            {camera.dof.range === Infinity ? '∞' : `${camera.dof.range.toFixed(2)}m`}
          </span>
        </div>
        <div className={css.cpCalcRow}>
          <span>近焦</span>
          <span className={css.cpCalcValue}>{camera.dof.near.toFixed(2)}m</span>
        </div>
        <div className={css.cpCalcRow}>
          <span>远焦</span>
          <span className={css.cpCalcValue}>
            {camera.dof.far === Infinity ? '∞' : `${camera.dof.far.toFixed(2)}m`}
          </span>
        </div>
      </div>

      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>运镜</div>
        <select
          value={camera.movement?.type || ''}
          onChange={e => {
            const preset = MOVEMENT_PRESETS.find(p => p.type === e.target.value)
            if (preset) {
              onUpdate(camera.id, {
                movement: { type: preset.type, duration: preset.defaultDuration },
              })
            }
          }}
        >
          <option value="">无</option>
          {MOVEMENT_PRESETS.map(p => (
            <option key={p.type} value={p.type}>{p.label} ({p.labelEn})</option>
          ))}
        </select>
      </div>

      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>剧本绑定</div>
        <div className={css.cpField}>
          <label>场景</label>
          <input
            type="text"
            value={camera.script?.sceneId || ''}
            onChange={e => onUpdate(camera.id, {
              script: { ...camera.script, sceneId: e.target.value },
            })}
            placeholder="Scene-01"
          />
        </div>
        <div className={css.cpField}>
          <label>镜号</label>
          <input
            type="text"
            value={camera.script?.shotId || ''}
            onChange={e => onUpdate(camera.id, {
              script: { ...camera.script, shotId: e.target.value },
            })}
            placeholder="Shot-03"
          />
        </div>
        <div className={css.cpField}>
          <label>描述</label>
          <input
            type="text"
            value={camera.script?.description || ''}
            onChange={e => onUpdate(camera.id, {
              script: { ...camera.script, description: e.target.value },
            })}
            placeholder="主角对话近景"
          />
        </div>
        <div className={css.cpField}>
          <label>对白</label>
          <input
            type="text"
            value={camera.script?.dialogue || ''}
            onChange={e => onUpdate(camera.id, {
              script: { ...camera.script, dialogue: e.target.value },
            })}
            placeholder="你怎么来了？"
          />
        </div>
        <div className={css.cpField}>
          <label>动作</label>
          <input
            type="text"
            value={camera.script?.action || ''}
            onChange={e => onUpdate(camera.id, {
              script: { ...camera.script, action: e.target.value },
            })}
            placeholder="转身离开"
          />
        </div>
      </div>
    </div>
  )
}

// --- Object Properties ---

interface ObjectPropsProps {
  object: import('../types/scene').SceneObject
  onUpdate: (id: string, params: Partial<import('../types/scene').SceneObject>) => void
}

const ObjectProperties: React.FC<ObjectPropsProps> = ({ object, onUpdate }) => {
  const handlePositionChange = (axis: 'x' | 'y' | 'z', value: number) => {
    onUpdate(object.id, { position: { ...object.position, [axis]: value } })
  }

  const handleScaleChange = (axis: 'x' | 'y' | 'z', value: number) => {
    onUpdate(object.id, { scale: { ...object.scale, [axis]: value } })
  }

  return (
    <div className={css.cpPropertyPanel}>
      <InspectorHeader title={object.type.toUpperCase()} meta={`ID ${object.id.slice(0, 8)}`} />
      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>物体: {object.type}</div>
        <div className={css.cpCalcRow}>
          <span>ID</span>
          <span className={[css.cpCalcValue, css.cpMono].join(' ')}>{object.id.slice(0, 8)}</span>
        </div>
      </div>

      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>位置</div>
        {(['x', 'y', 'z'] as const).map(axis => (
          <div className={[css.cpField, css.cpFieldRow].join(' ')} key={axis}>
            <label>{axis.toUpperCase()}</label>
            <input
              type="number" step="0.1"
              value={object.position[axis]}
              onChange={e => handlePositionChange(axis, Number(e.target.value))}
            />
          </div>
        ))}
      </div>

      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>缩放</div>
        {(['x', 'y', 'z'] as const).map(axis => (
          <div className={[css.cpField, css.cpFieldRow].join(' ')} key={axis}>
            <label>{axis.toUpperCase()}</label>
            <input
              type="number" step="0.1" min="0.1"
              value={object.scale[axis]}
              onChange={e => handleScaleChange(axis, Number(e.target.value))}
            />
          </div>
        ))}
      </div>

      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>颜色</div>
        <div className={css.cpField}>
          <input
            type="color"
            value={`#${object.color.toString(16).padStart(6, '0')}`}
            onChange={e => onUpdate(object.id, { color: parseInt(e.target.value.slice(1), 16) })}
          />
        </div>
      </div>
    </div>
  )
}
