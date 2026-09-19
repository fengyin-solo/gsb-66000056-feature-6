import type { FilterPreset, ProblemFilter } from '../types';

const PRESETS_STORAGE_KEY = 'code_interview_filter_presets';
const LAST_USED_FILTER_KEY = 'code_interview_last_used_filter';

const generateId = (): string =>
  'preset-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

const safeParse = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn('Failed to parse stored filter preset:', e);
    return fallback;
  }
};

export const loadPresets = (): FilterPreset[] => {
  try {
    const presets = safeParse<FilterPreset[]>(
      localStorage.getItem(PRESETS_STORAGE_KEY),
      []
    );
    return Array.isArray(presets) ? presets : [];
  } catch (e) {
    console.warn('Failed to load filter presets:', e);
    return [];
  }
};

const persistPresets = (presets: FilterPreset[]) => {
  try {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    console.warn('Failed to save filter presets:', e);
  }
};

export const createPreset = (
  presets: FilterPreset[],
  name: string,
  filter: ProblemFilter
): { presets: FilterPreset[]; preset: FilterPreset } => {
  const now = new Date().toISOString();
  const preset: FilterPreset = {
    id: generateId(),
    name,
    filter: { ...filter },
    createdAt: now,
    updatedAt: now,
  };
  const next = [preset, ...presets];
  persistPresets(next);
  return { presets: next, preset };
};

export const updatePreset = (
  presets: FilterPreset[],
  id: string,
  updates: { name?: string; filter?: ProblemFilter }
): FilterPreset[] => {
  const next = presets.map(preset =>
    preset.id === id
      ? {
          ...preset,
          name: updates.name ?? preset.name,
          filter: updates.filter ? { ...updates.filter } : preset.filter,
          updatedAt: new Date().toISOString(),
        }
      : preset
  );
  persistPresets(next);
  return next;
};

export const deletePreset = (
  presets: FilterPreset[],
  id: string
): FilterPreset[] => {
  const next = presets.filter(preset => preset.id !== id);
  persistPresets(next);
  return next;
};

/** Persist which filter combo was applied most recently, so it survives a refresh. */
export const saveLastUsedFilter = (filter: ProblemFilter | null): void => {
  try {
    if (filter) {
      localStorage.setItem(LAST_USED_FILTER_KEY, JSON.stringify(filter));
    } else {
      localStorage.removeItem(LAST_USED_FILTER_KEY);
    }
  } catch (e) {
    console.warn('Failed to save last used filter:', e);
  }
};

export const loadLastUsedFilter = (): ProblemFilter | null => {
  try {
    return safeParse<ProblemFilter | null>(
      localStorage.getItem(LAST_USED_FILTER_KEY),
      null
    );
  } catch (e) {
    console.warn('Failed to load last used filter:', e);
    return null;
  }
};
