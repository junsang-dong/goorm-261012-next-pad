import type { DocumentTab } from '../types';

interface TabItemProps {
  tab: DocumentTab;
  active: boolean;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

export function TabItem({ tab, active, onActivate, onClose }: TabItemProps) {
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      className={`np-tab${active ? ' np-tab-active' : ''}`}
      onClick={() => onActivate(tab.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onActivate(tab.id);
      }}
    >
      <span className="np-tab-title">{tab.title}</span>
      {tab.dirty && (
        <span className="np-tab-dirty" aria-label="수정됨" title="수정됨">
          ●
        </span>
      )}
      <button
        type="button"
        className="np-tab-close"
        aria-label={`${tab.title} 탭 닫기`}
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
      >
        ✕
      </button>
    </div>
  );
}
