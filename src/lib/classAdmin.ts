import { collection, deleteDoc, doc, getDocs, query, where, writeBatch, type DocumentReference } from 'firebase/firestore'
import { db } from './firebase'

/**
 * 학급 완전 삭제 (교사): 학생 명단·풀이 기록·진도·문장·나무·게임 → 입장 연결 → 학급코드 → 학급
 * Firestore 는 하위 문서를 자동으로 지우지 않으므로 하나씩 지운다. 되돌릴 수 없음.
 */
export async function deleteClass(classId: string, joinCode: string, onProgress?: (n: number) => void) {
  let done = 0
  const wipe = async (refs: DocumentReference[]) => {
    for (let i = 0; i < refs.length; i += 400) {
      const b = writeBatch(db!)
      refs.slice(i, i + 400).forEach((r) => b.delete(r))
      await b.commit()
      done += Math.min(400, refs.length - i)
      onProgress?.(done)
    }
  }
  const sub = async (...path: string[]) => (await getDocs(collection(db!, 'classes', classId, ...path))).docs.map((d) => d.ref)

  // 게임 (참가자·답 포함)
  for (const g of await sub('games')) {
    await wipe([...(await sub('games', g.id, 'players')), ...(await sub('games', g.id, 'answers'))])
    await wipe([g])
  }
  for (const name of ['students', 'attempts', 'progress', 'submissions', 'tree']) await wipe(await sub(name))

  // 이 학급으로 들어온 학생 연결 (학생 기기는 다음에 열면 입장 화면으로)
  const members = await getDocs(query(collection(db!, 'members'), where('classId', '==', classId)))
  await wipe(members.docs.map((d) => d.ref))

  // 학급코드는 학급이 있어야 교사 확인이 되므로 학급보다 먼저
  await deleteDoc(doc(db!, 'joinCodes', joinCode)).catch(() => {})
  await deleteDoc(doc(db!, 'classes', classId))
  return done
}
