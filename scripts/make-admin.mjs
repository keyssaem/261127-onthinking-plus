// 정답 검수 관리자 지정:  npm run make:admin -- 구글이메일   (해제: npm run make:admin -- 구글이메일 --remove)
// 관리자는 모든 학급이 함께 쓰는 문항·정답을 고칠 수 있으므로 꼭 필요한 사람만 지정한다.
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const [email, flag] = process.argv.slice(2)
if (!email) {
  console.error('사용법: npm run make:admin -- 구글이메일 [--remove]')
  process.exit(1)
}
initializeApp({ credential: cert(JSON.parse(readFileSync('.secrets/firebase-admin.json', 'utf8'))) })
const user = await getAuth().getUserByEmail(email).catch(() => null)
if (!user) {
  console.error(`${email}: 아직 한 번도 로그인하지 않은 계정이에요. 앱에서 선생님 로그인을 먼저 해 주세요.`)
  process.exit(1)
}
const ref = getFirestore().doc(`admins/${user.uid}`)
if (flag === '--remove') {
  await ref.delete()
  console.log(`관리자 해제: ${email}`)
} else {
  await ref.set({ email, createdAt: FieldValue.serverTimestamp() })
  console.log(`관리자 지정: ${email}`)
}
process.exit(0)
