import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { assessmentsTable, questionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

function parseWritingMetaFromExplanation(explanation: string | null | undefined): {
  maxAttempts: number | null;
  dueDate: string | null;
} {
  if (!explanation) return { maxAttempts: null, dueDate: null };
  try {
    const payload = JSON.parse(explanation) as { maxAttempts?: unknown; dueDate?: unknown };
    const maxAttempts = Number.isFinite(Number(payload.maxAttempts)) ? Math.max(1, Number(payload.maxAttempts)) : null;
    const dueDate = typeof payload.dueDate === "string" && payload.dueDate.trim().length > 0 ? payload.dueDate : null;
    return { maxAttempts, dueDate };
  } catch {
    return { maxAttempts: null, dueDate: null };
  }
}

router.get("/assessments", async (req: Request, res: Response) => {
  const { type, subject, grade } = req.query;
  let assessments = await db.select().from(assessmentsTable);

  if (type) assessments = assessments.filter(a => a.type === type);
  if (subject) assessments = assessments.filter(a => a.subject === subject);
  if (grade) assessments = assessments.filter(a => a.grade === grade);

  if (assessments.length === 0) return res.json(assessments);

  const questionRows = await db.select().from(questionsTable);
  const questionsByAssessment = questionRows.reduce((acc: Record<string, typeof questionRows>, q) => {
    if (!acc[q.assessmentId]) acc[q.assessmentId] = [];
    acc[q.assessmentId].push(q);
    return acc;
  }, {});

  const enriched = assessments.map((a) => {
    const questions = (questionsByAssessment[a.id] || []).sort((x, y) => x.orderIndex - y.orderIndex);
    const rubricSourceQuestion = questions.find((q) => q.type === "essay") ?? questions[0];
    const meta = parseWritingMetaFromExplanation(rubricSourceQuestion?.explanation);
    return {
      ...a,
      maxAttempts: meta.maxAttempts ?? 1,
      dueDate: meta.dueDate,
    };
  });

  return res.json(enriched);
});

router.post("/assessments", async (req: Request, res: Response) => {
  const { title, type, subject, grade, classId, description, duration, difficulty } = req.body;
  const id = uuidv4();
  const [assessment] = await db.insert(assessmentsTable).values({
    id,
    title,
    type,
    subject,
    grade,
    classId: classId ?? null,
    description: description ?? null,
    duration,
    questionCount: 0,
    difficulty,
    status: "active",
  }).returning();

  return res.status(201).json(assessment);
});

router.get("/assessments/:assessmentId", async (req: Request, res: Response) => {
  const { assessmentId } = req.params;
  const assessments = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, assessmentId as string)).limit(1);
  const assessment = assessments[0];

  if (!assessment) {
    return res.status(404).json({ error: "not_found", message: "Assessment not found" });
  }

  const questions = await db.select().from(questionsTable).where(eq(questionsTable.assessmentId, assessmentId as string));
  questions.sort((a, b) => a.orderIndex - b.orderIndex);

  let rubric: unknown = null;
  let rubricParams: unknown = null;
  let maxAttempts: number | null = null;
  let dueDate: string | null = null;

  // Writing assessments persist rubric metadata in the essay question explanation payload.
  const rubricSourceQuestion = questions.find((q) => q.type === "essay") ?? questions[0];
  if (rubricSourceQuestion?.explanation) {
    try {
      const payload = JSON.parse(rubricSourceQuestion.explanation) as {
        rubric?: unknown;
        rubricParams?: unknown;
      };
      rubric = payload.rubric ?? null;
      rubricParams = payload.rubricParams ?? null;
      const meta = parseWritingMetaFromExplanation(rubricSourceQuestion.explanation);
      maxAttempts = meta.maxAttempts;
      dueDate = meta.dueDate;
    } catch {
      rubric = null;
      rubricParams = null;
      maxAttempts = null;
      dueDate = null;
    }
  }

  return res.json({ ...assessment, questions, rubric, rubricParams, maxAttempts: maxAttempts ?? 1, dueDate });
});

router.get("/assessments/:assessmentId/questions", async (req: Request, res: Response) => {
  const { assessmentId } = req.params;
  const questions = await db.select().from(questionsTable).where(eq(questionsTable.assessmentId, assessmentId as string));
  questions.sort((a, b) => a.orderIndex - b.orderIndex);
  return res.json(questions);
});

router.post("/assessments/:assessmentId/questions", async (req: Request, res: Response) => {
  const { assessmentId } = req.params;
  const { text, type, options, correctAnswer, explanation, audioScript, points, difficulty, skill, orderIndex } = req.body;

  const id = uuidv4();
  const [question] = await db.insert(questionsTable).values({
    id,
    assessmentId: assessmentId as string,
    text,
    type,
    options: options ?? null,
    correctAnswer: correctAnswer ?? null,
    explanation: explanation ?? null,
    audioScript: audioScript ?? null,
    points,
    difficulty,
    skill: skill ?? null,
    orderIndex,
  }).returning();

  const allQuestions = await db.select().from(questionsTable).where(eq(questionsTable.assessmentId, assessmentId as string));
  await db.update(assessmentsTable).set({ questionCount: allQuestions.length }).where(eq(assessmentsTable.id, assessmentId as string));

  return res.status(201).json(question);
});

router.delete("/assessments/:assessmentId", async (req: Request, res: Response) => {
  const { assessmentId } = req.params;

  // Delete all questions associated with the assessment
  await db.delete(questionsTable).where(eq(questionsTable.assessmentId, assessmentId as string));
  
  // Delete the assessment itself
  await db.delete(assessmentsTable).where(eq(assessmentsTable.id, assessmentId as string));

  return res.json({ success: true, message: "Assessment and associated questions deleted successfully" });
});

router.post("/questions/brief", async (req: Request, res: Response) => {
  const { questionText, questionType, options, backgroundInformation, sources } = req.body ?? {};

  if (typeof questionText !== "string" || questionText.trim().length < 5) {
    return res.status(400).json({
      error: "bad_request",
      message: "Question text is required",
    });
  }

  const qType = typeof questionType === "string" ? questionType : "essay";
  const optionsText = Array.isArray(options) ? options.join(" | ") : "(none)";
  const bgText = typeof backgroundInformation === "string" ? backgroundInformation : "(none)";
  const sourcesText = Array.isArray(sources) ? JSON.stringify(sources).slice(0, 1500) : "(none)";

  const systemInstruction = `You are given an assessment question. You must help students understand the question. You must explain what the question is asking in clear, student-friendly language.

Guidelines:
- You must never answer the question itself. 
- You must never give tips or advice on how to answer the question.
- The output must be in plain text format, it must not contain any markdown, bullet points, or labels.
- Keep your response concise.

Following is some context on the question to help you provide a clear explanation.
Question Type: ${qType}
Question: ${questionText}
Answer Options (if any): ${optionsText}
Background Information: ${bgText}
Sources: ${sourcesText}`;

//   const userPrompt = `A student needs help understanding what this question is asking. 
// Explain it to them clearly and concretely.

// Rules:
// - Use plain conversational prose (no markdown, bullets, or headers).
// - Name at least 3 specific terms or concepts directly from the question.
// - Clarify any tricky vocabulary in the question itself.
// - If background or sources are provided, briefly explain how they relate to the question's topic.
// - Do NOT answer the question.
// - Do NOT give essay-writing tips or structure advice.
// - Keep it between 80–160 words.

// ---
// Question Type: ${qType}
// Question: ${questionText}
// Answer Options (if any): ${optionsText}
// Background Information: ${bgText}
// Sources: ${sourcesText}`;

  const toCompletedSentences = (value: string): string => {
    const clean = String(value ?? "").replace(/\s+/g, " ").trim();
    if (!clean) return "";
    const lastTerminal = Math.max(
      clean.lastIndexOf("."),
      clean.lastIndexOf("!"),
      clean.lastIndexOf("?")
    );
    return lastTerminal >= 0 ? clean.slice(0, lastTerminal + 1).trim() : `${clean}.`;
  };

  const isVague = (text: string): boolean => {
    const lower = text.toLowerCase();
    const genericPhrases = [
      "this question asks you to",
      "you should explain",
      "in your response",
      "be clear and specific",
      "support your ideas",
      "provide evidence",
      "think about",
      "consider the following",
    ];
    const hits = genericPhrases.filter((p) => lower.includes(p)).length;
    // Extract meaningful words (6+ chars) to gauge topic specificity
    const meaningfulWords = (text.match(/[a-zA-Z]{6,}/g) ?? []).map((w) => w.toLowerCase());
    const uniqueMeaningful = new Set(meaningfulWords);
    return hits >= 2 || uniqueMeaningful.size < 15;
  };

  const preferredModels = ["gemini-3-flash-preview", "gemini-2.5-flash"];
  let lastError: unknown = null;
  // const combinedPrompt = `${systemInstruction}\n\n${userPrompt}`;
  const combinedPrompt = systemInstruction;

  for (const model of preferredModels) {
    try {
      const firstResponse = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: combinedPrompt }] }],
        config: { temperature: 0.0 },
      });

      let brief = toCompletedSentences(String(firstResponse.text ?? ""));

      if (isVague(brief)) {
        // Pass the original response back so the model can self-correct
        const correctionPrompt = `Your previous explanation was too generic. Here it is:

"${brief}"

Rewrite it so it is grounded specifically in THIS question: "${questionText}"
- Name at least 3 specific concepts or terms from the question above.
- Stay between 90–170 words.
- Plain prose only. End on a complete sentence.
- Do NOT answer the question. Do NOT give writing advice.`;

        const retryResponse = await ai.models.generateContent({
          model,
          contents: [
            { role: "user", parts: [{ text: combinedPrompt }] },
            { role: "model", parts: [{ text: brief }] },
            { role: "user", parts: [{ text: correctionPrompt }] },
          ],
          config: { maxOutputTokens: 520, temperature: 0.3 },
        });

        const retried = toCompletedSentences(String(retryResponse.text ?? ""));
        if (retried.length > 0) brief = retried;
      }

      if (brief.length > 0) return res.json({ brief });
    } catch (error) {
      lastError = error;
      console.warn("[POST /api/questions/brief] Model attempt failed:", { model, error });
    }
  }

  console.error("[POST /api/questions/brief] All models failed:", lastError);
  return res.status(500).json({
    error: "ai_error",
    message: "Failed to generate question brief",
  });
});

export default router;
