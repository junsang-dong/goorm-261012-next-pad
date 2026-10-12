# NextPad — CodeMirror + Tauri 기술명세서
Version 1.0.0 · 작성일 2026-10-12 · 바이브코딩 데스크톱 앱 실습

## 1. 제품 정의

NextPad는 빠르게 메모하고 간단한 코드 파일을 편집하는 독립형 데스크톱 앱이다. Sublime Text의 단순한 편집 경험을 참고하되 자체 UI와 브랜드로 만든다.

핵심 흐름: 새 문서/파일 열기 → 편집 → 검색·바꾸기 → 파일 저장.
첫 대상은 macOS Apple Silicon이다. Windows를 후속 대상으로 설계하되 실제 검증 전 지원 완료로 표시하지 않는다.

### 목표
- 텍스트·Markdown·JSON·HTML·JavaScript 파일을 편집한다.
- 탭별 문서·커서·실행 취소 상태를 유지한다.
- 한글 입력, 파일 저장, 미저장 문서 종료 처리가 정상 동작한다.
- 시스템 WebView를 활용해 브라우저 엔진을 앱마다 포함하지 않는다.
- 실제 Tauri 앱 실행부터 Release 패키징까지 완성한다.

### 범위
| 우선순위 | 기능 |
|---|---|
| P0 필수 | 새 문서, 파일 열기, 저장, 다른 이름으로 저장 |
| P0 필수 | 여러 탭, 수정 표시, 탭별 실행 취소/다시 실행 |
| P0 필수 | 찾기/바꾸기, 선택·복사·붙여넣기, 한글 입력 |
| P0 필수 | 미저장 닫기/종료 확인, 저장 실패 처리 |
| P0 필수 | UTF-8 검증, 개행/BOM 유지, 외부 변경 충돌 확인 |
| P1 기본 편의 | 줄 번호·줄/열·문자 수, 구문 강조 |
| P1 기본 편의 | 테마·글자 크기·자동 줄바꿈, 설정 저장 |
| P2 후속 | 초안 복구, 최근 파일, 자동완성, 코드 접기 |
| 제외 | 터미널, 디버거, Git, AI API, 로그인, 서버/DB |
| 제외 | Markdown/HTML 실행·미리보기, 파일 연결, 폴더 검색 |
| 제외 | 모바일·App Store·자동 업데이트·협업 편집 |

완성 기준은 P0/P1과 macOS Release .app의 수동 검증이다. 첫 버전은 탭 최대 20개, 문서당 최대 5MiB로 제한한다. 이는 품질을 위한 프로젝트 정책이며 CodeMirror 자체 한계가 아니다.

## 2. 기술 스택

| 영역 | 선택 |
|---|---|
| UI | React + Vite + TypeScript |
| 편집 엔진 | CodeMirror 6 |
| 데스크톱 | Tauri 2, Rust |
| 네이티브 파일 선택 | tauri-plugin-dialog, Rust 측 API |
| 파일 IO | 제한된 사용자 정의 Rust commands |
| 설정 | 앱 config 디렉터리 JSON, Rust 측 저장 |
| 검증 | Vitest, Rust 단위 검사, 실기기 수동 확인 |
| 디자인 | 로컬 CSS·시스템 폰트, 외부 CDN 없음 |

CodeMirror 코어를 직접 연결한다. React 래퍼는 필수 의존성으로 추가하지 않는다.
Tauri dialog 플러그인은 네이티브 선택창에 사용한다. 프론트엔드에 광범위한 파일시스템 API를 노출하지 않는다. 파일 IO는 아래의 문서 토큰 기반 Rust 서비스가 담당한다.

CodeMirror 패키지:
- @codemirror/state, @codemirror/view, @codemirror/commands
- @codemirror/search, @codemirror/language
- @codemirror/lang-markdown, @codemirror/lang-json
- @codemirror/lang-html, @codemirror/lang-javascript
- @codemirror/theme-one-dark

Rust 기본 의존성: tauri, tauri-plugin-dialog, serde, serde_json.
안전 저장·해시·문서 ID에는 tempfile, sha2, uuid 등 필요한 소형 의존성만 선택한다.
선택한 Node/Rust/Tauri/CodeMirror 버전과 지원 OS를 README에 기록한다.
package-lock.json, Cargo.lock을 커밋하고 Rust toolchain과 Node 버전을 고정한다.

## 3. UI/UX

### 기본 창
- 초기 1000×700, 최소 720×480 논리 px.
- 시스템 타이틀바 유지, 단일 창·여러 탭.
- 상단 툴바: 새 문서, 열기, 저장, 다른 이름으로 저장, 찾기, 설정.
- 탭 바: 파일명, 미저장 점 표시, 닫기 버튼.
- 본문: 줄 번호가 있는 편집기.
- 하단 상태바: 언어, UTF-8/BOM 여부, LF/CRLF, 줄·열, 문자 수.
- 처음 실행은 빈 ‘제목 없음 1’ 탭 하나.
- 탭이 0개가 되면 새 문서 버튼을 가진 빈 화면 표시.

### 디자인
| 요소 | 기본값 |
|---|---|
| 라이트 배경 | #F7F8FA, 편집 영역 #FFFFFF |
| 텍스트 | #18212F |
| 강조 | #3478F6 |
| 다크 편집기 | CodeMirror oneDark |
| UI 폰트 | 시스템 폰트, 13–14px |
| 편집기 폰트 | 시스템 monospace + 한글 fallback, 14px |
| 편집기 크기 | 10–28px, 기본 14px |
| 탭 상태 | 수정 점 + 스크린리더용 ‘수정됨’ 안내 |

설정은 앱 내부 패널로 표시한다. 테마·글자 크기·줄바꿈 변경은 문서를 수정된 상태로 만들지 않는다. 애니메이션은 최소화한다.

## 4. 문서 생성과 열기

### 새 문서
- 문서 ID 발급, 이름 ‘제목 없음 N’.
- 빈 문서, UTF-8 BOM 없음, LF, plain text.
- 초기 빈 문서는 dirty=false. 내용이 생기면 dirty=true.
- 미저장 상태에서 내용이 다시 빈 문자열이면 dirty=false.
- 새로운 문서를 만드는 작업은 다른 탭을 덮어쓰지 않는다.

### 파일 열기
- 네이티브 선택창에서 파일 하나 선택. 취소는 정상 결과.
- Rust가 실제 파일 경로를 받아 검증·읽기 후 문서 토큰을 발급한다.
- 파일 크기를 읽기 전 확인하고 실제 읽기도 5MiB 초과를 방지한다.
- 폴더, 심볼릭 링크, NUL 바이트가 있는 파일은 거부한다.
- UTF-8 BOM을 별도로 기록하고 UTF-8 strict 디코딩한다.
- 잘못된 UTF-8은 대체 문자로 강제 변환하지 않고 ‘UTF-8 텍스트 파일만 지원합니다’ 안내.
- UTF-16/EUC-KR 변환, 바이너리 편집은 MVP 밖이다.
- 확장자만으로 텍스트 여부를 판단하지 않는다.
- 경로의 공백·한글·이모지를 처리하고 Rust PathBuf를 원본으로 유지한다.
- 같은 실제 경로가 이미 열려 있으면 기존 탭 활성화.
- 중복은 canonical path 기준으로 검사. hard link 동일성 판별은 후속 범위.
- 열기 실패 시 기존 탭과 내용은 변경하지 않는다.
- 최대 탭 수 초과 시 새 파일 열기를 거부하고 안내한다.

### 개행 정책
- 편집기 내부 문자열은 LF로 정규화한다.
- 원본이 모두 CRLF면 저장할 때 CRLF 복원.
- 원본이 LF면 LF 유지.
- 혼합 개행 또는 단독 CR은 LF로 정규화할 예정임을 알리고 확인 후 연다.
- 원본의 마지막 개행 유무를 유지한다. 자동 추가/공백 정리는 하지 않는다.
- BOM 여부는 기존 파일에서 유지하고 새 파일은 BOM 없음.
- 개행 혼합 파일은 처음 열기만으로 dirty로 표시하지 않으며, 저장 시 개행 변경 정책을 명시한다.

## 5. 편집 엔진과 탭 상태

### 엔진 설정
CodeMirror 확장으로 구현:
- lineNumbers, 활성 줄 표시, 기본 선택/커서 동작
- history + historyKeymap + defaultKeymap
- search + searchKeymap + highlightSelectionMatches
- syntaxHighlighting, 언어별 extension
- lineWrapping을 설정에 따라 선택
- 키맵의 Tab 들여쓰기 + Shift+Tab 내어쓰기
- Escape 후 Tab 등 편집기 밖으로 포커스를 이동하는 접근성 동작 보장

미니맵, 다중 커서 전용 UI, LSP는 필수 기능이 아니다.
편집 코어의 지원 기능을 켜는 데 집중하며 커서·선택·실행 취소를 직접 만들지 않는다.

### React 연결
- EditorView 인스턴스 하나를 활성 편집 영역에 마운트한다.
- 탭마다 EditorState를 보관한다. 상태에는 해당 탭의 문서·선택·history가 포함된다.
- 탭 전환 직전 현재 view.state와 scroll 위치를 보관한다.
- 새 탭의 state를 view.setState로 적용하고 레이아웃 뒤 scroll 복원.
- 탭 전환 때 전체 문서를 replace하는 transaction을 만들지 않는다.
- 입력할 때마다 React가 EditorView를 파괴·재생성하지 않는다.
- React StrictMode에서도 view와 이벤트 리스너를 중복 생성하지 않는다.
- unmount 시 view.destroy, native listeners unlisten.
- 테마·줄바꿈·언어·글꼴은 Compartment reconfigure로 변경해 history를 유지한다.
- 설정 변경은 비활성 탭 state에도 적용한다. 순서와 history 유지 검증.
- updateListener는 document/selection 변화만 필요한 메타데이터에 반영한다.

### 상태 표시
- 줄·열은 1부터 시작. 열은 UTF-16 code unit 기준이라고 README에 명시.
- 문자 수는 Unicode code point 수; grapheme 수와 다를 수 있음.
- 긴 문서는 문자 수 계산을 debounce해 매 키 입력의 전체 문자열 복제를 줄인다.
- 내용 변경 판정은 현재 LF 문서와 마지막 성공 저장 snapshot 비교.
- undo로 마지막 저장 내용에 돌아오면 dirty=false.
- 선택·커서·테마 변경만으로 dirty를 켜지 않는다.

## 6. 저장과 파일 보호

### 저장
- 경로 없는 문서의 저장은 네이티브 ‘다른 이름으로 저장’으로 연결.
- 경로 있는 문서는 Rust registry의 토큰으로 저장 요청.
- 기본 파일명은 ‘제목 없음.txt’. 확장자가 없으면 .txt를 제안하되 명시적 사용자 선택을 존중.
- 내용은 LF snapshot을 캡처하고 저장 시 BOM/개행 정책으로 인코딩.
- 기존 파일은 저장 전 원본 해시를 비교해 외부 변경/삭제를 감지.
- 충돌 시 ‘취소 / 다른 이름으로 저장 / 외부 버전 다시 열기’를 제공.
- 충돌 상태에서 자동 덮어쓰기는 하지 않는다.
- 다시 열기는 미저장 변경을 버린다는 별도 확인 후 진행하고 history 초기화.
- 다른 이름으로 저장은 선택한 대상의 기존 존재 여부를 Rust에서 확인한다.
- 파일이 이미 존재하면 덮어쓰기 확인을 받는다.
- 다른 열린 탭이 사용하는 경로에는 저장하지 않는다. 기존 탭으로 이동 또는 다른 경로 선택.
- 저장 완료 전에 원본 토큰/경로·dirty를 성공 상태로 변경하지 않는다.

### 안전 저장
- 대상과 같은 디렉터리에 임시 파일 생성.
- 변환한 바이트 전체 쓰기 → flush/sync → 대상 교체.
- 플랫폼에서 검증된 교체 함수/라이브러리를 사용한다.
- 원본 파일을 먼저 삭제하거나 truncate한 뒤 쓰는 방식은 피한다.
- 기존 파일 권한을 가능한 범위에서 보존한다. 실행 비트/확장 속성/ACL 지원 범위는 README에 기록.
- 쓰기·교체 실패 시 원본과 메모리 문서를 유지하고 오류 표시.
- 임시 파일은 실패 시 정리; 원본 파일을 정리 대상으로 취급하지 않는다.
- 대상이 심볼릭 링크로 바뀐 경우 저장 거부.
- 저장 직전에 해시를 다시 검사한다. 검사 이후 다른 프로그램이 쓸 수 있는 경쟁 조건은 남으며 다중 프로세스 잠금/네트워크 파일시스템 보장은 MVP 밖이다.
- macOS/Windows 파일 교체의 실제 동작을 각각 확인한다. 한 OS 결과를 다른 OS로 추정하지 않는다.

### 비동기 저장과 편집
- 저장 중 동일 문서 저장 버튼/단축키 중복 요청을 막고 문서별 직렬화.
- 저장 대상 snapshot의 version을 기록.
- 저장 중 편집은 허용하지만 성공 응답은 저장했던 snapshot만 baseline으로 등록.
- 현재 내용이 그 snapshot과 다르면 dirty는 계속 true.
- 저장 응답 전에 탭을 닫으려 하면 해당 저장 완료를 기다리고 현재 dirty를 재검사.
- 다른 탭 이동 중 완료된 응답은 요청한 문서 ID에만 적용한다.
- 지연 응답이 다른 문서의 경로나 내용을 덮어쓰지 않는다.

## 7. 검색·바꾸기와 언어

### 검색
- Cmd/Ctrl+F: 현재 문서 검색.
- Cmd+Alt+F(macOS)/Ctrl+H(Windows): 바꾸기.
- CodeMirror 검색 패널을 활용하고 이전/다음, 단일 바꾸기, 모두 바꾸기 제공.
- 첫 버전은 일반 텍스트 검색으로 시작. 대소문자 옵션 제공.
- 정규식 옵션은 비활성화해 대량 입력에서 복잡한 정규식 정책을 후속으로 둔다.
- 모두 바꾸기는 undo로 복원되어야 한다.
- 탭 전환 시 검색 패널의 대상이 현재 문서인지 확인.
- 한글 검색과 한글 바꾸기를 검증.

### 언어
| 확장자 | 모드 |
|---|---|
| .txt / 알 수 없음 | Plain Text |
| .md / .markdown | Markdown |
| .json | JSON |
| .html / .htm | HTML |
| .js / .mjs / .cjs | JavaScript |

저장 이름 변경 후 언어를 재감지한다. JSON 모드는 구문 강조를 의미하며 자동 포맷이나 오류 진단을 필수로 포함하지 않는다. HTML/JS는 텍스트로만 취급하고 앱 내부에서 실행하지 않는다.

## 8. 탭 닫기와 앱 종료

### 탭 닫기
- clean: 바로 닫기, Rust registry 토큰 해제.
- dirty: ‘저장 / 버리기 / 취소’ 3개 선택.
- 저장 선택: 저장 성공 AND 최신 내용이 clean일 때만 닫기.
- 저장창 취소/실패/새 편집이 있으면 탭 유지.
- 버리기: 확인한 시점의 문서를 닫기.
- 취소: 문서·탭·선택 유지.

### 앱 종료
- 빨간 닫기 버튼, Cmd+Q, 메뉴 종료를 하나의 close coordinator로 통합.
- 여러 dirty 탭은 ‘모두 저장 / 모두 버리기 / 취소’ 목록 대화상자.
- 종료 판단 동안 편집·새 탭·저장 명령을 잠시 잠그고 중복 종료 요청 무시.
- 모두 저장은 문서 순서대로 저장; 하나라도 취소/실패하면 종료 중단.
- 앞서 성공적으로 저장된 파일은 되돌리지 않고 남은 변경을 유지.
- OS 강제 종료·프로세스 kill·전원 종료까지 막는다고 주장하지 않는다.

Tauri close/exit 이벤트는 Rust에서 기본 종료를 먼저 막고 프론트엔드 coordinator에 요청 이벤트를 보낸다. 승인 후 Rust의 제한된 finish_close 명령으로 현재 창을 종료한다. 승인 플래그와 요청 ID로 재진입 루프를 방지한다.
OS 메뉴와 Cmd+Q가 guard를 우회하지 않는지 실제 Mac에서 확인한다.
프론트엔드 window.onCloseRequested만 구현하고 앱 전체 종료가 처리됐다고 판단하지 않는다.

첫 버전은 단일 창을 닫으면 앱을 종료하는 정책이다. 창 숨김·트레이 백그라운드 기능은 없다.

## 9. 설정 저장과 복구 범위

설정:
- theme: light/dark, 기본 light.
- fontSize: 10..28, 기본 14.
- wordWrap: boolean, 기본 true.

앱 config 디렉터리 settings.json에 변경을 debounce하여 저장한다.
serde 검증, 버전 필드, 손상 시 기본값 복구, 안전 파일 교체를 사용한다.
설정 저장 실패는 안내하고 편집은 계속 허용한다.
문서 내용은 settings.json에 저장하지 않는다.

MVP는 재실행 시 새 빈 탭을 연다. 미저장 문서 자동 복구는 P2다.
일반적인 닫기는 저장 확인으로 보호하지만 강제 종료 전 변경 복구는 보장하지 않는다.
복구 기능을 추가할 때는 앱 데이터 폴더의 복구 초안과 사용자 원본 파일 저장을 분리하고 재실행 시 ‘복구/버리기’를 제공한다.

## 10. 데이터 모델

    interface DocumentTab {
      id: string;
      title: string;
      fileToken: string | null;
      displayPath: string | null;
      language: 'text' | 'markdown' | 'json' | 'html' | 'javascript';
      eol: 'LF' | 'CRLF';
      hasUtf8Bom: boolean;
      savedContent: string;
      editVersion: number;
      dirty: boolean;
      saving: boolean;
    }

    interface EditorSession {
      state: EditorState;
      scrollTop: number;
      scrollLeft: number;
    }

    interface Settings {
      schemaVersion: 1;
      theme: 'light' | 'dark';
      fontSize: number;
      wordWrap: boolean;
    }

EditorState는 ID별 registry에, 문서 메타데이터는 React store/reducer에 둔다.
실제 DocumentTab은 savedContent와 현재 editor 문서를 기준으로 dirty를 파생한다.
Rust registry는 fileToken → canonical PathBuf, 원본 바이트 해시, BOM/EOL, 소유 문서 ID를 보관한다.
새 문서는 첫 저장 성공 시 토큰을 발급한다. 토큰은 실행 중만 유효하다.

## 11. Native 명령 계약

| command | 입력 | 결과 |
|---|---|---|
| open_document | 없음 | 취소 또는 token/path/content/encoding 정보 |
| save_document | fileToken, LF content, version | 성공 token/path/hash/version 또는 오류 |
| save_document_as | 문서 ID, 기존 token(optional), LF content, encoding, version | 선택창/덮어쓰기 확인 후 결과 |
| release_document | token | registry 정리 |
| load_settings | 없음 | 정규화된 Settings |
| save_settings | Settings | 성공 또는 오류 |
| finish_close | 현재 close request ID | 승인된 종료만 실행 |

- 명령은 main 창 호출자만 허용하고 인자 크기/enum/token 소유를 Rust에서 검증한다.
- 프론트엔드가 전달한 임의 경로로 파일을 읽거나 쓰지 않는다.
- 저장 경로는 Rust의 네이티브 선택창 또는 이미 허용된 registry에서만 얻는다.
- save_document_as의 기존 token 변경은 성공 후에만 반영한다.
- 파일 선택 취소는 오류가 아닌 cancelled 결과.
- 오류는 INVALID_UTF8, FILE_TOO_LARGE, FILE_CONFLICT, PERMISSION_DENIED, WRITE_FAILED 등 코드와 한국어 메시지로 전달.
- dialog/IO는 async 또는 적절한 blocking worker로 처리해 UI thread를 막지 않는다.
- mutex를 잡은 채 네이티브 대화상자 응답이나 긴 IO를 기다리지 않는다.
- 읽기/쓰기 권한 정책을 Rust command 내에 구현한다. 플러그인 capability가 사용자 정의 파일 IO를 자동으로 제한한다고 가정하지 않는다.

## 12. 보안·접근성

- main 창은 로컬 번들 UI만 로드, 외부 탐색/새 창 기본 차단.
- 프로덕션 CSP는 로컬 asset만 허용. Vite 개발 예외를 배포에 남기지 않는다.
- capability는 main 창과 필요한 API로 제한; shell 실행과 전체 디스크 fs scope를 추가하지 않는다.
- 문서 내용을 innerHTML로 렌더링하지 않는다.
- CodeMirror 문법 색칠만 수행하고 HTML/JS 문서 실행 금지.
- 프로그램 경로나 명령 실행을 문서 내용에서 추출하지 않는다.
- 복사·붙여넣기는 표준 편집 이벤트/OS 메뉴 사용; 불필요한 clipboard plugin은 추가하지 않는다.
- 아이콘 버튼 aria-label, Tab 포커스 순서, 포커스 복귀 구현.
- 한글 IME 조합 중 커스텀 단축키가 Enter/Space 등을 가로채지 않는다.
- 선택·커서 상태를 매 키 입력마다 screen reader에 강제로 알리지 않는다.
- 타사 라이선스 고지 포함. 제품명·아이콘은 NextPad 자체 디자인.

## 13. 단축키와 메뉴

macOS Cmd, Windows Ctrl을 Mod로 표현한다.
| 동작 | 단축키 |
|---|---|
| 새 문서 | Mod+N |
| 열기 | Mod+O |
| 저장 | Mod+S |
| 다른 이름으로 저장 | Mod+Shift+S |
| 탭 닫기 | Mod+W |
| 찾기 | Mod+F |
| 실행 취소 | Mod+Z |
| 다시 실행 | Cmd+Shift+Z / Ctrl+Y |
| 전체 선택 | Mod+A |

앱 단축키와 CodeMirror 키맵의 중복 처리 방지.
native 메뉴의 New/Open/Save/Quit는 동일한 action coordinator를 호출.
macOS Edit 메뉴는 복사·붙여넣기·전체 선택 등 기본 역할 제공.
Settings 입력 필드에서는 해당 필드의 기본 undo/선택 동작을 존중한다.
전역 단축키는 등록하지 않는다.

## 14. 권장 프로젝트 구조

    nextpad/
      package.json
      package-lock.json
      vite.config.ts
      tsconfig.json
      index.html
      .nvmrc
      README.md
      src/
        main.tsx
        App.tsx
        styles.css
        components/
          Toolbar.tsx
          TabBar.tsx
          EditorPane.tsx
          StatusBar.tsx
          SettingsPanel.tsx
          UnsavedDialog.tsx
        editor/
          create-editor.ts
          session-registry.ts
          extensions.ts
          languages.ts
        documents/
          reducer.ts
          document-service.ts
          close-coordinator.ts
        native/commands.ts
        types.ts
        tests/
      src-tauri/
        Cargo.toml
        Cargo.lock
        rust-toolchain.toml
        tauri.conf.json
        capabilities/default.json
        icons/
        src/
          lib.rs
          main.rs
          commands.rs
          file_service.rs
          document_registry.rs
          settings.rs
          lifecycle.rs
        tests/

UI와 native API는 작은 adapter로 연결한다. 구현 주석과 README는 한국어로 작성한다.

## 15. 개발·빌드

### 실행 환경
- Node.js, Rust toolchain과 OS별 native 빌드 도구를 먼저 확인한다.
- macOS는 Xcode Command Line Tools, Windows는 Microsoft C++ Build Tools와 WebView2를 준비한다.
- 지원 OS와 Node/Rust 버전은 선택한 의존성과 맞춰 README에 고정한다.
- 브라우저 UI 실행만으로 파일/종료 기능을 검증하지 않는다.

### 초기화
    npm create tauri-app@latest

프로젝트 이름 nextpad, 프론트엔드 React/TypeScript, 패키지 매니저 npm 선택.
개발 시작 전에 React/Vite 생성 결과와 Tauri 2 엔트리 설정을 확인한다.
공식 dialog plugin은 JS/Rust 대응 버전을 함께 설치·등록한다.
필요한 CodeMirror 패키지를 설치하고 실제 Tauri 창을 먼저 띄운다.

    npm install
    npm run tauri dev

### scripts 계약
| 명령 | 목적 |
|---|---|
| npm run dev | Vite UI 개발 서버; native 기능 검증 아님 |
| npm run tauri dev | 실제 데스크톱 개발 실행 |
| npm run typecheck | TypeScript 검사 |
| npm test | 의미 있는 문서/탭/저장 coordinator 검사 |
| cargo test (src-tauri에서) | 인코딩·개행·파일 저장·registry 검사 |
| npm run tauri build | Release 번들·앱 생성 |

### 패키징과 용량
- macOS .app/.dmg, Windows는 후속 .msi/NSIS installer.
- macOS 첫 빌드는 호스트 단일 architecture; universal은 별도 목표.
- 일반적인 출력은 src-tauri/target/release/bundle 아래이며 실제 생성 경로를 README에 기록.
- Release profile은 opt-level="s", lto=true, codegen-units=1, strip=true를 시작점으로 검증.
- 크기 최적화 이후에도 기존 기능 검사를 통과해야 한다. 수치만 줄이려고 파일 IO 실패 처리를 제거하지 않는다.
- Windows는 기본 WebView2 다운로드/시스템 런타임 전략 우선. 오프라인 전체 런타임 포함은 별도 설치 정책.
- 앱 자체 크기와 압축 설치 파일, 개발 폴더 크기를 각각 측정.
- 개발 폴더의 node_modules 및 Rust target은 클 수 있다. 경량 앱이 경량 개발 폴더를 보장하지 않는다.
- 소스 공유본과 Git에는 src, src-tauri 소스/설정, lockfile, 아이콘, README 포함.
- node_modules, target, dist 등 재생성 산출물은 제외.
- 목표 용량을 확정 수치로 약속하지 않고 실제 Release 결과를 기록.
- 다른 기기에 공개 배포할 때 서명·공증/설치 검증은 별도 수행.
- Gatekeeper 등의 OS 보안을 일괄 해제하는 배포 방법을 사용하지 않는다.

## 16. 검증·수용 기준

| ID | 검증 | 통과 기준 |
|---|---|---|
| T01 | 첫 실행/새 문서 | 빈 탭, 바로 입력 가능 |
| T02 | UTF-8 열기 | 한글·이모지·공백 경로 정상 |
| T03 | 저장/다른 이름 저장 | 정확한 내용과 경로, 성공 후 dirty 해제 |
| T04 | 취소/읽기·쓰기 실패 | 문서 유지, 거짓 성공 표시 없음 |
| T05 | 탭 전환 | 내용·선택·history·scroll 유지 |
| T06 | undo/redo | 다른 탭 기록 침범 없음, baseline 복귀 시 clean |
| T07 | 검색/전체 바꾸기 | 한글 검색, undo 복원 |
| T08 | dirty 탭 닫기 | 저장/버리기/취소 각 동작 일치 |
| T09 | 앱 닫기/Cmd+Q | 모든 dirty 확인, 실패·취소 시 종료 차단 |
| T10 | IME | 한글 조합·붙여넣기·검색 정상 |
| T11 | 인코딩/개행 | UTF-8 BOM·LF/CRLF·마지막 개행 유지 |
| T12 | 바이너리/대용량 | 열기 거부, 기존 문서 유지 |
| T13 | 외부 변경 | 원본 충돌 감지, 조용한 덮어쓰기 없음 |
| T14 | 저장 중 입력 | 저장했던 snapshot만 baseline, 새 편집은 dirty 유지 |
| T15 | 중복 경로 | 기존 탭 활성화, Save As 충돌 차단 |
| T16 | 테마/글꼴/줄바꿈 | history 유지, 설정 재실행 복구 |
| T17 | 교체 실패 | 원본 온전, dirty 유지 |
| T18 | Release 앱 | 개발 서버 없이 오프라인 실행·저장 가능 |

자동 검사는 범위 검증, 개행/BOM 왕복, dirty 계산, 비동기 저장 경쟁, 종료 취소, 안전 저장 실패를 집중한다.
네이티브 선택창·한글 IME·메뉴·Cmd+Q·파일 권한·.app 실행은 Mac에서 확인.
Windows 미검증 항목은 명시하고 지원 완료로 표시하지 않는다.
문서당 5MiB 이내에서 기본 편집·찾기의 실제 응답성을 측정; 느리면 제한/설정을 조정하고 기록.

## 17. 실습 단계

| 단계 | 결과 |
|---|---|
| 1 | Tauri 창과 단일 CodeMirror 편집기 실행 |
| 2 | Rust dialog/UTF-8 열기·안전 저장 구현 |
| 3 | 탭별 EditorState·dirty·history 구현 |
| 4 | 검색·언어·테마·설정·상태바 |
| 5 | 저장 확인·외부 변경·IME 검증 |
| 6 | Release 빌드, 설치·용량·오프라인 확인 |

Rust 환경과 의존성 다운로드는 수업 전에 준비한다. 완성 시간은 환경에 따라 달라지며 당일 구현을 보장하지 않는다. 시간이 부족하면 P2는 추가하지 않고 P0 데이터 보호에 집중한다.

## 18. Codex 구현 지시문

    이 SPEC에 따라 NextPad 데스크톱 앱을 구현하세요.
    React/Vite/TypeScript, CodeMirror 6, Tauri 2를 사용하세요.
    macOS 우선으로 P0/P1만 구현하고 버전/지원 OS를 README에 기록하세요.
    먼저 Tauri 창과 편집기를 실행한 뒤 파일 열기·저장부터 연결하세요.
    네이티브 dialog는 Rust에서 사용하고 파일 권한은 문서 토큰 registry로 제한하세요.
    탭마다 EditorState와 history를 보존하고 재마운트로 편집 기록을 잃지 않게 하세요.
    UTF-8 strict 검증, BOM/개행 유지, 안전 저장, 외부 변경 충돌 처리를 구현하세요.
    저장 중 새 편집과 종료 요청의 경쟁 조건을 처리하세요.
    탭 닫기, 창 닫기, Cmd+Q, 메뉴 종료를 같은 저장 확인 흐름에 연결하세요.
    파일 취소·저장 실패 시 문서를 유지하세요.
    외부 API/AI/DB/터미널/미리보기/자동 복구를 추가하지 마세요.
    타입 검사와 의미 있는 TS/Rust 검사를 실행하세요.
    실제 Mac에서 확인하지 못한 IME/메뉴/패키징은 미검증으로 기록하세요.
    마지막으로 Release .app 경로, 실행법, 측정한 앱 크기와 소스 공유본 크기를 보고하세요.

## 19. 공식 참고자료

확인일 2026-10-12. 기능 범위·5MiB 제한·저장 정책은 본 프로젝트의 설계 결정이다.

- CodeMirror 기능: https://codemirror.net/
- CodeMirror System Guide: https://codemirror.net/docs/guide/
- CodeMirror Reference: https://codemirror.net/docs/ref/
- Tauri 사전 준비: https://v2.tauri.app/start/prerequisites/
- Tauri Dialog: https://v2.tauri.app/plugin/dialog/
- Tauri 권한: https://v2.tauri.app/learn/security/using-plugin-permissions/
- Tauri App Size: https://v2.tauri.app/concept/size/
- Tauri Windows installer: https://v2.tauri.app/distribute/windows-installer/

문서 작성 완료는 구현·검증 완료를 의미하지 않는다. 수용 기준은 실제 빌드 단계에서 확인한다.
