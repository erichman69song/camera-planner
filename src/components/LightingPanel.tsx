import React from 'react'
import { usePlannerStore } from '../store/usePlannerStore'
import { StageLightType, LightModifierType } from '../types/scene'
import css from '../styles.module.css'

const LIGHT_ITEMS: Array<{
  type: StageLightType
  code: string
  label: string
  meta: string
}> = [
  { type: 'point', code: 'OMNI', label: '点光源', meta: '全向硬光 / practical' },
  { type: 'area', code: 'AREA', label: '面光源', meta: '柔光箱 / LED panel' },
  { type: 'line', code: 'TUBE', label: '线光源', meta: '灯管 / strip light' },
]

const MODIFIER_ITEMS: Array<{
  type: LightModifierType
  code: string
  label: string
  meta: string
}> = [
  { type: 'flag', code: 'FLAG', label: '黑旗', meta: '切光 / negative fill' },
  { type: 'butterfly', code: 'SILK', label: '蝶布', meta: '透光 / diffusion' },
  { type: 'blackout', code: 'DUV', label: '黑幕', meta: '遮光 / blackout' },
]

const LIGHT_LABELS: Record<StageLightType, string> = {
  point: '点光源',
  area: '面光源',
  line: '线光源',
}

const MODIFIER_LABELS: Record<LightModifierType, string> = {
  flag: '黑旗',
  butterfly: '蝶布',
  blackout: '黑幕',
}

export const LightingPanel: React.FC = () => {
  const lights = usePlannerStore(s => s.project.scene.lights || [])
  const modifiers = usePlannerStore(s => s.project.scene.modifiers || [])
  const selectedLightId = usePlannerStore(s => s.selectedLightId)
  const selectedModifierId = usePlannerStore(s => s.selectedModifierId)
  const pendingLightType = usePlannerStore(s => s.pendingLightType)
  const pendingModifierType = usePlannerStore(s => s.pendingModifierType)
  const setPendingLightType = usePlannerStore(s => s.setPendingLightType)
  const setPendingModifierType = usePlannerStore(s => s.setPendingModifierType)
  const selectStageLight = usePlannerStore(s => s.selectStageLight)
  const selectLightModifier = usePlannerStore(s => s.selectLightModifier)
  const deleteStageLight = usePlannerStore(s => s.deleteStageLight)
  const deleteLightModifier = usePlannerStore(s => s.deleteLightModifier)
  const setTool = usePlannerStore(s => s.setTool)
  const setMode = usePlannerStore(s => s.setMode)

  const chooseLight = (type: StageLightType) => {
    setPendingLightType(type)
    setTool('light')
    setMode('place')
  }

  const chooseModifier = (type: LightModifierType) => {
    setPendingModifierType(type)
    setTool('light')
    setMode('place')
  }

  const pendingLabel = pendingLightType
    ? LIGHT_LABELS[pendingLightType]
    : pendingModifierType
      ? MODIFIER_LABELS[pendingModifierType]
      : null

  return (
    <div className={css.cpLightingPanel}>
      <div className={css.cpPaletteHeader}>灯光设备</div>
      <div className={css.cpPaletteHint}>
        {pendingLabel
          ? `已选「${pendingLabel}」→ 在场景地面点击放置`
          : '选择灯具或控光设备，再在场景内放置'}
      </div>

      <div className={css.cpAssetSectionLabel}>LIGHT SOURCES</div>
      <div className={css.cpLightingGrid}>
        {LIGHT_ITEMS.map(item => (
          <button
            type="button"
            key={item.type}
            className={`${css.cpLightingCard} ${pendingLightType === item.type ? css.active : ''}`}
            onClick={() => chooseLight(item.type)}
          >
            <span className={css.cpLightingCode}>{item.code}</span>
            <strong>{item.label}</strong>
            <small>{item.meta}</small>
          </button>
        ))}
      </div>

      <div className={css.cpAssetSectionLabel}>GRIP / MODIFIERS</div>
      <div className={css.cpLightingGrid}>
        {MODIFIER_ITEMS.map(item => (
          <button
            type="button"
            key={item.type}
            className={`${css.cpLightingCard} ${pendingModifierType === item.type ? css.active : ''}`}
            onClick={() => chooseModifier(item.type)}
          >
            <span className={css.cpLightingCode}>{item.code}</span>
            <strong>{item.label}</strong>
            <small>{item.meta}</small>
          </button>
        ))}
      </div>

      <div className={css.cpAssetSectionLabel}>
        PLACED EQUIPMENT · {lights.length + modifiers.length}
      </div>
      <div className={css.cpEquipmentList}>
        {lights.map(light => (
          <div
            role="button"
            tabIndex={0}
            key={light.id}
            className={`${css.cpEquipmentItem} ${selectedLightId === light.id ? css.selected : ''}`}
            onClick={() => selectStageLight(light.id)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') selectStageLight(light.id)
            }}
          >
            <i style={{ background: `#${light.color.toString(16).padStart(6, '0')}` }} />
            <span>
              <strong>{light.name}</strong>
              <small>{LIGHT_LABELS[light.type]} · {Math.round(light.intensity)} lx</small>
            </span>
            <b
              role="button"
              tabIndex={0}
              onClick={event => {
                event.stopPropagation()
                deleteStageLight(light.id)
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') deleteStageLight(light.id)
              }}
              aria-label={`删除${light.name}`}
            >×</b>
          </div>
        ))}
        {modifiers.map(modifier => (
          <div
            role="button"
            tabIndex={0}
            key={modifier.id}
            className={`${css.cpEquipmentItem} ${selectedModifierId === modifier.id ? css.selected : ''}`}
            onClick={() => selectLightModifier(modifier.id)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') selectLightModifier(modifier.id)
            }}
          >
            <i className={css.cpModifierSwatch} />
            <span>
              <strong>{modifier.name}</strong>
              <small>
                {MODIFIER_LABELS[modifier.type]} · 透光 {Math.round(modifier.transmission * 100)}%
              </small>
            </span>
            <b
              role="button"
              tabIndex={0}
              onClick={event => {
                event.stopPropagation()
                deleteLightModifier(modifier.id)
              }}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') deleteLightModifier(modifier.id)
              }}
              aria-label={`删除${modifier.name}`}
            >×</b>
          </div>
        ))}
        {lights.length === 0 && modifiers.length === 0 && (
          <div className={css.cpEmpty}>尚未放置灯具或控光设备</div>
        )}
      </div>
    </div>
  )
}
