import { EditorState } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchExtensions, searchKeymap } from '../search/findReplacePanel';
import {
  languageCompartment,
  themeCompartment,
  fontSizeCompartment,
  wordWrapCompartment,
} from './compartments';
import { themeExtensionFor, fontSizeExtension } from './theme';
import { languageSupportFor } from './languageDetect';
import type { Language, Theme } from '../types';

// Per-tab CodeMirror state, kept outside React so switching tabs is a plain
// view.setState() instead of recreating history (SPEC §5: per-tab undo/redo isolation).
export interface EditorSession {
  state: EditorState;
  scrollTop: number;
  scrollLeft: number;
}

interface CreateSessionOptions {
  tabId: string;
  doc: string;
  language: Language;
  theme: Theme;
  fontSize: number;
  wordWrap: boolean;
  onUpdate: (tabId: string, update: ViewUpdate) => void;
}

const sessions = new Map<string, EditorSession>();

export function createSession(opts: CreateSessionOptions): EditorSession {
  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    drawSelection(),
    history(),
    keymap.of([indentWithTab, ...searchKeymap, ...historyKeymap, ...defaultKeymap]),
    searchExtensions(),
    languageCompartment.of(languageSupportFor(opts.language)),
    themeCompartment.of(themeExtensionFor(opts.theme)),
    fontSizeCompartment.of(fontSizeExtension(opts.fontSize)),
    wordWrapCompartment.of(opts.wordWrap ? EditorView.lineWrapping : []),
    EditorView.updateListener.of((update) => {
      // Keep the registry's stored state mirroring the live view for whichever tab is
      // mounted, so reading a tab's current text (e.g. for save) never needs the view itself.
      replaceSessionState(opts.tabId, update.state);
      opts.onUpdate(opts.tabId, update);
    }),
  ];
  const state = EditorState.create({ doc: opts.doc, extensions });
  const session: EditorSession = { state, scrollTop: 0, scrollLeft: 0 };
  sessions.set(opts.tabId, session);
  return session;
}

export function getSession(tabId: string): EditorSession | undefined {
  return sessions.get(tabId);
}

export function getSessionText(tabId: string): string | undefined {
  return sessions.get(tabId)?.state.doc.toString();
}

export function replaceSessionState(tabId: string, state: EditorState): void {
  const session = sessions.get(tabId);
  if (session) session.state = state;
}

export function setSessionScroll(tabId: string, top: number, left: number): void {
  const session = sessions.get(tabId);
  if (session) {
    session.scrollTop = top;
    session.scrollLeft = left;
  }
}

export function removeSession(tabId: string): void {
  sessions.delete(tabId);
}

export function allSessionIds(): string[] {
  return [...sessions.keys()];
}
