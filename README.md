# 온생각 퀴즈 월드

충남 '온생각' 사고도구어 학습을 교실에서 쓰기 좋게 다시 만든 웹앱입니다.

- 학생: 학급코드 + 번호 + 닉네임으로 입장(익명), 또는 학급 없이 '혼자 연습'
- 교사: 구글 로그인 → 학급 만들기, 실시간 현황판, 한 문장 쓰기 검토
- 관리자: 문항 정답 검수
- 채점은 Firestore 보안 규칙이 정답과 대조해 처리 (학생 기기에는 정답이 없음)

기술: Vite + React + TypeScript + Tailwind, Firebase(Auth·Firestore)

## 실행

```bash
npm install
cp .env.example .env.local   # Firebase 웹 앱 설정값 입력
npm run dev
```

Firebase 준비는 [docs/FIREBASE_설정.md](docs/FIREBASE_설정.md) 참고.

| 명령 | 하는 일 |
|---|---|
| `npm run deploy:web` | GitHub Pages 배포 (gh-pages 브랜치) |
| `npm run deploy:rules` | `firestore.rules` 게시 |
| `npm run test:rules` | 보안 규칙·채점 종단 점검 |
| `npm run make:admin -- 이메일` | 정답 검수 관리자 지정 |
| `npm run pull:l2` | 검수 결과를 로컬 데이터로 내려받기 |

## 콘텐츠 저작권

낱말·문항 내용은 충청남도교육청 '온생각' 교재에서 가져온 것으로, 이 저장소에는 포함하지 않습니다
(`data/`, 교재 원문·분석 문서는 `.gitignore`). 앱은 Firestore에 올린 데이터를 읽어 씁니다.
