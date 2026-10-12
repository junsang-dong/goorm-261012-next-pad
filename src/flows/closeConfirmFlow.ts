import { useCallback, useRef, useState } from 'react';
import type { DocumentTab } from '../types';

export type CloseDecision = 'save' | 'discard' | 'cancel';

export interface CloseConfirmRequest {
  dirtyTabs: DocumentTab[];
  mode: 'tab' | 'quit';
}

/**
 * Plain async confirm bridge: a dialog request is pushed into local state, and the promise
 * returned by requestConfirm resolves when the dialog calls respond(). This replaces SPEC
 * §8's request-ID close coordinator per the approved lightweight-scope plan — the only
 * reentrancy protection needed is the caller's own in-flight boolean (e.g. around Cmd+Q).
 */
export function useCloseConfirmFlow() {
  const [request, setRequest] = useState<CloseConfirmRequest | null>(null);
  const resolverRef = useRef<((decision: CloseDecision) => void) | null>(null);

  const requestConfirm = useCallback(
    (dirtyTabs: DocumentTab[], mode: 'tab' | 'quit'): Promise<CloseDecision> => {
      return new Promise((resolve) => {
        resolverRef.current = resolve;
        setRequest({ dirtyTabs, mode });
      });
    },
    [],
  );

  const respond = useCallback((decision: CloseDecision) => {
    setRequest(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(decision);
  }, []);

  return { request, requestConfirm, respond };
}
