// firestore.rules → Firebase 에 게시 (콘솔에 붙여넣는 것과 동일)
// 사용법: npm run deploy:rules   (필요: .secrets/firebase-admin.json)
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeApp, cert } from 'firebase-admin/app'
import { getSecurityRules } from 'firebase-admin/security-rules'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
initializeApp({ credential: cert(JSON.parse(readFileSync(join(ROOT, '.secrets/firebase-admin.json'), 'utf8'))) })
const rs = await getSecurityRules().releaseFirestoreRulesetFromSource(readFileSync(join(ROOT, 'firestore.rules'), 'utf8'))
console.log('✔ Firestore 규칙 게시:', rs.name)
