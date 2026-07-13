import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

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

    let geminiRes: Response | undefined
    const maxAttempts = 3
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      geminiRes = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
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
      if (geminiRes.ok) break
      const errText = await geminiRes.text()
      console.error(`Gemini API error (attempt ${attempt}/${maxAttempts}):`, geminiRes.status, errText)
      // Only 503 (model overloaded) is worth retrying — other statuses will just fail the same way again.
      if (geminiRes.status !== 503 || attempt === maxAttempts) break
      await new Promise((r) => setTimeout(r, attempt * 1500))
    }

    if (!geminiRes || !geminiRes.ok) {
      return new Response(JSON.stringify({ error: "Gemini request failed" }), {
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
