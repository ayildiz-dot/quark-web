import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// --- Model fallback list -----------------------------------------------------
// Models are tried in order, top to bottom. Stable models come FIRST because
// preview models (like gemini-3-flash-preview) ship with much tighter rate
// limits — that is the most common cause of the "usage limit" errors.
// If a model is rate-limited (429), overloaded (503), or errors out, we
// automatically fall back to the next one. To change priority, just reorder.
const MODELS = [
  "gemini-3.5-flash",       // stable, most capable — primary
  "gemini-3.1-flash-lite",  // stable, fast + low cost — fallback
  "gemini-3-flash-preview", // preview — last resort
]
// -----------------------------------------------------------------------------

// Best-effort PII redaction before anything leaves Kaizen's systems. This is a
// defense-in-depth regex pass, NOT a compliance guarantee — it will not catch every
// name or unusual PII format. Real production rollout should still go through your
// security/compliance review of what these transcripts actually contain.
function redactPII(text: string): string {
  if (!text) return text
  let out = text
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL_REDACTED]")
  out = out.replace(/\b(?:\d[ -]?){10,19}\b/g, "[NUMBER_REDACTED]")
  out = out.replace(/\+\d[\d ()-]{6,14}\d/g, "[NUMBER_REDACTED]")
  return out
}

// v2 (Phase 1 rewrite): each AI Attribute carries its OWN admin-authored prompt
// (written in ScorecardBuilder — Phase 2), rather than one generic prompt covering
// every question. This function only handles Quality AI Attributes for now.
// DSAT Controllability prediction (Phase 4) will extend or sit alongside this.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    const { transcript, attributes } = await req.json()

    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "transcript is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }
    if (!Array.isArray(attributes) || attributes.length === 0) {
      return new Response(JSON.stringify({ error: "attributes array is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }
    for (const a of attributes) {
      if (!a?.id || !a?.ai_prompt) {
        return new Response(
          JSON.stringify({ error: "each attribute needs an id and an ai_prompt" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        )
      }
    }

    const redacted = redactPII(transcript)

    const attributeList = attributes
      .map((a: any, i: number) => {
        const flags = []
        if (a.is_form_critical) flags.push("FORM CRITICAL — a fail here fails the whole evaluation")
        if (a.allow_na === false) flags.push("N/A not allowed")
        const flagText = flags.length ? ` (${flags.join("; ")})` : ""
        return `${i + 1}. [id: ${a.id}] "${a.title}"${flagText}\n   Evaluation instructions: ${a.ai_prompt}`
      })
      .join("\n\n")

    const prompt = `You are assisting a human QA evaluator at a customer support quality team. You are NOT making the final decision — the evaluator will review and can change every suggestion you give.

Read the customer service interaction transcript below (some personal details have already been redacted). For EACH attribute listed, follow ITS OWN evaluation instructions (they differ per attribute — read each one carefully) and decide:
- score: one of "pass", "fail", or "na"
- comment: a short (1-2 sentence) justification grounded in the transcript

Attributes:
${attributeList}

Transcript (PII redacted):
"""
${redacted}
"""

Respond only with the requested JSON, one entry per attribute id listed above.`

    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key is not configured on the server" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    // Same request body is reused for every model in the fallback list.
    const requestBody = JSON.stringify({
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
    })

    const startTime = Date.now()
    const totalBudgetMs = 135000 // stay under Supabase's 150s wall-clock kill
    let geminiRes: Response | undefined
    let lastStatus = 0
    let usedModel = ""

    // Try each model in turn. Move to the next model on any non-OK response
    // (rate limit / overload / error). Retry ONE fast 503 on the same model first.
    outer:
    for (const model of MODELS) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const remaining = totalBudgetMs - (Date.now() - startTime)
        if (remaining < 10000) break outer
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), remaining)
        const attemptStart = Date.now()
        try {
          geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
              signal: controller.signal,
              body: requestBody,
            },
          )
        } catch (fetchErr) {
          console.error(`Gemini fetch failed (model ${model}, attempt ${attempt}):`, fetchErr?.message || fetchErr)
          geminiRes = undefined
          break outer // timed out or network failure — budget is spent
        } finally {
          clearTimeout(timeoutId)
        }
        if (geminiRes.ok) {
          usedModel = model
          break outer
        }
        lastStatus = geminiRes.status
        const errText = await geminiRes.text()
        console.error(`Gemini API error (model ${model}, attempt ${attempt}):`, geminiRes.status, errText)
        const attemptDuration = Date.now() - attemptStart
        // Retry a FAST 503 once on the same model; otherwise fall through to the next model.
        if (geminiRes.status === 503 && attemptDuration <= 15000) continue
        break // try next model
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      // Surface WHY it failed so the QC team can tell a usage limit apart from a timeout.
      let reason = "Gemini request failed or timed out — please try again in a moment"
      if (lastStatus === 429) {
        reason = "Usage limit reached — every Gemini model is rate-limited right now. Wait a minute and try again, or raise the quota in Google AI Studio."
      } else if (lastStatus === 400) {
        reason = "Gemini rejected the request (400) — this scorecard may have too many or too-long AI attributes for a single call. Try fewer AI attributes."
      } else if (lastStatus === 503) {
        reason = "Gemini is temporarily overloaded on every model — please try again in a moment."
      } else if (lastStatus >= 500) {
        reason = `Gemini server error (${lastStatus}) on every model — please try again shortly.`
      }
      console.error("All Gemini models failed. Last status:", lastStatus)
      return new Response(JSON.stringify({ error: reason, lastStatus }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    const geminiData = await geminiRes.json()
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) {
      console.error("Gemini response missing content:", JSON.stringify(geminiData))
      return new Response(JSON.stringify({ error: "Gemini returned an empty response" }), {
        status: 502,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    console.log(`ai-score-suggestion OK using model: ${usedModel}`)
    const parsed = JSON.parse(rawText)

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  } catch (e) {
    console.error("ai-score-suggestion error:", e?.message || e)
    return new Response(JSON.stringify({ error: "Unexpected server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
})
