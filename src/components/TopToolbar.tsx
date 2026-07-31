/**
 * TopToolbar — Mode selection, tool selection, undo/redo, toggles, export.
 */

import React from 'react'
import { usePlannerStore, EditorMode, ToolMode } from '../store/usePlannerStore'
import css from '../styles.module.css'

const MODES: { value: EditorMode; label: string; icon: string }[] = [
  { value: 'select', label: '选择', icon: '↖' },
  { value: 'place', label: '放置', icon: '＋' },
  { value: 'move', label: '移动', icon: '✣' },
  { value: 'rotate', label: '旋转', icon: '↻' },
]

const TOOLS: { value: ToolMode; label: string; icon: string }[] = [
  { value: 'camera', label: '机位', icon: 'CAM' },
  { value: 'object', label: '置景', icon: 'OBJ' },
  { value: 'light', label: '灯光', icon: 'LUX' },
  { value: 'path', label: '路径', icon: 'PATH' },
]

interface TopToolbarProps {
  onExport?: () => void
}

export const TopToolbar: React.FC<TopToolbarProps> = ({ onExport }) => {
  const mode = usePlannerStore(s => s.mode)
  const tool = usePlannerStore(s => s.tool)
  const showGrid = usePlannerStore(s => s.showGrid)
  const showAxes = usePlannerStore(s => s.showAxes)
  const setMode = usePlannerStore(s => s.setMode)
  const setTool = usePlannerStore(s => s.setTool)
  const toggleGrid = usePlannerStore(s => s.toggleGrid)
  const toggleAxes = usePlannerStore(s => s.toggleAxes)
  const undo = usePlannerStore(s => s.undo)
  const redo = usePlannerStore(s => s.redo)
  const cameras = usePlannerStore(s => s.project.cameras)
  const actors = usePlannerStore(s => s.project.actors)
  const sceneObjects = usePlannerStore(s => s.project.scene.objects)

  return (
    <header className={css.cpToolbar}>
      <div className={css.cpBrand}>
        <span className={css.cpBrandMark}>CP</span>
        <span className={css.cpBrandCopy}>
          <strong>Camera Planner</strong>
          <small>摄影预演工作台</small>
        </span>
      </div>

      <div className={css.cpWorkspaceMeta} aria-label="场景状态">
        <span className={css.cpLiveStatus}><i />SCENE LIVE</span>
        <span>{cameras.length} 机位</span>
        <span>{actors.length} 角色</span>
        <span>{sceneObjects.length} 置景</span>
      </div>

      <div className={css.cpToolbarSpacer} />

      <div className={css.cpToolbarGroup}>
        <span className={css.cpToolbarLabel}>编辑</span>
        {MODES.map(m => (
          <button
            type="button"
            key={m.value}
            className={`${css.cpToolbarBtn} ${mode === m.value ? css.active : ''}`}
            onClick={() => setMode(m.value)}
            title={m.label}
            aria-label={m.label}
            aria-pressed={mode === m.value}
          >
            <span className={css.cpIcon}>{m.icon}</span>
            <span className={css.cpToolbarBtnText}>{m.label}</span>
          </button>
        ))}
      </div>

      <div className={css.cpToolbarSep} />

      <div className={css.cpToolbarGroup}>
        <span className={css.cpToolbarLabel}>对象</span>
        {TOOLS.map(t => (
          <button
            type="button"
            key={t.value}
            className={`${css.cpToolbarBtn} ${tool === t.value ? css.active : ''}`}
            onClick={() => setTool(t.value)}
            title={t.label}
            aria-label={t.label}
            aria-pressed={tool === t.value}
          >
            <span className={css.cpToolCode}>{t.icon}</span>
            <span className={css.cpToolbarBtnText}>{t.label}</span>
          </button>
        ))}
      </div>

      <div className={css.cpToolbarSep} />

      <div className={css.cpToolbarGroup}>
        <button type="button" className={css.cpToolbarBtn} onClick={undo} title="撤销 (Ctrl+Z)" aria-label="撤销">↩</button>
        <button type="button" className={css.cpToolbarBtn} onClick={redo} title="重做 (Ctrl+Y)" aria-label="重做">↪</button>
      </div>

      <div className={css.cpToolbarSep} />

      <div className={css.cpToolbarGroup}>
        <button
          type="button"
          className={`${css.cpToolbarBtn} ${showGrid ? css.active : ''}`}
          onClick={toggleGrid}
          title="米制网格"
          aria-pressed={showGrid}
        ><span className={css.cpToolCode}>GRID</span></button>
        <button
          type="button"
          className={`${css.cpToolbarBtn} ${showAxes ? css.active : ''}`}
          onClick={toggleAxes}
          title="坐标轴"
          aria-pressed={showAxes}
        ><span className={css.cpToolCode}>AXIS</span></button>
      </div>

      {onExport && (
        <button type="button" className={[css.cpToolbarBtn, css.cpToolbarExport].join(' ')} onClick={onExport}>
          交付 / 导出
        </button>
      )}
    </header>
  )
}
