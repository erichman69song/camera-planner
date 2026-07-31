/**
 * SceneTemplates — Scene template cards to load presets.
 */

import React from 'react'
import { usePlannerStore } from '../store/usePlannerStore'
import { outputManager } from './CameraPlanner'
import { SCENE_PRESETS } from '../presets/templates'
import { generateId } from '../engine/calc'
import css from '../styles.module.css'

export const SceneTemplates: React.FC = () => {
  const setSceneConfig = usePlannerStore(s => s.setSceneConfig)

  const handleSelect = (preset: typeof SCENE_PRESETS[number]) => {
    const objects = preset.objects.map(o => ({
      ...o,
      id: generateId(),
    }))

    setSceneConfig({
      template: preset.template,
      objects,
    })

    outputManager.emit('scene:change', {
      template: preset.template,
      objects,
      lighting: usePlannerStore.getState().project.scene.lighting,
      lights: usePlannerStore.getState().project.scene.lights || [],
      modifiers: usePlannerStore.getState().project.scene.modifiers || [],
    })
  }

  return (
    <div className={css.cpSceneTemplates}>
      <div className={css.cpTemplatesHeader}>场景模板</div>
      <div className={css.cpTemplatesGrid}>
        {SCENE_PRESETS.map(preset => (
          <button
            key={preset.template}
            className={css.cpTemplateCard}
            onClick={() => handleSelect(preset)}
          >
            <span className={css.cpIconXl}>{preset.icon}</span>
            <div className={css.cpTemplateInfo}>
              <div className={css.cpTemplateName}>{preset.label}</div>
              <div className={css.cpTemplateEn}>{preset.labelEn}</div>
              <div className={css.cpTemplateCount}>{preset.objects.length} 个物体</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
