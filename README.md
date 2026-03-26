# Focus. - To-Do List Application (Backend)

초보자도 쉽게 백엔드 시스템을 이해하고 API를 활용할 수 있도록 작성된 Focus. 프로젝트의 백엔드 명세서입니다.

---

### 1. Feature List

이 프로젝트의 백엔드는 **Node.js** 와 **Express.js** 를 기반으로 동작하며, 안전한 데이터 보관과 외부 서비스 연동을 담당합니다.

- **데이터베이스 (PostgreSQL 연동)**
  - 애플리케이션의 모든 데이터(사용자 정보, 할일 목록 등)는 PostgreSQL(관계형 데이터베이스)에 안전하게 저장됩니다.
  
- **사용자 인증 (Google OAuth & JWT)**
  - `Passport.js`를 이용해 구글 로그인(OAuth 2.0)을 지원합니다.
  - 구글 로그인이 성공하면 안전한 `JWT Token`을 프론트엔드로 발급해서 세션을 유지합니다.
  
- **구글 캘린더 자동 동기화 (Google Calendar API)**
  - 단순히 DB에만 데이터를 저장하는 것을 넘어, 구글 캘린더 권한을 받아 외부 달력과 실시간으로 연동합니다.
  - 할일에 기한(D-day)을 설정하면 사용자의 구글 캘린더에도 자동으로 일정이 추가됩니다.
  - 앱에서 할일을 완료하거나 삭제하면 구글 캘린더 쪽의 일정도 함께 업데이트(완료 표시/삭제) 됩니다.

- **할일(Todo) 및 일정(Calendar) 관리 API 제공**
  - 프론트엔드가 요청하는 할일의 생성, 조회, 수정, 삭제(CRUD) 기능을 REST API 형태로 안정적으로 제공합니다.

---

### 2. API Documentation

프론트엔드 어플리케이션이 백엔드 서버에 데이터를 요청하기 위한 API 엔드포인트 목록입니다. (인증이 필요한 API는 헤더에 JWT Token을 포함해야 합니다.)

#### 인증 (Auth) API - `/auth`

| HTTP Method | API Endpoint | 역할 및 설명 | 요청 파라미터 / 본문 |
| --- | --- | --- | --- |
| **GET** | `/auth/google` | **구글 로그인 시작**<br>사용자를 구글 로그인 페이지로 보냅니다. (이때 캘린더 접근 권한을 함께 요청함) | 없음 |
| **GET** | `/auth/google/callback` | **구글 로그인 콜백**<br>로그인이 성공하면 JWT 토큰을 생성한 뒤 프론트엔드 URL로 리다이렉트 시켜줍니다. | 없음 |

#### 할일 (Todos) API - `/todos`

| HTTP Method | API Endpoint | 역할 및 설명 | 요청 본문(Payload) |
| --- | --- | --- | --- |
| **GET** | `/todos` | **할일 목록 가져오기**<br>로그인한 사용자의 모든 할일 목록을 최신순으로 가져옵니다. | 없음 |
| **POST** | `/todos` | **할일 추가**<br>할일을 추가합니다. 마감 기한(`due_date`)이 있다면 구글 캘린더에도 즉시 일정을 생성합니다. | `{ content, priority, due_date }` |
| **PUT** | `/todos/:id` | **완료 토글**<br>특정 할일을 완료/미완료 상태로 스위칭합니다. (연동된 캘린더 일정도 제목에 '✅' 추가됨) | 없음 |
| **PATCH** | `/todos/:id` | **설정 내용 변경**<br>할일의 내용이나 날짜를 변경합니다. 구글 캘린더에서도 같이 수정됩니다. | `{ content, due_date }` |
| **PATCH** | `/todos/:id/priority`| **중요도 변경**<br>할일의 중요도를 변경(high, medium, none)합니다. | `{ priority }` |
| **DELETE** | `/todos/:id` | **할일 및 일정 삭제**<br>애플리케이션 내역과 구글 캘린더의 일정을 모두 삭제합니다. | 없음 |
| **POST** | `/todos/from-calendar`| **구글 캘린더 이벤트를 할일로 변환**<br>캘린더에서 가져온 이벤트를 앱의 새 할일로 만들고 즉시 완료 처리까지 수행합니다. | `{ content, due_date, calendar_event_id }` |

#### 캘린더 (Calendar) API - `/calendar`

이 API들은 DB 대신 **사용자의 구글 캘린더 서버**와 직접 통신합니다.

| HTTP Method | API Endpoint | 역할 및 설명 | 요청 파라미터 / 본문 |
| --- | --- | --- | --- |
| **GET** | `/calendar` | **특정 기간의 이벤트 조회**<br>시작일과 종료일을 전달하면 해당 구간에 포함된 내 구글 캘린더 일정을 가져옵니다. | Query: `?start={isoDate}&end={isoDate}` |
| **POST** | `/calendar` | **일정 추가**<br>지정한 시간대에 새로운 일정을 구글 캘린더에 생성합니다. | `{ title, start, end, description }` |
| **PUT** | `/calendar/:eventId`| **일정 수정**<br>존재하는 구글 캘린더 외부 이벤트의 시간이나 제목을 수정합니다. | `{ title, start, end, description }` |
| **DELETE** | `/calendar/:eventId`| **일정 삭제**<br>선택한 구글 캘린더 이벤트를 지우며, 앱 내 연동된 할일이 있다면 같이 지워줍니다. | 없음 |
| **GET** | `/calendar/holidays`| **한국 공휴일 조회**<br>선택된 기간의 한국 공휴일 데이터를 구글 공휴일 캘린더에서 불러옵니다. | Query: `?start={isoDate}&end={isoDate}` |

---
*참고 문서: 해당 문서는 v1.0 기준으로 작성되었으며, 지속적으로 업데이트됩니다.*
