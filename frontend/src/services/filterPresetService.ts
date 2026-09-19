import type { Problem } from '../types';
import { getDifficultyTag } from '../types';

/**
 * 题库筛选条件：搜索关键字 + 难度 + 标签
 */
export interface FilterCriteria {
  searchQuery: string;
  difficulty: string; // 'all' | 'easy' | 'medium' | 'hard'
  tag: string;
}

export interface FilterPreset {
  id: string;
  name: string;
  criteria: FilterCriteria;
  createdAt: string;
  lastUsedAt: string;
}

export const DEFAULT_FILTER_CRITERIA: FilterCriteria = {
  searchQuery: '',
  difficulty: 'all',
  tag: '',
};

const PRESETS_STORAGE_KEY = 'code_interview_filter_presets';
const LAST_USED_STORAGE_KEY = 'code_interview_filter_last_used_preset_id';

const VALID_DIFFICULTIES = ['all', 'easy', 'medium', 'hard'];

const isValidCriteria = (value: any): value is FilterCriteria => {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.searchQuery === 'string' &&
    typeof value.tag === 'string' &&
    typeof value.difficulty === 'string' &&
    VALID_DIFFICULTIES.includes(value.difficulty)
  );
};

const isValidPreset = (value: any): value is FilterPreset => {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.lastUsedAt === 'string' &&
    isValidCriteria(value.criteria)
  );
};

/**
 * 条件是否完全一致（用于判断是否已保存过相同组合）
 */
export const criteriaEquals = (a: FilterCriteria, b: FilterCriteria): boolean => {
  return a.searchQuery === b.searchQuery && a.difficulty === b.difficulty && a.tag === b.tag;
};

/**
 * 统一的题目筛选逻辑，与题库列表原有搜索/筛选规则保持一致：
 * - 难度：精确匹配，'all' 表示不限
 * - 标签：题目标签数组中精确包含所选标签
 * - 搜索：标题 / 描述 / 标签 包含关键字（不区分大小写）
 */
export const matchProblems = (problems: Problem[], criteria: FilterCriteria): Problem[] => {
  const { searchQuery, difficulty, tag } = criteria;
  return problems.filter((p) => {
    if (difficulty && difficulty !== 'all' && p.difficulty !== difficulty) {
      return false;
    }
    if (tag && !p.tags.includes(tag)) {
      return false;
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matched =
        p.title.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.tags.some((t) => t.toLowerCase().includes(query));
      if (!matched) {
        return false;
      }
    }
    return true;
  });
};

const readPresets = (): FilterPreset[] => {
  try {
    const stored = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isValidPreset);
  } catch (e) {
    console.warn('Failed to load filter presets from storage:', e);
    return [];
  }
};

const writePresets = (presets: FilterPreset[]) => {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    console.warn('Failed to save filter presets to storage:', e);
  }
};

export const getFilterPresets = (): FilterPreset[] => readPresets();

export const findPresetByCriteria = (criteria: FilterCriteria): FilterPreset | undefined => {
  return readPresets().find((preset) => criteriaEquals(preset.criteria, criteria));
};

export const findPresetByName = (name: string): FilterPreset | undefined => {
  const target = name.trim();
  return readPresets().find((preset) => preset.name === target);
};

export const createFilterPreset = (name: string, criteria: FilterCriteria): FilterPreset => {
  const now = new Date().toISOString();
  const preset: FilterPreset = {
    id: 'preset-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
    name: name.trim(),
    criteria: {
      searchQuery: criteria.searchQuery,
      difficulty: criteria.difficulty,
      tag: criteria.tag,
    },
    createdAt: now,
    lastUsedAt: now,
  };
  const presets = readPresets();
  presets.push(preset);
  writePresets(presets);
  return preset;
};

/**
 * 记录一次使用（点击切换 / 保存后选中），按最近使用时间排序展示
 */
export const markPresetUsed = (presetId: string): FilterPreset | null => {
  const presets = readPresets();
  const index = presets.findIndex((p) => p.id === presetId);
  if (index === -1) {
    return null;
  }
  presets[index] = { ...presets[index], lastUsedAt: new Date().toISOString() };
  writePresets(presets);
  return presets[index];
};

export const deleteFilterPreset = (presetId: string): void => {
  const presets = readPresets().filter((p) => p.id !== presetId);
  writePresets(presets);
  if (getLastUsedPresetId() === presetId) {
    setLastUsedPresetId(null);
  }
};

export const getLastUsedPresetId = (): string | null => {
  try {
    return localStorage.getItem(LAST_USED_STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to load last used filter preset:', e);
    return null;
  }
};

export const setLastUsedPresetId = (presetId: string | null): void => {
  try {
    if (presetId) {
      localStorage.setItem(LAST_USED_STORAGE_KEY, presetId);
    } else {
      localStorage.removeItem(LAST_USED_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Failed to persist last used filter preset:', e);
  }
};

/**
 * 刷新页面后恢复最近使用的组合；若组合已被删除或数据损坏则返回 null
 */
export const getLastUsedPreset = (): FilterPreset | null => {
  const id = getLastUsedPresetId();
  if (!id) {
    return null;
  }
  const preset = readPresets().find((p) => p.id === id);
  return preset ?? null;
};

/**
 * 根据当前条件生成一个默认组合名，如「中等 · 哈希表」「简单 · 搜索：二叉树」「全部题目」
 */
export const suggestPresetName = (criteria: FilterCriteria): string => {
  const parts: string[] = [];
  if (criteria.difficulty !== 'all') {
    parts.push(getDifficultyTag(criteria.difficulty).label);
  }
  if (criteria.tag) {
    parts.push(criteria.tag);
  }
  if (criteria.searchQuery.trim()) {
    const keyword = criteria.searchQuery.trim().substring(0, 10);
    parts.push(`搜索：${keyword}`);
  }
  const name = parts.length > 0 ? parts.join(' · ') : '全部题目';
  return name.length > 20 ? name.substring(0, 20) : name;
};
