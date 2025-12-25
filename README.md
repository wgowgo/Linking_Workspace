# 🔗 Linking Workspace

## 🇰🇷 링킹 워크스페이스 · 🇺🇸 Linking Workspace

### Chrome 확장 프로그램으로 노트, 할 일, 하이라이트, 북마크를 **폴더 관리, 다국어 지원, 다크 모드**와 함께 <br/> 체계적으로 관리할 수 있는 생산성 도구입니다.

### A Chrome extension productivity tool that helps you organize **notes, tasks, highlights, and bookmarks** with <br/> folder management, multilingual support, and dark mode.

---

# 주요 기능 · Features

## 🇰🇷 한국어

- **노트 관리**: 무제한 노트 생성, 폴더 정리, 제목/내용 검색, 실시간 자동 저장

- **할 일 관리**: 완료 추적, 폴더 정리, 드래그 앤 드롭 순서 변경

- **하이라이트**: 웹 페이지 텍스트 하이라이트 저장, 폴더 정리, 원본 URL 빠른 접근

- **나중에 보기**: 커스텀 이름으로 URL 저장, 폴더 정리, 빠른 접근

- **도구 모음**: URL 정리, URL 단축, 광고 차단, 포모도로 타이머

- **폴더 관리**: 무제한 폴더 생성, 드래그 앤 드롭, 항목 순서 변경

- **다국어 지원**: 한국어, 영어, 일본어, 중국어, 프랑스어, 아랍어

- **다크 모드**: 아름다운 다크 테마, 자동 테마 전환

## 🇺🇸 English

- **Notes Management**: Unlimited notes, folder organization, search by title/content, real-time auto-save

- **Tasks Management**: Completion tracking, folder organization, drag-and-drop reordering

- **Highlights**: Save highlighted text from web pages, folder organization, quick access to source URLs

- **Read Later**: Save URLs with custom names, folder organization, quick access

- **Tools Suite**: URL cleaner, URL shortener, ad blocker, Pomodoro timer

- **Folder Management**: Unlimited folders, drag-and-drop, item reordering

- **Multilingual Support**: Korean, English, Japanese, Chinese, French, Arabic

- **Dark Mode**: Beautiful dark theme, automatic theme switching

---

# 폴더 구조 · Folder Structure

```
Linking-Workspace/
├── _locales/                    ← 다국어 메시지 파일
│   ├── ko/
│   │   └── messages.json       ← 한국어
│   ├── en/
│   │   └── messages.json       ← 영어
│   ├── ja/
│   │   └── messages.json       ← 일본어
│   ├── zh/
│   │   └── messages.json       ← 중국어
│   ├── fr/
│   │   └── messages.json       ← 프랑스어
│   └── ar/
│       └── messages.json       ← 아랍어
├── background.js                ← 백그라운드 서비스 워커
├── content.js                   ← 콘텐츠 스크립트
├── popup.html                   ← 팝업 UI
├── popup.js                     ← 팝업 로직
├── popup.css                    ← 팝업 스타일
├── reader.css                   ← 리더 모드 스타일
├── i18n.js                      ← 다국어 지원 유틸리티
└── manifest.json                ← 확장 프로그램 매니페스트
```

---

# 사용 방법 · How to Use

## 🇰🇷 한국어

### 1) 노트 작성

- 팝업에서 **"Notes"** 탭 클릭

- **"New Page"** 버튼으로 새 노트 생성

- 제목과 내용 입력 (자동 저장)

### 2) 할 일 관리

- **"Tasks"** 탭에서 할 일 추가

- 체크박스로 완료 표시

- 드래그 앤 드롭으로 순서 변경

### 3) 하이라이트

- 웹 페이지에서 텍스트 선택

- 우클릭 → **"Linking Workspace"** → **"Highlight"**

- 선택한 텍스트가 자동 저장됨

### 4) 나중에 보기

- 방법 1: 우클릭 → **"Linking Workspace"** → **"Read Later"**

- 방법 2: 팝업 → **"Read Later"** 탭 → **"+"** 버튼 → 이름과 URL 입력

### 5) 폴더 관리

- 각 섹션의 **"📁"** 버튼으로 새 폴더 생성

- 항목을 드래그하여 폴더로 이동

- 폴더 내 항목도 드래그로 순서 변경

### 6) 도구 사용

**Tools 탭에서:**

- **URL 정리**: 추적 파라미터 제거된 깔끔한 URL 생성

- **URL 단축**: 긴 URL을 짧게 단축

- **광고 차단**: 팝업 광고 및 Google AdSense 광고 전역 차단 (토글)

- **포모도로 타이머**: 시/분/초 단위 시간 설정, 종료 시 알림

### 7) 언어/테마 변경

- 좌측 상단 언어 선택 드롭다운에서 언어 변경

- 테마 토글 버튼으로 다크/라이트 모드 전환

---

## 🇺🇸 English

### 1) Create Notes

- Click the **"Notes"** tab in the popup

- Click **"New Page"** to create a new note

- Enter title and content (auto-saved)

### 2) Manage Tasks

- Add tasks in the **"Tasks"** tab

- Check boxes to mark completion

- Drag and drop to reorder

### 3) Highlights

- Select text on a web page

- Right-click → **"Linking Workspace"** → **"Highlight"**

- Selected text is automatically saved

### 4) Read Later

- Method 1: Right-click → **"Linking Workspace"** → **"Read Later"**

- Method 2: Popup → **"Read Later"** tab → **"+"** button → Enter name and URL

### 5) Folder Management

- Click **"📁"** button in any section to create a new folder

- Drag items to folders

- Reorder items within folders via drag-and-drop

### 6) Tools

**In the Tools tab:**

- **Clean URL**: Generate clean URLs with tracking parameters removed

- **Shorten URL**: Shorten long URLs

- **Remove Ads**: Global ad blocker for pop-ups and Google AdSense (toggle)

- **Pomodoro Timer**: Set time in hours/minutes/seconds, get notifications when time is up

### 7) Language/Theme

- Change language from the dropdown in the top-left

- Toggle theme button for dark/light mode

---

# ⚠️ 주의 사항 · Notes

## 🇰🇷 한국어

- **저장 공간**: 최대 10MB (설정에서 사용량 확인 가능)

- **데이터 저장**: 모든 데이터는 브라우저 로컬 저장소에 저장 (외부 서버 전송 없음)

- **URL 단축**: TinyURL 서비스를 사용하여 외부 API 호출

- **키보드 단축키**: 기본값 `Ctrl+Shift+C` (Windows/Linux) 또는 `Command+Shift+C` (Mac)

- **권한**: storage, activeTab, scripting, contextMenus, windows, notifications 필요

- **브라우저**: Chrome 기반 브라우저 (Chrome, Edge, Brave 등)에서 작동

## 🇺🇸 English

- **Storage Limit**: Maximum 10MB (check usage in Settings)

- **Data Storage**: All data stored locally in browser (no external server transmission)

- **URL Shortening**: Uses TinyURL service (external API call)

- **Keyboard Shortcut**: Default `Ctrl+Shift+C` (Windows/Linux) or `Command+Shift+C` (Mac)

- **Permissions**: Requires storage, activeTab, scripting, contextMenus, windows, notifications

- **Browser**: Works on Chrome-based browsers (Chrome, Edge, Brave, etc.)

---

# 설치 방법 · Installation

## 🇰🇷 한국어

### Chrome 웹 스토어에서

1. Chrome 웹 스토어 방문

2. "Linking Workspace" 검색

3. "Chrome에 추가" 클릭

### 수동 설치

1. 저장소 다운로드 또는 클론

2. Chrome에서 `chrome://extensions/` 이동

3. "개발자 모드" 활성화

4. "압축해제된 확장 프로그램을 로드합니다" 클릭

5. 확장 프로그램 디렉토리 선택

## 🇺🇸 English

### From Chrome Web Store

1. Visit Chrome Web Store

2. Search for "Linking Workspace"

3. Click "Add to Chrome"

### Manual Installation

1. Download or clone this repository

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode"

4. Click "Load unpacked"

5. Select the extension directory

---

# 버전 · Version

**Current Version / 현재 버전**: 1.1.0

---

# 기여하기 · Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

기여를 환영합니다! Pull Request를 자유롭게 제출해주세요.

---

# 라이선스 · License

This project is open source and available under the MIT License.

이 프로젝트는 오픈 소스이며 MIT 라이선스 하에 제공됩니다.
