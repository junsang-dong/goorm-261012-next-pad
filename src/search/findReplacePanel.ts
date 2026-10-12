import type { EditorView, Panel } from '@codemirror/view';
import {
  search as cmSearch,
  searchKeymap,
  closeSearchPanel,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  highlightSelectionMatches,
  SearchQuery,
  setSearchQuery,
  getSearchQuery,
} from '@codemirror/search';
import type { Extension } from '@codemirror/state';

function makeButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.title = title;
  btn.className = 'np-search-btn';
  btn.onclick = onClick;
  return btn;
}

/**
 * Plain-text find/replace panel. Regex search is intentionally not exposed (SPEC §7 scopes
 * v1 to plain text + case-sensitivity only) — SearchQuery.regexp is simply never set to true.
 */
function createPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'np-search-panel';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = '찾기';
  searchInput.className = 'np-search-input';
  searchInput.setAttribute('main-field', 'true');
  searchInput.setAttribute('aria-label', '찾을 내용');

  const caseLabel = document.createElement('label');
  caseLabel.className = 'np-search-case-label';
  const caseCheckbox = document.createElement('input');
  caseCheckbox.type = 'checkbox';
  caseLabel.append(caseCheckbox, document.createTextNode(' 대소문자 구분'));

  const prevBtn = makeButton('↑', '이전 찾기', () => findPrevious(view));
  const nextBtn = makeButton('↓', '다음 찾기', () => findNext(view));
  const closeBtn = makeButton('✕', '검색 패널 닫기', () => closeSearchPanel(view));

  const replaceInput = document.createElement('input');
  replaceInput.type = 'text';
  replaceInput.placeholder = '바꿀 내용';
  replaceInput.className = 'np-search-input';
  replaceInput.setAttribute('aria-label', '바꿀 내용');

  const replaceBtn = makeButton('바꾸기', '한 개 바꾸기', () => replaceNext(view));
  const replaceAllBtn = makeButton('모두 바꾸기', '모두 바꾸기', () => replaceAll(view));

  function commitQuery() {
    const query = new SearchQuery({
      search: searchInput.value,
      caseSensitive: caseCheckbox.checked,
      replace: replaceInput.value,
    });
    view.dispatch({ effects: setSearchQuery.of(query) });
  }

  searchInput.oninput = commitQuery;
  caseCheckbox.onchange = commitQuery;
  replaceInput.oninput = commitQuery;

  searchInput.onkeydown = (event) => {
    if (event.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) findPrevious(view);
      else findNext(view);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSearchPanel(view);
    }
  };
  replaceInput.onkeydown = (event) => {
    if (event.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      replaceNext(view);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeSearchPanel(view);
    }
  };

  const row1 = document.createElement('div');
  row1.className = 'np-search-row';
  row1.append(searchInput, prevBtn, nextBtn, caseLabel, closeBtn);

  const row2 = document.createElement('div');
  row2.className = 'np-search-row';
  row2.append(replaceInput, replaceBtn, replaceAllBtn);

  dom.append(row1, row2);

  return {
    dom,
    top: true,
    mount() {
      const existing = getSearchQuery(view.state);
      searchInput.value = existing.search;
      caseCheckbox.checked = existing.caseSensitive;
      replaceInput.value = existing.replace;
      searchInput.focus();
      searchInput.select();
    },
  };
}

export function searchExtensions(): Extension {
  return [cmSearch({ top: true, createPanel }), highlightSelectionMatches()];
}

export { searchKeymap };
