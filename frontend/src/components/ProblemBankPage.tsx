import React, { useState, useEffect, useMemo } from 'react';
import { useInterviewStore } from '../store/interview';
import { useToastStore } from '../store/toast';
import { getProblems, deleteProblem, isUsingMockData } from '../services/problemService';
import { resetMockData } from '../services/mockProblemService';
import { getDifficultyTag, DIFFICULTY_TAGS, type Problem } from '../types';
import { ProblemFormModal } from './ProblemFormModal';
import {
  matchProblems,
  criteriaEquals,
  getFilterPresets,
  findPresetByCriteria,
  findPresetByName,
  createFilterPreset,
  deleteFilterPreset,
  markPresetUsed,
  getLastUsedPreset,
  setLastUsedPresetId,
  suggestPresetName,
  DEFAULT_FILTER_CRITERIA,
  type FilterCriteria,
  type FilterPreset,
} from '../services/filterPresetService';

export const ProblemBankPage: React.FC = () => {
  const { problems, setProblems, removeProblem } = useInterviewStore();
  const { success, error, info, warning } = useToastStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null);

  // 刷新页面后恢复最近使用的筛选组合（组合不存在时回退到默认条件）
  const [restoredPreset] = useState<FilterPreset | null>(() => getLastUsedPreset());
  const [searchQuery, setSearchQuery] = useState(() => restoredPreset?.criteria.searchQuery ?? DEFAULT_FILTER_CRITERIA.searchQuery);
  const [selectedDifficulty, setSelectedDifficulty] = useState(() => restoredPreset?.criteria.difficulty ?? DEFAULT_FILTER_CRITERIA.difficulty);
  const [selectedTag, setSelectedTag] = useState(() => restoredPreset?.criteria.tag ?? DEFAULT_FILTER_CRITERIA.tag);
  const [activePresetId, setActivePresetId] = useState<string | null>(() => restoredPreset?.id ?? null);

  const [presets, setPresets] = useState<FilterPreset[]>(() => getFilterPresets());
  const [loading, setLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState(false);

  // 保存组合弹窗
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  // 删除组合确认
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null);

  const currentCriteria: FilterCriteria = useMemo(
    () => ({ searchQuery, difficulty: selectedDifficulty, tag: selectedTag }),
    [searchQuery, selectedDifficulty, selectedTag],
  );

  // 全量加载一次题目，搜索/难度/标签统一在前端筛选，
  // 保证各筛选组合的匹配数与列表结果完全一致
  useEffect(() => {
    loadProblems();
    if (restoredPreset) {
      info(`已恢复最近使用的筛选组合「${restoredPreset.name}」`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProblems = async () => {
    setLoading(true);
    try {
      const data = await getProblems();
      setProblems(data);
      const usingMock = isUsingMockData();
      setMockMode(usingMock);
      if (usingMock && !mockMode) {
        warning('后端服务不可用，当前使用本地 Mock 数据。您的操作将保存在浏览器本地存储中。');
      }
      info(`已加载 ${data.length} 道题目`);
    } catch (err) {
      console.error('Failed to load problems:', err);
      error('加载题目列表失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProblem = () => {
    setEditingProblem(null);
    setIsModalOpen(true);
  };

  const handleEditProblem = (problem: Problem) => {
    setEditingProblem(problem);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (problemId: string) => {
    setDeleteConfirmId(problemId);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteProblem(deleteConfirmId);
      removeProblem(deleteConfirmId);
      setDeleteConfirmId(null);
      success('题目删除成功');
    } catch (err) {
      console.error('Failed to delete problem:', err);
      error('删除题目失败，请稍后重试');
    }
  };

  const handleSuccess = (problem: Problem) => {
    if (editingProblem) {
      success(`题目「${problem.title}」更新成功`);
    } else {
      success(`题目「${problem.title}」创建成功`);
    }
    loadProblems();
  };

  // 手动调整任意条件时退出当前组合（不删除组合本身，也不清空已选条件）
  const detachActivePreset = () => {
    setActivePresetId(null);
    setLastUsedPresetId(null);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    detachActivePreset();
  };

  const handleDifficultyChange = (value: string) => {
    setSelectedDifficulty(value);
    detachActivePreset();
  };

  const handleTagChange = (value: string) => {
    setSelectedTag(value);
    detachActivePreset();
  };

  const handleClearFilters = () => {
    setSearchQuery(DEFAULT_FILTER_CRITERIA.searchQuery);
    setSelectedDifficulty(DEFAULT_FILTER_CRITERIA.difficulty);
    setSelectedTag(DEFAULT_FILTER_CRITERIA.tag);
    detachActivePreset();
  };

  const handleApplyPreset = (preset: FilterPreset) => {
    setSearchQuery(preset.criteria.searchQuery);
    setSelectedDifficulty(preset.criteria.difficulty);
    setSelectedTag(preset.criteria.tag);
    setActivePresetId(preset.id);
    markPresetUsed(preset.id);
    setLastUsedPresetId(preset.id);
    setPresets(getFilterPresets());
    const count = matchProblems(problems, preset.criteria).length;
    if (count === 0) {
      warning(`组合「${preset.name}」当前没有匹配的题目，已为您保留该组合`);
    } else {
      success(`已切换到筛选组合「${preset.name}」，匹配 ${count} 道题目`);
    }
  };

  const handleOpenSaveModal = () => {
    // 相同条件组合已存在时直接切换过去，避免重复保存
    const existing = findPresetByCriteria(currentCriteria);
    if (existing) {
      info(`该条件组合已保存为「${existing.name}」，已直接切换`);
      handleApplyPreset(existing);
      return;
    }
    setPresetName(suggestPresetName(currentCriteria));
    setIsSaveModalOpen(true);
  };

  const handleConfirmSavePreset = () => {
    const name = presetName.trim();
    if (!name) {
      error('请输入筛选组合名称');
      return;
    }
    if (name.length > 20) {
      error('组合名称不能超过 20 个字符');
      return;
    }
    if (findPresetByName(name)) {
      error('已存在同名组合，请换一个名称');
      return;
    }
    const preset = createFilterPreset(name, currentCriteria);
    setPresets(getFilterPresets());
    setActivePresetId(preset.id);
    setLastUsedPresetId(preset.id);
    setIsSaveModalOpen(false);
    success(`已保存筛选组合「${name}」`);
  };

  const handleConfirmDeletePreset = () => {
    if (!deletePresetId) return;
    const preset = presets.find((p) => p.id === deletePresetId);
    deleteFilterPreset(deletePresetId);
    setPresets(getFilterPresets());
    // 删除的是当前组合时，仅取消选中，当前筛选条件与空态保留
    if (activePresetId === deletePresetId) {
      setActivePresetId(null);
      setLastUsedPresetId(null);
    }
    setDeletePresetId(null);
    success(`筛选组合「${preset?.name ?? ''}」已删除，当前筛选条件已保留`);
  };

  const filteredProblems = useMemo(
    () => matchProblems(problems, currentCriteria),
    [problems, currentCriteria],
  );

  const activePreset = presets.find((p) => p.id === activePresetId) ?? null;
  const hasActiveCriteria = !criteriaEquals(currentCriteria, DEFAULT_FILTER_CRITERIA);

  // 每个保存组合的实时匹配数量
  const countByPreset = useMemo(() => {
    const map = new Map<string, number>();
    presets.forEach((preset) => {
      map.set(preset.id, matchProblems(problems, preset.criteria).length);
    });
    return map;
  }, [presets, problems]);

  const allTags = useMemo(
    () => Array.from(new Set(problems.flatMap(p => p.tags))).filter(t => t),
    [problems],
  );
  // 当前选中的标签已从所有题目中删除（如组合引用了旧标签）
  const isSelectedTagMissing = !!selectedTag && !allTags.includes(selectedTag);

  const inputStyle = {
    padding: '10px 16px',
    borderRadius: '6px',
    border: '1px solid #444',
    background: '#2d2d2d',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 2000,
  };
  const modalStyle: React.CSSProperties = {
    background: '#1e1e1e', borderRadius: '8px', padding: '24px',
    width: '420px', border: '1px solid #333',
  };
  const cancelBtnStyle: React.CSSProperties = {
    padding: '10px 24px', borderRadius: '4px', border: '1px solid #555',
    background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: '14px',
  };
  const dangerBtnStyle: React.CSSProperties = {
    padding: '10px 24px', borderRadius: '4px', border: 'none',
    background: '#f44336', color: '#fff', cursor: 'pointer', fontSize: '14px',
  };
  const primaryBtnStyle: React.CSSProperties = {
    padding: '10px 24px', borderRadius: '4px', border: 'none',
    background: '#667eea', color: '#fff', cursor: 'pointer', fontSize: '14px',
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: '28px', margin: '0 0 8px 0' }}>题库管理</h1>
          <p style={{ color: '#888', margin: 0 }}>管理所有面试编程题目，支持按难度和标签筛选</p>
        </div>
        <button
          onClick={handleCreateProblem}
          style={{
            padding: '10px 24px',
            background: '#4caf50',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}>
            + 新增题目
        </button>
      </div>

      {mockMode && (
        <div style={{
          marginBottom: '24px',
          padding: '14px 20px',
          background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.15), rgba(255, 193, 7, 0.1))',
          border: '1px solid rgba(255, 152, 0, 0.3)',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <div>
              <span style={{ color: '#ff9800', fontWeight: 500 }}>Mock 数据模式</span>
              <p style={{ color: '#888', margin: '4px 0 0 0', fontSize: '13px' }}>
                后端服务不可用，当前数据保存在浏览器本地存储中
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => {
                resetMockData();
                loadProblems();
                success('已重置为初始 Mock 数据');
              }}
              style={{
                padding: '8px 16px',
                background: 'rgba(255, 152, 0, 0.2)',
                color: '#ff9800',
                border: '1px solid rgba(255, 152, 0, 0.4)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
              }}>
              🔄 重置数据
            </button>
          </div>
        </div>
      )}

      {/* 常用筛选组合：列表顶部快速切换，展示每个组合实时匹配数 */}
      <div style={{
        background: '#1e1e1e',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '16px',
        border: '1px solid #333',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#888', fontSize: '13px' }}>⭐ 常用筛选组合</span>
          <button
            onClick={handleOpenSaveModal}
            style={{
              padding: '6px 14px',
              background: 'rgba(102, 126, 234, 0.15)',
              color: '#667eea',
              border: '1px solid rgba(102, 126, 234, 0.4)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            💾 保存当前条件
          </button>
        </div>
        {presets.length > 0 ? (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
            {[...presets]
              .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
              .map((preset) => {
                const isActive = preset.id === activePresetId;
                const count = countByPreset.get(preset.id) ?? 0;
                const isEmpty = count === 0;
                return (
                  <div
                    key={preset.id}
                    role="button"
                    tabIndex={0}
                    title={preset.name}
                    onClick={() => handleApplyPreset(preset)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleApplyPreset(preset); } }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px 6px 14px',
                      borderRadius: '16px',
                      border: `1px solid ${isActive ? '#667eea' : '#444'}`,
                      background: isActive ? 'rgba(102, 126, 234, 0.15)' : 'transparent',
                      color: isActive ? '#667eea' : '#bbb',
                      cursor: 'pointer',
                      fontSize: '13px',
                      maxWidth: '260px',
                    }}
                  >
                    {isActive && <span>✓</span>}
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {preset.name}
                    </span>
                    <span style={{
                      padding: '1px 8px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: isEmpty ? 'rgba(244, 67, 54, 0.15)' : 'rgba(255,255,255,0.08)',
                      color: isEmpty ? '#f44336' : '#888',
                    }}>
                      {count}
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`删除筛选组合 ${preset.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletePresetId(preset.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeletePresetId(preset.id);
                        }
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        color: '#888',
                        fontSize: '13px',
                        lineHeight: 1,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(244, 67, 54, 0.2)';
                        e.currentTarget.style.color = '#f44336';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#888';
                      }}
                    >
                      ×
                    </span>
                  </div>
                );
              })}
          </div>
        ) : (
          <p style={{ color: '#666', fontSize: '12px', margin: '10px 0 0 0' }}>
            还没有保存的筛选组合，设置搜索 / 难度 / 标签后点击「保存当前条件」即可快速复用
          </p>
        )}
      </div>

      <div style={{
        background: '#1e1e1e',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '24px',
        border: '1px solid #333',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        alignItems: 'center',
      }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="搜索题目标题、描述或标签..."
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div>
          <label style={{ color: '#888', fontSize: '12px', marginBottom: '4px', display: 'block' }}>难度筛选</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handleDifficultyChange('all')}
              style={{
                padding: '6px 16px',
                borderRadius: '16px',
                border: `1px solid ${selectedDifficulty === 'all' ? '#667eea' : '#444'}`,
                background: selectedDifficulty === 'all' ? 'rgba(102, 126, 234, 0.15)' : 'transparent',
                color: selectedDifficulty === 'all' ? '#667eea' : '#888',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              全部
            </button>
            {DIFFICULTY_TAGS.map(tag => (
              <button
                key={tag.value}
                onClick={() => handleDifficultyChange(tag.value)}
                style={{
                  padding: '6px 16px',
                  borderRadius: '16px',
                  border: `1px solid ${selectedDifficulty === tag.value ? tag.color : '#444'}`,
                  background: selectedDifficulty === tag.value ? tag.bgColor : 'transparent',
                  color: selectedDifficulty === tag.value ? tag.color : '#888',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        {(allTags.length > 0 || selectedTag) && (
          <div style={{ minWidth: '200px' }}>
            <label style={{ color: '#888', fontSize: '12px', marginBottom: '4px', display: 'block' }}>标签筛选</label>
            <select
              value={selectedTag}
              onChange={e => handleTagChange(e.target.value)}
              style={{ ...inputStyle, width: '100%', color: isSelectedTagMissing ? '#f44336' : '#fff' }}
            >
              <option value="">所有标签</option>
              {isSelectedTagMissing && (
                <option value={selectedTag}>「{selectedTag}」（标签已删除）</option>
              )}
              {allTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <span style={{ color: '#888', fontSize: '14px' }}>
          {hasActiveCriteria ? `筛选出 ${filteredProblems.length} 道题目（题库共 ${problems.length} 道）` : `共 ${filteredProblems.length} 道题目`}
        </span>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {hasActiveCriteria && (
            <button
              onClick={handleClearFilters}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f44336',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              ✕ 清除筛选条件
            </button>
          )}
          <button
            onClick={loadProblems}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#667eea',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            🔄 刷新列表
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '64px', color: '#888' }}>
          加载中...
        </div>
      ) : filteredProblems.length === 0 ? (
        <div style={{
          background: '#1e1e1e',
          borderRadius: '12px',
          padding: '64px 24px',
          textAlign: 'center',
          border: '1px dashed #333',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>{hasActiveCriteria ? '🔍' : '📝'}</div>
          {hasActiveCriteria ? (
            <>
              <h3 style={{ color: '#fff', margin: '0 0 8px 0' }}>没有匹配的题目</h3>
              <p style={{ color: '#888', margin: '0 0 24px 0', maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
                {isSelectedTagMissing ? (
                  <>
                    当前筛选的标签{activePreset ? `（组合「${activePreset.name}」）` : ''}
                    <span style={{ color: '#f44336' }}>「{selectedTag}」已被删除或不存在</span>
                    ，组合已为您保留。可重新选择标签或清除当前条件后再试。
                  </>
                ) : activePreset ? (
                  <>
                    组合「{activePreset.name}」当前没有匹配的题目，组合已保留；题目增删改后匹配数会自动更新，您也可以调整筛选条件。
                  </>
                ) : (
                  <>
                    当前筛选条件下没有匹配的题目，请调整搜索关键字、难度或标签。
                  </>
                )}
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button
                  onClick={handleClearFilters}
                  style={{
                    padding: '10px 24px',
                    background: 'rgba(102, 126, 234, 0.15)',
                    color: '#667eea',
                    border: '1px solid rgba(102, 126, 234, 0.4)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}>
                  清除筛选条件
                </button>
                <button
                  onClick={handleCreateProblem}
                  style={{
                    padding: '10px 24px',
                    background: '#4caf50',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                  }}>
                  创建题目
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ color: '#fff', margin: '0 0 8px 0' }}>暂无题目</h3>
              <p style={{ color: '#888', margin: '0 0 24px 0' }}>
                点击右上角按钮创建您的第一道题目
              </p>
              <button
                onClick={handleCreateProblem}
                style={{
                  padding: '12px 32px',
                  background: '#4caf50',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}>
                创建题目
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {filteredProblems.map((problem) => {
            const diffTag = getDifficultyTag(problem.difficulty);
            return (
              <div
                key={problem.id}
                style={{
                  background: '#1e1e1e',
                  borderRadius: '12px',
                  padding: '20px 24px',
                  border: '1px solid #333',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#667eea';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#333';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <h3 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>{problem.title}</h3>
                      <span style={{
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        background: diffTag.bgColor,
                        color: diffTag.color,
                      }}>
                        {diffTag.label}
                      </span>
                    </div>
                    <p style={{ color: '#888', margin: '0 0 12px 0', fontSize: '14px', lineHeight: 1.5 }}>
                      {problem.description.length > 150
                        ? problem.description.substring(0, 150) + '...'
                        : problem.description}
                    </p>
                    {problem.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {problem.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            style={{
                              padding: '4px 10px',
                              background: 'rgba(102, 126, 234, 0.1)',
                              color: '#667eea',
                              borderRadius: '4px',
                              fontSize: '12px',
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleEditProblem(problem)}
                      style={{
                        padding: '8px 16px',
                        background: 'rgba(102, 126, 234, 0.1)',
                        color: '#667eea',
                        border: '1px solid rgba(102, 126, 234, 0.3)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDeleteClick(problem.id)}
                      style={{
                        padding: '8px 16px',
                        background: 'rgba(244, 67, 54, 0.1)',
                        color: '#f44336',
                        border: '1px solid rgba(244, 67, 54, 0.3)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '24px', color: '#666', fontSize: '12px' }}>
                  <span>⏱ {problem.timeLimit}ms</span>
                  <span>💾 {problem.memoryLimit}MB</span>
                  <span>📊 {problem.testCases.length} 个测试用例</span>
                  {problem.createdAt && (
                    <span>创建于 {new Date(problem.createdAt).toLocaleDateString('zh-CN')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 删除题目确认 */}
      {deleteConfirmId && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ color: '#fff', margin: '0 0 12px 0' }}>确认删除</h3>
            <p style={{ color: '#888', margin: '0 0 24px 0' }}>
              确定要删除这道题目吗？此操作不可撤销。
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirmId(null)}
                style={cancelBtnStyle}
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                style={dangerBtnStyle}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 保存筛选组合 */}
      {isSaveModalOpen && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ color: '#fff', margin: '0 0 8px 0' }}>保存筛选组合</h3>
            <p style={{ color: '#888', fontSize: '13px', margin: '0 0 16px 0' }}>
              为当前的搜索 / 难度 / 标签条件起一个名字，方便之后在列表顶部一键切换。
            </p>
            <input
              autoFocus
              type="text"
              value={presetName}
              maxLength={20}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirmSavePreset(); }}
              placeholder="例如：中等难度 · 哈希表"
              style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: '6px' }}
            />
            <div style={{ color: '#666', fontSize: '12px', marginBottom: '20px' }}>
              {presetName.trim().length}/20 个字符
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setIsSaveModalOpen(false)}
                style={cancelBtnStyle}
              >
                取消
              </button>
              <button
                onClick={handleConfirmSavePreset}
                style={primaryBtnStyle}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除筛选组合确认 */}
      {deletePresetId && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ color: '#fff', margin: '0 0 12px 0' }}>删除筛选组合</h3>
            <p style={{ color: '#888', margin: '0 0 24px 0' }}>
              确定要删除组合「{presets.find(p => p.id === deletePresetId)?.name}」吗？
              {deletePresetId === activePresetId && ' 删除后当前筛选条件会保留在列表中。'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletePresetId(null)}
                style={cancelBtnStyle}
              >
                取消
              </button>
              <button
                onClick={handleConfirmDeletePreset}
                style={dangerBtnStyle}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      <ProblemFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleSuccess}
        editingProblem={editingProblem}
      />
    </div>
  );
};
