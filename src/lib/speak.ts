/** 읽어주기 (브라우저 내장 TTS, ko-KR) */
export function speak(text: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ko-KR'
  u.rate = 0.9
  window.speechSynthesis.speak(u)
}

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window
