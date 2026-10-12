import { EditorView } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';

export function createEditorView(initialState: EditorState, parent: HTMLElement): EditorView {
  return new EditorView({ state: initialState, parent });
}

/** Switches the single mounted view to a different tab's state, restoring its scroll
 * position once the new content has been laid out (SPEC §5: no full-document replace
 * transaction on tab switch, and scroll is preserved). */
export function switchEditorState(
  view: EditorView,
  state: EditorState,
  scrollTop: number,
  scrollLeft: number,
): void {
  view.setState(state);
  requestAnimationFrame(() => {
    view.scrollDOM.scrollTop = scrollTop;
    view.scrollDOM.scrollLeft = scrollLeft;
  });
}
