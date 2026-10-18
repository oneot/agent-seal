# agent-seal

웹 채널 보안의 암호를 **브라우저 안에서 봉인**하고, AI Creative Agent를 연결하는 독립적인 `index.html` 한 파일을 만드는 정적 도구입니다.

[생성기 열기](https://oneot.github.io/agent-seal/)

## 사용 방법

1. 웹 채널 보안의 암호를 붙여 넣습니다. 기존과 같이 앞뒤 공백을 제외한 20자 이상, 내부 공백이 없는 값을 받습니다. 이 검사는 입력 형식만 확인하며 암호의 실제 유효성을 확인하지 않습니다.
2. GitHub ID 또는 주소를 입력합니다. `oneot`, `@OneOT`, `github.com/oneot`, `https://github.com/oneot/agent-seal`, `oneot.github.io` 같은 입력을 `oneot`으로 정규화합니다.
3. **복사**를 눌러 결과를 `index.html`로 저장합니다. 자동 복사가 실패하면 **복사 실패**를 표시하고 코드를 선택합니다. 직접 복사하거나 다시 시도할 수 있습니다.
4. 해당 계정의 GitHub Pages에 생성 파일을 올립니다. 허용할 원점은 `https://<정규화한 ID>.github.io`이며, 같은 원점의 저장소 하위 경로도 사용할 수 있습니다. 다른 계정, 사용자 정의 도메인, `file://` 등은 이 원점과 다릅니다.

ID는 1~39자의 영문자·숫자와 중간의 단일 하이픈을 허용합니다. 연속 하이픈, 앞뒤 하이픈, 가짜 GitHub 호스트, URL의 사용자 정보 및 비표준 포트는 거부합니다. GitHub URL은 `github.com`과 `www.github.com`, Pages URL은 정확한 `<ID>.github.io` 호스트만 받습니다. 계정의 실제 존재 여부는 조회하지 않습니다.

Enter 제출, 한글 IME 조합 중 제출 방지, 화면 읽기 안내, 동작 줄이기 설정과 기존 유리 효과·모바일 디자인을 유지합니다. **처음부터 다시**는 입력과 생성 결과, 복사 표시 및 타이머를 초기화합니다. 이전 비동기 작업의 완료가 새 화면을 덮어쓰지 않습니다.

## 암호화와 외부 연결

생성기는 외부 API를 호출하지 않고 입력한 암호를 `localStorage`, `sessionStorage`, 쿠키에 저장하지 않습니다. 생성물에는 원문 대신 봉인값만 들어갑니다. 원문은 처리 중 브라우저 메모리에 존재하며, 봉인 시도와 재시작 때 앱의 상태 참조와 입력칸을 비웁니다. JavaScript 문자열의 메모리 보안 삭제까지 보장하지는 않습니다. 실제 암호를 커밋·로그·테스트 데이터에 넣지 마세요.

기존 브로커 계약을 그대로 사용합니다.

| 항목 | 형식 |
| --- | --- |
| 평문 | UTF-8 JSON `{ "s": secret, "o": origin }` |
| 데이터 암호화 | 매번 새 AES-256-GCM 키, 12바이트 IV, 16바이트 인증 태그 |
| 키 봉인 | 기존 RSA-2048 공개키, RSA-OAEP / SHA-256 |
| 출력 | `wrapped key (256 bytes) + IV (12 bytes) + ciphertext/tag`의 패딩 없는 base64url |
| 토큰 요청 | 기존 broker URL에 `POST`, 본문은 `JSON.stringify({ sealed: SEALED })` |
| 채팅 | Bot Framework Web Chat **4.18.0**, `ko-KR`, 기존 `startConversation` 이벤트와 구독 순서 |

토큰 요청에는 의도적으로 `Content-Type: application/json`을 추가하지 않습니다. 문자열 본문의 기본 `text/plain` 요청을 유지해 불필요한 CORS preflight와 확인되지 않은 서버 호환성 변경을 피합니다.

생성 페이지는 연결 중 상태, CDN 로드 실패, HTTP 오류, 잘못된 JSON, 누락되거나 잘못된 토큰, 네트워크 및 채팅 초기화 실패를 구분해 안내합니다. 첫 인사 이벤트만 실패한 경우에는 채팅창을 유지하고 직접 메시지를 입력하도록 안내합니다. 서버의 원시 오류 본문을 그대로 화면에 출력하지 않습니다.

생성 파일은 **추가 로컬 자산 없이 사용하는 한 HTML 파일**이지만, 실행할 때 Web Chat CDN과 브로커 네트워크 연결은 필요합니다. 브로커 구현·개인키·최종 원점 검증은 이 저장소에 없으며, 클라이언트만으로 서버의 동작을 보장하지 않습니다.

## 구조와 배포

| 파일 | 역할 |
| --- | --- |
| `index.html` | 생성기의 마크업과 접근성 기본 구조 |
| `assets/styles.css` | 기존 반응형 유리 효과 디자인 |
| `assets/app.js` | 입력 단계, 애니메이션, 복사·재시작 상태 |
| `assets/github-id.js` | GitHub ID와 실제 URL 호스트 검증 |
| `assets/seal.js` | 공개키 및 봉인 바이트 형식 |
| `assets/template.js` | 브로커 주소와 독립 실행 HTML 생성 |
| `tests/` | 외부 서비스를 mock하는 단위·브라우저 회귀 검증 |

프레임워크, 번들러, 프로덕션 npm 의존성이나 빌드 단계가 없습니다. 생성기 배포 시 **루트 `index.html`과 `assets/`를 함께** 제공하세요. 모든 자산 경로는 상대 경로라 `/agent-seal/` 같은 저장소 하위 경로에서 동작합니다.

GitHub Pages의 기존 `main` 브랜치 루트 정적 배포 방식을 유지합니다. 테스트용 GitHub Actions는 Pages를 배포하거나 저장소 설정을 변경하지 않습니다.

## 로컬 개발과 검증

유지보수 도구에는 Node.js 22 이상이 필요하며, CI는 Node.js 24를 사용합니다. 사이트 이용자는 Node.js가 필요 없습니다.

```sh
npm ci --ignore-scripts
npm run dev
```

`http://127.0.0.1:4173/agent-seal/`에서 확인합니다. 개발 서버는 로컬 루프백에만 바인딩됩니다. ES modules와 Web Crypto를 사용하므로 생성기를 `file://`로 직접 열지 말고 HTTPS 또는 localhost로 제공하세요.

```sh
npx playwright install chromium webkit
npm test
npm run test:browser
# 두 검증을 함께 실행
npm run check
```

Linux에서 브라우저 시스템 의존성도 필요하다면 `npx playwright install --with-deps chromium webkit`을 사용합니다.

단위 테스트는 테스트용 키쌍과 더미 값으로 봉인 형식·복호화 왕복·변조 감지·ID 정규화·생성 템플릿을 확인합니다. Chromium과 WebKit에서는 실제 DOM 흐름, 상대 자산 경로, 복사 성공/실패, 연속 클릭, 재시작 경합, IME, 애니메이션과 생성 페이지의 응답별 오류 처리를 확인합니다. 실제 암호, 운영 브로커, 실제 클립보드는 사용하지 않습니다.

데스크톱(1280×800)과 모바일 크기(390×844)의 입력·ID·결과 화면 및 결과 코드 내용을 가린 디자인 비교용 이미지는 `test-results/visual-*/`에 저장합니다. 자동 검증은 레이아웃 조건을 확인하며, 이미지는 시각 비교 자료이지 OS별 픽셀 기준을 고정한 스냅샷 테스트는 아닙니다. CI에서도 이미지와 실패 trace를 `browser-results` 아티팩트로 보관합니다.

외부 CDN/브로커는 브라우저 테스트에서 전부 mock합니다. 실제 서비스의 CORS 설정, 토큰 발급, Web Chat와 브로커 사이의 운영 통합을 검증했다는 의미는 아닙니다.
