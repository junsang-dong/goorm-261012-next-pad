import type { Extension } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import type { Language } from '../types';

const EXTENSION_TO_LANGUAGE: Record<string, Language> = {
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  html: 'html',
  htm: 'html',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
};

const LANGUAGE_LABEL: Record<Language, string> = {
  text: 'Plain Text',
  markdown: 'Markdown',
  json: 'JSON',
  html: 'HTML',
  javascript: 'JavaScript',
};

export function detectLanguage(fileName: string | null): Language {
  if (!fileName) return 'text';
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return 'text';
  const ext = fileName.slice(dot + 1).toLowerCase();
  return EXTENSION_TO_LANGUAGE[ext] ?? 'text';
}

export function languageLabel(language: Language): string {
  return LANGUAGE_LABEL[language];
}

export function languageSupportFor(language: Language): Extension {
  switch (language) {
    case 'markdown':
      return markdown();
    case 'json':
      return json();
    case 'html':
      return html();
    case 'javascript':
      return javascript();
    case 'text':
    default:
      return [];
  }
}
