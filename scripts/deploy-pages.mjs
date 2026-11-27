// GitHub Pages 배포: 빌드 → dist 를 gh-pages 브랜치로 올리기
// 사용법: npm run deploy:web     (필요: .env.local, git 원격 저장소 origin)
// 사이트 주소: https://아이디.github.io/저장소이름/
import { execSync } from 'node:child_process'
import { copyFileSync, writeFileSync, rmSync } from 'node:fs'

const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts })
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()

const remote = out('git remote get-url origin')
const m = remote.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/)
if (!m) throw new Error(`GitHub 원격 저장소가 아니에요: ${remote}`)
const [, owner, repo] = m
const base = repo.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '/' : `/${repo}/`

console.log(`▶ 빌드 (base=${base})`)
sh('npm run build', { env: { ...process.env, VITE_BASE: base } })

// 새로고침·바로가기 주소(/learn 등)도 앱이 열리도록 404.html = index.html
copyFileSync('dist/index.html', 'dist/404.html')
writeFileSync('dist/.nojekyll', '')

console.log('▶ gh-pages 브랜치로 올리는 중')
rmSync('dist/.git', { recursive: true, force: true })
const g = (c) => sh(`git ${c}`, { cwd: 'dist' })
g('init -q -b gh-pages')
g('add -A')
g('-c user.name="deploy" -c user.email="deploy@users.noreply.github.com" commit -q -m "deploy"')
g(`push -f "${remote}" gh-pages`)
rmSync('dist/.git', { recursive: true, force: true })

console.log(`\n✔ 배포 완료 → https://${owner.toLowerCase()}.github.io${base}`)
console.log('  (처음 한 번: 저장소 Settings → Pages → Branch 를 gh-pages 로 지정)')
