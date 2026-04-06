import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { resultsTable, assessmentsTable, questionsTable, usersTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

function parseWritingActivityPayload(explanation: string | null | undefined): any | null {
  if (!explanation) return null;
  try {
    const parsed = JSON.parse(explanation);
    if (parsed && typeof parsed === "object" && parsed.kind === "writing_activity_v1") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function gradeWritingAnswer(params: {
  studentResponse: string;
  writingPrompt: string;
  backgroundInformation: string;
  sources: unknown[];
  rubric: unknown;
  rubricParams: unknown;
  grade: string;
  subject: string;
  studentName?: string;
}) {
  const prompt = `You are an expert California K-12 writing teacher and rubric-based scorer.

Grade Level: ${params.grade}
Subject: ${params.subject}
Student Name (optional): ${params.studentName ?? "(not provided)"}

WRITING PROMPT:
${params.writingPrompt}

BACKGROUND INFORMATION:
${params.backgroundInformation}

SOURCES PROVIDED TO STUDENT:
${JSON.stringify(params.sources ?? [], null, 2)}

RUBRIC:
${JSON.stringify(params.rubric ?? {}, null, 2)}

RUBRIC PARAMS:
${JSON.stringify(params.rubricParams ?? {}, null, 2)}

STUDENT RESPONSE:
${params.studentResponse}

SCORING RULES:
- Score strictly against the rubric levels and requirements provided.
- Evaluate how well the response uses or aligns with the provided background information and sources.
- Consider accuracy, relevance, evidence use, citations, organization, conventions, thesis, introduction, and conclusion where applicable.
- Compute wordCount, paragraphCount, citationCount, and requirement booleans.
- Return only valid JSON in this exact format:
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

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const rawText = response.text ?? "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse AI writing grade response");
  return JSON.parse(jsonMatch[0]);
}

function firstQueryString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function completedAtMs(d: Date | string | null | undefined): number {
  if (d instanceof Date) return d.getTime();
  if (typeof d === "string") return new Date(d).getTime();
  return 0;
}

router.get("/results", async (req: Request, res: Response) => {
  const studentId = firstQueryString(req.query["studentId"]);
  const assessmentId = firstQueryString(req.query["assessmentId"]);
  const classId = firstQueryString(req.query["classId"]);

  try {
    const conditions = [];
    if (studentId) conditions.push(eq(resultsTable.studentId, studentId));
    if (assessmentId) conditions.push(eq(resultsTable.assessmentId, assessmentId));

    const baseQuery = db.select().from(resultsTable);
    const results =
      conditions.length === 0
        ? await baseQuery.orderBy(desc(resultsTable.completedAt))
        : conditions.length === 1
          ? await baseQuery
              .where(conditions[0])
              .orderBy(desc(resultsTable.completedAt))
          : await baseQuery
              .where(and(...conditions))
              .orderBy(desc(resultsTable.completedAt));

    const assessmentIds = [...new Set(results.map((r) => r.assessmentId))];
    const studentIds = [...new Set(results.map((r) => r.studentId))];

    const assessments =
      assessmentIds.length > 0
        ? await db
            .select()
            .from(assessmentsTable)
            .where(inArray(assessmentsTable.id, assessmentIds))
        : [];
    const students =
      studentIds.length > 0
        ? await db
            .select()
            .from(usersTable)
            .where(inArray(usersTable.id, studentIds))
        : [];

    const assessmentMap = Object.fromEntries(assessments.map((a) => [a.id, a]));
    const studentMap = Object.fromEntries(students.map((s) => [s.id, s]));

    let enriched = results.map((r) => ({
      id: r.id,
      assessmentId: r.assessmentId,
      assessmentTitle: assessmentMap[r.assessmentId]?.title ?? "Unknown",
      assessmentType: assessmentMap[r.assessmentId]?.type ?? "CAASPP",
      studentId: r.studentId,
      studentName: studentMap[r.studentId]?.name ?? "Unknown",
      score: Number(r.score) || 0,
      maxScore: Number(r.maxScore) || 0,
      percentage: Number(r.percentage) || 0,
      passed: Boolean(r.passed),
      timeSpent: Number(r.timeSpent) || 0,
      completedAt: r.completedAt,
      feedback: r.feedback,
    }));

    if (classId) {
      const classStudents = students
        .filter((s) => s.classIds?.includes(classId))
        .map((s) => s.id);
      enriched = enriched.filter((r) => classStudents.includes(r.studentId));
    }

    enriched.sort(
      (a, b) => completedAtMs(b.completedAt) - completedAtMs(a.completedAt),
    );

    return res.json(enriched);
  } catch (err) {
    const pg =
      err && typeof err === "object" && "cause" in err
        ? (err as { cause?: unknown }).cause
        : undefined;
    console.error("[GET /api/results]", err, pg ?? "");
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to load results. Check that the database schema is applied (drizzle push).",
    });
  }
});

router.post("/results", async (req: Request, res: Response) => {
  const { assessmentId, studentId, answers, timeSpent } = req.body;

  const assessments = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, assessmentId)).limit(1);
  const assessment = assessments[0];
  if (!assessment) {
    return res.status(404).json({ error: "not_found", message: "Assessment not found" });
  }

  const questions = await db.select().from(questionsTable).where(eq(questionsTable.assessmentId, assessmentId));
  const questionMap = Object.fromEntries(questions.map(q => [q.id, q]));

  let score = 0;
  let maxScore = 0;

  const answerFeedback: Array<{ questionId: string; grading?: unknown; rubric?: unknown }> = [];

  for (const question of questions) {
    const pts = Number(question.points) || 0;
    maxScore += pts;
    const submitted = answers.find((a: { questionId: string; answer: string }) => a.questionId === question.id);
    if (submitted && question.correctAnswer && submitted.answer === question.correctAnswer) {
      score += pts;
    } else if (submitted && question.type === "essay") {
      const writingPayload = parseWritingActivityPayload(question.explanation);
      if (writingPayload) {
        try {
          const grading = await gradeWritingAnswer({
            studentResponse: submitted.answer,
            writingPrompt: question.text,
            backgroundInformation: writingPayload.backgroundInformation ?? "",
            sources: writingPayload.sources ?? [],
            rubric: writingPayload.rubric ?? {},
            rubricParams: writingPayload.rubricParams ?? {},
            grade: assessment.grade,
            subject: assessment.subject,
          });

          const awarded = Math.max(0, Math.min(pts, Number(grading?.totalScore) || 0));
          score += awarded;
          answerFeedback.push({
            questionId: question.id,
            grading,
            rubric: writingPayload.rubric ?? {},
          });
        } catch (error) {
          console.error("[POST /api/results] Failed AI grade for essay:", error);
          score += pts * 0.5;
        }
      } else {
        score += pts * 0.5;
      }
    }
  }

  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const passed = percentage >= 60;
  const safeTimeSpent = Number(timeSpent) || 0;

  let feedback = "Great job!";
  if (percentage < 60) {
    feedback = "You should focus on reviewing the core concepts, specifically the reading and writing rubrics covered in this assessment.";
  } else if (percentage < 80) {
    feedback = "Good work. Focus on citing more specific evidence in the future to improve your score further.";
  }

  if (answerFeedback.length > 0) {
    feedback = JSON.stringify({
      kind: "ai_writing_result_v1",
      summary: feedback,
      questions: answerFeedback,
    });
  }

  const id = uuidv4();
  const [result] = await db.insert(resultsTable).values({
    id,
    assessmentId,
    studentId,
    score,
    maxScore,
    percentage,
    passed,
    timeSpent: safeTimeSpent,
    answers,
    feedback,
  }).returning();

  return res.status(201).json({
    id: result.id,
    assessmentId: result.assessmentId,
    assessmentTitle: assessment.title,
    assessmentType: assessment.type,
    studentId: result.studentId,
    studentName: "Student",
    score: Number(result.score) || 0,
    maxScore: Number(result.maxScore) || 0,
    percentage: Number(result.percentage) || 0,
    passed: Boolean(result.passed),
    timeSpent: Number(result.timeSpent) || 0,
    completedAt: result.completedAt,
    feedback: result.feedback,
  });
});

router.get("/results/:resultId", async (req: Request, res: Response) => {
  const { resultId } = req.params;
  const results = await db.select().from(resultsTable).where(eq(resultsTable.id, resultId as string)).limit(1);
  const result = results[0];

  if (!result) {
    return res.status(404).json({ error: "not_found", message: "Result not found" });
  }

  const assessments = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, result.assessmentId)).limit(1);
  const assessment = assessments[0];
  const questions = await db.select().from(questionsTable).where(eq(questionsTable.assessmentId, result.assessmentId));
  const students = await db.select().from(usersTable).where(eq(usersTable.id, result.studentId)).limit(1);
  const questionMap = Object.fromEntries(questions.map(q => [q.id, q]));

  const answerDetails = (result.answers as { questionId: string; answer: string }[]).map(a => {
    const q = questionMap[a.questionId];
    if (!q) return null;
    const isCorrect = q.type === "multiple_choice" ? a.answer === q.correctAnswer : false;
    const pts = isCorrect ? q.points : (q.type === "essay" ? q.points * 0.5 : 0);
    return {
      questionId: q.id,
      questionText: q.text,
      answer: a.answer,
      correctAnswer: q.correctAnswer,
      isCorrect,
      points: pts,
      maxPoints: q.points,
    };
  }).filter(Boolean);

  return res.json({
    id: result.id,
    assessmentId: result.assessmentId,
    assessmentTitle: assessment?.title ?? "Unknown",
    assessmentType: assessment?.type ?? "CAASPP",
    studentId: result.studentId,
    studentName: students[0]?.name ?? "Unknown",
    score: Number(result.score) || 0,
    maxScore: Number(result.maxScore) || 0,
    percentage: Number(result.percentage) || 0,
    passed: Boolean(result.passed),
    timeSpent: Number(result.timeSpent) || 0,
    completedAt: result.completedAt,
    feedback: result.feedback,
    answers: answerDetails,
  });
});

router.post("/results/:resultId/insights", async (req: Request, res: Response) => {
  const { resultId } = req.params;
  const results = await db.select().from(resultsTable).where(eq(resultsTable.id, resultId as string)).limit(1);
  const result = results[0];

  if (!result) {
    return res.status(404).json({ error: "not_found", message: "Result not found" });
  }

  const assessments = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, result.assessmentId)).limit(1);
  const assessment = assessments[0];
  const questions = await db.select().from(questionsTable).where(eq(questionsTable.assessmentId, result.assessmentId));
  const students = await db.select().from(usersTable).where(eq(usersTable.id, result.studentId)).limit(1);
  
  if (!assessment || !students[0]) {
      return res.status(404).json({ error: "not_found", message: "Assessment or student not found" });
  }

  const questionMap = Object.fromEntries(questions.map(q => [q.id, q]));
  const answerDetails = (result.answers as { questionId: string; answer: string }[]).map(a => {
    const q = questionMap[a.questionId];
    if (!q) return null;
    return {
      questionText: q.text,
      studentAnswer: a.answer,
      correctAnswer: q.correctAnswer,
      skill: q.skill
    };
  }).filter(Boolean);

  const prompt = `You are an expert AI teaching assistant. Analyze the following student assessment result and provide concise, personalized insights and feedback for the student to improve. Focus on their strengths and the specific concepts they got wrong. DO NOT be overly verbose. Return ONLY the feedback text.
Assessment: ${assessment.title}
Student: ${students[0].name}
Score: ${result.percentage}% (${result.passed ? "Passed" : "Failed"})

Question/Answer Data:
${JSON.stringify(answerDetails, null, 2)}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 2000 },
    });

    const aiFeedback = response.text || "Could not generate insights.";

    await db.update(resultsTable)
      .set({ feedback: aiFeedback })
      .where(eq(resultsTable.id, resultId as string));

    return res.json({ feedback: aiFeedback });
  } catch (error) {
    console.error("Failed to generate AI insights:", error);
    return res.status(500).json({ error: "ai_error", message: "Failed to generate AI insights" });
  }
});

export default router;