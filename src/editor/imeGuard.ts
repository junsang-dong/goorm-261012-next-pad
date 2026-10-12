/**
 * True while a Korean/Japanese/Chinese IME composition is in progress, or on the legacy
 * `keyCode === 229` fallback some browsers use during composition. App-level shortcut
 * handlers must bail out early on this so Enter/Space/etc. mid-composition reach the IME
 * instead of being hijacked (SPEC §12).
 */
export function isComposingEvent(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}
