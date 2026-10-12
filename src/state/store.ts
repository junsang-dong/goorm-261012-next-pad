import { useMemo, useReducer } from 'react';
import { initialTabsState, tabsReducer } from './documentTab';
import { MAX_TABS } from '../types';

export function useTabsStore() {
  const [state, dispatch] = useReducer(tabsReducer, initialTabsState);

  const activeTab = useMemo(
    () => state.tabs.find((t) => t.id === state.activeTabId) ?? null,
    [state.tabs, state.activeTabId],
  );

  const canAddTab = state.tabs.length < MAX_TABS;

  return { state, dispatch, activeTab, canAddTab };
}
