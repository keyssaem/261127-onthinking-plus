// 온생각 사고도구어 교사용 교재(1~3권) raw 텍스트 → 2수준 단어/문항 JSON
// 사용법:  node scripts/extract-l2.mjs
// 입력:    data/raw/vol1.txt, vol2.txt, vol3.txt  (pdftotext -raw -enc UTF-8 결과)
// 출력:    data/l2/words.json, items.json, review.md
//
// 교재 구조: PDF 1쪽(펼침면) = 사고도구어 1개, 7개 활동
//   이해1 사전적 의미 / 이해2 다의어 연결 / 확장1 비슷한 말 / 확장2 통하는 말 고르기
//   적용1 장면 빈칸 / 적용2 글 빈칸 / 활용 한 문장 쓰기
// PDF에서 '그림'으로만 표시되는 정답(확장2 동그라미, 이해2 선긋기)은 answer=null 로 두고
// review.md 에 수작업 입력 대상으로 남긴다.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'data', 'raw')
const OUT = join(ROOT, 'data', 'l2')

const HAN = /[㐀-鿿豈-﫿]/
const clean = (s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F​-‍﻿]/g, '').replace(/\s+/g, ' ').trim()
const supToDigit = (s) => s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)))
const isDigits =(s) => /^\d+$/.test(s)
const isAnchor = (s) =>
  s.includes('봅시다') || s.startsWith('초등 2수준') || s.startsWith('초등 1수준') ||
  /온생각 사고도구어/.test(s) || isDigits(s)

// 빈칸 "( 답 )" 추출 → 문장은 "(  )" 로 바꾸고 답 목록 반환
function extractBlanks(text, options) {
  const answers = []
  const masked = text.replace(/\(\s*([^()]+?)\s*\)/g, (whole, a) => {
    // 보기와 맞지 않고 띄어쓰기·쉼표·영문이 있는 괄호는 원문 괄호로 보고 유지
    if (options && answerIndex(options, clean(a)) < 0 && (/[\s,A-Za-z㐀-鿿]/.test(a) || clean(a).length >= 5))
      return whole
    answers.push(clean(a))
    return '(   )'
  })
  return { masked, answers }
}

// 빈칸 답(어간일 수 있음)을 보기 번호로 매핑
function answerIndex(options, blank) {
  const stem = (w) => w.replace(/(하다|되다|하게|한|했다|하니)$/, '')
  let i = options.findIndex((o) => o === blank)
  if (i < 0) i = options.findIndex((o) => stem(o) === stem(blank))
  if (i < 0) i = options.findIndex((o) => blank.startsWith(stem(o)) || stem(o).startsWith(blank))
  return i
}

function splitSentences(text) {
  return text
    .split(/(?<=[.?!])\s+(?=\S)/)
    .map(clean)
    .filter(Boolean)
}

function parsePage(pageText, vol, pageNo) {
  const lines = pageText.split(/\r?\n/).map(clean).filter(Boolean)
  const issues = []

  // ---------- 표제어 ----------
  const headRe = /^([가-힣]+)\(([^)]*[㐀-鿿A-Za-z][^)]*)\)([가-힣]*)([\d⁰¹²³⁴⁵⁶⁷⁸⁹]*)$/
  const headIdx = lines.findIndex((l) => headRe.test(l))
  if (headIdx < 0) return null
  const [, stem, hanja, suffix, homo] = lines[headIdx].match(headRe)
  const headword = stem + suffix
  const levelLine = lines.find((l) => /^초등 [12]수준$/.test(l))
  const level = levelLine ? Number(levelLine.match(/(\d)수준/)[1]) : null

  // ---------- 순번 / 한자 풀이 / 뜻 ----------
  const sajeonIdx = lines.findIndex((l) => l.includes('사전적 의미를 알아봅시다'))
  let seq = null
  let k = sajeonIdx + 1
  while (k < lines.length && isDigits(lines[k])) {
    seq = Number(lines[k]) // "1" 다음 실제 순번
    k++
  }
  const gloss = []
  while (k + 1 < lines.length && HAN.test(lines[k]) && lines[k].length <= 2 && !HAN.test(lines[k + 1])) {
    gloss.push(`${lines[k]} ${lines[k + 1]}`)
    k += 2
  }
  const synAnchorIdx = lines.findIndex((l, i) => i > sajeonIdx && /의미가 (비슷한|가장 가까운) 낱말을/.test(l))
  const defText = lines.slice(k, synAnchorIdx > k ? synAnchorIdx : k).join(' ')
  const senses = []
  const senseParts = /^\d+\.\s/.test(defText) ? defText.split(/(?:^|\s)(?=\d+\.\s)/) : [defText]
  for (const part of senseParts.map(clean).filter(Boolean)) {
    const [def, ...exs] = part.replace(/^\d+\.\s*/, '').split('‣').map(clean)
    senses.push({ definition: def, examples: exs.filter(Boolean) })
  }
  if (!senses.length || !senses[0].definition) issues.push('뜻 추출 실패')

  // ---------- 확장1: 비슷한 말 ----------
  const synLineIdx = lines.findIndex((l) => /①\s*\(.+\)\s*②\s*\(.+\)/.test(l))
  // 변형: 예문 1개 + 빈칸 1개  ("공정성 완벽성 진정성 희소성 ( 공정성 )")
  const synOneIdx =
    synLineIdx < 0
      ? lines.findIndex((l, i) => i > synAnchorIdx && lines[i - 1] === '비슷한 말' && /\(\s*\S+\s*\)$/.test(l))
      : -1
  let synonymItem = null
  let mapStart = -1
  if (synLineIdx >= 0) {
    const m = lines[synLineIdx].match(/^(.*?)\s*①\s*\(\s*(.+?)\s*\)\s*②\s*\(\s*(.+?)\s*\)$/)
    const options = m[1].split(' ').filter(Boolean)
    const ans = [m[2], m[3]]
    // 예문: 앵커 다음 ~ '비슷한 말' 앞
    const endIdx = lines.findIndex((l, i) => i > synAnchorIdx && l === '비슷한 말')
    const body = lines
      .slice(synAnchorIdx + 1, endIdx > 0 ? endIdx : synLineIdx)
      .filter((l) => !isDigits(l))
      .join(' ')
      .replace(new RegExp(`^${headword}\\s*`), '')
    const sm = body.match(/①\s*(.+?)\s*②\s*(.+)$/)
    const sentences = sm ? [clean(sm[1]), clean(sm[2])] : []
    if (sentences.length !== 2) issues.push('확장1 예문 분리 실패')
    const answer = ans.map((a) => options.indexOf(a))
    if (options.length !== 4 || answer.includes(-1)) issues.push(`확장1 보기/정답 확인 (${options.join(',')} → ${ans.join(',')})`)
    synonymItem = { prompt: { sentences }, options, answer }
    mapStart = synLineIdx + 1
  } else if (synOneIdx > 0) {
    const m = lines[synOneIdx].match(/^(.*?)\s*\(\s*(.+?)\s*\)$/)
    const options = m[1].split(' ').filter(Boolean)
    const sentence = lines
      .slice(synAnchorIdx + 1, synOneIdx - 1)
      .filter((l) => !isDigits(l))
      .join(' ')
      .replace(new RegExp(`^${headword}\\s*`), '')
    const answer = [options.indexOf(m[2])]
    if (options.length !== 4 || answer[0] < 0) issues.push(`확장1(1문장) 보기/정답 확인 (${options.join(',')} → ${m[2]})`)
    synonymItem = { prompt: { sentences: [clean(sentence)] }, options, answer }
    mapStart = synOneIdx + 1
  } else {
    issues.push('확장1 없음')
  }

  // ---------- 의미지도 ----------
  let related = []
  if (mapStart > 0) {
    const tail = lines.slice(mapStart)
    const hIdx = tail.findIndex((l) => /^\(.+\)$/.test(l))
    related = tail
      .slice(hIdx + 1)
      .filter((w) => w !== headword && !isAnchor(w) && /^[가-힣 ]{1,12}$/.test(w))
  }

  // ---------- 확장2: 통하는 말 고르기 ----------
  const mcqIdx = lines.findIndex((l) => /^➀/.test(l))
  let mcqItem = null
  let para = null
  if (mcqIdx > 0) {
    const options = lines[mcqIdx].split(/[➀➁➂➃]/).map(clean).filter(Boolean)
    const group = lines[mcqIdx - 1].split(' ').filter(Boolean)
    mcqItem = { prompt: { group }, options, answer: null }
    if (options.length !== 4) issues.push('확장2 보기 수 확인')

    // ---------- 적용2: 글 빈칸 ----------
    const pOptions = (lines[mcqIdx + 1] || '').split(' ').filter(Boolean)
    const pBody = []
    for (let i = mcqIdx + 2; i < lines.length; i++) {
      if (isAnchor(lines[i]) || /^2\s/.test(lines[i])) break
      pBody.push(lines[i])
    }
    const { masked, answers } = extractBlanks(pBody.join(' '), pOptions)
    const answer = answers.map((a) => answerIndex(pOptions, a))
    if (answer.includes(-1) || !answers.length) issues.push(`적용2 정답 매핑 확인 (${pOptions.join(',')} → ${answers.join(',')})`)
    para = { prompt: { text: masked, blanks: answers }, options: pOptions, answer }
  } else {
    issues.push('확장2 없음')
  }

  // ---------- 적용1: 장면 빈칸 ----------
  let scene = null
  const goIdx = lines.findIndex((l) => l.includes('통하는 말을 골라 봅시다'))
  if (goIdx >= 0 && mcqIdx > 0) {
    let s = goIdx + 1
    while (s < lines.length && isDigits(lines[s])) s++
    const region = []
    for (let i = s; i < mcqIdx - 1; i++) {
      if (lines[i].includes('봅시다')) break
      region.push(lines[i])
    }
    const sOptions = (region.shift() || '').split(' ').filter(Boolean)
    const { masked, answers } = extractBlanks(region.join(' '), sOptions)
    const sentences = splitSentences(masked)
    const answer = answers.map((a) => answerIndex(sOptions, a))
    if (sentences.length !== 3 || answers.length < 3) issues.push(`적용1 문장/빈칸 수 확인 (${sentences.length}/${answers.length})`)
    if (answer.includes(-1)) issues.push(`적용1 정답 매핑 확인 (${sOptions.join(',')} → ${answers.join(',')})`)
    scene = { prompt: { sentences, blanks: answers }, options: sOptions, answer }
  } else {
    issues.push('적용1 없음')
  }

  // ---------- 이해2: 다의어 연결 ----------
  const left = []
  const right = []
  let buf = []
  let rightOpen = false
  for (const l of lines) {
    if (l.includes('• •')) {
      const [before, after] = l.split('• •').map(clean)
      left.push(clean([...buf, before].join(' ')))
      right.push(after)
      buf = []
      rightOpen = !/[.다음]$/.test(after)
      continue
    }
    if (rightOpen && !isAnchor(l)) {
      right[right.length - 1] = clean(`${right[right.length - 1]} ${l}`)
      rightOpen = !/[.다음]$/.test(l)
      continue
    }
    rightOpen = false
    if (isAnchor(l) || headRe.test(l)) buf = []
    else buf.push(l)
  }
  const matchItem = left.length >= 2 ? { prompt: { left, right }, answer: null } : null
  if (!matchItem) issues.push('이해2 연결 문항 추출 실패')
  else if (left.some((x) => !x)) issues.push('이해2 왼쪽 문장 일부 비어 있음')

  return {
    vol, pageNo, level, seq, headword, stem, hanja, homograph_no: homo ? Number(supToDigit(homo)) : null,
    gloss, senses, related, synonymItem, mcqItem, scene, para, matchItem, issues,
  }
}

// ---------------------------------------------------------------------
const words = []
const items = []
const review = []

for (const vol of [1, 2, 3]) {
  const text = readFileSync(join(RAW, `vol${vol}.txt`), 'utf8')
  text.split('\f').forEach((page, i) => {
    if (!page.includes('사전적 의미를 알아봅시다')) return
    const p = parsePage(page, vol, i + 1)
    if (!p || p.level !== 2) return
    const id = `L2-${String(p.seq).padStart(3, '0')}`
    words.push({
      id, level: 2, seq: p.seq, book_vol: vol, headword: p.headword, homograph_no: p.homograph_no,
      hanja: p.hanja, hanja_gloss: p.gloss, senses: p.senses,
      definition: p.senses.map((s) => s.definition).join(' / '),
      example: p.senses.flatMap((s) => s.examples)[0] ?? null,
      related: p.related, source_page: p.pageNo,
    })
    const push = (stage, type, body, answer) =>
      items.push({ id: `${id}-${stage}`, word_id: id, stage, type, ...body, answer })

    push('이해1', 'card', { prompt: { headword: p.headword, hanja: p.hanja, gloss: p.gloss, senses: p.senses } }, null)
    if (p.matchItem) push('이해2', 'match', { prompt: p.matchItem.prompt }, null)
    if (p.synonymItem) push('확장1', 'synonym_fill', { prompt: p.synonymItem.prompt, options: p.synonymItem.options }, p.synonymItem.answer)
    if (p.mcqItem) push('확장2', 'mcq', { prompt: p.mcqItem.prompt, options: p.mcqItem.options }, null)
    if (p.scene) push('적용1', 'scene_fill', { prompt: p.scene.prompt, options: p.scene.options }, p.scene.answer)
    if (p.para) push('적용2', 'paragraph_fill', { prompt: p.para.prompt, options: p.para.options }, p.para.answer)
    push('활용', 'sentence_write', { prompt: { instruction: `‘${p.headword}’(이)라는 낱말을 사용하여 한 문장을 써 봅시다.` } }, null)

    if (p.issues.length) review.push(`- **${id} ${p.headword}** (${vol}권 PDF ${p.pageNo}쪽): ${p.issues.join(' · ')}`)
  })
}

words.sort((a, b) => a.seq - b.seq)
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'words.json'), JSON.stringify(words, null, 2))
writeFileSync(join(OUT, 'items.json'), JSON.stringify(items, null, 2))

const seqs = new Set(words.map((w) => w.seq))
const missing = []
// 교재 통합 순번: 1수준 1~43, 2수준 44~336
for (let s = 44; s <= 336; s++) if (!seqs.has(s)) missing.push(s)
const count = (t) => items.filter((x) => x.type === t).length
const autoOk = items.filter((x) => ['synonym_fill', 'scene_fill', 'paragraph_fill'].includes(x.type) && Array.isArray(x.answer) && !x.answer.includes(-1)).length

writeFileSync(join(OUT, 'review.md'), [
  '# 2수준 추출 검수 목록',
  '',
  `- 단어: ${words.length} / 293 · 누락 순번: ${missing.length ? missing.join(', ') : '없음'}`,
  `- 문항: ${items.length} (card ${count('card')}, match ${count('match')}, synonym_fill ${count('synonym_fill')}, mcq ${count('mcq')}, scene_fill ${count('scene_fill')}, paragraph_fill ${count('paragraph_fill')}, sentence_write ${count('sentence_write')})`,
  `- 자동 정답 확보(확장1·적용1·적용2): ${autoOk}`,
  `- **수작업 정답 필요**: 확장2(동그라미 표시) ${count('mcq')}개, 이해2(선긋기) ${count('match')}개`,
  '- **띄어쓰기 검수 필요**: PDF 줄바꿈 위치가 공백으로 합쳐져 "게임에 서", "불 구하고" 같은 오류가 문단·장면 문장에 섞여 있음 (검수 화면에서 교정 예정)',
  '- 원문 자체 오류 의심: 부정(긍적), 해설·향상·현실(정답이 보기에 없음) → 교재 원본 확인',
  '',
  '## 자동 점검에서 걸린 단어',
  '',
  ...review,
].join('\n'))

console.log(`words ${words.length}, items ${items.length}, autoOk ${autoOk}, flagged ${review.length}, missing ${missing.length}`)
