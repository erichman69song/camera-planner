/**
 * ObjectPalette — concrete previs asset catalogue.
 */

import React from 'react'
import { usePlannerStore } from '../store/usePlannerStore'
import { ObjectType } from '../types/scene'
import css from '../styles.module.css'

type AssetItem = {
  type: ObjectType
  label: string
  code: string
  dimensions: string
  color: number
}

const FURNITURE: AssetItem[] = [
  { type: 'sofa', label: '三人沙发', code: 'SOFA', dimensions: '2.35 × 0.90 × 1.34m', color: 0x667989 },
  { type: 'bookshelf', label: '实木书柜', code: 'SHELF', dimensions: '1.66 × 0.54 × 2.35m', color: 0x74533b },
  { type: 'table', label: '长桌', code: 'TABLE', dimensions: '1.80 × 0.92 × 0.84m', color: 0x72513b },
  { type: 'chair', label: '软包椅', code: 'CHAIR', dimensions: '0.54 × 0.54 × 1.05m', color: 0x596f7e },
]

const ARCHITECTURE: AssetItem[] = [
  { type: 'wall', label: '墙面', code: 'WALL', dimensions: '4.00 × 0.18 × 3.00m', color: 0x9b9c98 },
  { type: 'window', label: '双扇窗口', code: 'WIN', dimensions: '1.90 × 0.28 × 1.55m', color: 0x66737a },
  { type: 'door', label: '室内门', code: 'DOOR', dimensions: '1.20 × 0.15 × 2.28m', color: 0x76523a },
  { type: 'building', label: '建筑立面', code: 'BLDG', dimensions: '3.55 × 2.65 × 4.97m', color: 0x70777d },
]

const ENVIRONMENT: AssetItem[] = [
  { type: 'car', label: '轿车', code: 'CAR', dimensions: '2.65 × 1.25 × 1.20m', color: 0x586c7c },
  { type: 'tree', label: '乔木', code: 'TREE', dimensions: '1.60 × 1.60 × 3.10m', color: 0x416d46 },
  { type: 'person', label: '静态人形', code: 'HUMAN', dimensions: '0.50 × 0.30 × 1.80m', color: 0x5f7f8b },
  { type: 'prop', label: '通用道具', code: 'PROP', dimensions: '0.36m', color: 0x8a7c69 },
]

const PRIMITIVES: AssetItem[] = [
  { type: 'box', label: '方块', code: 'BOX', dimensions: '1m', color: 0x888888 },
  { type: 'sphere', label: '球体', code: 'BALL', dimensions: 'Ø 1m', color: 0x888888 },
  { type: 'cylinder', label: '柱体', code: 'CYL', dimensions: 'Ø 1 × 1m', color: 0x888888 },
  { type: 'cone', label: '锥体', code: 'CONE', dimensions: 'Ø 1 × 1m', color: 0x888888 },
  { type: 'torus', label: '圆环', code: 'RING', dimensions: 'Ø 1m', color: 0x888888 },
  { type: 'plane', label: '平面', code: 'PLANE', dimensions: '1 × 1m', color: 0x666d72 },
]

export const OBJECT_ASSETS = [
  ...FURNITURE,
  ...ARCHITECTURE,
  ...ENVIRONMENT,
  ...PRIMITIVES,
]

export const OBJECT_LABELS = Object.fromEntries(
  OBJECT_ASSETS.map(asset => [asset.type, asset.label])
) as Record<ObjectType, string>

export function getObjectDefaults(type: ObjectType): {
  name: string
  y: number
  color: number
} {
  const asset = OBJECT_ASSETS.find(item => item.type === type)
  const y = ['box', 'sphere', 'cone', 'cylinder'].includes(type)
    ? 0.5
    : type === 'torus'
      ? 0.15
      : type === 'plane'
        ? 0.01
        : type === 'prop'
          ? 0.18
          : 0
  return {
    name: asset?.label || type,
    y,
    color: asset?.color ?? 0x888888,
  }
}

/** Kept as public API for existing integrations. */
export function defaultObjectY(type: ObjectType): number {
  return getObjectDefaults(type).y
}

const AssetSection: React.FC<{
  label: string
  assets: AssetItem[]
  active: ObjectType | null
  onSelect: (type: ObjectType) => void
}> = ({ label, assets, active, onSelect }) => (
  <>
    <div className={css.cpAssetSectionLabel}>{label}</div>
    <div className={css.cpAssetGrid}>
      {assets.map(asset => (
        <button
          type="button"
          key={asset.type}
          className={`${css.cpAssetCard} ${active === asset.type ? css.active : ''}`}
          onClick={() => onSelect(asset.type)}
          title={`${asset.label} · ${asset.dimensions}`}
        >
          <span className={css.cpAssetCode}>{asset.code}</span>
          <strong>{asset.label}</strong>
          <small>{asset.dimensions}</small>
        </button>
      ))}
    </div>
  </>
)

export const ObjectPalette: React.FC = () => {
  const pendingObjectType = usePlannerStore(s => s.pendingObjectType)
  const setPendingObjectType = usePlannerStore(s => s.setPendingObjectType)
  const setTool = usePlannerStore(s => s.setTool)
  const setMode = usePlannerStore(s => s.setMode)

  const handleSelect = (type: ObjectType) => {
    setPendingObjectType(type)
    setTool('object')
    setMode('place')
  }

  return (
    <div className={css.cpObjectPalette}>
      <div className={css.cpPaletteHeader}>置景模型库</div>
      <div className={css.cpPaletteHint}>
        {pendingObjectType
          ? `已选「${OBJECT_LABELS[pendingObjectType]}」→ 在场景地面点击放置`
          : '模型按真实米制尺寸创建，放置后可自由缩放与旋转'}
      </div>
      <AssetSection label="FURNITURE / 家具" assets={FURNITURE} active={pendingObjectType} onSelect={handleSelect} />
      <AssetSection label="ARCHITECTURE / 建筑构件" assets={ARCHITECTURE} active={pendingObjectType} onSelect={handleSelect} />
      <AssetSection label="ENVIRONMENT / 环境" assets={ENVIRONMENT} active={pendingObjectType} onSelect={handleSelect} />
      <AssetSection label="PRIMITIVES / 基础体" assets={PRIMITIVES} active={pendingObjectType} onSelect={handleSelect} />
    </div>
  )
}
