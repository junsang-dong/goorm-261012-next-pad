import { Compartment } from '@codemirror/state';

// Shared across every tab's EditorState so a single settings change can be reconfigured
// into both the active (mounted) state and every background tab's stored state (SPEC §5:
// "설정 변경은 비활성 탭 state에도 적용한다").
export const languageCompartment = new Compartment();
export const themeCompartment = new Compartment();
export const fontSizeCompartment = new Compartment();
export const wordWrapCompartment = new Compartment();
