const fs = require('fs')

function patchFile(path, anchor, replacement) {
  const src = fs.readFileSync(path, 'utf8')
  const count = src.split(anchor).length - 1
  if (count !== 1) {
    console.log(`❌ ${path} — expected 1 match, found ${count}`)
    return false
  }
  fs.writeFileSync(path, src.replace(anchor, replacement))
  console.log(`✅ ${path} — single-attempt budget added`)
  return true
}

const scoreAnchor = `    let geminiRes: Response | undefined
    const maxAttempts = 2
    const perAttemptTimeoutMs = 55000
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeoutMs)
      try {
        geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                thinkingConfig: { thinkingLevel: "LOW" },
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    suggestions: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: {
                          questionId: { type: "STRING" },
                          score: { type: "STRING", enum: ["pass", "fail", "na"] },
                          comment: { type: "STRING" },
                        },
                        required: ["questionId", "score", "comment"],
                      },
                    },
                  },
                  required: ["suggestions"],
                },
              },
            }),
          },
        )
      } catch (fetchErr) {
        console.error(\`Gemini fetch failed (attempt \${attempt}/\${maxAttempts}):\`, fetchErr?.message || fetchErr)
        geminiRes = undefined
      } finally {
        clearTimeout(timeoutId)
      }
      if (geminiRes?.ok) break
      if (geminiRes) {
        const errText = await geminiRes.text()
        console.error(\`Gemini API error (attempt \${attempt}/\${maxAttempts}):\`, geminiRes.status, errText)
        if (geminiRes.status !== 503) break
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      return new Response(JSON.stringify({ error: "Gemini request failed or timed out — please try again in a moment" }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }`

const scoreReplacement = `    const startTime = Date.now()
    const totalBudgetMs = 135000 // stay under Supabase's 150s wall-clock kill
    let geminiRes: Response | undefined
    for (let attempt = 1; attempt <= 2; attempt++) {
      const remaining = totalBudgetMs - (Date.now() - startTime)
      if (remaining < 10000) break
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), remaining)
      const attemptStart = Date.now()
      try {
        geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                thinkingConfig: { thinkingLevel: "MINIMAL" },
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    suggestions: {
                      type: "ARRAY",
                      items: {
                        type: "OBJECT",
                        properties: {
                          questionId: { type: "STRING" },
                          score: { type: "STRING", enum: ["pass", "fail", "na"] },
                          comment: { type: "STRING" },
                        },
                        required: ["questionId", "score", "comment"],
                      },
                    },
                  },
                  required: ["suggestions"],
                },
              },
            }),
          },
        )
      } catch (fetchErr) {
        console.error(\`Gemini fetch failed (attempt \${attempt}):\`, fetchErr?.message || fetchErr)
        geminiRes = undefined
        break // timed out or network failure — budget is spent, no point retrying
      } finally {
        clearTimeout(timeoutId)
      }
      if (geminiRes.ok) break
      const errText = await geminiRes.text()
      console.error(\`Gemini API error (attempt \${attempt}):\`, geminiRes.status, errText)
      const attemptDuration = Date.now() - attemptStart
      // Only retry a FAST failure (e.g. an instant 503) — a slow failure means the budget's gone.
      if (geminiRes.status !== 503 || attemptDuration > 15000) break
    }

    if (!geminiRes || !geminiRes.ok) {
      return new Response(JSON.stringify({ error: "Gemini request failed or timed out — please try again in a moment" }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }`

const dsatAnchor = `    let geminiRes: Response | undefined
    const maxAttempts = 2
    const perAttemptTimeoutMs = 55000
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), perAttemptTimeoutMs)
      try {
        geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                thinkingConfig: { thinkingLevel: "LOW" },
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    answer: { type: "STRING", enum: options },
                    reasoning: { type: "STRING" },
                  },
                  required: ["answer", "reasoning"],
                },
              },
            }),
          },
        )
      } catch (fetchErr) {
        console.error(\`Gemini fetch failed (attempt \${attempt}/\${maxAttempts}):\`, fetchErr?.message || fetchErr)
        geminiRes = undefined
      } finally {
        clearTimeout(timeoutId)
      }
      if (geminiRes?.ok) break
      if (geminiRes) {
        const errText = await geminiRes.text()
        console.error(\`Gemini API error (attempt \${attempt}/\${maxAttempts}):\`, geminiRes.status, errText)
        if (geminiRes.status !== 503) break
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      return new Response(JSON.stringify({ error: "Gemini request failed or timed out — please try again in a moment" }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }`

const dsatReplacement = `    const startTime = Date.now()
    const totalBudgetMs = 135000
    let geminiRes: Response | undefined
    for (let attempt = 1; attempt <= 2; attempt++) {
      const remaining = totalBudgetMs - (Date.now() - startTime)
      if (remaining < 10000) break
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), remaining)
      const attemptStart = Date.now()
      try {
        geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                thinkingConfig: { thinkingLevel: "MINIMAL" },
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    answer: { type: "STRING", enum: options },
                    reasoning: { type: "STRING" },
                  },
                  required: ["answer", "reasoning"],
                },
              },
            }),
          },
        )
      } catch (fetchErr) {
        console.error(\`Gemini fetch failed (attempt \${attempt}):\`, fetchErr?.message || fetchErr)
        geminiRes = undefined
        break
      } finally {
        clearTimeout(timeoutId)
      }
      if (geminiRes.ok) break
      const errText = await geminiRes.text()
      console.error(\`Gemini API error (attempt \${attempt}):\`, geminiRes.status, errText)
      const attemptDuration = Date.now() - attemptStart
      if (geminiRes.status !== 503 || attemptDuration > 15000) break
    }

    if (!geminiRes || !geminiRes.ok) {
      return new Response(JSON.stringify({ error: "Gemini request failed or timed out — please try again in a moment" }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }`

const ok1 = patchFile('supabase/functions/ai-score-suggestion/index.ts', scoreAnchor, scoreReplacement)
const ok2 = patchFile('supabase/functions/ai-dsat-suggestion/index.ts', dsatAnchor, dsatReplacement)

if (!ok1 || !ok2) process.exitCode = 1
