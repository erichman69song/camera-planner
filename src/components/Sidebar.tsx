/**
 * Sidebar — Left panel with tabs: cameras, objects, templates, characters.
 */

import React from 'react'
import { usePlannerStore, SideTab } from '../store/usePlannerStore'
import { CameraList } from './CameraList'
import { ObjectPalette } from './ObjectPalette'
import { SceneTemplates } from './SceneTemplates'
import { ActorPanel } from './ActorPanel'
import { LightingPanel } from './LightingPanel'
import css from '../styles.module.css'

const TABS: { value: SideTab; label: string; icon: string }[] = [
  { value: 'cameras', label: '机位', icon: 'CAM' },
  { value: 'characters', label: '角色', icon: 'ACT' },
  { value: 'objects', label: '置景', icon: 'OBJ' },
  { value: 'lighting', label: '灯光', icon: 'LGT' },
  { value: 'templates', label: '场景', icon: 'SET' },
]

export const Sidebar: React.FC = () => {
  const sideTab = usePlannerStore(s => s.sideTab)
  const setSideTab = usePlannerStore(s => s.setSideTab)

  return (
    <div className={css.cpSidebar}>
      <div className={css.cpPanelHeader}>
        <span>
          <small>SCENE SETUP</small>
          <strong>场景构成</strong>
        </span>
        <i>01</i>
      </div>
      <div className={css.cpSidebarTabs}>
        {TABS.map(t => (
          <button
            type="button"
            key={t.value}
            className={`${css.cpTabBtn} ${sideTab === t.value ? css.active : ''}`}
            onClick={() => setSideTab(t.value)}
            title={t.label}
            aria-pressed={sideTab === t.value}
          >
            <span className={css.cpTabCode}>{t.icon}</span>
            <span className={css.cpTabLabel}>{t.label}</span>
          </button>
        ))}
      </div>
      <div className={css.cpSidebarContent}>
        {sideTab === 'cameras' && <CameraList />}
        {sideTab === 'objects' && <ObjectPalette />}
        {sideTab === 'templates' && <SceneTemplates />}
        {sideTab === 'characters' && <ActorPanel />}
        {sideTab === 'lighting' && <LightingPanel />}
      </div>
    </div>
  )
}
