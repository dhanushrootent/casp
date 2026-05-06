import { Router, type IRouter, type Request, type Response } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import { v4 as uuidv4 } from "uuid";

const router: IRouter = Router();
const VEO_VIDEO_MODEL = "veo-3.1-lite-generate-preview";
const VIDEO_POLL_INTERVAL_MS = 5000;
const VIDEO_POLL_TIMEOUT_MS = 60000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildVideoGenerationPrompt(input: {
  assignmentPrompt: string;
  sourceTitle: string;
  sourceDescription: string;
  grade: string;
  subject?: string;
  backgroundInformation?: string;
}): string {
  const safeBackground = truncateToWordLimit(input.backgroundInformation ?? "", 120);
  const safeSourceDescription = truncateToWordLimit(input.sourceDescription, 120);
  return `Create a short, classroom-safe educational video clip for a K-12 writing assignment.

Context:
- Grade: ${input.grade}
- Subject: ${input.subject && input.subject.trim().length > 0 ? input.subject : "English Language Arts"}
- Assignment prompt: ${truncateToWordLimit(input.assignmentPrompt, 140)}
- Source title: ${input.sourceTitle}
- Source description: ${safeSourceDescription}
${safeBackground ? `- Background context: ${safeBackground}` : ""}

Video requirements:
- Keep visuals age-appropriate and non-violent.
- Focus on historically/scientifically plausible details aligned with the assignment.
- Style should look like an educational explainer reference clip.
- Include no watermarks, logos, or overlaid text.`;
}

async function maybeGenerateVideoSourceUrl(input: {
  source: {
    title: string;
    description: string;
    type: string;
    url?: string;
  };
  assignmentPrompt: string;
  grade: string;
  subject?: string;
  backgroundInformation?: string;
  teacherProvidedSources?: string[];
}): Promise<string | undefined> {
  if (String(input.source.type).toLowerCase() !== "video") return input.source.url;
  const existingUrl =
    typeof input.source.url === "string" && input.source.url.trim().length > 0
      ? input.source.url.trim()
      : undefined;
  const teacherSourceSet = new Set(
    (input.teacherProvidedSources ?? [])
      .map((s) => String(s ?? "").trim())
      .filter((s) => /^https?:\/\//i.test(s))
      .map((s) => s.toLowerCase()),
  );
  const isTeacherProvidedUrl = existingUrl
    ? teacherSourceSet.has(existingUrl.toLowerCase())
    : false;

  try {
    const prompt = buildVideoGenerationPrompt({
      assignmentPrompt: input.assignmentPrompt,
      sourceTitle: input.source.title,
      sourceDescription: input.source.description,
      grade: input.grade,
      subject: input.subject,
      backgroundInformation: input.backgroundInformation,
    });

    let operation = await ai.models.generateVideos({
      model: VEO_VIDEO_MODEL,
      prompt,
      config: { numberOfVideos: 1 },
    });

    const startedAt = Date.now();
    while (!operation?.done && Date.now() - startedAt < VIDEO_POLL_TIMEOUT_MS) {
      await sleep(VIDEO_POLL_INTERVAL_MS);
      operation = await ai.operations.getVideosOperation({ operation });
    }

    if (!operation?.done) {
      console.warn("[writing] Veo video generation timed out", {
        model: VEO_VIDEO_MODEL,
        sourceTitle: input.source.title,
      });
      return undefined;
    }

    const generatedVideo = (operation as any)?.response?.generatedVideos?.[0]?.video;
    const maybeUri =
      (typeof generatedVideo?.uri === "string" && generatedVideo.uri.trim().length > 0
        ? generatedVideo.uri
        : undefined) ??
      (typeof generatedVideo?.downloadUri === "string" && generatedVideo.downloadUri.trim().length > 0
        ? generatedVideo.downloadUri
        : undefined);

    if (!maybeUri) {
      console.warn("[writing] Veo completed without a usable video URL", {
        sourceTitle: input.source.title,
      });
    }
    // Prefer generated Veo URL for AI-proposed video sources.
    // Preserve teacher-provided links as authoritative references.
    return isTeacherProvidedUrl ? existingUrl : maybeUri ?? existingUrl;
  } catch (error) {
    console.warn("[writing] Veo video generation failed, continuing without URL", {
      sourceTitle: input.source.title,
      error,
    });
    return existingUrl;
  }
}

function safeJsonFromModelText(rawText: string): unknown {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // 1) Best case: model returned pure JSON.
  try {
    return JSON.parse(cleaned);
  } catch {
    // continue
  }

  // 2) Common case: extra text around a JSON object.
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    const maybeObj = cleaned.slice(objStart, objEnd + 1);
    try {
      return JSON.parse(maybeObj);
    } catch {
      // continue
    }
  }

  // 3) Fallback: extra text around a JSON array.
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    const maybeArr = cleaned.slice(arrStart, arrEnd + 1);
    try {
      return JSON.parse(maybeArr);
    } catch {
      // continue
    }
  }

  return null;
}

function sanitizeSuggestion(value: string): string {
  return value
    .replace(/^["'`\[{(]+/, "")
    .replace(/["'`\]}):,]+$/, "")
    .replace(/^suggestions?["']?\s*:\s*\[?/i, "")
    .replace(/^\s*\{\s*$/g, "")
    .replace(/^\s*\[\s*$/g, "")
    .replace(/^\s*\}\s*$/g, "")
    .replace(/^\s*\]\s*$/g, "")
    .trim();
}

function isValidSuggestion(value: string): boolean {
  if (!value) return false;
  if (/^suggestions?\s*:?$/i.test(value)) return false;
  if (/^suggestions?["']?\s*:\s*\[?$/i.test(value)) return false;
  if (/^[\[\]\{\}"'`:,]+$/.test(value)) return false;
  return true;
}

function parseSuggestionsFromPlainText(rawText: string): string[] {
  return rawText
    .split("\n")
    .map((line) => line.replace(/^[\s\-*0-9.)]+/, "").trim())
    .map(sanitizeSuggestion)
    .filter(isValidSuggestion)
    .slice(0, 5);
}

function buildFallbackSuggestions(input: {
  grade: string;
  rubricType: string;
  difficulty: string;
  subject?: string;
  genre?: string;
}): string[] {
  const subject = input.subject && input.subject.trim().length > 0 ? input.subject : "English Language Arts";
  const genreLabel = input.genre && input.genre.trim().length > 0 ? input.genre : "general";

  const byGenre: Record<string, string[]> = {
    political: [
      "Should the voting age be lowered for local elections?",
      "How do campaign messages influence public opinion?",
      "What responsibilities do citizens have during an election year?",
      "Should student councils have more influence over school policy?",
      "How should governments balance safety and personal freedom?",
    ],
    geographical: [
      "How does geography shape where people choose to live?",
      "Why do some cities grow faster than others?",
      "How do rivers, mountains, and coastlines influence communities?",
      "What challenges do people face when living in extreme climates?",
      "How does location affect trade, travel, and culture?",
    ],
    personal_experience: [
      "A moment when you had to make a difficult decision",
      "An experience that changed how you see your community",
      "A challenge that taught you perseverance",
      "A time when teamwork helped solve a problem",
      "An experience that made you more confident",
    ],
    historical: [
      "What caused the American Revolution to begin?",
      "How did the Civil Rights Movement change the United States?",
      "What can students learn from the Great Depression today?",
      "How did ancient civilizations adapt to their environments?",
      "Which invention had the biggest impact on daily life in history?",
    ],
    scientific: [
      "How should communities respond to climate change?",
      "Should space exploration remain a major priority?",
      "What are the benefits and risks of artificial intelligence?",
      "How does the water cycle affect human life?",
      "Why is biodiversity important to healthy ecosystems?",
    ],
    literary: [
      "How does a character's point of view shape a story?",
      "Why do authors use symbolism in novels and poems?",
      "How does conflict reveal a character's values?",
      "What makes a setting important in literature?",
      "How can a theme connect fiction to real life?",
    ],
    social_issue: [
      "Should schools limit student cellphone use during the day?",
      "How can communities address homelessness more effectively?",
      "Should social media companies do more to reduce misinformation?",
      "How can schools better support student mental health?",
      "What is the best way to reduce food waste in communities?",
    ],
    biographical: [
      "What made Malala Yousafzai an influential leader?",
      "How did Cesar Chavez inspire social change?",
      "What obstacles did Marie Curie overcome in her career?",
      "How did Nelson Mandela demonstrate resilience and leadership?",
      "What can students learn from the life of Amelia Earhart?",
    ],
    cultural: [
      "How do traditions help shape cultural identity?",
      "Why is preserving local history and heritage important?",
      "How does music reflect the values of a culture?",
      "What can food tell us about a community's history?",
      "How do celebrations bring communities together?",
    ],
    environmental: [
      "How can communities reduce plastic pollution?",
      "Should cities invest more in public transportation to protect the environment?",
      "What causes wildfires to become more destructive?",
      "How can students help protect local ecosystems?",
      "Why is water conservation becoming more important each year?",
    ],
  };

  const genreSuggestions = byGenre[genreLabel] ?? [
    `How does ${subject} connect to students' lives outside the classroom?`,
    `What issue in ${subject} matters most to young people today?`,
    `How can students use what they learn in ${subject} to improve their community?`,
    `What challenge in ${subject} is most important to solve in the future?`,
    `How does perspective influence the way people understand ${subject}?`,
  ];

  return genreSuggestions;
}

function ensureFiveSuggestions(
  suggestions: string[],
  fallbackInput: { grade: string; rubricType: string; difficulty: string; subject?: string; genre?: string },
): string[] {
  const deduped = Array.from(
    new Map(
      suggestions
        .map(sanitizeSuggestion)
        .filter(isValidSuggestion)
        .map((item) => [item.toLowerCase(), item] as const),
    ).values(),
  );

  const fallback = buildFallbackSuggestions(fallbackInput);
  for (const item of fallback) {
    if (deduped.length >= 5) break;
    if (!deduped.some((existing) => existing.toLowerCase() === item.toLowerCase())) {
      deduped.push(item);
    }
  }

  return deduped.slice(0, 5);
}

function clampInt(n: unknown, min: number, max: number): number {
  const parsed = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function truncateToWordLimit(value: unknown, maxWords: number): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= maxWords) return text;
  return `${words.slice(0, maxWords).join(" ")}...`;
}

/** Primary sources need room for citation + verbatim excerpts within the global cap (500 words). */
function truncateSourceDescription(s: { type?: unknown; description?: unknown }, maxWords: number): string {
  const typ = String(s?.type ?? "").toLowerCase();
  const cap = typ === "primary_source" ? Math.min(500, Math.max(maxWords, 280)) : maxWords;
  return truncateToWordLimit(s?.description, cap);
}

/** Injected into Gemini prompts for /writing/generate and /writing/finalize. */
const PRIMARY_SOURCE_DOCUMENTATION_RULES = `
PRIMARY SOURCE DOCUMENTATION (for any source with type "primary_source", or when a teacher-provided hint is clearly an archival / first-hand document):
- Use only real, verifiable documents (for example: laws, treaties, speeches, letters, official records, census tables, museum or National Archives finding aids). Do not invent archive names, collection numbers, or fabricated direct quotes.
- When the teacher supplied a URL or document title for a primary source, preserve that "url" and "title" exactly as given; do not substitute a different document.
- For every "primary_source" entry, the "description" MUST use this exact three-part structure (labels and order):
  Citation (documented): One line with full document title, author or issuing body, date of the document, and repository, collection, or stable URL when known.
  Evidence (verbatim): One or two short excerpts in quotation marks copied verbatim from the source. If exact wording cannot be verified from public text, write: Evidence (verbatim): (exact wording not verified here) and then a single factual line labeled Paraphrase (attributed): — never invent a fake quotation.
  Relevance: 1–2 sentences connecting this documented evidence to the assignment.
- For non-primary types (article, book, website, video), keep descriptions concise; include verbatim quotes only when you are confident they match a public excerpt.
`.trim();

function normalizeGradeResponse(parsed: any) {
  const isWeakFeedback = (text: string) => {
    const t = text.trim().toLowerCase();
    if (t.length < 40) return true;
    return /good job|needs improvement|well done|keep it up|nice work|more detail needed/.test(t);
  };
  const criteriaScores = Array.isArray(parsed?.criteriaScores)
    ? parsed.criteriaScores.map((c: any, idx: number) => ({
        criterionId: String(c?.criterionId ?? `criterion_${idx + 1}`),
        criterionName: String(c?.criterionName ?? `Criterion ${idx + 1}`),
        score: Number.isFinite(Number(c?.score)) ? Number(c.score) : 0,
        maxScore: Number.isFinite(Number(c?.maxScore)) ? Number(c.maxScore) : 0,
        level: String(c?.level ?? "Developing"),
        feedback: (() => {
          const raw = String(c?.feedback ?? "").trim();
          if (!isWeakFeedback(raw)) return raw;
          const criterionName = String(c?.criterionName ?? `Criterion ${idx + 1}`);
          const level = String(c?.level ?? "Developing");
          const quoteSnippet =
            Array.isArray(c?.quotes) && c.quotes.length > 0
              ? String(c.quotes[0] ?? "").trim()
              : "";
          return [
            `In ${criterionName}, your current level is ${level}.`,
            quoteSnippet
              ? `Evidence from your response: "${quoteSnippet}".`
              : "Your response does not yet include strong direct evidence for this rubric row.",
            "To improve this score, revise this section with one concrete supporting detail and one explicit explanation sentence that links the detail to your main claim.",
          ].join(" ");
        })(),
        quotes: Array.isArray(c?.quotes)
          ? c.quotes.map((q: unknown) => String(q ?? "").trim()).filter((q: string) => q.length > 0).slice(0, 2)
          : [],
      }))
    : [];

  const strengths = Array.isArray(parsed?.overallFeedback?.strengths)
    ? parsed.overallFeedback.strengths.map((s: unknown) => String(s ?? "").trim()).filter((s: string) => s.length > 0)
    : [];
  const areasForImprovement = Array.isArray(parsed?.overallFeedback?.areasForImprovement)
    ? parsed.overallFeedback.areasForImprovement
        .map((s: unknown) => String(s ?? "").trim())
        .filter((s: string) => s.length > 0)
    : [];

  const teacherNoteRaw = String(parsed?.overallFeedback?.teacherNote ?? "").trim();
  const studentSummaryRaw = String(parsed?.overallFeedback?.studentSummary ?? "").trim();
  const firstCriterion = criteriaScores[0];
  const firstQuote =
    Array.isArray(firstCriterion?.quotes) && firstCriterion.quotes.length > 0
      ? firstCriterion.quotes[0]
      : "";

  // Always return human, teacher-like observations even if the model response is sparse.
  const teacherNote =
    teacherNoteRaw ||
    `Most immediate scoring driver: ${firstCriterion?.criterionName ?? "rubric alignment"}. The response needs clearer evidence and tighter organization to move from ${firstCriterion?.level ?? "current performance"} to the next level. Targeted revision: add one stronger evidence sentence and explicit analysis in each body paragraph to increase score potential.`;
  const studentSummary =
    studentSummaryRaw ||
    `You have a solid start with clear ideas${firstQuote ? `, especially in "${firstQuote}"` : ""}. To raise your score, make your evidence more specific and explain how each example proves your claim.`;

  return {
    totalScore: Number.isFinite(Number(parsed?.totalScore)) ? Number(parsed.totalScore) : 0,
    maxScore: Number.isFinite(Number(parsed?.maxScore)) ? Number(parsed.maxScore) : 0,
    percentage: Number.isFinite(Number(parsed?.percentage)) ? Number(parsed.percentage) : 0,
    criteriaScores,
    overallFeedback: {
      strengths,
      areasForImprovement,
      teacherNote,
      studentSummary,
    },
    wordCount: Number.isFinite(Number(parsed?.wordCount)) ? Number(parsed.wordCount) : 0,
    paragraphCount: Number.isFinite(Number(parsed?.paragraphCount)) ? Number(parsed.paragraphCount) : 0,
    citationCount: Number.isFinite(Number(parsed?.citationCount)) ? Number(parsed.citationCount) : 0,
    meetsRequirements: {
      wordCount: Boolean(parsed?.meetsRequirements?.wordCount),
      paragraphCount: Boolean(parsed?.meetsRequirements?.paragraphCount),
      citations: Boolean(parsed?.meetsRequirements?.citations),
      thesis: Boolean(parsed?.meetsRequirements?.thesis),
      introConclusion: Boolean(parsed?.meetsRequirements?.introConclusion),
    },
  };
}

router.post("/writing/suggestions", async (req: Request, res: Response) => {
  const { grade, rubricType, difficulty, subject, assessmentType, genre } = req.body ?? {};

  if (typeof grade !== "string" || grade.trim().length === 0) {
    return res.status(400).json({
      error: "bad_request",
      message: "Grade is required",
    });
  }

  if (typeof rubricType !== "string" || rubricType.trim().length === 0) {
    return res.status(400).json({
      error: "bad_request",
      message: "Writing type is required",
    });
  }

  if (typeof difficulty !== "string" || difficulty.trim().length === 0) {
    return res.status(400).json({
      error: "bad_request",
      message: "Difficulty is required",
    });
  }

  if (typeof genre !== "string" || genre.trim().length === 0) {
    return res.status(400).json({
      error: "bad_request",
      message: "Genre is required",
    });
  }

  const prompt = `You are an expert California K-12 curriculum assistant.

Suggest exactly 5 strong writing activity topics for a teacher.

Context:
- Grade: ${grade}
- Writing Type: ${rubricType}
- Difficulty: ${difficulty}
- Genre: ${genre}
- Subject: ${typeof subject === "string" && subject.length > 0 ? subject : "English Language Arts"}
- Assessment Type: ${typeof assessmentType === "string" && assessmentType.length > 0 ? assessmentType : "CAASPP"}

Requirements:
- Topics must be age-appropriate for the grade.
- Tailor them to the requested writing type and difficulty.
- Make them classroom-friendly, specific, concrete, and varied.
- Return only short topic ideas, topic titles, or compact issue/question themes.
- Each suggestion should be brief, ideally 3 to 10 words.
- Do NOT return a full assignment, full writing prompt, or multi-sentence instruction.
- Do NOT return meta instructions like "Write an essay about..." or "Write a piece with a political angle...".
- Do NOT mention the words "genre", "angle", "writing type", "grade", or "difficulty" in the suggestions unless they naturally belong in the topic itself.
- Prefer concrete topics such as historical events, local issues, public policy debates, scientific phenomena, literary themes, personal experiences, or cultural questions.

Return ONLY valid JSON in this exact format:
{
  "suggestions": [
    "string",
    "string",
    "string",
    "string",
    "string"
  ]
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text ?? "";
    const parsed = safeJsonFromModelText(rawText);
    const out = parsed as any;
    const suggestions =
      parsed && typeof parsed === "object" && Array.isArray(out?.suggestions)
        ? out.suggestions
          .map((item: unknown) => String(item ?? "").trim())
          .map(sanitizeSuggestion)
          .filter(isValidSuggestion)
          .slice(0, 5)
        : parseSuggestionsFromPlainText(rawText);

    return res.json({
      suggestions: ensureFiveSuggestions(suggestions, {
        grade,
        rubricType,
        difficulty,
        subject: typeof subject === "string" ? subject : undefined,
        genre: typeof genre === "string" ? genre : undefined,
      }),
    });
  } catch (error) {
    console.error("[POST /api/writing/suggestions] Failed:", error);
    return res.status(500).json({
      error: "ai_error",
      message: "Failed to suggest writing topics",
    });
  }
});

router.post("/writing/finalize", async (req: Request, res: Response) => {
  const {
    topic,
    promptText,
    grade,
    subject,
    assessmentType,
    difficulty,
    rubricType,
    genre,
    teacherProvidedSources,
    sourceDescriptionMaxWords,
  } = req.body ?? {};
  const finalPromptText =
    typeof promptText === "string" && promptText.trim().length > 0
      ? promptText.trim()
      : typeof topic === "string"
        ? topic.trim()
        : "";

  if (finalPromptText.length < 10) {
    return res.status(400).json({
      error: "bad_request",
      message: "Prompt is too short or empty",
    });
  }

  if (typeof grade !== "string" || grade.trim().length === 0) {
    return res.status(400).json({
      error: "bad_request",
      message: "Grade is required",
    });
  }

  if (typeof rubricType !== "string" || rubricType.trim().length === 0) {
    return res.status(400).json({
      error: "bad_request",
      message: "Writing type is required",
    });
  }

  if (typeof difficulty !== "string" || difficulty.trim().length === 0) {
    return res.status(400).json({
      error: "bad_request",
      message: "Difficulty is required",
    });
  }

  if (typeof genre !== "string" || genre.trim().length === 0) {
    return res.status(400).json({
      error: "bad_request",
      message: "Genre is required",
    });
  }

  const safeSourceDescriptionMaxWords = Number.isFinite(Number(sourceDescriptionMaxWords))
    ? clampInt(sourceDescriptionMaxWords, 40, 500)
    : 220;

  const prompt = `You are an expert California K-12 curriculum and writing support assistant.

Create student-facing support materials for a writing assignment.

Context:
- Final writing prompt: ${finalPromptText}
- Grade: ${grade}
- Subject: ${typeof subject === "string" && subject.length > 0 ? subject : "English Language Arts"}
- Assessment Type: ${typeof assessmentType === "string" && assessmentType.length > 0 ? assessmentType : "CAASPP"}
- Writing Type: ${rubricType}
- Difficulty: ${difficulty}
- Genre: ${genre}
- Teacher-provided source hints (prioritize these when relevant): ${
    Array.isArray(teacherProvidedSources) && teacherProvidedSources.length > 0
      ? JSON.stringify(
          teacherProvidedSources.map((s: unknown) => String(s ?? "").trim()).filter((s: string) => s.length > 0),
          null,
          2,
        )
      : "(none provided)"
  }

Requirements:
- Treat the provided final writing prompt as the exact assignment students will answer.
- First, write "backgroundInformation" as 2 to 4 rich, age-appropriate paragraphs. It should help students understand the assignment well enough to plan an outline, write a draft, and revise into a final essay.
- Include exactly 3 to 5 entries in "sources". Each source must be a plausible, classroom-appropriate reference type (title/author/year/url as appropriate).
- If teacher-provided sources are listed, prefer and include them first when they are relevant and age-appropriate.
- If a teacher-provided source is weak or irrelevant, keep it out and replace with a better source.
- Exception: if a teacher-provided item is a primary document (or they gave a URL/title to a specific archival text), include it unless it is clearly inappropriate for the grade; do not replace it with a different primary document.
${PRIMARY_SOURCE_DOCUMENTATION_RULES}
- For each source, the "description" field is NOT a biography of the author and NOT generic "about the book" filler. Instead, it must:
  - Summarize and extend ideas that appear in YOUR "backgroundInformation" above (same topic, key claims, vocabulary, and angle).
  - Explain how reading or using this source would help a student understand the background context and prepare their essay.
  - Be written so a student could grasp the main background ideas relevant to that source by reading the description alone (it may briefly name the work only to anchor the reference).
  - Be at most ${safeSourceDescriptionMaxWords} words per source (count carefully; never exceed this limit).
  - For type "primary_source", follow the PRIMARY SOURCE DOCUMENTATION rules above (citation + verbatim evidence + relevance) within the word limit; prioritize keeping the Citation and Evidence lines intact.
  - For other types, start with a direct, topic-specific statement. Do NOT begin with phrases like "This book", "This source", "This article", "In this book", or similar generic openers.

Return ONLY valid JSON in this exact format:
{
  "backgroundInformation": "string",
  "sources": [
    {
      "title": "string",
      "author": "string (optional)",
      "year": "string (optional)",
      "description": "string (max ${safeSourceDescriptionMaxWords} words; ties to backgroundInformation, not author bio)",
      "type": "article | book | website | primary_source | video",
      "url": "string (optional)"
    }
  ]
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        // Long per-source descriptions (200-300 words × several sources) plus background need headroom.
        maxOutputTokens: 12288,
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text ?? "";
    const parsed = safeJsonFromModelText(rawText);
    if (!parsed || typeof parsed !== "object") {
      console.error("[POST /api/writing/finalize] Raw model text:", rawText);
      return res.status(500).json({
        error: "ai_error",
        message: "Failed to parse AI response",
      });
    }

    const out = parsed as any;
    const normalizedSources = Array.isArray(out.sources)
      ? await Promise.all(
          out.sources.map(async (s: any) => {
            const candidate = {
              title: String(s?.title ?? ""),
              author: s?.author != null ? String(s.author) : undefined,
              year: s?.year != null ? String(s.year) : undefined,
              description: truncateSourceDescription(s, safeSourceDescriptionMaxWords),
              type: String(s?.type ?? "website"),
              url: s?.url != null ? String(s.url) : undefined,
            };
            const generatedVideoUrl = await maybeGenerateVideoSourceUrl({
              source: candidate,
              assignmentPrompt: finalPromptText,
              grade,
              subject: typeof subject === "string" ? subject : undefined,
              backgroundInformation:
                typeof out.backgroundInformation === "string" ? out.backgroundInformation : undefined,
              teacherProvidedSources: Array.isArray(teacherProvidedSources)
                ? teacherProvidedSources.map((s: unknown) => String(s ?? ""))
                : [],
            });
            return {
              ...candidate,
              url: generatedVideoUrl ?? candidate.url,
            };
          }),
        )
      : [];

    return res.json({
      backgroundInformation:
        typeof out.backgroundInformation === "string" ? out.backgroundInformation : "",
      sources: normalizedSources,
    });
  } catch (error) {
    console.error("[POST /api/writing/finalize] Failed:", error);
    return res.status(500).json({
      error: "ai_error",
      message: "Failed to finalize writing topic",
    });
  }
});

router.post("/writing/generate", async (req: Request, res: Response) => {
  const {
    topic,
    grade,
    subject,
    assessmentType,
    difficulty,
    genre,
    promptCount,
    rubricType,
    rubricParams,
    classId,
    metadata,
    teacherProvidedSources,
    sourceDescriptionMaxWords,
  } = req.body ?? {};

  if (typeof topic !== "string" || topic.trim().length < 10) {
    return res.status(400).json({
      error: "bad_request",
      message: "Topic is too short or empty",
    });
  }

  const safePromptCount = clampInt(promptCount, 1, 5);
  const safeSourceDescriptionMaxWords = Number.isFinite(Number(sourceDescriptionMaxWords))
    ? clampInt(sourceDescriptionMaxWords, 40, 500)
    : 220;

  const rp = rubricParams ?? {};
  const minWords = clampInt(rp.minWords, 0, 2000);
  const maxWords = clampInt(rp.maxWords, minWords || 0, 5000);
  const minParagraphs = clampInt(rp.minParagraphs, 0, 20);
  const maxParagraphs = clampInt(rp.maxParagraphs, minParagraphs || 0, 50);
  const minCitations = clampInt(rp.minCitations, 0, 20);
  const maxCitations = clampInt(rp.maxCitations, minCitations || 0, 50);
  const requireThesis = Boolean(rp.requireThesis);
  const requireIntroConclusion = Boolean(rp.requireIntroConclusion);
  const additionalInstructions =
    typeof rp.additionalInstructions === "string" ? rp.additionalInstructions : "";

  const customTitle =
    metadata && typeof metadata === "object" && "assessmentTitle" in metadata
      ? (metadata.assessmentTitle as unknown)
      : undefined;

  const rubricCriteriaRules = `RUBRIC CRITERIA RULES (build dynamically):
- Always include criteria for: Organization, Word Count Adherence, Conventions & Mechanics.
- Include "Evidence & Citations" and weight it higher when minCitations > 0.
- If requireThesis = true, include "Thesis Statement".
- If requireIntroConclusion = true, include "Introduction & Conclusion".
- If rubricType is "argumentative", include "Claim & Counterclaim".
- If rubricType is "narrative", include "Voice & Style".
- Treat "essay" as a valid general essay-writing mode when generating prompts and rubric language.

Weights:
- Include a "weight" percentage for each criterion.
- Ensure the weights sum to exactly 100.
- totalPoints must be set (use 20 unless you have a strong reason to choose a different total).
- points per criterion must be derived from weight and totalPoints (round to integers, and ensure the sum equals totalPoints by adjusting the largest-weight criterion if needed).

Levels:
- Provide exactly 4 levels per criterion with: score, label, description.
- Use these labels: Exemplary, Proficient, Developing, Beginning.
- Scores should be criterion points distributed (e.g. full points, 75%, 50%, 25% rounded).`;

  const prompt = `You are an expert California K-12 writing assessment designer.

TOPIC / TEXT:
${topic.trim()}

CONTEXT:
- Assessment Type: ${assessmentType}
- Subject: ${subject}
- Grade Level: ${grade}
- Difficulty: ${difficulty}
- Genre: ${typeof genre === "string" && genre.length > 0 ? genre : "general"}
- Writing Type (rubricType): ${rubricType}
- Prompts to generate: ${safePromptCount}
${customTitle ? `- Assessment Title (teacher-provided): ${customTitle}` : ""}
${classId ? `- Class ID (context only): ${classId}` : ""}
- Teacher-provided source hints (prioritize these when relevant): ${
    Array.isArray(teacherProvidedSources) && teacherProvidedSources.length > 0
      ? JSON.stringify(
          teacherProvidedSources.map((s: unknown) => String(s ?? "").trim()).filter((s: string) => s.length > 0),
          null,
          2,
        )
      : "(none provided)"
  }

WRITING REQUIREMENTS (rubricParams):
- minWords: ${minWords}
- maxWords: ${maxWords}
- minParagraphs: ${minParagraphs}
- maxParagraphs: ${maxParagraphs}
- requireThesis: ${requireThesis}
- requireIntroConclusion: ${requireIntroConclusion}
- minCitations: ${minCitations}
- maxCitations: ${maxCitations}
- additionalInstructions: ${additionalInstructions ? additionalInstructions : "(none)"}

QUALITY & STANDARDS:
- All content must be age-appropriate for Grade ${grade}.
- Align with California Common Core (or NGSS when applicable) for the provided grade and subject.
- Sources must be plausible, real-world-style suggested references relevant to the topic.
- If teacher-provided sources are supplied, prefer and include them first (when relevant and appropriate), then add supporting sources as needed.
- If a teacher-provided item is a primary document (or they gave a URL/title to a specific archival text), preserve that title and URL exactly; do not swap in a different primary document.
- Each source.description must be concise and useful, with a hard maximum of ${safeSourceDescriptionMaxWords} words for secondary sources; primary sources may use the structured format below and may run longer in the model output (still respect the word budget by prioritizing citation + evidence first).
${PRIMARY_SOURCE_DOCUMENTATION_RULES}

${rubricCriteriaRules}

Return ONLY a valid JSON object in this exact format (no markdown, no commentary):
{
  "assessmentTitle": "string",
  "summary": "string",
  "backgroundInformation": "string",
  "sources": [
    {
      "title": "string",
      "author": "string (optional)",
      "year": "string (optional)",
      "description": "string",
      "type": "article | book | website | primary_source | video",
      "url": "string (optional)"
    }
  ],
  "writingPrompts": [
    {
      "id": "string",
      "text": "string",
      "type": "string",
      "skill": "string",
      "difficulty": "string"
    }
  ],
  "rubric": {
    "totalPoints": 20,
    "criteria": [
      {
        "id": "string",
        "name": "string",
        "description": "string",
        "weight": 0,
        "points": 0,
        "levels": [
          { "score": 0, "label": "Exemplary", "description": "string" },
          { "score": 0, "label": "Proficient", "description": "string" },
          { "score": 0, "label": "Developing", "description": "string" },
          { "score": 0, "label": "Beginning", "description": "string" }
        ]
      }
    ]
  }
}

Additional constraints:
- Generate exactly ${safePromptCount} writingPrompts.
- writingPrompts[].id must be unique and stable-looking (uuid-like or short slug).
- backgroundInformation must be 2–4 paragraphs with helpful academic context for students.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text ?? "";
    const parsed = safeJsonFromModelText(rawText);
    if (!parsed || typeof parsed !== "object") {
      console.error("[POST /api/writing/generate] Raw model text:", rawText);
      return res.status(500).json({
        error: "ai_error",
        message: "Failed to parse AI response",
      });
    }

    const out = parsed as any;

    const writingPrompts = Array.isArray(out.writingPrompts)
      ? out.writingPrompts.map((p: any) => ({
          id: typeof p?.id === "string" && p.id.length > 0 ? p.id : uuidv4(),
          text: String(p?.text ?? ""),
          type: String(p?.type ?? rubricType ?? "writing"),
          skill: String(p?.skill ?? ""),
          difficulty: String(p?.difficulty ?? difficulty ?? "mixed"),
        }))
      : [];

    const normalizedSources = Array.isArray(out.sources)
      ? await Promise.all(
          out.sources.map(async (s: any) => {
            const candidate = {
              title: String(s?.title ?? ""),
              author: s?.author != null ? String(s.author) : undefined,
              year: s?.year != null ? String(s.year) : undefined,
              description: truncateSourceDescription(s, safeSourceDescriptionMaxWords),
              type: String(s?.type ?? "website"),
              url: s?.url != null ? String(s.url) : undefined,
            };
            const generatedVideoUrl = await maybeGenerateVideoSourceUrl({
              source: candidate,
              assignmentPrompt: topic.trim(),
              grade: String(grade ?? ""),
              subject: typeof subject === "string" ? subject : undefined,
              backgroundInformation:
                typeof out.backgroundInformation === "string" ? out.backgroundInformation : undefined,
              teacherProvidedSources: Array.isArray(teacherProvidedSources)
                ? teacherProvidedSources.map((s: unknown) => String(s ?? ""))
                : [],
            });
            return {
              ...candidate,
              url: generatedVideoUrl ?? candidate.url,
            };
          }),
        )
      : [];

    return res.json({
      assessmentTitle:
        (typeof customTitle === "string" && customTitle.length > 0
          ? customTitle
          : undefined) ??
        (typeof out.assessmentTitle === "string" && out.assessmentTitle.length > 0
          ? out.assessmentTitle
          : undefined) ??
        `${grade} Grade ${subject} Writing Activity`,
      summary:
        (typeof out.summary === "string" && out.summary.length > 0
          ? out.summary
          : undefined) ?? `Writing activity for Grade ${grade} ${subject}`,
      backgroundInformation:
        (typeof out.backgroundInformation === "string" ? out.backgroundInformation : "") ?? "",
      sources: normalizedSources,
      writingPrompts,
      rubric: out.rubric ?? { totalPoints: 20, criteria: [] },
    });
  } catch (error) {
    console.error("[POST /api/writing/generate] Failed:", error);
    return res.status(500).json({
      error: "ai_error",
      message: "Failed to generate writing activity",
    });
  }
});

router.post("/writing/grade", async (req: Request, res: Response) => {
  const {
    studentResponse,
    writingPrompt,
    backgroundInformation,
    sources,
    rubric,
    rubricParams,
    grade,
    subject,
    studentName,
  } = req.body ?? {};

  if (typeof studentResponse !== "string" || studentResponse.trim().length < 10) {
    return res.status(400).json({
      error: "bad_request",
      message: "Student response is too short or empty",
    });
  }

  if (typeof writingPrompt !== "string" || writingPrompt.trim().length < 5) {
    return res.status(400).json({
      error: "bad_request",
      message: "Writing prompt is too short or empty",
    });
  }

  const prompt = `You are an expert California K-12 writing teacher and rubric-based scorer.

Grade Level: ${grade}
Subject: ${subject}
Student Name (optional): ${studentName ?? "(not provided)"}

WRITING PROMPT (student was responding to):
${writingPrompt}

BACKGROUND INFORMATION (provided to student):
${typeof backgroundInformation === "string" ? backgroundInformation : ""}

SOURCES PROVIDED TO STUDENT (must be used while evaluating evidence quality and source alignment):
${JSON.stringify(Array.isArray(sources) ? sources : [], null, 2)}

RUBRIC (score strictly against these criteria and their levels; do not invent criteria or levels):
${JSON.stringify(rubric, null, 2)}

RUBRIC PARAMS (mechanical requirements):
${JSON.stringify(rubricParams ?? {}, null, 2)}

STUDENT RESPONSE:
${studentResponse}

SCORING RULES:
- You MUST score strictly against the rubric levels provided.
- You MUST evaluate whether the student response aligns with the provided background information and sources (accuracy, relevance, and evidence usage).
- When a source is type "primary_source" or its description includes "Citation (documented):" and "Evidence (verbatim):", treat those verbatim excerpts as the documented evidence supplied to students. Compare the student's claims to that evidence; do not invent different quotations from the primary text.
- Provide 1–2 direct quotes from the student response per criterion to justify the score.
- Use warm, human, teacher-like language in complete sentences.
- Avoid robotic phrasing and generic filler.
- Make every criterion feedback specific to THIS submission: name the exact weakness and explain how it affected that criterion's score.
- For each criterion, include at least one concrete "what to change" action the student could do to gain points on that exact row.
- For each criterion feedback, explicitly include: (1) achieved level and why, (2) one exact quote/snippet from student response, and (3) one concrete revision that would move the student to the next rubric level.
- overallFeedback.teacherNote must be highly specific (3-5 sentences): strongest evidence in submission, biggest scoring gap, and precise revision plan that would increase score.
- overallFeedback.studentSummary must be specific and student-friendly (2-4 sentences), referencing at least one concrete part of the student's response.
- Compute wordCount, paragraphCount (paragraphs separated by blank lines), and citationCount (count occurrences of bracket citations like [1] or parenthetical citations like (Author, 2020) — best-effort heuristic).
- Determine meetsRequirements booleans for: wordCount, paragraphCount, citations, thesis, introConclusion.

Return ONLY valid JSON in this exact format:
{
  "totalScore": 0,
  "maxScore": 0,
  "percentage": 0,
  "criteriaScores": [
    {
      "criterionId": "string",
      "criterionName": "string",
      "score": 0,
      "maxScore": 0,
      "level": "string",
      "feedback": "string",
      "quotes": ["string"]
    }
  ],
  "overallFeedback": {
    "strengths": ["string"],
    "areasForImprovement": ["string"],
    "teacherNote": "string",
    "studentSummary": "string"
  },
  "wordCount": 0,
  "paragraphCount": 0,
  "citationCount": 0,
  "meetsRequirements": {
    "wordCount": true,
    "paragraphCount": true,
    "citations": true,
    "thesis": true,
    "introConclusion": true
  }
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const rawText = response.text ?? "";
    const parsed = safeJsonFromModelText(rawText);
    if (!parsed || typeof parsed !== "object") {
      console.error("[POST /api/writing/grade] Raw model text:", rawText);
      return res.status(500).json({
        error: "ai_error",
        message: "Failed to parse AI response",
      });
    }

    return res.json(normalizeGradeResponse(parsed));
  } catch (error) {
    console.error("[POST /api/writing/grade] Failed:", error);
    return res.status(500).json({
      error: "ai_error",
      message: "Failed to grade writing response",
    });
  }
});

export default router;

