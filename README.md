# TIMS - 테스트 이슈 관리 시스템

SI 프로젝트의 단위테스트·통합테스트에서 발견된 이슈(결함)를 등록하고, 담당자 지정부터 조치, 재테스트, 종료까지 추적하는 경량 웹 시스템입니다. 데이터베이스 없이 JSON 파일에 저장하며, 결함관리대장 엑셀 내보내기/가져오기를 지원합니다.

## 주요 기능

| 기능 | 설명 |
|---|---|
| 이슈 등록 | 단위(UT)/통합(IT) 구분별 자동 채번(`UT-0001`), 심각도별 조치 기한 자동 계산, 스크린샷 붙여넣기(Ctrl+V) 첨부 |
| 목록/검색 | 상태·심각도·모듈·담당자·기간·키워드 검색, 빠른 필터(내 담당, 재테스트 대기, 기한 초과 등), 정렬·페이징 |
| 상태 관리 | 신규 → 접수 → 조치중 → 조치완료 → 종료 흐름, 재테스트 Fail 시 자동 재오픈, 반려·이의 제기, PL/PM 강제 변경 |
| 조치/재테스트 | 차수별 조치 내역(원인 분류, 조치 내용, 수정 대상), 재테스트 결과(Pass/Fail) 누적 기록 |
| 이력/코멘트 | 모든 변경을 자동 기록하고 코멘트와 함께 시간순 타임라인으로 표시 |
| 대시보드 | 상태별·심각도별·모듈별·담당자별 현황, 조치율, 일자별 추이, 장기 미조치 목록 |
| 엑셀 | 결함관리대장 양식 내보내기, 기존 대장 일괄 가져오기(행별 검증 후 등록) |
| 설정 | 사용자·역할, 모듈, 테스트 차수, 조치 기한 기준값 관리 |

### 역할

| 역할 | 할 수 있는 일 |
|---|---|
| 테스터 | 이슈 등록, 재테스트, 본인 발견 이슈 수정·이의 제기 |
| 개발자 | 본인 담당 이슈 착수·조치 등록·조치완료 |
| PL/PM | 담당자 지정·재지정, 반려, 재오픈, 강제 변경, 삭제, 엑셀 가져오기, 설정 변경 |

로그인 없이 화면 상단에서 사용자를 선택하는 방식입니다. 역할 제한은 업무 실수 방지용이며 보안 통제 수단이 아니므로 **내부망에서만 사용**하세요.

## 기술 스택

- 서버: Node.js 20 이상, Express 5, exceljs, multer, zod
- 화면: React 18, Vite, TypeScript, Ant Design, TanStack Query, Recharts
- 저장소: JSON 파일 (`data/issues.json`, `data/config.json`)

## 설치 및 실행

```bash
npm install

# 운영: 화면 빌드 후 서버 실행 (http://localhost:3000)
npm run build
npm start

# 개발: 서버(3000) + 화면 개발 서버(5173) 동시 실행 (http://localhost:5173)
npm run dev
```

처음 실행하면 `data/` 폴더와 기본 설정이 생성되고 관리자 사용자(`u-admin`) 한 명만 등록되어 있습니다. 관리자로 접속해 **설정** 화면에서 사용자와 모듈을 먼저 등록하세요.

### npm 스크립트

| 스크립트 | 설명 |
|---|---|
| `npm start` | 서버 실행 (빌드된 화면 `dist/web` 함께 제공) |
| `npm run build` | 화면 빌드 |
| `npm run dev` | 서버와 화면 개발 서버 동시 실행 (코드 변경 시 자동 반영) |
| `npm run typecheck` | 서버·화면 타입 검사 |

### 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 서버 포트 |
| `TIMS_DATA_DIR` | `./data` | 데이터 파일·첨부·백업 폴더 |
| `TIMS_LOG_DIR` | `./logs` | 오류 로그 폴더 |

## 다른 PC·휴대폰에서 접속

같은 네트워크(Wi-Fi)에 있다면 서버 PC의 내부 IP로 접속합니다.

1. 서버 PC에서 `ipconfig`를 실행해 Wi-Fi의 IPv4 주소를 확인합니다(예: `192.168.45.219`).
2. 다른 기기 브라우저에서 `http://192.168.45.219:3000`으로 접속합니다.
3. 접속이 안 되면 서버 PC에서 관리자 권한 PowerShell로 방화벽을 허용합니다.

```powershell
New-NetFirewallRule -DisplayName "TIMS 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
```

화면은 PC 기준으로 만들어져 있어 휴대폰에서는 표와 메뉴가 좁게 보일 수 있습니다.

## 데이터 관리

| 경로 | 내용 |
|---|---|
| `data/issues.json` | 이슈 전체와 ID 채번 정보 |
| `data/config.json` | 프로젝트 정보, 사용자, 모듈, 기준값 |
| `data/attachments/{이슈ID}/` | 첨부파일 실물 |
| `data/backup/` | 자동 백업 (서버 시작 시 + 매일 00:00, 기본 30일 보관) |
| `logs/` | 일별 오류 로그 (30일 보관) |

- **서버는 하나만 실행**해야 합니다. 같은 데이터 폴더로 두 번째 서버를 띄우면 `data/.lock` 때문에 시작되지 않습니다.
- 저장은 임시 파일에 쓴 뒤 교체하는 방식이라 저장 중 서버가 꺼져도 파일이 손상되지 않습니다.
- 여러 명이 같은 이슈를 동시에 수정하면 나중에 저장한 사람에게 "다른 사용자가 먼저 수정했습니다" 안내가 표시됩니다.
- 첨부파일 폴더는 자동 백업 대상이 아닙니다. `data/` 폴더 전체를 주기적으로 외부 저장소에 복사하세요.

### 복구

1. 서버를 중지합니다.
2. `data/backup/`에서 원하는 시점의 `issues_yyyyMMdd_HHmmss.json`을 `data/issues.json`으로 복사합니다(설정은 `config_...json` → `data/config.json`).
3. 서버를 다시 시작합니다.

## 폴더 구조

```text
├─ docs/                  기능정의서, 상세설계서
├─ shared/                서버·화면 공용 (코드값, 타입, 검증 스키마, 상태 전이표)
├─ server/
│  ├─ index.ts            서버 시작, 잠금, 백업 스케줄
│  ├─ routes/             REST API
│  ├─ services/           이슈·워크플로우·통계·엑셀 처리
│  ├─ repository/         JSON 파일 저장소 (원자적 쓰기, 쓰기 큐)
│  └─ middleware/         사용자 식별, 오류 처리
├─ web/src/
│  ├─ pages/              대시보드, 이슈 목록·등록·상세, 가져오기, 설정
│  ├─ components/         공통 레이아웃, 태그, 오류 표시
│  └─ api/                API 호출
├─ data/                  실행 시 생성 (git 제외)
└─ logs/                  실행 시 생성 (git 제외)
```

## API 요약

모든 API는 `/api` 아래에 있으며, 변경 요청은 `X-User-Id` 헤더가 필요합니다. 상세 명세는 [상세설계서 4장](docs/02_상세설계서.md#4-api-설계)을 참고하세요.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET / POST | `/api/issues` | 이슈 검색 / 등록 |
| GET / PATCH / DELETE | `/api/issues/:id` | 이슈 상세 / 수정 / 삭제 |
| POST | `/api/issues/:id/transitions` | 상태 전이 |
| POST | `/api/issues/:id/resolutions` | 조치 등록 |
| POST | `/api/issues/:id/retests` | 재테스트 등록 |
| POST | `/api/issues/:id/comments` | 코멘트 등록 |
| POST | `/api/issues/:id/attachments` | 첨부 업로드 |
| GET | `/api/attachments/:attachmentId` | 첨부 다운로드 |
| GET | `/api/stats` | 대시보드 집계 |
| GET | `/api/export` | 엑셀 내보내기 |
| GET / POST | `/api/import/template`, `/api/import/preview`, `/api/import/commit` | 엑셀 가져오기 |
| GET / PUT | `/api/config` | 설정 조회 / 저장 |

## 문서

- [기능정의서](docs/01_기능정의서.md)
- [상세설계서](docs/02_상세설계서.md)
