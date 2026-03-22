import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { resultsTable, assessmentsTable, questionsTable, usersTable } from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const router: IRouter = Router();

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

  for (const question of questions) {
    const pts = Number(question.points) || 0;
    maxScore += pts;
    const submitted = answers.find((a: { questionId: string; answer: string }) => a.questionId === question.id);
    if (submitted && question.correctAnswer && submitted.answer === question.correctAnswer) {
      score += pts;
    } else if (submitted && question.type === "essay") {
      score += pts * 0.5;
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

export default router;