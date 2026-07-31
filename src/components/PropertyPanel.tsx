/**
 * PropertyPanel — Right panel showing properties of selected camera or object.
 */

import React from 'react'
import { usePlannerStore } from '../store/usePlannerStore'
import { outputManager } from './CameraPlanner'
import { MOVEMENT_PRESETS } from '../presets/movements'
import { Camera } from '../types/camera'
import { Actor, ActorRole, ActorAction, ActorBodyType } from '../types/actor'
import { SceneObject, StageLight, LightModifier } from '../types/scene'
import { OBJECT_LABELS } from './ObjectPalette'
import css from '../styles.module.css'

const ROLE_LABELS: Record<ActorRole, string> = {
  principal: '主角',
  supporting: '配角',
  extra: '群众',
}

const ACTION_LABELS: Record<ActorAction, string> = {
  stand: '站立',
  walk: '行走',
  run: '奔跑',
  sit: '坐姿',
  turn: '转身',
  gesture: '手势',
  leave: '离场',
}

const BODY_LABELS: Record<ActorBodyType, string> = {
  adult_male: '成年男性',
  adult_female: '成年女性',
  child: '儿童',
}

const LIGHT_LABELS = {
  point: '点光源',
  area: '面光源',
  line: '线光源',
} as const

const MODIFIER_LABELS = {
  flag: '黑旗',
  butterfly: '蝶布',
  blackout: '黑幕',
} as const

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
  const selectedLightId = usePlannerStore(s => s.selectedLightId)
  const selectedModifierId = usePlannerStore(s => s.selectedModifierId)
  const cameras = usePlannerStore(s => s.project.cameras)
  const sceneObjects = usePlannerStore(s => s.project.scene.objects)
  const actors = usePlannerStore(s => s.project.actors)
  const lights = usePlannerStore(s => s.project.scene.lights || [])
  const modifiers = usePlannerStore(s => s.project.scene.modifiers || [])
  const updateCamera = usePlannerStore(s => s.updateCamera)
  const updateObject = usePlannerStore(s => s.updateObject)
  const updateActor = usePlannerStore(s => s.updateActor)
  const updateStageLight = usePlannerStore(s => s.updateStageLight)
  const updateLightModifier = usePlannerStore(s => s.updateLightModifier)

  const selectedCamera = cameras.find(c => c.id === selectedCameraId)
  const selectedObject = sceneObjects.find(o => o.id === selectedObjectId)
  const selectedActor = actors.find(a => a.id === selectedActorId)
  const selectedLight = lights.find(light => light.id === selectedLightId)
  const selectedModifier = modifiers.find(modifier => modifier.id === selectedModifierId)

  if (selectedCamera) {
    return <CameraProperties camera={selectedCamera} onUpdate={updateCamera} />
  }

  if (selectedActor) {
    return <ActorProperties actor={selectedActor} onUpdate={updateActor} />
  }

  if (selectedObject) {
    return <ObjectProperties object={selectedObject} onUpdate={updateObject} />
  }

  if (selectedLight) {
    return <StageLightProperties light={selectedLight} onUpdate={updateStageLight} />
  }

  if (selectedModifier) {
    return <ModifierProperties modifier={selectedModifier} onUpdate={updateLightModifier} />
  }

  return (
    <div className={css.cpPropertyPanel}>
      <InspectorHeader title="参数检查器" meta="未选择对象" />
      <div className={css.cpPlaceholder}>
        <span>↖</span>
        <p>从场景或左侧列表选择机位、角色、置景或灯光设备</p>
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
          <label>人物模型</label>
          <select
            value={actor.bodyType}
            onChange={e => onUpdate(actor.id, { bodyType: e.target.value as ActorBodyType })}
          >
            {Object.entries(BODY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className={css.cpField}>
          <label>动作模型</label>
          <select
            value={actor.action}
            onChange={e => onUpdate(actor.id, { action: e.target.value as ActorAction })}
          >
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
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
        <div className={css.cpSectionTitle}>人物尺寸倍率</div>
        {(['x', 'y', 'z'] as const).map(axis => (
          <div className={[css.cpField, css.cpFieldRow].join(' ')} key={axis}>
            <label>{axis.toUpperCase()}</label>
            <input
              type="number"
              min="0.2"
              max="4"
              step="0.05"
              value={actor.scale[axis]}
              onChange={e => onUpdate(actor.id, {
                scale: {
                  ...actor.scale,
                  [axis]: Math.max(0.2, Number(e.target.value)),
                },
              })}
            />
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
  object: SceneObject
  onUpdate: (id: string, params: Partial<SceneObject>) => void
}

const ObjectProperties: React.FC<ObjectPropsProps> = ({ object, onUpdate }) => {
  const handlePositionChange = (axis: 'x' | 'y' | 'z', value: number) => {
    onUpdate(object.id, { position: { ...object.position, [axis]: value } })
  }

  const handleScaleChange = (axis: 'x' | 'y' | 'z', value: number) => {
    onUpdate(object.id, { scale: { ...object.scale, [axis]: value } })
  }

  const handleRotationChange = (axis: 'yaw' | 'pitch' | 'roll', value: number) => {
    onUpdate(object.id, { rotation: { ...object.rotation, [axis]: value } })
  }

  return (
    <div className={css.cpPropertyPanel}>
      <InspectorHeader
        title={object.name || OBJECT_LABELS[object.type] || object.type.toUpperCase()}
        meta={OBJECT_LABELS[object.type] || object.type}
      />
      <div className={css.cpPanelSection}>
        <div className={css.cpSectionTitle}>模型属性</div>
        <div className={css.cpField}>
          <label>名称</label>
          <input
            type="text"
            value={object.name || ''}
            placeholder={OBJECT_LABELS[object.type]}
            onChange={e => onUpdate(object.id, { name: e.target.value })}
          />
        </div>
        <div className={css.cpCalcRow}>
          <span>模型</span>
          <span className={css.cpCalcValue}>{OBJECT_LABELS[object.type] || object.type}</span>
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
        <div className={css.cpSectionTitle}>旋转</div>
        {(['yaw', 'pitch', 'roll'] as const).map(axis => (
          <div className={[css.cpField, css.cpFieldRow].join(' ')} key={axis}>
            <label>{axis}</label>
            <input
              type="number"
              step="1"
              value={object.rotation[axis]}
              onChange={e => handleRotationChange(axis, Number(e.target.value))}
            />
            <span className={css.cpFieldValue}>{object.rotation[axis]}°</span>
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

interface StageLightProps {
  light: StageLight
  onUpdate: (id: string, params: Partial<StageLight>) => void
}

const StageLightProperties: React.FC<StageLightProps> = ({ light, onUpdate }) => (
  <div className={css.cpPropertyPanel}>
    <InspectorHeader
      title={light.name}
      meta={`${LIGHT_LABELS[light.type]} · ${Math.round(light.intensity)} lx`}
    />
    <div className={css.cpPanelSection}>
      <div className={css.cpSectionTitle}>灯具参数</div>
      <div className={css.cpField}>
        <label>名称</label>
        <input
          type="text"
          value={light.name}
          onChange={e => onUpdate(light.id, { name: e.target.value })}
        />
      </div>
      <div className={css.cpField}>
        <label>启用</label>
        <input
          type="checkbox"
          checked={light.enabled}
          onChange={e => onUpdate(light.id, { enabled: e.target.checked })}
        />
      </div>
      <div className={css.cpField}>
        <label>输出强度</label>
        <input
          type="range"
          min="0"
          max={light.type === 'area' ? 80 : 1200}
          step={light.type === 'area' ? 1 : 10}
          value={light.intensity}
          onChange={e => onUpdate(light.id, { intensity: Number(e.target.value) })}
        />
        <span className={css.cpFieldValue}>{Math.round(light.intensity)} lx</span>
      </div>
      <div className={css.cpField}>
        <label>有效距离</label>
        <input
          type="range"
          min="1"
          max="50"
          step="0.5"
          value={light.distance}
          onChange={e => onUpdate(light.id, { distance: Number(e.target.value) })}
        />
        <span className={css.cpFieldValue}>{light.distance.toFixed(1)}m</span>
      </div>
      <div className={css.cpField}>
        <label>光色</label>
        <input
          type="color"
          value={`#${light.color.toString(16).padStart(6, '0')}`}
          onChange={e => onUpdate(light.id, { color: parseInt(e.target.value.slice(1), 16) })}
        />
      </div>
    </div>

    <TransformSections
      value={light}
      onPosition={(axis, value) => onUpdate(light.id, {
        position: { ...light.position, [axis]: value },
      })}
      onRotation={(axis, value) => onUpdate(light.id, {
        rotation: { ...light.rotation, [axis]: value },
      })}
      onScale={(axis, value) => onUpdate(light.id, {
        scale: { ...light.scale, [axis]: value },
      })}
    />
  </div>
)

interface ModifierProps {
  modifier: LightModifier
  onUpdate: (id: string, params: Partial<LightModifier>) => void
}

const ModifierProperties: React.FC<ModifierProps> = ({ modifier, onUpdate }) => (
  <div className={css.cpPropertyPanel}>
    <InspectorHeader
      title={modifier.name}
      meta={MODIFIER_LABELS[modifier.type]}
    />
    <div className={css.cpPanelSection}>
      <div className={css.cpSectionTitle}>控光装备</div>
      <div className={css.cpField}>
        <label>名称</label>
        <input
          type="text"
          value={modifier.name}
          onChange={e => onUpdate(modifier.id, { name: e.target.value })}
        />
      </div>
      <div className={css.cpField}>
        <label>启用</label>
        <input
          type="checkbox"
          checked={modifier.enabled}
          onChange={e => onUpdate(modifier.id, { enabled: e.target.checked })}
        />
      </div>
      <div className={css.cpField}>
        <label>透光率</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={modifier.transmission}
          onChange={e => onUpdate(modifier.id, { transmission: Number(e.target.value) })}
        />
        <span className={css.cpFieldValue}>{Math.round(modifier.transmission * 100)}%</span>
      </div>
      <div className={css.cpField}>
        <label>柔光程度</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={modifier.diffusion}
          onChange={e => onUpdate(modifier.id, { diffusion: Number(e.target.value) })}
        />
        <span className={css.cpFieldValue}>{Math.round(modifier.diffusion * 100)}%</span>
      </div>
      <div className={css.cpField}>
        <label>布面颜色</label>
        <input
          type="color"
          value={`#${modifier.color.toString(16).padStart(6, '0')}`}
          onChange={e => onUpdate(modifier.id, { color: parseInt(e.target.value.slice(1), 16) })}
        />
      </div>
    </div>

    <TransformSections
      value={modifier}
      onPosition={(axis, value) => onUpdate(modifier.id, {
        position: { ...modifier.position, [axis]: value },
      })}
      onRotation={(axis, value) => onUpdate(modifier.id, {
        rotation: { ...modifier.rotation, [axis]: value },
      })}
      onScale={(axis, value) => onUpdate(modifier.id, {
        scale: { ...modifier.scale, [axis]: value },
      })}
    />
  </div>
)

interface TransformValue {
  position: { x: number; y: number; z: number }
  rotation: { yaw: number; pitch: number; roll: number }
  scale: { x: number; y: number; z: number }
}

const TransformSections: React.FC<{
  value: TransformValue
  onPosition: (axis: 'x' | 'y' | 'z', value: number) => void
  onRotation: (axis: 'yaw' | 'pitch' | 'roll', value: number) => void
  onScale: (axis: 'x' | 'y' | 'z', value: number) => void
}> = ({ value, onPosition, onRotation, onScale }) => (
  <>
    <div className={css.cpPanelSection}>
      <div className={css.cpSectionTitle}>位置</div>
      {(['x', 'y', 'z'] as const).map(axis => (
        <div className={[css.cpField, css.cpFieldRow].join(' ')} key={axis}>
          <label>{axis.toUpperCase()}</label>
          <input
            type="number"
            step="0.1"
            value={value.position[axis]}
            onChange={e => onPosition(axis, Number(e.target.value))}
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
            type="number"
            step="1"
            value={value.rotation[axis]}
            onChange={e => onRotation(axis, Number(e.target.value))}
          />
          <span className={css.cpFieldValue}>{value.rotation[axis]}°</span>
        </div>
      ))}
    </div>
    <div className={css.cpPanelSection}>
      <div className={css.cpSectionTitle}>尺寸倍率</div>
      {(['x', 'y', 'z'] as const).map(axis => (
        <div className={[css.cpField, css.cpFieldRow].join(' ')} key={axis}>
          <label>{axis.toUpperCase()}</label>
          <input
            type="number"
            min="0.1"
            max="8"
            step="0.1"
            value={value.scale[axis]}
            onChange={e => onScale(axis, Math.max(0.1, Number(e.target.value)))}
          />
        </div>
      ))}
    </div>
  </>
)
