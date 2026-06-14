import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_MODEL = "gemini-2.5-flash";

type CandidateRow = {
  id: string;
  name: string;
  description: string | null;
  cv_text: string | null;
  job_id: string | null;
};

type JobRow = {
  title: string | null;
  role: string | null;
  description: string | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: "Missing Supabase environment variables." }, 500);
  }

  if (!geminiApiKey) {
    return jsonResponse({ error: "AI assessment is not configured." }, 500);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authorization,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "Not authenticated." }, 401);
  }

  const body = await request.json();
  const candidateId = String(body.candidateId ?? "").trim();

  if (!candidateId) {
    return jsonResponse({ error: "candidateId is required." }, 400);
  }

  const { data: candidate, error: candidateError } = await userClient
    .from("candidates")
    .select("id, name, description, cv_text, job_id")
    .eq("id", candidateId)
    .maybeSingle();

  if (candidateError) {
    return jsonResponse({ error: candidateError.message }, 400);
  }

  if (!candidate) {
    return jsonResponse({ error: "Candidate not found." }, 404);
  }

  const candidateRow = candidate as CandidateRow;

  if (!candidateRow.cv_text && !candidateRow.description) {
    return jsonResponse(
      { error: "Add CV text or a description before requesting an AI assessment." },
      400,
    );
  }

  let job: JobRow | null = null;

  if (candidateRow.job_id) {
    const { data: jobData, error: jobError } = await userClient
      .from("jobs")
      .select("title, role, description")
      .eq("id", candidateRow.job_id)
      .maybeSingle();

    if (jobError) {
      return jsonResponse({ error: jobError.message }, 400);
    }

    job = (jobData ?? null) as JobRow | null;
  }

  const prompt = buildPrompt(candidateRow, job);

  let aiText: string;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 300,
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                score: { type: "integer" },
                summary: { type: "string" },
              },
              required: ["score", "summary"],
            },
          },
        }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      const apiMessage = data?.error?.message ?? "Unknown Gemini API error.";
      return jsonResponse({ error: `AI assessment failed: ${apiMessage}` }, 502);
    }

    aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  } catch (fetchError) {
    return jsonResponse(
      { error: `AI assessment request failed: ${(fetchError as Error).message}` },
      502,
    );
  }

  let parsed: { score?: unknown; summary?: unknown };

  try {
    parsed = extractJson(aiText) as { score?: unknown; summary?: unknown };
  } catch {
    return jsonResponse({ error: "AI returned an unexpected response." }, 502);
  }

  const score = clampScore(parsed.score);
  const summary = String(parsed.summary ?? "").trim().slice(0, 240);

  if (score === null || !summary) {
    return jsonResponse({ error: "AI returned an unexpected response." }, 502);
  }

  const { error: updateError } = await userClient
    .from("candidates")
    .update({ ai_score: score, ai_summary: summary })
    .eq("id", candidateId);

  if (updateError) {
    return jsonResponse({ error: updateError.message }, 400);
  }

  return jsonResponse({ score, summary });
});

function buildPrompt(candidate: CandidateRow, job: JobRow | null): string {
  const jobInfo = job
    ? `Job title: ${job.title ?? "N/A"}\nJob role: ${job.role ?? "N/A"}\nJob description: ${job.description ?? "N/A"}`
    : "No job is associated with this candidate.";

  const candidateInfo = `Candidate name: ${candidate.name}\nCandidate notes/description: ${candidate.description ?? "N/A"}\nCV text: ${candidate.cv_text ?? "N/A"}`;

  return `You are assisting a recruiter. Compare the candidate below against the job and assess fit.

${jobInfo}

${candidateInfo}

Score the fit from 1 (poor fit) to 5 (excellent fit), and give a one-sentence summary (max 240 characters) explaining the score.`;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model response.");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function clampScore(value: unknown): number | null {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return null;
  }

  const rounded = Math.round(num);

  if (rounded < 1 || rounded > 5) {
    return null;
  }

  return rounded;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
