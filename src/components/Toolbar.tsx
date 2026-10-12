interface ToolbarProps {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onFind: () => void;
  onSettings: () => void;
}

export function Toolbar({ onNew, onOpen, onSave, onSaveAs, onFind, onSettings }: ToolbarProps) {
  return (
    <div className="np-toolbar" role="toolbar" aria-label="편집 도구 모음">
      <button type="button" aria-label="새 문서" onClick={onNew}>
        새 문서
      </button>
      <button type="button" aria-label="열기" onClick={onOpen}>
        열기
      </button>
      <button type="button" aria-label="저장" onClick={onSave}>
        저장
      </button>
      <button type="button" aria-label="다른 이름으로 저장" onClick={onSaveAs}>
        다른 이름으로 저장
      </button>
      <button type="button" aria-label="찾기" onClick={onFind}>
        찾기
      </button>
      <div className="np-toolbar-spacer" />
      <button type="button" aria-label="설정" onClick={onSettings}>
        설정
      </button>
    </div>
  );
}
