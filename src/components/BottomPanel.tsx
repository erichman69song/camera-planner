/**
 * BottomPanel — Bottom panel with tabs: timeline, storyboard, keyframes.
 */

import React from 'react'
import { usePlannerStore, BottomTab } from '../store/usePlannerStore'
import { Timeline } from './Timeline'
import { StoryboardGrid } from './StoryboardGrid'
import css from '../styles.module.css'

const TABS: { value: BottomTab; label: string }[] = [
  { value: 'timeline', label: '时间线' },
  { value: 'storyboard', label: '分镜表' },
  { value: 'keyframes', label: '关键帧' },
]

export const BottomPanel: React.FC = () => {
  const bottomTab = usePlannerStore(s => s.bottomTab)
  const setBottomTab = usePlannerStore(s => s.setBottomTab)
  const pathPoints = usePlannerStore(s => s.project.path)

  return (
    <div className={css.cpBottomPanel}>
      <div className={css.cpBottomTabs}>
        <div className={css.cpBottomHeading}>
          <small>SHOT SEQUENCE</small>
          <strong>镜头编排</strong>
        </div>
        {TABS.map(t => (
          <button
            type="button"
            key={t.value}
            className={`${css.cpTabBtn} ${bottomTab === t.value ? css.active : ''}`}
            onClick={() => setBottomTab(t.value)}
            aria-pressed={bottomTab === t.value}
          >
            {t.label}
          </button>
        ))}
        <span className={css.cpBottomSummary}>{pathPoints.length} 个路径关键帧</span>
      </div>
      <div className={css.cpBottomContent}>
        {bottomTab === 'timeline' && <Timeline />}
        {bottomTab === 'storyboard' && <StoryboardGrid />}
        {bottomTab === 'keyframes' && (
          <div className={css.cpKeyframes}>
            <div className={css.cpKeyframesHeader}>
              关键帧 ({pathPoints.length})
            </div>
            {pathPoints.length === 0 ? (
              <div className={css.cpEmpty}>暂无关键帧。在路径工具模式下点击场景添加。</div>
            ) : (
              <div className={css.cpKeyframesList}>
                {pathPoints.map((p, i) => (
                  <div key={p.id} className={css.cpKeyframeItem}>
                    <span className={css.cpKfIndex}>#{i + 1}</span>
                    <span className={css.cpKfPos}>
                      ({p.position.x.toFixed(1)}, {p.position.y.toFixed(1)}, {p.position.z.toFixed(1)})
                    </span>
                    <span className={css.cpKfTime}>t={p.t.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
