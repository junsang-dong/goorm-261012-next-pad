import type { DocumentTab } from '../types';
import type { CloseDecision } from '../flows/closeConfirmFlow';

interface ConfirmDialogProps {
  dirtyTabs: DocumentTab[];
  mode: 'tab' | 'quit';
  onRespond: (decision: CloseDecision) => void;
}

export function ConfirmDialog({ dirtyTabs, mode, onRespond }: ConfirmDialogProps) {
  const isMulti = dirtyTabs.length > 1;
  const title =
    mode === 'quit'
      ? isMulti
        ? `${dirtyTabs.length}개의 파일이 저장되지 않았습니다`
        : '저장되지 않은 변경 사항이 있습니다'
      : `'${dirtyTabs[0]?.title ?? ''}' 파일이 저장되지 않았습니다`;
  const saveLabel = isMulti ? '모두 저장' : '저장';
  const discardLabel = isMulti ? '모두 버리기' : '버리기';

  return (
    <div className="np-modal-overlay">
      <div className="np-modal" role="alertdialog" aria-modal="true" aria-label={title}>
        <p className="np-modal-title">{title}</p>
        {isMulti && (
          <ul className="np-modal-list">
            {dirtyTabs.map((tab) => (
              <li key={tab.id}>{tab.title}</li>
            ))}
          </ul>
        )}
        <div className="np-modal-actions">
          <button type="button" onClick={() => onRespond('cancel')}>
            취소
          </button>
          <button type="button" onClick={() => onRespond('discard')}>
            {discardLabel}
          </button>
          <button type="button" className="np-primary" autoFocus onClick={() => onRespond('save')}>
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
