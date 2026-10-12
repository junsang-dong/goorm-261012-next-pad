import { useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';
import type { ViewUpdate } from '@codemirror/view';
import { openSearchPanel } from '@codemirror/search';
import { listen } from '@tauri-apps/api/event';

import type { DocumentTab, Language } from './types';
import { useTabsStore } from './state/store';
import { makeUntitledTab, titleFromPath } from './state/documentTab';
import { useSettings } from './state/settings';
import { useCloseConfirmFlow } from './flows/closeConfirmFlow';

import {
  createSession,
  getSession,
  getSessionText,
  replaceSessionState,
  removeSession,
  setSessionScroll,
  allSessionIds,
} from './editor/sessionRegistry';
import { createEditorView, switchEditorState } from './editor/createEditorView';
import { isComposingEvent } from './editor/imeGuard';
import {
  languageCompartment,
  themeCompartment,
  fontSizeCompartment,
  wordWrapCompartment,
} from './editor/compartments';
import { themeExtensionFor, fontSizeExtension } from './editor/theme';
import { detectLanguage, languageSupportFor } from './editor/languageDetect';

import {
  openDocument,
  saveDocument,
  saveDocumentAs,
  releaseDocument,
  approveClose,
  nativeErrorMessage,
} from './native/commands';

import { Toolbar } from './components/Toolbar';
import { TabBar } from './components/TabBar';
import { StatusBar } from './components/StatusBar';
import { SettingsDialog } from './components/SettingsDialog';
import { ConfirmDialog } from './components/ConfirmDialog';

export default function App() {
  const { state: tabsState, dispatch, activeTab, canAddTab } = useTabsStore();
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cursorInfo, setCursorInfo] = useState({ line: 1, column: 1 });
  const [charCount, setCharCount] = useState(0);

  const { settings, updateSettings } = useSettings(showError);
  const { request: closeRequest, requestConfirm, respond } = useCloseConfirmFlow();

  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const activeTabIdRef = useRef<string | null>(null);
  const isClosingRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);
  const charCountTimerRef = useRef<number | null>(null);
  const hasInitializedRef = useRef(false);

  // ---- status/toast helpers -------------------------------------------------

  function showError(message: string) {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }

  function scheduleCharCount(state: { doc: { toString(): string } }) {
    if (charCountTimerRef.current !== null) window.clearTimeout(charCountTimerRef.current);
    charCountTimerRef.current = window.setTimeout(() => {
      const text = state.doc.toString();
      // Unicode code point count, not UTF-16 length (SPEC §5).
      setCharCount([...text].length);
    }, 180);
  }

  // Captured once per tab at session-creation time; only touches stable React setters/refs,
  // so it never goes stale even though it's defined fresh on every render (SPEC §5).
  function handleSessionUpdate(tabId: string, update: ViewUpdate) {
    if (update.docChanged) dispatch({ type: 'markDirty', id: tabId });
    if (tabId !== activeTabIdRef.current) return;
    const head = update.state.selection.main.head;
    const line = update.state.doc.lineAt(head);
    setCursorInfo({ line: line.number, column: head - line.from + 1 });
    scheduleCharCount(update.state);
  }

  // ---- tab lifecycle ----------------------------------------------------------

  function createNewTab() {
    if (!canAddTab) {
      showError('탭은 최대 20개까지 열 수 있습니다.');
      return;
    }
    const id = crypto.randomUUID();
    const tab = makeUntitledTab(id, tabsState.nextUntitledOrdinal);
    createSession({
      tabId: id,
      doc: '',
      language: 'text',
      theme: settings.theme,
      fontSize: settings.fontSize,
      wordWrap: settings.wordWrap,
      onUpdate: handleSessionUpdate,
    });
    dispatch({ type: 'addTab', tab });
    dispatch({ type: 'bumpUntitledOrdinal' });
  }

  async function openFile() {
    if (!canAddTab) {
      showError('탭은 최대 20개까지 열 수 있습니다.');
      return;
    }
    try {
      const result = await openDocument();
      if (result.status === 'cancelled') return;
      if (result.status === 'alreadyOpen') {
        const existing = tabsState.tabs.find((t) => t.fileToken === result.token);
        if (existing) dispatch({ type: 'activateTab', id: existing.id });
        return;
      }
      const id = crypto.randomUUID();
      const language = detectLanguage(result.displayPath);
      const tab: DocumentTab = {
        id,
        title: titleFromPath(result.displayPath),
        fileToken: result.token,
        displayPath: result.displayPath,
        language,
        eol: result.eol,
        hasUtf8Bom: result.hasUtf8Bom,
        dirty: false,
      };
      createSession({
        tabId: id,
        doc: result.content,
        language,
        theme: settings.theme,
        fontSize: settings.fontSize,
        wordWrap: settings.wordWrap,
        onUpdate: handleSessionUpdate,
      });
      dispatch({ type: 'addTab', tab });
    } catch (err) {
      showError(nativeErrorMessage(err));
    }
  }

  /** Saves a tab by id (existing token -> plain save, otherwise forces Save As). Used by
   * the Save toolbar action as well as the close/quit confirm flows, which may need to save
   * a tab that is not the currently active one. */
  async function saveTabById(id: string): Promise<boolean> {
    const tab = tabsState.tabs.find((t) => t.id === id);
    if (!tab) return false;
    const text = getSessionText(id) ?? '';
    try {
      if (tab.fileToken) {
        const result = await saveDocument(tab.fileToken, text);
        dispatch({
          type: 'applySaveResult',
          id,
          fileToken: tab.fileToken,
          displayPath: result.path,
          eol: result.eol,
          hasUtf8Bom: result.hasUtf8Bom,
          language: tab.language,
        });
        return true;
      }
      const suggested = `${tab.title}.txt`;
      const result = await saveDocumentAs(null, text, suggested);
      if (result.status === 'cancelled') return false;
      applySavedAsResult(tab, id, result.token, result.path, result.eol, result.hasUtf8Bom);
      return true;
    } catch (err) {
      showError(nativeErrorMessage(err));
      return false;
    }
  }

  function applySavedAsResult(
    tab: DocumentTab,
    id: string,
    fileToken: string,
    path: string,
    eol: 'LF' | 'CRLF',
    hasUtf8Bom: boolean,
  ) {
    const language = detectLanguage(path);
    dispatch({ type: 'applySaveResult', id, fileToken, displayPath: path, eol, hasUtf8Bom, language });
    reconfigureTabLanguageIfNeeded(id, tab.language, language);
  }

  function reconfigureTabLanguageIfNeeded(id: string, prev: Language, next: Language) {
    if (prev === next) return;
    const effect = languageCompartment.reconfigure(languageSupportFor(next));
    if (viewRef.current && id === activeTabIdRef.current) {
      viewRef.current.dispatch({ effects: effect });
    } else {
      const session = getSession(id);
      if (session) replaceSessionState(id, session.state.update({ effects: effect }).state);
    }
  }

  async function saveActiveTab() {
    if (activeTab) await saveTabById(activeTab.id);
  }

  async function saveActiveTabAs() {
    const tab = activeTab;
    if (!tab) return;
    const text = getSessionText(tab.id) ?? '';
    const suggested = tab.displayPath ? titleFromPath(tab.displayPath) : `${tab.title}.txt`;
    try {
      const result = await saveDocumentAs(tab.fileToken, text, suggested);
      if (result.status === 'cancelled') return;
      applySavedAsResult(tab, tab.id, result.token, result.path, result.eol, result.hasUtf8Bom);
    } catch (err) {
      showError(nativeErrorMessage(err));
    }
  }

  async function closeTab(id: string) {
    const tab = tabsState.tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.dirty) {
      const decision = await requestConfirm([tab], 'tab');
      if (decision === 'cancel') return;
      if (decision === 'save') {
        const ok = await saveTabById(id);
        if (!ok) return;
      }
    }
    if (tab.fileToken) releaseDocument(tab.fileToken).catch(() => {});
    removeSession(id);
    dispatch({ type: 'closeTab', id });
  }

  function closeActiveTab() {
    if (activeTab) closeTab(activeTab.id);
  }

  function handleActivateTab(id: string) {
    if (id === tabsState.activeTabId) return;
    if (viewRef.current && tabsState.activeTabId) {
      setSessionScroll(
        tabsState.activeTabId,
        viewRef.current.scrollDOM.scrollTop,
        viewRef.current.scrollDOM.scrollLeft,
      );
    }
    dispatch({ type: 'activateTab', id });
  }

  function toggleFind() {
    if (viewRef.current) {
      openSearchPanel(viewRef.current);
      viewRef.current.focus();
    }
  }

  function adjustFontSize(delta: number) {
    const next = Math.min(28, Math.max(10, settings.fontSize + delta));
    if (next !== settings.fontSize) updateSettings({ fontSize: next });
  }

  async function requestQuit() {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    try {
      const dirtyTabs = tabsState.tabs.filter((t) => t.dirty);
      if (dirtyTabs.length === 0) {
        await approveClose();
        return;
      }
      const decision = await requestConfirm(dirtyTabs, 'quit');
      if (decision === 'cancel') return;
      if (decision === 'save') {
        for (const t of dirtyTabs) {
          const ok = await saveTabById(t.id);
          if (!ok) return;
        }
      }
      await approveClose();
    } catch (err) {
      showError(nativeErrorMessage(err));
    } finally {
      isClosingRef.current = false;
    }
  }

  // ---- effects ----------------------------------------------------------------

  // First launch always starts with one empty "제목 없음 1" tab (SPEC §3). Guarded against
  // React StrictMode's double-invoked effects.
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    createNewTab();
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    activeTabIdRef.current = tabsState.activeTabId;
  }, [tabsState.activeTabId]);

  // Mount the single EditorView on first content, or switch it to the newly active tab's
  // state (never a full-document replace transaction) on every subsequent change.
  useEffect(() => {
    if (!tabsState.activeTabId || !editorContainerRef.current) return;
    const session = getSession(tabsState.activeTabId);
    if (!session) return;
    if (!viewRef.current) {
      viewRef.current = createEditorView(session.state, editorContainerRef.current);
      const top = session.scrollTop;
      const left = session.scrollLeft;
      requestAnimationFrame(() => {
        if (!viewRef.current) return;
        viewRef.current.scrollDOM.scrollTop = top;
        viewRef.current.scrollDOM.scrollLeft = left;
      });
    } else {
      switchEditorState(viewRef.current, session.state, session.scrollTop, session.scrollLeft);
    }
  }, [tabsState.activeTabId]);

  useEffect(() => {
    if (tabsState.tabs.length === 0 && viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
    }
  }, [tabsState.tabs.length]);

  // Settings apply to every open tab's stored state, not just the active one (SPEC §5).
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    const effects = [
      themeCompartment.reconfigure(themeExtensionFor(settings.theme)),
      fontSizeCompartment.reconfigure(fontSizeExtension(settings.fontSize)),
      wordWrapCompartment.reconfigure(settings.wordWrap ? EditorView.lineWrapping : []),
    ];
    for (const tabId of allSessionIds()) {
      if (viewRef.current && tabId === activeTabIdRef.current) {
        viewRef.current.dispatch({ effects });
      } else {
        const session = getSession(tabId);
        if (session) replaceSessionState(tabId, session.state.update({ effects }).state);
      }
    }
  }, [settings.theme, settings.fontSize, settings.wordWrap]);

  // Keep latest coordinator functions reachable from listeners registered once on mount.
  const actionsRef = useRef({
    createNewTab,
    openFile,
    saveActiveTab,
    saveActiveTabAs,
    closeActiveTab,
    requestQuit,
    adjustFontSize,
  });
  useEffect(() => {
    actionsRef.current = {
      createNewTab,
      openFile,
      saveActiveTab,
      saveActiveTabAs,
      closeActiveTab,
      requestQuit,
      adjustFontSize,
    };
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isComposingEvent(event)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        actionsRef.current.createNewTab();
      } else if (key === 'o') {
        event.preventDefault();
        actionsRef.current.openFile();
      } else if (key === 's' && event.shiftKey) {
        event.preventDefault();
        actionsRef.current.saveActiveTabAs();
      } else if (key === 's') {
        event.preventDefault();
        actionsRef.current.saveActiveTab();
      } else if (key === 'w') {
        event.preventDefault();
        actionsRef.current.closeActiveTab();
      } else if (key === '=' || key === '+') {
        // '=' is what Cmd+Plus actually reports without Shift on most layouts; '+' covers
        // Shift-held and numpad-plus variants. preventDefault also blocks the WebView's own
        // Cmd+/- page-zoom so it doesn't fight with our font-size change.
        event.preventDefault();
        actionsRef.current.adjustFontSize(1);
      } else if (key === '-' || key === '_') {
        event.preventDefault();
        actionsRef.current.adjustFontSize(-1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // The red traffic-light button, Cmd+W-on-window and Cmd+Q all surface as this one signal
  // from Rust (SPEC §8, simplified: see lib.rs).
  useEffect(() => {
    const unlistenPromise = listen('close-requested', () => {
      actionsRef.current.requestQuit();
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // ---- render -------------------------------------------------------------------

  return (
    <div className="np-app">
      <Toolbar
        onNew={createNewTab}
        onOpen={openFile}
        onSave={saveActiveTab}
        onSaveAs={saveActiveTabAs}
        onFind={toggleFind}
        onSettings={() => setSettingsOpen(true)}
      />

      {tabsState.tabs.length === 0 ? (
        <div className="np-empty-state">
          <p>열린 문서가 없습니다.</p>
          <button type="button" onClick={createNewTab}>
            새 문서 만들기
          </button>
        </div>
      ) : (
        <>
          <TabBar
            tabs={tabsState.tabs}
            activeTabId={tabsState.activeTabId}
            onActivate={handleActivateTab}
            onClose={closeTab}
          />
          <div className="np-editor-pane" ref={editorContainerRef} />
          <StatusBar tab={activeTab} line={cursorInfo.line} column={cursorInfo.column} charCount={charCount} />
        </>
      )}

      {settingsOpen && (
        <SettingsDialog settings={settings} onChange={updateSettings} onClose={() => setSettingsOpen(false)} />
      )}

      {closeRequest && (
        <ConfirmDialog dirtyTabs={closeRequest.dirtyTabs} mode={closeRequest.mode} onRespond={respond} />
      )}

      {toast && (
        <div className="np-toast" role="alert">
          {toast}
        </div>
      )}
    </div>
  );
}
