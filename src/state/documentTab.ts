import type { DocumentTab, Eol, Language } from '../types';

export function makeUntitledTab(id: string, ordinal: number): DocumentTab {
  return {
    id,
    title: `제목 없음 ${ordinal}`,
    fileToken: null,
    displayPath: null,
    language: 'text',
    eol: 'LF',
    hasUtf8Bom: false,
    dirty: false,
  };
}

export function titleFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export interface TabsState {
  tabs: DocumentTab[];
  activeTabId: string | null;
  nextUntitledOrdinal: number;
}

export type TabsAction =
  | { type: 'addTab'; tab: DocumentTab }
  | { type: 'activateTab'; id: string }
  | { type: 'closeTab'; id: string }
  | { type: 'markDirty'; id: string }
  | { type: 'applySaveResult'; id: string; fileToken: string; displayPath: string; eol: Eol; hasUtf8Bom: boolean; language: Language }
  | { type: 'bumpUntitledOrdinal' };

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'addTab': {
      const tabs = [...state.tabs, action.tab];
      return { ...state, tabs, activeTabId: action.tab.id };
    }
    case 'activateTab': {
      if (!state.tabs.some((t) => t.id === action.id)) return state;
      return { ...state, activeTabId: action.id };
    }
    case 'closeTab': {
      const index = state.tabs.findIndex((t) => t.id === action.id);
      if (index < 0) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      let activeTabId = state.activeTabId;
      if (activeTabId === action.id) {
        const next = tabs[index] ?? tabs[index - 1];
        activeTabId = next ? next.id : null;
      }
      return { ...state, tabs, activeTabId };
    }
    case 'markDirty': {
      const tabs = state.tabs.map((t) => (t.id === action.id && !t.dirty ? { ...t, dirty: true } : t));
      return { ...state, tabs };
    }
    case 'applySaveResult': {
      const tabs = state.tabs.map((t) =>
        t.id === action.id
          ? {
              ...t,
              fileToken: action.fileToken,
              displayPath: action.displayPath,
              title: titleFromPath(action.displayPath),
              eol: action.eol,
              hasUtf8Bom: action.hasUtf8Bom,
              language: action.language,
              dirty: false,
            }
          : t,
      );
      return { ...state, tabs };
    }
    case 'bumpUntitledOrdinal':
      return { ...state, nextUntitledOrdinal: state.nextUntitledOrdinal + 1 };
    default:
      return state;
  }
}

export const initialTabsState: TabsState = {
  tabs: [],
  activeTabId: null,
  nextUntitledOrdinal: 1,
};
