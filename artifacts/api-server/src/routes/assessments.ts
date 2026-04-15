import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { assessmentsTable, questionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const router: IRouter = Router();

router.get("/assessments", async (req: Request, res: Response) => {
  const { type, subject, grade } = req.query;
  let assessments = await db.select().from(assessmentsTable);

  if (type) assessments = assessments.filter(a => a.type === type);
  if (subject) assessments = assessments.filter(a => a.subject === subject);
  if (grade) assessments = assessments.filter(a => a.grade === grade);

  return res.json(assessments);
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
        maxAttempts?: unknown;
        dueDate?: unknown;
      };
      rubric = payload.rubric ?? null;
      rubricParams = payload.rubricParams ?? null;
      maxAttempts = Number.isFinite(Number(payload.maxAttempts)) ? Math.max(1, Number(payload.maxAttempts)) : null;
      dueDate = typeof payload.dueDate === "string" && payload.dueDate.trim().length > 0 ? payload.dueDate : null;
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

export default router;
