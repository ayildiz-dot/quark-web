const fs = require('fs')

function patchFile(path, anchor, replacement) {
  const src = fs.readFileSync(path, 'utf8')
  const count = src.split(anchor).length - 1
  if (count !== 1) {
    console.log(`❌ ${path} — expected 1 match, found ${count}`)
    return false
  }
  fs.writeFileSync(path, src.replace(anchor, replacement))
  console.log(`✅ ${path} — model updated`)
  return true
}

const ok1 = patchFile(
  'supabase/functions/ai-score-suggestion/index.ts',
  'models/gemini-2.5-flash:generateContent',
  'models/gemini-3.5-flash:generateContent'
)
const ok2 = patchFile(
  'supabase/functions/ai-dsat-suggestion/index.ts',
  'models/gemini-2.5-flash:generateContent',
  'models/gemini-3.5-flash:generateContent'
)

if (!ok1 || !ok2) process.exitCode = 1
