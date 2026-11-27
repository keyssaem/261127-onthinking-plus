// data/l2/*.json → Firestore 업로드 (words, items, answers, meta/wordIndexL2)
// 사용법:  npm run upload:l2
// 필요: Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > [새 비공개 키 생성] 으로 받은 JSON 파일을
//       프로젝트 폴더의 .secrets/firebase-admin.json 으로 저장 (깃에 올라가지 않음, 절대 공유 금지)
// 같은 id 는 덮어쓰기이므로 여러 번 실행해도 안전하다.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const KEY = process.env.FIREBASE_ADMIN_KEY ?? join(ROOT, '.secrets', 'firebase-admin.json')
if (!existsSync(KEY)) {
  console.error(`서비스 계정 키가 없습니다: ${KEY}\n docs/FIREBASE_설정.md 의 '서비스 계정 키' 단계를 확인하세요.`)
  process.exit(1)
}

initializeApp({ credential: cert(JSON.parse(readFileSync(KEY, 'utf8'))) })
const db = getFirestore()

const words = JSON.parse(readFileSync(join(ROOT, 'data/l2/words.json'), 'utf8'))
const items = JSON.parse(readFileSync(join(ROOT, 'data/l2/items.json'), 'utf8'))

const hasAnswer = (it) => Array.isArray(it.answer) && it.answer.length > 0 && !it.answer.includes(-1)

async function writeAll(label, entries) {
  // Firestore 일괄 쓰기 한도 500 → 400씩
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch()
    for (const [ref, data] of entries.slice(i, i + 400)) batch.set(ref, data)
    await batch.commit()
  }
  console.log(`✔ ${label} ${entries.length}건`)
}

// 검수 화면에서 확인(verified)한 문항은 덮어쓰지 않는다 → 먼저 npm run pull:l2 로 내려받아 두면 로컬과 같아짐
const verified = new Set((await db.collection('items').where('verified', '==', true).select().get()).docs.map((d) => d.id))
if (verified.size) console.log(`ℹ 검수 완료 문항 ${verified.size}개는 건너뜀`)
const fresh = items.filter((it) => !verified.has(it.id))
await writeAll(
  'words',
  words.map((w) => [
    db.collection('words').doc(w.id),
    {
      level: w.level, seq: w.seq, book_vol: w.book_vol, headword: w.headword, homograph_no: w.homograph_no,
      hanja: w.hanja, hanja_gloss: w.hanja_gloss, senses: w.senses, related: w.related,
      definition: w.definition, example: w.example, source_page: w.source_page, verified: false,
    },
  ]),
)

await writeAll(
  'items',
  fresh.map((it) => [
    db.collection('items').doc(it.id),
    {
      word_id: it.word_id, stage: it.stage, type: it.type, prompt: it.prompt,
      options: it.options ?? null, answer_ready: hasAnswer(it), verified: false,
    },
  ]),
)

await writeAll(
  'answers',
  fresh.filter(hasAnswer).map((it) => [db.collection('answers').doc(it.id), { answer: it.answer, word_id: it.word_id }]),
)

// 목록 화면용 색인 (문서 1개 = 읽기 1회)
await db.collection('meta').doc('wordIndexL2').set({
  words: words.map((w) => ({ id: w.id, seq: w.seq, book_vol: w.book_vol, headword: w.headword, hanja: w.hanja })),
  updatedAt: new Date(),
})
console.log('✔ meta/wordIndexL2')
