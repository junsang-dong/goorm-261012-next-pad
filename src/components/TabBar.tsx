import type { DocumentTab } from '../types';
import { TabItem } from './TabItem';

interface TabBarProps {
  tabs: DocumentTab[];
  activeTabId: string | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

export function TabBar({ tabs, activeTabId, onActivate, onClose }: TabBarProps) {
  return (
    <div className="np-tabbar" role="tablist" aria-label="열린 문서 탭">
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          active={tab.id === activeTabId}
          onActivate={onActivate}
          onClose={onClose}
        />
      ))}
    </div>
  );
}
