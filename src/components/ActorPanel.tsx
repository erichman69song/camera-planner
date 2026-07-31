/**
 * ActorPanel — 角色调度编辑面板
 *
 * 功能：
 * - 角色列表（添加/选择/删除）
 * - 选中角色的属性编辑（名称/类型/身高）
 * - 运动关键帧管理（添加/删除/编辑）
 * - 关键帧按时间排序，显示位置和动作
 */

import React from 'react'
import { usePlannerStore } from '../store/usePlannerStore'
import { generateId, sampleActorAtTime } from '../engine/calc'
import { Actor, ActorRole, ActorAction, ActorBodyType } from '../types/actor'
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
  sit: '坐',
  turn: '转身',
  gesture: '手势',
  leave: '离场',
}

const BODY_LABELS: Record<ActorBodyType, string> = {
  adult_male: '成年男性',
  adult_female: '成年女性',
  child: '儿童',
}

const ACTOR_COLORS = [0x4ecdc4, 0xff6b35, 0x9b59b6, 0x2ecc71, 0xe74c3c, 0xf39c12]

export const ActorPanel: React.FC = () => {
  const actors = usePlannerStore(s => s.project.actors)
  const selectedActorId = usePlannerStore(s => s.selectedActorId)
  const selectActor = usePlannerStore(s => s.selectActor)
  const addActor = usePlannerStore(s => s.addActor)
  const deleteActor = usePlannerStore(s => s.deleteActor)
  const updateActor = usePlannerStore(s => s.updateActor)
  const addActorKeyframe = usePlannerStore(s => s.addActorKeyframe)
  const removeActorKeyframe = usePlannerStore(s => s.removeActorKeyframe)
  const updateActorKeyframe = usePlannerStore(s => s.updateActorKeyframe)
  const timelineTime = usePlannerStore(s => s.project.timeline.currentTime)

  const selectedActor = actors.find(a => a.id === selectedActorId)

  const handleAdd = () => {
    const colorIdx = actors.length % ACTOR_COLORS.length
    const newActor: Actor = {
      id: generateId(),
      name: `角色${actors.length + 1}`,
      role: 'principal',
      bodyType: 'adult_male',
      action: 'stand',
      position: { x: Math.random() * 4 - 2, y: 0, z: Math.random() * 4 - 2 },
      rotation: { yaw: 0, pitch: 0, roll: 0 },
      scale: { x: 1, y: 1, z: 1 },
      height: 1.7,
      color: ACTOR_COLORS[colorIdx],
      keyframes: [],
    }
    addActor(newActor)
    selectActor(newActor.id)
  }

  const handleAddKeyframe = () => {
    if (!selectedActor) return
    // Use interpolated position at current timeline time if keyframes exist
    const sample = sampleActorAtTime(selectedActor.keyframes, timelineTime)
    addActorKeyframe(selectedActor.id, {
      id: generateId(),
      time: timelineTime,
      position: sample?.position ?? { ...selectedActor.position },
      rotation: sample?.rotation ?? { ...selectedActor.rotation },
      action: (sample?.action ?? 'stand') as ActorAction,
    })
  }

  return (
    <div className={css.cpCameraList}>
      {/* 角色列表 */}
      <div className={css.cpCameraListHeader}>
        <span>角色 ({actors.length})</span>
        <button className={css.cpBtnSm} onClick={handleAdd}>+ 添加</button>
      </div>
      <div className={css.cpCameraListItems}>
        {actors.length === 0 && (
          <div className={css.cpEmpty}>暂无角色，点击"添加"创建</div>
        )}
        {actors.map(actor => (
          <div
            key={actor.id}
            className={`${css.cpCameraItem} ${selectedActorId === actor.id ? css.selected : ''}`}
            onClick={() => selectActor(actor.id)}
          >
            <div
              className={css.cpCameraColor}
              style={{ backgroundColor: `#${actor.color.toString(16).padStart(6, '0')}` }}
            />
            <div className={css.cpCameraInfo}>
              <div className={css.cpCameraName}>{actor.name}</div>
              <div className={css.cpCameraMeta}>
                {ACTION_LABELS[actor.action]} · {actor.height}m · {actor.keyframes.length}关键帧
              </div>
            </div>
            <button
              className={css.cpCameraDelete}
              onClick={(e) => { e.stopPropagation(); deleteActor(actor.id) }}
              title="删除"
            >×</button>
          </div>
        ))}
      </div>

      {/* 选中角色的属性编辑 */}
      {selectedActor && (
        <div className={css.cpActorProps}>
          <div className={css.cpPropsSection}>
            <label className={css.cpLabel}>名称</label>
            <input
              className={css.cpInput}
              type="text"
              value={selectedActor.name}
              onChange={e => updateActor(selectedActor.id, { name: e.target.value })}
            />
          </div>
          <div className={css.cpPropsSection}>
            <label className={css.cpLabel}>类型</label>
            <select
              className={css.cpSelect}
              value={selectedActor.role}
              onChange={e => updateActor(selectedActor.id, { role: e.target.value as ActorRole })}
            >
              {Object.entries(ROLE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className={css.cpPropsSection}>
            <label className={css.cpLabel}>人物模型</label>
            <select
              className={css.cpSelect}
              value={selectedActor.bodyType}
              onChange={e => updateActor(selectedActor.id, { bodyType: e.target.value as ActorBodyType })}
            >
              {Object.entries(BODY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className={css.cpPropsSection}>
            <label className={css.cpLabel}>当前动作模型</label>
            <select
              className={css.cpSelect}
              value={selectedActor.action}
              onChange={e => updateActor(selectedActor.id, { action: e.target.value as ActorAction })}
            >
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className={css.cpPropsSection}>
            <label className={css.cpLabel}>身高 (m)</label>
            <input
              className={css.cpInput}
              type="number"
              step="0.1"
              min="0.5"
              max="2.5"
              value={selectedActor.height}
              onChange={e => updateActor(selectedActor.id, { height: parseFloat(e.target.value) || 1.7 })}
            />
          </div>

          {/* 关键帧管理 */}
          <div className={css.cpKeyframeSection}>
            <div className={css.cpCameraListHeader}>
              <span>运动关键帧 ({selectedActor.keyframes.length})</span>
              <button className={css.cpBtnSm} onClick={handleAddKeyframe}>+ 关键帧</button>
            </div>
            <div className={css.cpKeyframeList}>
              {selectedActor.keyframes.map((kf, idx) => (
                <div key={kf.id} className={css.cpKeyframeItem}>
                  <span className={css.cpKfIndex}>{idx + 1}</span>
                  <label className={css.cpKfLabel}>
                    <span>时间</span>
                    <input
                      className={css.cpInput}
                      type="number"
                      step="0.5"
                      min="0"
                      value={kf.time}
                      onChange={e => updateActorKeyframe(
                        selectedActor.id, kf.id,
                        { time: parseFloat(e.target.value) || 0 }
                      )}
                    />
                  </label>
                  <label className={css.cpKfLabel}>
                    <span>X</span>
                    <input
                      className={css.cpInput}
                      type="number"
                      step="0.1"
                      value={kf.position.x.toFixed(1)}
                      onChange={e => updateActorKeyframe(
                        selectedActor.id, kf.id,
                        { position: { ...kf.position, x: parseFloat(e.target.value) || 0 } }
                      )}
                    />
                  </label>
                  <label className={css.cpKfLabel}>
                    <span>Z</span>
                    <input
                      className={css.cpInput}
                      type="number"
                      step="0.1"
                      value={kf.position.z.toFixed(1)}
                      onChange={e => updateActorKeyframe(
                        selectedActor.id, kf.id,
                        { position: { ...kf.position, z: parseFloat(e.target.value) || 0 } }
                      )}
                    />
                  </label>
                  <select
                    className={css.cpKfAction}
                    value={kf.action}
                    onChange={e => updateActorKeyframe(
                      selectedActor.id, kf.id,
                      { action: e.target.value as ActorAction }
                    )}
                  >
                    {Object.entries(ACTION_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <button
                    className={css.cpCameraDelete}
                    onClick={() => removeActorKeyframe(selectedActor.id, kf.id)}
                    title="删除关键帧"
                  >×</button>
                </div>
              ))}
              {selectedActor.keyframes.length === 0 && (
                <div className={css.cpEmpty}>
                  暂无关键帧。移动时间线到目标时间，点击"关键帧"添加。
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
