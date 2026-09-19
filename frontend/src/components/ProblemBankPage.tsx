import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useInterviewStore } from '../store/interview';
import { useToastStore } from '../store/toast';
import { getProblems, deleteProblem, isUsingMockData } from '../services/problemService';
import { resetMockData } from '../services/mockProblemService';
import {
  getDifficultyTag,
  DIFFICULTY_TAGS,
  DEFAULT_PROBLEM_FILTER,
  isProblemFilterEmpty,
  matchProblemFilter,
  type Problem,
  type ProblemFilter,
  type FilterPreset,
} from '../types';
import {
  loadPresets,
  createPreset,
  updatePreset,
  deletePreset,
  loadLastUsedFilter,
  saveLastUsedFilter,
} from '../services/filterPresetService';
import { ProblemFormModal } from './ProblemFormModal';
import { FilterPresetBar } from './FilterPresetBar';

export const ProblemBankPage: React.FC = () => {
  const { problems, setProblems, removeProblem } = useInterviewStore();
  const { success, error, info, warning } = useToastStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const mockWarnedRef = useRef(false);

  // 筛选条件：首次进入时恢复最近使用的组合（刷新后仍生效）
  const [filter, setFilter] = useState<ProblemFilter>(
    () => loadLastUsedFilter() ?? { ...DEFAULT_PROBLEM_FILTER }
  );
  const [presets, setPresets] = useState<FilterPreset[]>(() => loadPresets());
  const [activePresetId, setActivePresetId] = useState<string | null>(() => {
    const lastUsed = loadLastUsedFilter();
    if (!lastUsed) return null;
    const matched = loadPresets().find(p =>
      p.filter.search === lastUsed.search &&
      p.filter.difficulty === lastUsed.difficulty &&
      p.filter.tag === lastUsed.tag
    );
    return matched?.id ?? null;
  });

  const loadProblems = useCallback(async (showToast = false) => {
    setLoading(true);
    try {
      // 拉取全量题目后在前端筛选，保证每个常用组合都能算出准确的匹配数量，
      // 且标签被删除后仍可在下拉中看到失效状态；搜索、筛选与增删改查结果保持一致。
      const data = await getProblems();
      setProblems(data);
      const usingMock = isUsingMockData();
      setMockMode(usingMock);
      if (usingMock && !mockWarnedRef.current) {
        mockWarnedRef.current = true;
        warning('后端服务不可用，当前使用本地 Mock 数据。您的操作将保存在浏览器本地存储中。');
      }
      if (showToast) {
        info(`已加载 ${data.length} 道题目`);
      }
    } catch (err) {
      console.error('Failed to load problems:', err);
      error('加载题目列表失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [setProblems, info, warning, error]);

  useEffect(() => {
    loadProblems();
  }, [loadProblems]);

  const activePreset = presets.find(p => p.id === activePresetId) ?? null;

  /** 修改任意筛选条件：脱离当前组合，但保留条件本身，并记住最近使用的条件。 */
  const updateFilter = (patch: Partial<ProblemFilter>) => {
    const next = { ...filter, ...patch };
    setFilter(next);
    if (activePreset) {
      setActivePresetId(null);
    }
    saveLastUsedFilter(isProblemFilterEmpty(next) ? null : next);
  };

  const handleApplyPreset = (preset: FilterPreset) => {
    setFilter({ ...preset.filter });
    setActivePresetId(preset.id);
    saveLastUsedFilter(isProblemFilterEmpty(preset.filter) ? null : preset.filter);
  };

  const handleClearFilter = () => {
    setFilter({ ...DEFAULT_PROBLEM_FILTER });
    setActivePresetId(null);
    saveLastUsedFilter(null);
  };

  const handleCreatePreset = (name: string): string | null => {
    const trimmed = name.trim();
    if (presets.some(p => p.name === trimmed)) {
      return '已存在同名筛选组合，请换个名称';
    }
    const { presets: next, preset } = createPreset(presets, trimmed, filter);
    setPresets(next);
    setActivePresetId(preset.id);
    saveLastUsedFilter(isProblemFilterEmpty(filter) ? null : filter);
    success(`已保存筛选组合「${trimmed}」`);
    return null;
  };

  const handleRenamePreset = (presetId: string, name: string): string | null => {
    const trimmed = name.trim();
    if (presets.some(p => p.name === trimmed && p.id !== presetId)) {
      return '已存在同名筛选组合，请换个名称';
    }
    setPresets(updatePreset(presets, presetId, { name: trimmed }));
    success('筛选组合已重命名');
    return null;
  };

  const handleUpdatePreset = (presetId: string) => {
    setPresets(updatePreset(presets, presetId, { filter: { ...filter } }));
    setActivePresetId(presetId);
    saveLastUsedFilter(isProblemFilterEmpty(filter) ? null : filter);
    success('筛选组合已更新为当前条件');
  };

  const handleDeletePreset = (presetId: string) => {
    setPresets(deletePreset(presets, presetId));
    // 删除的是组合本身；若正在使用它，保留当前筛选条件，仅取消选中态
    if (activePresetId === presetId) {
      setActivePresetId(null);
    }
    success('筛选组合已删除');
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

  const filteredProblems = useMemo(
    () => problems.filter(p => matchProblemFilter(p, filter)),
    [problems, filter]
  );

  const allTags = useMemo(
    () => Array.from(new Set(problems.flatMap(p => p.tags))).filter(t => t),
    [problems]
  );

  // 每个常用组合匹配的题目数量（基于全量题目实时计算，增删改后自动更新）
  const presetCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const preset of presets) {
      map[preset.id] = problems.reduce(
        (count, p) => count + (matchProblemFilter(p, preset.filter) ? 1 : 0),
        0
      );
    }
    return map;
  }, [presets, problems]);

  const tagMissing = !!filter.tag && !allTags.includes(filter.tag);
  const hasActiveFilter = !isProblemFilterEmpty(filter);

  const inputStyle = {
    padding: '10px 16px',
    borderRadius: '6px',
    border: '1px solid #444',
    background: '#2d2d2d',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
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

      <FilterPresetBar
        presets={presets}
        activePresetId={activePresetId}
        currentFilter={filter}
        counts={presetCounts}
        availableTags={allTags}
        onApply={handleApplyPreset}
        onClear={handleClearFilter}
        onCreate={handleCreatePreset}
        onRename={handleRenamePreset}
        onUpdate={handleUpdatePreset}
        onDelete={handleDeletePreset}
      />

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
            value={filter.search}
            onChange={e => updateFilter({ search: e.target.value })}
            placeholder="搜索题目标题、描述或标签..."
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>

        <div>
          <label style={{ color: '#888', fontSize: '12px', marginBottom: '4px', display: 'block' }}>难度筛选</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => updateFilter({ difficulty: 'all' })}
              style={{
                padding: '6px 16px',
                borderRadius: '16px',
                border: `1px solid ${filter.difficulty === 'all' ? '#667eea' : '#444'}`,
                background: filter.difficulty === 'all' ? 'rgba(102, 126, 234, 0.15)' : 'transparent',
                color: filter.difficulty === 'all' ? '#667eea' : '#888',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              全部
            </button>
            {DIFFICULTY_TAGS.map(tag => (
              <button
                key={tag.value}
                onClick={() => updateFilter({ difficulty: tag.value })}
                style={{
                  padding: '6px 16px',
                  borderRadius: '16px',
                  border: `1px solid ${filter.difficulty === tag.value ? tag.color : '#444'}`,
                  background: filter.difficulty === tag.value ? tag.bgColor : 'transparent',
                  color: filter.difficulty === tag.value ? tag.color : '#888',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                {tag.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ minWidth: '200px' }}>
          <label style={{ color: '#888', fontSize: '12px', marginBottom: '4px', display: 'block' }}>标签筛选</label>
          <select
            value={filter.tag}
            onChange={e => updateFilter({ tag: e.target.value })}
            style={{ ...inputStyle, width: '100%' }}
          >
            <option value="">所有标签</option>
            {tagMissing && (
              <option value={filter.tag}>⚠️ {filter.tag}（标签已删除）</option>
            )}
            {allTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      </div>

      {tagMissing && (
        <div style={{
          marginBottom: '16px',
          padding: '12px 18px',
          background: 'rgba(255, 152, 0, 0.1)',
          border: '1px solid rgba(255, 152, 0, 0.35)',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ff9800', fontSize: '13px' }}>
            <span>⚠️</span>
            <span>
              当前筛选的标签「{filter.tag}」已从题库中删除，
              {activePreset ? `筛选组合「${activePreset.name}」已保留。` : '当前筛选条件已保留。'}
              您可以移除该标签或调整其他条件。
            </span>
          </div>
          <button
            onClick={() => updateFilter({ tag: '' })}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 152, 0, 0.4)',
              background: 'rgba(255, 152, 0, 0.15)',
              color: '#ff9800',
              cursor: 'pointer',
              fontSize: '13px',
              whiteSpace: 'nowrap',
            }}
          >
            移除失效标签
          </button>
        </div>
      )}

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <span style={{ color: '#888', fontSize: '14px' }}>
          {hasActiveFilter
            ? `匹配 ${filteredProblems.length} / ${problems.length} 道题目`
            : `共 ${filteredProblems.length} 道题目`}
        </span>
        <button
          onClick={() => loadProblems(true)}
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '64px', color: '#888' }}>
          加载中...
        </div>
      ) : problems.length === 0 && !hasActiveFilter ? (
        <div style={{
          background: '#1e1e1e',
          borderRadius: '12px',
          padding: '64px 24px',
          textAlign: 'center',
          border: '1px dashed #333',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📝</div>
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
        </div>
      ) : filteredProblems.length === 0 ? (
        <div style={{
          background: '#1e1e1e',
          borderRadius: '12px',
          padding: '64px 24px',
          textAlign: 'center',
          border: '1px dashed #333',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>
            {tagMissing ? '🏷️' : '🔍'}
          </div>
          <h3 style={{ color: '#fff', margin: '0 0 8px 0' }}>
            {tagMissing ? '筛选的标签已不存在' : '没有找到匹配的题目'}
          </h3>
          <p style={{ color: '#888', margin: '0 0 24px 0', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>
            {tagMissing
              ? `标签「${filter.tag}」已从所有题目中删除${activePreset ? `，组合「${activePreset.name}」仍已保留` : ''}。请移除失效标签或调整筛选条件。`
              : activePreset
                ? `组合「${activePreset.name}」当前没有匹配的题目，条件已保留。您可以调整筛选条件后更新该组合。`
                : '当前筛选条件下没有匹配的题目，请尝试更换关键词、难度或标签。'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            {tagMissing && (
              <button
                onClick={() => updateFilter({ tag: '' })}
                style={{
                  padding: '10px 24px',
                  background: '#ff9800',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                移除失效标签
              </button>
            )}
            <button
              onClick={handleClearFilter}
              style={{
                padding: '10px 24px',
                background: 'transparent',
                color: '#667eea',
                border: '1px solid rgba(102, 126, 234, 0.4)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              清除全部筛选
            </button>
          </div>
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

      {deleteConfirmId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#1e1e1e', borderRadius: '8px', padding: '24px', width: '400px', border: '1px solid #333' }}>
            <h3 style={{ color: '#fff', margin: '0 0 12px 0' }}>确认删除</h3>
            <p style={{ color: '#888', margin: '0 0 24px 0' }}>
              确定要删除这道题目吗？此操作不可撤销。
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirmId(null)}
                style={{ padding: '10px 24px', borderRadius: '4px', border: '1px solid #555', background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: '14px' }}
              >
                取消
              </button>
              <button
                onClick={handleConfirmDelete}
                style={{ padding: '10px 24px', borderRadius: '4px', border: 'none', background: '#f44336', color: '#fff', cursor: 'pointer', fontSize: '14px' }}
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
