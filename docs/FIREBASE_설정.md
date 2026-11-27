# Firebase 연결 안내 (선생님이 직접 하실 부분, 10분)

학생 = **익명 로그인**(학급코드·번호·비밀번호), 교사 = **구글 로그인**. 이메일 가입은 없습니다.

## 1. 프로젝트 만들기
1. https://console.firebase.google.com → **프로젝트 추가**
2. 이름: `onthinking-plus` → Google 애널리틱스는 **사용 안 함**(필요 없음) → 만들기
3. 요금제는 기본 **Spark(무료)** 그대로 두면 됩니다.

## 2. 웹 앱 등록 → 설정값 복사
1. 프로젝트 개요 화면에서 **`</>` (웹)** 아이콘 클릭
2. 앱 닉네임: `onthinking-plus-web` → **앱 등록** (Firebase 호스팅 체크는 지금은 안 해도 됨)
3. 화면에 나오는 `firebaseConfig = { ... }` 의 값을 프로젝트 폴더 **`.env.local`** 에 옮겨 적기

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=onthinking-plus.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=onthinking-plus
VITE_FIREBASE_STORAGE_BUCKET=onthinking-plus.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```
(나중에 다시 보려면: ⚙️ **프로젝트 설정 → 일반 → 내 앱**)

> 이 값들은 웹 앱에 원래 공개되는 값이라 비밀은 아닙니다. 데이터 보호는 4단계의 보안 규칙이 담당합니다.

## 3. 로그인 방식 켜기
**빌드 → Authentication → 시작하기 → Sign-in method** 탭
- **Google** → 사용 설정 켜기 → 프로젝트 지원 이메일 선택 → 저장 *(구글 클라우드 설정 없이 이걸로 끝)*
- **익명** → 사용 설정 켜기 → 저장
- 이메일/비밀번호는 켜지 않습니다.

※ `localhost` 는 승인된 도메인에 기본 포함되어 있습니다. 나중에 인터넷 주소로 배포하면 **Settings → 승인된 도메인**에 그 주소를 추가합니다.

## 4. Firestore 데이터베이스 + 보안 규칙
1. **빌드 → Firestore Database → 데이터베이스 만들기**
   - 버전: **Standard**
   - 위치: **asia-northeast3 (서울)** ← 한 번 정하면 못 바꿉니다
   - 모드: **프로덕션 모드**
2. 만들어지면 **규칙** 탭 → 기존 내용 전부 지우고 프로젝트 폴더의 **`firestore.rules`** 내용을 붙여넣기 → **게시**

## 5. 서비스 계정 키 (단어 293개 업로드용, 1회)
1. ⚙️ **프로젝트 설정 → 서비스 계정** 탭 → **새 비공개 키 생성** → JSON 파일 다운로드
2. 그 파일 이름을 `firebase-admin.json` 으로 바꿔서 프로젝트 폴더의 **`.secrets`** 폴더 안에 넣기
   (`.secrets/firebase-admin.json`)

> ⚠️ 이 파일은 **데이터베이스 전체를 마음대로 바꿀 수 있는 관리자 열쇠**입니다.
> 채팅·카톡·메일·깃허브에 절대 올리지 마세요. (`.secrets/` 는 `.gitignore` 에 등록되어 있음)

## 6. 업로드 & 확인
여기까지 하고 알려 주시면 Claude가 실행합니다. 직접 하실 경우:

```powershell
npm run upload:l2
```
```
✔ words 293건
✔ items 2050건
✔ answers 874건
✔ meta/wordIndexL2
```

```powershell
npm run dev
```
http://localhost:5173 → **선생님** → Google로 로그인 → 이름 저장 → 학급 만들기 → 학생 등록
