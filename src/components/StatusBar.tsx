import type { DocumentTab } from '../types';
import { languageLabel } from '../editor/languageDetect';

interface StatusBarProps {
  tab: DocumentTab | null;
  line: number;
  column: number;
  charCount: number;
}

export function StatusBar({ tab, line, column, charCount }: StatusBarProps) {
  if (!tab) return <div className="np-statusbar" />;
  return (
    <div className="np-statusbar">
      <span>{languageLabel(tab.language)}</span>
      <span>{tab.hasUtf8Bom ? 'UTF-8 BOM' : 'UTF-8'}</span>
      <span>{tab.eol}</span>
      <span>
        {line}:{column}
      </span>
      <span>{charCount.toLocaleString()}자</span>
    </div>
  );
}
