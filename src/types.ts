export type Language = 'text' | 'markdown' | 'json' | 'html' | 'javascript';

export type Eol = 'LF' | 'CRLF';

export interface DocumentTab {
  id: string;
  title: string;
  fileToken: string | null;
  displayPath: string | null;
  language: Language;
  eol: Eol;
  hasUtf8Bom: boolean;
  dirty: boolean;
}

export type Theme = 'light' | 'dark';

export interface Settings {
  schemaVersion: number;
  theme: Theme;
  fontSize: number;
  wordWrap: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: 1,
  theme: 'light',
  fontSize: 14,
  wordWrap: true,
};

export const MAX_TABS = 20;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
