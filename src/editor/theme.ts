import { EditorView } from '@codemirror/view';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import type { Extension } from '@codemirror/state';
import type { Theme } from '../types';

const lightTheme = EditorView.theme(
  {
    '&': { backgroundColor: '#FFFFFF', color: '#18212F' },
    '.cm-content': { caretColor: '#3478F6' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#3478F6' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
      backgroundColor: '#3478F633',
    },
    '.cm-activeLine': { backgroundColor: '#F7F8FA' },
    '.cm-activeLineGutter': { backgroundColor: '#F7F8FA' },
    '.cm-gutters': { backgroundColor: '#F7F8FA', color: '#8A94A6', border: 'none' },
  },
  { dark: false },
);

const lightExtension: Extension = [lightTheme, syntaxHighlighting(defaultHighlightStyle)];

export function themeExtensionFor(theme: Theme): Extension {
  return theme === 'dark' ? oneDark : lightExtension;
}

export function fontSizeExtension(px: number): Extension {
  return EditorView.theme({
    '&': { fontSize: `${px}px` },
    '.cm-content, .cm-gutters': {
      fontFamily:
        "ui-monospace, 'SF Mono', Menlo, Consolas, 'Apple SD Gothic Neo', 'Malgun Gothic', monospace",
    },
  });
}
