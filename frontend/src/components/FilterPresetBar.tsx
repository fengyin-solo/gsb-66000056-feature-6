import React, { useEffect, useState } from 'react';
import type { FilterPreset, ProblemFilter } from '../types';
import { isProblemFilterEmpty, isSameProblemFilter } from '../types';

interface SaveModalState {
  mode: 'create' | 'rename';
  presetId?: string;
  initialName?: string;
}

interface FilterPresetBarProps {
  presets: FilterPreset[];
  activePresetId: string | null;
  currentFilter: ProblemFilter;
  counts: Record<string, number>;
  availableTags: string[];
  onApply: (preset: FilterPreset) => void;
  onClear: () => void;
  onCreate: (name: string) => string | null;
  onRename: (presetId: string, name: string) => string | null;
  onUpdate: (presetId: string) => void;
  onDelete: (presetId: string) => void;
}

export const FilterPresetBar: React.FC<FilterPresetBarProps> = ({
  presets,
  activePresetId,
  currentFilter,
  counts,
  availableTags,
  onApply,
  onClear,
  onCreate,
  onRename,
  onUpdate,
  onDelete,
}) => {
  const [saveModal, setSaveModal] = useState<SaveModalState | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<FilterPreset | null>(null);

  useEffect(() => {
    if (saveModal) {
      setNameInput(saveModal.initialName ?? '');
      setNameError('');
    }
  }, [saveModal]);

  const activePreset = presets.find(p => p.id === activePresetId) ?? null;
  const currentFilterEmpty = isProblemFilterEmpty(currentFilter);
  const activePresetMatches =
    activePreset && isSameProblemFilter(activePreset.filter, currentFilter);
  const canUpdate = !!activePresetMatches;
  const canSaveAs = !currentFilterEmpty;

  const openCreateModal = () => setSaveModal({ mode: 'create' });
  const openRenameModal = (preset: FilterPreset) => {
    setDeleteTarget(null);
    setSaveModal({ mode: 'rename', presetId: preset.id, initialName: preset.name });
  };

  const handleModalSubmit = () => {
    const name = nameInput.trim();
    if (!name) {
      setNameError('请输入组合名称');
      return;
    }
    if (name.length > 30) {
      setNameError('组合名称不能超过 30 个字符');
      return;
    }
    if (saveModal?.mode === 'create') {
      const err = onCreate(name);
      if (err) {
        setNameError(err);
        return;
      }
    } else if (saveModal?.mode === 'rename' && saveModal.presetId) {
      const err = onRename(saveModal.presetId, name);
      if (err) {
        setNameError(err);
        return;
      }
    }
    setSaveModal(null);
  };

  return (
    <div
      style={{
        background: '#1e1e1e',
        borderRadius: '12px',
        padding: '14px 20px',
        marginBottom: '16px',
        border: '1px solid #333',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        alignItems: 'center',
      }}
    >
      <span style={{ color: '#888', fontSize: '13px', flexShrink: 0 }}>
        常用筛选
      </span>

      <button
        onClick={onClear}
        title="查看全部题目"
        style={{
          padding: '6px 14px',
          borderRadius: '16px',
          border: `1px solid ${currentFilterEmpty ? '#667eea' : '#444'}`,
          background: currentFilterEmpty ? 'rgba(102, 126, 234, 0.15)' : 'transparent',
          color: currentFilterEmpty ? '#667eea' : '#888',
          cursor: 'pointer',
          fontSize: '13px',
          whiteSpace: 'nowrap',
        }}
      >
        全部题目
      </button>

      {presets.map(preset => {
        const isActive =
          activePresetMatches ?? preset.id === activePresetId;
        const count = counts[preset.id] ?? 0;
        const tagMissing =
          !!preset.filter.tag && !availableTags.includes(preset.filter.tag);
        return (
          <div
            key={preset.id}
            style={{
              position: 'relative',
              display: 'inline-flex',
              borderRadius: '16px',
              border: `1px solid ${
                isActive ? '#667eea' : tagMissing ? 'rgba(255, 152, 0, 0.5)' : '#444'
              }`,
              background: isActive
                ? 'rgba(102, 126, 234, 0.15)'
                : tagMissing
                  ? 'rgba(255, 152, 0, 0.08)'
                  : 'transparent',
            }}
          >
            <button
              onClick={() => onApply(preset)}
              title={
                tagMissing
                  ? `标签「${preset.filter.tag}」已不存在，当前无匹配题目`
                  : `${preset.name}（${count} 道题目）`
              }
              style={{
                padding: '6px 4px 6px 14px',
                borderRadius: '16px 0 0 16px',
                border: 'none',
                background: 'transparent',
                color: isActive ? '#667eea' : tagMissing ? '#ff9800' : '#ccc',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
              }}
            >
              {tagMissing && <span>⚠️</span>}
              <span>{preset.name}</span>
              <span
                style={{
                  padding: '1px 8px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background:
                    count > 0 ? 'rgba(102, 126, 234, 0.2)' : 'rgba(244, 67, 54, 0.15)',
                  color: count > 0 ? '#a5b4fc' : '#f44336',
                  flexShrink: 0,
                }}
              >
                {count}
              </span>
            </button>
            <button
              aria-label={`管理组合 ${preset.name}`}
              onClick={() =>
                setDeleteTarget(deleteTarget?.id === preset.id ? null : preset)
              }
              title="管理此组合"
              style={{
                padding: '0 10px 0 2px',
                borderRadius: '0 16px 16px 0',
                border: 'none',
                background: 'transparent',
                color: isActive ? '#667eea' : '#888',
                cursor: 'pointer',
                fontSize: '14px',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              ⋮
            </button>

            {deleteTarget?.id === preset.id && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 150 }}
                  onClick={() => setDeleteTarget(null)}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: '96px',
                    background: '#2d2d2d',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    padding: '4px',
                    zIndex: 160,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  }}
                >
                  <button style={menuItemStyle} onClick={() => openRenameModal(preset)}>
                    ✏️ 重命名
                  </button>
                  <button
                    style={{ ...menuItemStyle, color: '#f44336' }}
                    onClick={() => {
                      onDelete(preset.id);
                      setDeleteTarget(null);
                    }}
                  >
                    🗑 删除
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      <div style={{ flex: 1 }} />

      {canUpdate && activePreset && (
        <button
          onClick={() => onUpdate(activePreset.id)}
          style={actionButtonStyle}
          title="用当前筛选条件覆盖此组合"
        >
          💾 更新「{activePreset.name}」
        </button>
      )}
      <button
        onClick={openCreateModal}
        disabled={!canSaveAs}
        style={{
          ...actionButtonStyle,
          opacity: canSaveAs ? 1 : 0.45,
          cursor: canSaveAs ? 'pointer' : 'not-allowed',
          color: canSaveAs ? '#4caf50' : '#888',
          borderColor: canSaveAs ? 'rgba(76, 175, 80, 0.4)' : '#444',
        }}
        title={canSaveAs ? '保存当前筛选条件为常用组合' : '请先设置筛选条件'}
      >
        ⭐ 保存当前条件
      </button>

      {saveModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setSaveModal(null)}
        >
          <div
            style={{
              background: '#1e1e1e',
              borderRadius: '8px',
              padding: '24px',
              width: '400px',
              border: '1px solid #333',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ color: '#fff', margin: '0 0 16px 0', fontSize: '18px' }}>
              {saveModal.mode === 'create' ? '保存筛选组合' : '重命名筛选组合'}
            </h3>
            <input
              type="text"
              autoFocus
              value={nameInput}
              onChange={e => {
                setNameInput(e.target.value);
                setNameError('');
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleModalSubmit();
                if (e.key === 'Escape') setSaveModal(null);
              }}
              placeholder="为该筛选组合命名，例如：中等难度·动态规划"
              maxLength={30}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 14px',
                borderRadius: '6px',
                border: `1px solid ${nameError ? '#f44336' : '#444'}`,
                background: '#2d2d2d',
                color: '#fff',
                fontSize: '14px',
                outline: 'none',
                marginBottom: nameError ? '6px' : '20px',
              }}
            />
            {nameError && (
              <p style={{ color: '#f44336', fontSize: '12px', margin: '0 0 12px 0' }}>
                {nameError}
              </p>
            )}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSaveModal(null)}
                style={{
                  padding: '9px 20px',
                  borderRadius: '4px',
                  border: '1px solid #555',
                  background: 'transparent',
                  color: '#ccc',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                取消
              </button>
              <button
                onClick={handleModalSubmit}
                style={{
                  padding: '9px 20px',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#667eea',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const menuItemStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '4px',
  border: 'none',
  background: 'transparent',
  color: '#ccc',
  cursor: 'pointer',
  fontSize: '13px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const actionButtonStyle: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: '6px',
  border: '1px solid rgba(102, 126, 234, 0.4)',
  background: 'rgba(102, 126, 234, 0.1)',
  color: '#667eea',
  cursor: 'pointer',
  fontSize: '13px',
  whiteSpace: 'nowrap',
};
