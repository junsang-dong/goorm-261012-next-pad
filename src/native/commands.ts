import { invoke } from '@tauri-apps/api/core';
import type { Eol, Settings } from '../types';

export interface NativeError {
  code: string;
  message: string;
}

export function isNativeError(value: unknown): value is NativeError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value;
}

export function nativeErrorMessage(value: unknown): string {
  if (isNativeError(value)) return value.message;
  return '알 수 없는 오류가 발생했습니다.';
}

export type OpenResult =
  | { status: 'cancelled' }
  | { status: 'alreadyOpen'; token: string }
  | {
      status: 'opened';
      token: string;
      displayPath: string;
      content: string;
      hasUtf8Bom: boolean;
      eol: Eol;
    };

export interface SaveResult {
  path: string;
  eol: Eol;
  hasUtf8Bom: boolean;
}

export type SaveAsResult =
  | { status: 'cancelled' }
  | { status: 'saved'; token: string; path: string; eol: Eol; hasUtf8Bom: boolean };

export function openDocument(): Promise<OpenResult> {
  return invoke('open_document');
}

export function saveDocument(token: string, content: string): Promise<SaveResult> {
  return invoke('save_document', { token, content });
}

export function saveDocumentAs(
  existingToken: string | null,
  content: string,
  suggestedName: string,
): Promise<SaveAsResult> {
  return invoke('save_document_as', { existingToken, content, suggestedName });
}

export function releaseDocument(token: string): Promise<void> {
  return invoke('release_document', { token });
}

export function approveClose(): Promise<void> {
  return invoke('approve_close');
}

export function loadSettings(): Promise<Settings> {
  return invoke('load_settings');
}

export function saveSettings(settings: Settings): Promise<void> {
  return invoke('save_settings', { settings });
}
