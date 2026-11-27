export type Sense = { definition: string; examples: string[] }

export type Word = {
  id: string
  seq: number
  book_vol: number | null
  headword: string
  homograph_no: number | null
  hanja: string | null
  hanja_gloss: string[] | null
  senses: Sense[]
  related: string[]
}

/** meta/wordIndex 문서의 한 줄 (목록 화면용, 읽기 1회로 293개) */
export type WordIndexEntry = Pick<Word, 'id' | 'seq' | 'book_vol' | 'headword' | 'hanja'>

export type ItemType =
  | 'card'
  | 'match'
  | 'synonym_fill'
  | 'mcq'
  | 'scene_fill'
  | 'paragraph_fill'
  | 'sentence_write'
  | 'bell'

export type Item = {
  id: string
  word_id: string
  stage: string
  type: ItemType
  prompt: Record<string, unknown>
  options: string[] | null
  answer_ready: boolean
}

export type Student = {
  /** 학급 학생: 번호 문자열 / 비회원: 익명 uid */
  id: string
  /** 비회원(혼자 연습)이면 null */
  class_id: string | null
  number: number
  nickname: string
  level: number
  guest: boolean
  cat: CatName
}

export type WordProgress = {
  word_id: string
  known_flag: boolean | null
  correct: number
  wrong: number
  last_seen: string | null
  /** 따라 쓰기에 성공한 한자 */
  hanja?: string[]
}

export const STAGE_ORDER = ['이해1', '이해2', '확장1', '확장2', '적용1', '적용2', '활용'] as const

export const STAGE_LABEL: Record<string, string> = {
  이해1: '낱말 알기',
  이해2: '뜻 연결하기',
  확장1: '비슷한 말 찾기',
  확장2: '통하는 말 고르기',
  적용1: '장면에 맞는 말',
  적용2: '글에 맞는 말',
  활용: '한 문장 쓰기',
}

/** 학생이 고르는 고양이 (components/pixel 의 CAT_COLORS 와 같은 이름) */
export const CAT_NAMES = ['cheese', 'gray', 'cream', 'black'] as const
export type CatName = (typeof CAT_NAMES)[number]
/** 저장된 고양이가 없거나 잘못되면 번호로 정해지는 기본 고양이 */
export const catOf = (cat: unknown, n: number): CatName =>
  typeof cat === 'string' && (CAT_NAMES as readonly string[]).includes(cat) ? (cat as CatName) : CAT_NAMES[Math.abs(n) % 4]
