import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Same best-effort PII redaction as ai-score-suggestion — not a compliance guarantee,
// just a defense-in-depth pass before anything leaves Kaizen's systems.
function redactPII(text: string): string {
  if (!text) return text
  let out = text
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[EMAIL_REDACTED]")
  out = out.replace(/\b(?:\d[ -]?){10,19}\b/g, "[NUMBER_REDACTED]")
  out = out.replace(/\+\d[\d ()-]{6,14}\d/g, "[NUMBER_REDACTED]")
  return out
}

// Phase 4: one call = one routing question in the BPO DSAT (Vendor, non-spot-check)
// decision tree. The client walks Controllability -> Level 1 -> Level 2 itself,
// calling this once per section (max 3 calls), because which section comes next
// depends on what the AI answered for the previous one — the branching tree lives
// client-side in dsatSections/dsatQuestions/dsatOptions, this function only ever
// sees one question + its option labels at a time.
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  try {
    const { transcript, sectionTitle, questionTitle, options } = await req.json()

    if (!transcript || typeof transcript !== "string") {
      return new Response(JSON.stringify({ error: "transcript is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }
    if (!questionTitle || typeof questionTitle !== "string") {
      return new Response(JSON.stringify({ error: "questionTitle is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }
    if (!Array.isArray(options) || options.length === 0) {
      return new Response(JSON.stringify({ error: "options array is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      })
    }

    const redacted = redactPII(transcript)

    const prompt = `You are assisting a human QA evaluator scoring a customer support DSAT (dissatisfaction) case. You are NOT making the final decision — the evaluator will review and can change your answer.

Read the customer service interaction transcript below (some personal details have already been redacted) and answer ONE question about it${sectionTitle ? ` (section: "${sectionTitle}")` : ""}:

"${questionTitle}"

You MUST pick exactly one of these options: ${options.map((o: string) => `"${o}"`).join(", ")}

Respond only with the requested JSON: the chosen option (must match one of the options exactly) and a short (1-2 sentence) justification grounded in the transcript.

Transcript (PII redacted):
"""
${redacted}
"""`

    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key is not configured on the server" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      )
    }

    let geminiRes: Response | undefined
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
        console.error(`Gemini fetch failed (attempt ${attempt}/${maxAttempts}):`, fetchErr?.message || fetchErr)
        geminiRes = undefined
      } finally {
        clearTimeout(timeoutId)
      }
      if (geminiRes?.ok) break
      if (geminiRes) {
        const errText = await geminiRes.text()
        console.error(`Gemini API error (attempt ${attempt}/${maxAttempts}):`, geminiRes.status, errText)
        if (geminiRes.status !== 503) break
      }
    }

    if (!geminiRes || !geminiRes.ok) {
      return new Response(JSON.stringify({ error: "Gemini request failed or timed out — please try again in a moment" }), {
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
    console.error("ai-dsat-suggestion error:", e?.message || e)
    return new Response(JSON.stringify({ error: "Unexpected server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    })
  }
})
