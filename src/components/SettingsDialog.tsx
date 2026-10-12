import type { Settings, Theme } from '../types';

interface SettingsDialogProps {
  settings: Settings;
  onChange: (partial: Partial<Settings>) => void;
  onClose: () => void;
}

export function SettingsDialog({ settings, onChange, onClose }: SettingsDialogProps) {
  return (
    <div className="np-modal-overlay" onClick={onClose}>
      <div
        className="np-modal"
        role="dialog"
        aria-modal="true"
        aria-label="설정"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="np-modal-title">설정</p>

        <div className="np-settings-row">
          <label htmlFor="np-theme">테마</label>
          <select
            id="np-theme"
            value={settings.theme}
            onChange={(e) => onChange({ theme: e.target.value as Theme })}
          >
            <option value="light">라이트</option>
            <option value="dark">다크</option>
          </select>
        </div>

        <div className="np-settings-row">
          <label htmlFor="np-font-size">글자 크기 ({settings.fontSize}px)</label>
          <input
            id="np-font-size"
            type="range"
            min={10}
            max={28}
            value={settings.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          />
        </div>

        <div className="np-settings-row">
          <label htmlFor="np-word-wrap">자동 줄바꿈</label>
          <input
            id="np-word-wrap"
            type="checkbox"
            checked={settings.wordWrap}
            onChange={(e) => onChange({ wordWrap: e.target.checked })}
          />
        </div>

        <div className="np-modal-actions">
          <button type="button" className="np-primary" onClick={onClose} autoFocus>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
