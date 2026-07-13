const fs = require('fs')

function patchFile(path) {
  const src = fs.readFileSync(path, 'utf8')
  const anchor = 'models/gemini-3.5-flash:generateContent'
  const count = src.split(anchor).length - 1
  if (count !== 1) {
    console.log(`❌ ${path} — expected 1 match, found ${count}`)
    return false
  }
  fs.writeFileSync(path, src.replace(anchor, 'models/gemini-3-flash-preview:generateContent'))
  console.log(`✅ ${path} — switched to gemini-3-flash-preview`)
  return true
}

const ok1 = patchFile('supabase/functions/ai-score-suggestion/index.ts')
const ok2 = patchFile('supabase/functions/ai-dsat-suggestion/index.ts')

if (!ok1 || !ok2) process.exitCode = 1
