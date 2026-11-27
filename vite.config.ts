import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages 는 https://아이디.github.io/저장소이름/ 아래에서 열리므로 배포할 때 VITE_BASE=/저장소이름/ 로 빌드
// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
})
