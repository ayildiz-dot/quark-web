const fs = require('fs')

function addThinkingConfig(path) {
  const src = fs.readFileSync(path, 'utf8')
  const re = /generationConfig:\s*\{\n(\s*)responseMimeType:/
  const matches = src.match(new RegExp(re, 'g')) || []
  if (matches.length !== 1) {
    console.log(`❌ ${path} — expected 1 match, found ${matches.length}`)
    return false
  }
  const indent = src.match(re)[1]
  const newSrc = src.replace(re, `generationConfig: {\n${indent}thinkingConfig: { thinkingLevel: "LOW" },\n${indent}responseMimeType:`)
  fs.writeFileSync(path, newSrc)
  console.log(`✅ ${path} — thinkingConfig added`)
  return true
}

const ok1 = addThinkingConfig('supabase/functions/ai-score-suggestion/index.ts')
const ok2 = addThinkingConfig('supabase/functions/ai-dsat-suggestion/index.ts')

if (!ok1 || !ok2) process.exitCode = 1
