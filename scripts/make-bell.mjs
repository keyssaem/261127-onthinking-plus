// 골든벨 문항 만들기: 낱말마다 '뜻 + 빈칸 예문 → 알맞은 낱말 고르기' 4지선다 1문항
// 사용법: npm run make:bell   (Firestore words 를 읽어 items/{낱말}-골든벨, answers/{…} 에 저장, 여러 번 실행해도 같은 결과)
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const db = getFirestore(initializeApp({ credential: cert(JSON.parse(readFileSync('.secrets/firebase-admin.json', 'utf8'))) }))

// 실행할 때마다 같은 보기가 나오도록 고정 난수
let seed = 20261127
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const shuffle = (a) => {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}
const stemOf = (h) => h.replace(/하다$/, '')
const mask = (text, stem) => text.split(stem).join('○'.repeat(stem.length))

const words = (await db.collection('words').where('level', '==', 2).get()).docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .sort((a, b) => a.seq - b.seq)

const items = []
for (const w of words) {
  const stem = stemOf(w.headword)
  // 예문에 낱말이 들어 있는 뜻을 고른다
  const sense = w.senses.find((s) => s.examples.some((e) => e.includes(stem))) ?? w.senses[0]
  const example = sense.examples.find((e) => e.includes(stem)) ?? ''
  const pool = words.filter(
    (o) => o.book_vol === w.book_vol && o.headword !== w.headword && !o.headword.includes(stem) && !w.headword.includes(stemOf(o.headword)),
  )
  const options = shuffle([w.headword, ...shuffle(pool).slice(0, 3).map((o) => o.headword)])
  items.push({
    id: `${w.id}-골든벨`,
    data: {
      word_id: w.id,
      vol: w.book_vol,
      stage: '골든벨',
      type: 'bell',
      prompt: { definition: mask(sense.definition, stem), example: mask(example, stem) },
      options,
      answer_ready: true,
      verified: false,
    },
    answer: [options.indexOf(w.headword)],
  })
}

for (let i = 0; i < items.length; i += 200) {
  const b = db.batch()
  for (const it of items.slice(i, i + 200)) {
    b.set(db.doc(`items/${it.id}`), it.data)
    b.set(db.doc(`answers/${it.id}`), { answer: it.answer, word_id: it.data.word_id })
  }
  await b.commit()
}
console.log(`✔ 골든벨 문항 ${items.length}개 (1권 ${items.filter((x) => x.data.vol === 1).length} · 2권 ${items.filter((x) => x.data.vol === 2).length} · 3권 ${items.filter((x) => x.data.vol === 3).length})`)
console.log('예:', JSON.stringify(items[0].data.prompt), items[0].data.options, '정답', items[0].answer)
process.exit(0)
