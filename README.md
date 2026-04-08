# Macro Clicker

Chrome extension for automated element clicking with configurable intervals and page refresh.

## Features

- **Element Picker** - 페이지에서 클릭할 요소를 직접 선택 (Shadow DOM 기반 오버레이)
- **Auto Clicker** - 선택한 요소를 ms 단위 간격으로 자동 클릭
- **Page Refresh** - 설정한 주기(초 단위)로 페이지 자동 새로고침
- **Repeat Count** - 클릭 횟수 제한 (0 = 무제한)
- **Saved Configs** - 설정을 저장하고 다시 불러오기
- **Auto Resume** - 페이지 새로고침 후 자동으로 클릭 재개

## Architecture

```
src/
  background/
    service-worker.ts  # 새로고침 타이머, 상태 관리, 메시지 라우팅
  content/
    picker.ts          # Shadow DOM 요소 선택 오버레이
    clicker.ts         # setInterval 기반 자동 클릭 루프
  popup/
    popup.html/css/ts  # Setup/Saved 탭, 실행 상태 표시
  shared/
    types.ts           # SelectorSet, MacroConfig, ActiveState, Message 타입
    storage.ts         # chrome.storage.local 래퍼
    selector.ts        # 멀티 전략 셀렉터 엔진
```

### Selector Engine

요소를 찾을 때 6단계 우선순위로 시도:

1. `id` / `data-testid`
2. ARIA label + role
3. CSS selector (unique match)
4. XPath (unique match)
5. Text content (fuzzy match)
6. CSS selector (relaxed, fallback)

### Key Design Decisions

- **Content script이 storage를 직접 읽어 self-start** - 페이지 새로고침 시 서비스 워커 메시지 타이밍에 의존하지 않음
- **setTimeout 체이닝으로 새로고침** - chrome.alarms는 1분 최소 주기 제한이 있어 sub-minute 새로고침 불가
- **Click count 보고 1초 throttle** - 빠른 간격(10ms)에서 storage 쓰기 병목 방지

## Setup

```bash
yarn install
yarn build
```

## Development

```bash
yarn dev
```

## Chrome에 로드하기

1. `chrome://extensions` 열기
2. "개발자 모드" 켜기
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. `dist` 폴더 선택

## Tech Stack

- TypeScript
- Vite + @crxjs/vite-plugin
- Chrome Extension Manifest V3
- chrome.storage.local
