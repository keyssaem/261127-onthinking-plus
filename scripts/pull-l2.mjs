// 검수 화면에서 확인한 문항(문구·보기·정답)을 data/l2/items.json 으로 내려받기
// 사용법: npm run pull:l2   (그 뒤 upload:l2 를 해도 검수 결과가 사라지지 않음)
import { readFileSync, writeFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const db = getFirestore(initializeApp({ credential: cert(JSON.parse(readFileSync('.secrets/firebase-admin.json', 'utf8'))) }))
const PATH = 'data/l2/items.json'
const items = JSON.parse(readFileSync(PATH, 'utf8'))
const byId = new Map(items.map((it) => [it.id, it]))

const snap = await db.collection('items').where('verified', '==', true).get()
let n = 0
for (const d of snap.docs) {
  const it = byId.get(d.id)
  if (!it) continue
  const v = d.data()
  const ans = await db.doc(`answers/${d.id}`).get()
  it.prompt = v.prompt
  if (v.options !== undefined && v.options !== null) it.options = v.options
  if (ans.exists) it.answer = ans.data().answer
  it.verified = true
  n++
}
writeFileSync(PATH, JSON.stringify(items, null, 2) + '\n')
console.log(`✔ 검수 문항 ${n}개를 ${PATH} 에 반영`)
process.exit(0)
