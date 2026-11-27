// 보안 규칙·채점 종단 점검: 임시 학급을 만들어 익명 학생(학급 입장·비회원)으로 풀이를 흉내 낸 뒤 모두 삭제
// 사용법: npm run test:rules   (필요: .env.local, .secrets/firebase-admin.json)
import { readFileSync } from 'node:fs'
import { initializeApp as adminInit, cert } from 'firebase-admin/app'
import { getFirestore as adminDb } from 'firebase-admin/firestore'
import { getAuth as adminAuth } from 'firebase-admin/auth'
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, signOut } from 'firebase/auth'
import {
  getFirestore, doc, getDoc, setDoc, collection, serverTimestamp, setLogLevel, getDocs, query, where, increment,
  writeBatch,
} from 'firebase/firestore'

setLogLevel('silent')
const A = adminDb(adminInit({ credential: cert(JSON.parse(readFileSync('.secrets/firebase-admin.json', 'utf8'))) }))
const e = process.env
const config = {
  apiKey: e.VITE_FIREBASE_API_KEY, authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: e.VITE_FIREBASE_PROJECT_ID, appId: e.VITE_FIREBASE_APP_ID,
}
// 사용자마다 새 연결 (앱도 사용자 교체 시 페이지를 새로 연다 — 같은 연결에서 사용자를 바꾸면 읽기가 이전 인증으로 나감)
let auth, db
function freshClient(name) {
  const app = initializeApp(config, name)
  auth = getAuth(app)
  db = getFirestore(app)
}
freshClient('class-student')
let fails = 0
const ok = (m) => console.log('✅', m)
const bad = (m) => { fails++; console.log('❌', m) }
async function expectDeny(label, fn) {
  try { await fn(); bad(`${label} — 허용됨(문제)`) } catch (x) {
    if (x.code === 'permission-denied') ok(`${label} — 차단됨`); else bad(`${label} — ${x.code}`)
  }
}
async function expectAllow(label, fn) {
  try { const r = await fn(); ok(label); return r } catch (x) { bad(`${label} — ${x.code ?? x.message}`) }
}

const CID = '_e2e_class'
const CODE = 'ZZTEST'
const ITEM = 'L2-044-적용1'
await A.doc(`classes/${CID}`).set({ teacherUid: '_e2e_teacher', name: 'E2E', joinCode: CODE, level: 2 })
await A.doc(`joinCodes/${CODE}`).set({ classId: CID })
const ans = (await A.doc(`answers/${ITEM}`).get()).data().answer
const wrong = ans.map((x) => (x + 1) % 3)
const uids = []

/** 공통 풀이 점검 (base = 'classes/{CID}' 또는 'guests/{uid}') */
async function solveChecks(label, base, uid, studentId) {
  const attempts = collection(db, `${base}/attempts`)
  const row = (tryNo, response) => ({
    uid, studentId, itemId: ITEM, wordId: 'L2-044', stage: '적용1', type: 'scene_fill', mode: 'solo',
    tryNo, response, timeMs: 1000, createdAt: serverTimestamp(),
  })
  await expectDeny(`[${label}] 정답 미리 읽기`, () => getDoc(doc(db, 'answers', ITEM)))
  await expectDeny(`[${label}] 오답을 정답으로 위조`, () => setDoc(doc(attempts), { ...row(1, wrong), isCorrect: true }))
  await expectAllow(`[${label}] 오답 기록`, () => setDoc(doc(attempts), { ...row(1, wrong), isCorrect: false }))
  await expectDeny(`[${label}] 정답을 오답으로 기록`, () => setDoc(doc(attempts), { ...row(1, ans), isCorrect: false }))
  await expectAllow(`[${label}] 정답 기록`, () => setDoc(doc(attempts), { ...row(1, ans), isCorrect: true }))
  await expectAllow(`[${label}] 2차 시도 기록`, () =>
    setDoc(doc(db, `${base}/attempts/${uid}__${ITEM}__2`), { ...row(2, wrong), isCorrect: false }))
  const rev = await expectAllow(`[${label}] 2차 후 정답 열람`, () => getDoc(doc(db, 'answers', ITEM)))
  if (rev && JSON.stringify(rev.data()?.answer) !== JSON.stringify(ans)) bad('열람한 정답이 다름')
  await expectAllow(`[${label}] 진도 기록`, () =>
    setDoc(doc(db, `${base}/progress/${studentId}__L2-044`),
      { studentId, wordId: 'L2-044', correct: increment(1), wrong: increment(0) }, { merge: true }))
  const pg = await expectAllow(`[${label}] 내 진도 조회`, () =>
    getDocs(query(collection(db, `${base}/progress`), where('studentId', '==', studentId))))
  if (pg && pg.size !== 1) bad(`진도 건수 ${pg.size}`)
  await expectAllow(`[${label}] 한 문장 제출`, () =>
    setDoc(doc(collection(db, `${base}/submissions`)), {
      uid, studentId, nickname: '테스트', itemId: 'L2-044-활용', wordId: 'L2-044',
      text: '가능한 일부터 해 보자.', status: '제출', createdAt: serverTimestamp(),
    }))
}

try {
  // ---------- 학급 학생: 학급코드 + 번호 + 닉네임 (사전 등록 없음) ----------
  const uid = (await signInAnonymously(auth)).user.uid
  uids.push(uid)
  await expectAllow('학급코드로 학급 찾기', () => getDoc(doc(db, 'joinCodes', CODE)))
  await expectAllow('학급 이름 보기', () => getDoc(doc(db, 'classes', CID)))
  await expectDeny('다른 학생 명단 만들기(members 없이)', () =>
    setDoc(doc(db, `classes/${CID}/students/5`), { number: 5, nickname: '가짜', level: 2 }))
  await expectDeny('번호 형식 위반(100번)', async () => {
    const b = writeBatch(db)
    b.set(doc(db, 'members', uid), { classId: CID, studentId: '100', joinedAt: serverTimestamp() })
    b.set(doc(db, `classes/${CID}/students/100`), { number: 100, nickname: 'x', level: 2 })
    await b.commit()
  })
  await expectAllow('스스로 입장(3번 하늘)', async () => {
    const b = writeBatch(db)
    b.set(doc(db, 'members', uid), { classId: CID, studentId: '3', joinedAt: serverTimestamp() })
    b.set(doc(db, `classes/${CID}/students/3`), { number: 3, nickname: '하늘', level: 2 }, { merge: true })
    await b.commit()
  })
  await expectAllow('반 친구 명단 보기', () => getDocs(collection(db, `classes/${CID}/students`)))
  await solveChecks('학급', `classes/${CID}`, uid, '3')
  // 교사 답장: 학생은 자기 문장만 읽고, 스스로 '확인' 처리할 수 없음
  const mine = await expectAllow('내 문장·답장 보기', () =>
    getDocs(query(collection(db, `classes/${CID}/submissions`), where('uid', '==', uid))))
  if (mine && mine.size !== 1) bad(`내 문장 건수 ${mine.size}`)
  if (mine?.size) {
    await A.doc(mine.docs[0].ref.path).update({ status: '확인', feedback: '잘했어요' }) // 교사 대신 admin
    await expectAllow('답장 받은 문장 다시 읽기', () => getDoc(doc(db, mine.docs[0].ref.path)))
    await expectDeny('학생이 스스로 확인 처리', () =>
      setDoc(doc(db, mine.docs[0].ref.path), { status: '확인' }, { merge: true }))
  }
  await expectDeny('반 친구 문장 전체 보기', () => getDocs(collection(db, `classes/${CID}/submissions`)))
  await expectDeny('다른 학생인 척 기록', () =>
    setDoc(doc(collection(db, `classes/${CID}/attempts`)), {
      uid, studentId: '4', itemId: ITEM, wordId: 'L2-044', stage: '적용1', type: 'scene_fill', mode: 'solo',
      tryNo: 1, response: ans, timeMs: 1, createdAt: serverTimestamp(), isCorrect: true,
    }))
  await expectDeny('학생이 교사로 등록', () => setDoc(doc(db, 'teachers', uid), { name: 'x' }))
  await expectDeny('학생이 단어 수정', () => setDoc(doc(db, 'words', 'L2-044'), { headword: 'x' }))
  await expectDeny('학생이 정답 입력', () => setDoc(doc(db, 'answers', 'L2-044-확장2'), { answer: [0], word_id: 'L2-044' }))
  await expectDeny('학생이 문항 검수 표시', () =>
    setDoc(doc(db, 'items', 'L2-044-확장2'), { answer_ready: true, verified: true }, { merge: true }))
  await expectDeny('학생이 관리자로 등록', () => setDoc(doc(db, 'admins', uid), { email: 'x' }))
  await signOut(auth)

  // ---------- 비회원 혼자 연습 ----------
  freshClient('guest')
  const g = (await signInAnonymously(auth)).user.uid
  uids.push(g)
  await solveChecks('비회원', `guests/${g}`, g, g)
  await expectDeny('[비회원] 남의 연습장 쓰기', () =>
    setDoc(doc(db, `guests/${uids[0]}/submissions/x`), { text: 'x' }))
  await expectDeny('[비회원] 학급 기록 쓰기', () =>
    setDoc(doc(collection(db, `classes/${CID}/attempts`)), {
      uid: g, studentId: '3', itemId: ITEM, wordId: 'L2-044', stage: '적용1', type: 'scene_fill', mode: 'solo',
      tryNo: 1, response: ans, timeMs: 1, createdAt: serverTimestamp(), isCorrect: true,
    }))
  await signOut(auth)
} catch (x) {
  bad(`예상 밖 오류: ${x.code ?? x.message}`)
} finally {
  await A.recursiveDelete(A.doc(`classes/${CID}`))
  await A.doc(`joinCodes/${CODE}`).delete()
  for (const u of uids) {
    await A.doc(`members/${u}`).delete()
    await A.recursiveDelete(A.doc(`guests/${u}`))
    await adminAuth().deleteUser(u).catch(() => {})
  }
  console.log(`🧹 테스트 데이터 삭제 · 실패 ${fails}건`)
  process.exit(fails ? 1 : 0)
}
