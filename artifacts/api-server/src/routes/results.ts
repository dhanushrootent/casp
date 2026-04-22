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

async function generateMentorInsights(params: {
  studentName: string;
  performanceBrief: unknown;
}) {
  const prompt = `You are an AI Education Mentor. Analyze the following student performance data and provide a concise (max 150 words) detailed explanation for their teacher.
Student Name: ${params.studentName}
Performance History (Contains both right and wrong answers to help gauge strengths and weaknesses): ${JSON.stringify(params.performanceBrief)}

TASK:
1. Identify specific academic concepts or skills the student is consistently getting WRONG (weaknesses).
2. Identify specific academic concepts or skills the student is getting RIGHT (strengths).
3. Explain WHY they might be struggling based on the incorrect answers.
4. Provide actionable training recommendations for the teacher to help this student improve.

FORMAT: Provide a professional, encouraging analysis in plain text. No markdown formatting.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 2000 },
    });
    return response.text || "Insight generation failed.";
  } catch (e: any) {
    console.error("AI Insights Error:", e?.message || e);
    if (e?.message?.includes("429") || e?.message?.includes("Quota") || e?.message?.includes("exhausted")) {
      return "Unable to generate insights: The Gemini API key has exceeded its rate limit or free tier quota. Please try again later or check your Google Cloud Console billing.";
    }
    return "Unable to generate insights at this moment due to a connection issue.";
  }
}

async function generateSummaryFromScore(params: {
  studentName: string;
  percentage: number;
  passed: boolean;
  strengthAreas: string[];
  improvementAreas: string[];
}) {
  const prompt = `You are an AI education coach writing student-facing encouragement for a dashboard.
Write 2-3 short, natural sentences (max 70 words total). Tone: warm, human, and encouraging (not robotic).

Student: ${params.studentName}
Score Percentage: ${Math.round(params.percentage)}
Passed: ${params.passed}
Strength Areas: ${params.strengthAreas.join(", ") || "None"}
Improvement Areas: ${params.improvementAreas.join(", ") || "None"}

Rules:
- Mention the student by name once.
- Include score context in plain language (excellent / strong / developing / needs support) based on the score.
- Include one concrete next-step recommendation.
- Avoid generic lines like "good job" without specifics.
- Return plain text only (no markdown, no labels).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 220 },
    });
    const text = (response.text || "").trim();
    if (text.length > 0) return text;
  } catch (e: any) {
    console.error("AI Summary Error:", e?.message || e);
  }

  // Fallback if AI call fails/unavailable.
  if (params.percentage < 60) {
    return "The student is below proficiency and should focus on core concept review with targeted practice in weak skill areas.";
  }
  if (params.percentage < 80) {
    return "The student shows developing proficiency; reinforce evidence quality and consistency to move from approaching to strong mastery.";
  }
  return "The student demonstrates strong proficiency; continue extension tasks that deepen analysis while maintaining current strengths.";
}

function parseStoredPerformancePayload(feedback: unknown): {
  detailedTranscript?: any[];
} | null {
  if (typeof feedback !== "string" || feedback.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(feedback);
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as any;
    if (p.kind === "student_performance_v1" || p.kind === "ai_writing_result_v1") {
      return {
        detailedTranscript: Array.isArray(p.detailedTranscript) ? p.detailedTranscript : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function extractFeedbackSummary(feedback: unknown): string {
  if (typeof feedback !== "string" || feedback.trim().length === 0) return "";
  try {
    const parsed = JSON.parse(feedback) as any;
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.summary === "string" && parsed.summary.trim().length > 0) {
        return parsed.summary.trim();
      }
      if (typeof parsed.mentorInsights === "string" && parsed.mentorInsights.trim().length > 0) {
        return parsed.mentorInsights.trim().slice(0, 320);
      }
    }
  } catch {
    // keep raw string fallback below
  }
  return feedback.trim().slice(0, 320);
}

function extractTeacherFinalComment(feedback: unknown): string | null {
  if (typeof feedback !== "string" || feedback.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(feedback) as any;
    const comment = typeof parsed?.teacherFinalComment === "string" ? parsed.teacherFinalComment.trim() : "";
    return comment.length > 0 ? comment : null;
  } catch {
    return null;
  }
}

function parseFeedbackObject(feedback: unknown): any | null {
  if (typeof feedback !== "string" || feedback.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(feedback);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function extractTeacherScoreFinalized(feedback: unknown): boolean {
  const parsed = parseFeedbackObject(feedback);
  return Boolean(parsed?.teacherScoreFinalized);
}

function extractAchievedExceptional(feedback: unknown): boolean {
  const parsed = parseFeedbackObject(feedback);
  return Boolean(parsed?.achievedExceptional);
}

function withTeacherFinalComment(feedback: string | null | undefined, teacherFinalComment: string | null): string {
  const base = typeof feedback === "string" && feedback.trim().length > 0 ? feedback : "{}";
  try {
    const parsed = JSON.parse(base) as any;
    const next = { ...(parsed && typeof parsed === "object" ? parsed : {}) };
    if (teacherFinalComment && teacherFinalComment.trim().length > 0) {
      next.teacherFinalComment = teacherFinalComment.trim();
    } else {
      delete next.teacherFinalComment;
    }
    return JSON.stringify(next);
  } catch {
    if (teacherFinalComment && teacherFinalComment.trim().length > 0) {
      return JSON.stringify({ kind: "teacher_comment_v1", teacherFinalComment: teacherFinalComment.trim() });
    }
    return JSON.stringify({});
  }
}

function withTeacherScoreFinalized(
  feedback: string | null | undefined,
  data: {
    teacherScoreFinalized?: boolean;
    teacherFinalComment?: string | null;
    manualPercentage?: number | null;
    manualScore?: number | null;
    manualMaxScore?: number | null;
    manualPassed?: boolean | null;
    questions?: Array<{ questionId: string; grading: any }>;
  },
): string {
  const base = typeof feedback === "string" && feedback.trim().length > 0 ? feedback : "{}";
  try {
    const parsed = JSON.parse(base) as any;
    const next = { ...(parsed && typeof parsed === "object" ? parsed : {}) };
    if (typeof data.teacherScoreFinalized === "boolean") {
      next.teacherScoreFinalized = data.teacherScoreFinalized;
      next.teacherScoreFinalizedAt = data.teacherScoreFinalized ? new Date().toISOString() : null;
    }
    if (typeof data.teacherFinalComment === "string" && data.teacherFinalComment.trim().length > 0) {
      next.teacherFinalComment = data.teacherFinalComment.trim();
    }
    if (typeof data.manualPercentage === "number" && Number.isFinite(data.manualPercentage)) {
      next.manualPercentage = data.manualPercentage;
    }
    if (typeof data.manualScore === "number" && Number.isFinite(data.manualScore)) {
      next.manualScore = data.manualScore;
    }
    if (typeof data.manualMaxScore === "number" && Number.isFinite(data.manualMaxScore)) {
      next.manualMaxScore = data.manualMaxScore;
    }
    if (typeof data.manualPassed === "boolean") {
      next.manualPassed = data.manualPassed;
    }
    if (Array.isArray(data.questions)) {
      next.questions = data.questions;
      next.kind = "ai_writing_result_v1";
    }
    return JSON.stringify(next);
  } catch {
    return JSON.stringify({
      kind: "teacher_score_finalization_v1",
      teacherScoreFinalized: Boolean(data.teacherScoreFinalized),
      teacherScoreFinalizedAt: new Date().toISOString(),
      teacherFinalComment: data.teacherFinalComment ?? null,
      manualPercentage: data.manualPercentage ?? null,
      manualScore: data.manualScore ?? null,
      manualMaxScore: data.manualMaxScore ?? null,
      manualPassed: data.manualPassed ?? null,
      questions: Array.isArray(data.questions) ? data.questions : [],
    });
  }
}

function computeSkillAreasFromTranscript(
  transcript: Array<{ score?: number; answeredQuestions?: Array<{ skill?: string; isCorrect?: boolean | null }> }>,
) {
  const skillStats: Record<string, { total: number; correct: number }> = {};
  for (const item of transcript) {
    const score = Number(item?.score) || 0;
    const answered = Array.isArray(item?.answeredQuestions) ? item.answeredQuestions : [];
    for (const aq of answered) {
      if (!aq?.skill) continue;
      if (!skillStats[aq.skill]) skillStats[aq.skill] = { total: 0, correct: 0 };
      skillStats[aq.skill].total++;
      if (aq.isCorrect === true) {
        skillStats[aq.skill].correct++;
      } else if (aq.isCorrect === null && score >= 70) {
        // Proxy for rubric/open-ended items where binary correctness is unavailable.
        skillStats[aq.skill].correct++;
      }
    }
  }

  const skillAverages = Object.entries(skillStats).map(([skill, stats]) => ({
    skill,
    percent: (stats.correct / stats.total) * 100,
  }));
  return {
    strengthAreas: skillAverages.filter((s) => s.percent >= 75).map((s) => s.skill),
    improvementAreas: skillAverages.filter((s) => s.percent < 60).map((s) => s.skill),
  };
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
- When a source has type "primary_source" or its description includes "Citation (documented):" and "Evidence (verbatim):", treat those verbatim excerpts as the documented evidence supplied to students. Compare the student's claims to that evidence; do not invent different quotations from the primary text.
- Consider accuracy, relevance, evidence use, citations, organization, conventions, thesis, introduction, and conclusion where applicable.
- Compute wordCount, paragraphCount, citationCount, and requirement booleans.
- For each criteriaScores[].feedback, write a human-friendly rationale in 2-4 bullet-style points, focusing on specific evidence from the student's response.
- The rationale should sound like a real teacher speaking to ${params.studentName ?? "the student"}: warm, clear, specific, and actionable (not robotic).
- When possible, include one strength point and one improvement point in each criterion feedback.
- Make every criterion feedback specific to THIS submission: identify exact weaknesses and explain how they affected score.
- Include one concrete revision action per criterion that could raise score on that row.
- For each criterion feedback, explicitly include: (1) achieved level and why, (2) one exact quote/snippet from student response, and (3) one concrete revision that would move the student to the next rubric level.
- overallFeedback.teacherNote must be highly specific (3-5 sentences): strongest evidence, biggest scoring gap, and targeted revision plan.
- overallFeedback.studentSummary must be specific and student-friendly (2-4 sentences), referencing at least one concrete part of the response.
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
  try {
    return ensureSpecificOverallFeedback(JSON.parse(jsonMatch[0]), params.studentName ?? "The student");
  } catch (err) {
    // One gentle repair pass for common model JSON mistakes (trailing commas).
    const repaired = jsonMatch[0].replace(/,\s*([}\]])/g, "$1");
    try {
      return ensureSpecificOverallFeedback(JSON.parse(repaired), params.studentName ?? "The student");
    } catch {
      throw err;
    }
  }
}

function buildFallbackWritingGrading(params: { points: number; rubric: any; studentName: string }) {
  const safePoints = Math.max(0, Number(params.points) || 0);
  const totalScore = Math.round(safePoints * 0.5 * 100) / 100;
  const criteria = Array.isArray(params.rubric?.criteria) ? params.rubric.criteria : [];

  const criteriaScores =
    criteria.length > 0
      ? criteria.map((c: any, idx: number) => {
          const maxScore = Math.max(
            0,
            Number(c?.points) || (safePoints > 0 ? safePoints / criteria.length : 0),
          );
          const score = Math.round(maxScore * 0.5 * 100) / 100;
          return {
            criterionId: c?.id != null ? String(c.id) : `criterion_${idx + 1}`,
            criterionName: c?.name != null ? String(c.name) : `Criterion ${idx + 1}`,
            score,
            maxScore,
            level: "Estimated",
            feedback:
              `- Automated scoring fallback used because rubric parsing failed for this response.\n` +
              `- ${params.studentName} should review this criterion and refine evidence clarity and rubric alignment.\n` +
              `- Use "Regenerate insights" if you want a fresh AI explanation for this submission.`,
            quotes: [],
          };
        })
      : [
          {
            criterionId: "overall",
            criterionName: "Overall Writing",
            score: totalScore,
            maxScore: safePoints,
            level: "Estimated",
            feedback:
              `- Automated scoring fallback used because rubric parsing failed for this response.\n` +
              `- ${params.studentName} should revise for stronger rubric alignment and clearer evidence.`,
            quotes: [],
          },
        ];

  return {
    totalScore,
    maxScore: safePoints,
    percentage: safePoints > 0 ? (totalScore / safePoints) * 100 : 0,
    criteriaScores,
    overallFeedback: {
      strengths: ["Response was captured and saved successfully."],
      areasForImprovement: ["Re-run grading to receive full criterion-level AI scoring."],
      teacherNote: "Fallback score was applied due to model JSON parse failure.",
      studentSummary: "Your answer was submitted. A temporary score was applied while AI grading recovers.",
    },
    wordCount: 0,
    paragraphCount: 0,
    citationCount: 0,
    meetsRequirements: {
      wordCount: false,
      paragraphCount: false,
      citations: false,
      thesis: false,
      introConclusion: false,
    },
  };
}

function ensureSpecificOverallFeedback(grading: any, studentName: string) {
  const isWeakFeedback = (text: string) => {
    const t = String(text ?? "").trim().toLowerCase();
    if (t.length < 40) return true;
    return /good job|needs improvement|well done|keep it up|nice work|more detail needed/.test(t);
  };
  const criteria = Array.isArray(grading?.criteriaScores) ? grading.criteriaScores : [];
  const normalizedCriteria = criteria.map((c: any, idx: number) => {
    const raw = String(c?.feedback ?? "").trim();
    if (!isWeakFeedback(raw)) return c;
    const criterionName = String(c?.criterionName ?? `Criterion ${idx + 1}`);
    const level = String(c?.level ?? "Developing");
    const quoteSnippet =
      Array.isArray(c?.quotes) && c.quotes.length > 0
        ? String(c.quotes[0] ?? "").trim()
        : "";
    return {
      ...c,
      feedback: [
        `In ${criterionName}, this submission is currently at ${level}.`,
        quoteSnippet
          ? `Student evidence: "${quoteSnippet}".`
          : "There is not enough direct textual evidence in the response for this rubric row.",
        "To gain points on this criterion, add one precise supporting detail and follow it with explicit analysis that connects it to the claim.",
      ].join(" "),
    };
  });

  const criteriaForOverall = normalizedCriteria;
  const first = criteriaForOverall[0] ?? null;
  const firstQuote =
    Array.isArray(first?.quotes) && first.quotes.length > 0
      ? String(first.quotes[0] ?? "").trim()
      : "";
  const teacherNote = String(grading?.overallFeedback?.teacherNote ?? "").trim();
  const studentSummary = String(grading?.overallFeedback?.studentSummary ?? "").trim();

  return {
    ...grading,
    criteriaScores: criteriaForOverall,
    overallFeedback: {
      strengths: Array.isArray(grading?.overallFeedback?.strengths) ? grading.overallFeedback.strengths : [],
      areasForImprovement: Array.isArray(grading?.overallFeedback?.areasForImprovement)
        ? grading.overallFeedback.areasForImprovement
        : [],
      teacherNote:
        teacherNote ||
        `${studentName} shows potential, but scoring was limited mostly in ${first?.criterionName ?? "rubric alignment"}. The strongest current evidence is ${firstQuote ? `"${firstQuote}"` : "present but underdeveloped"}, while the biggest gap is depth of analysis and explicit evidence linkage. To raise the score, revise body paragraphs with one stronger quote/fact and one sentence explaining how it proves the claim.`,
      studentSummary:
        studentSummary ||
        `You have a clear starting point${firstQuote ? `, including "${firstQuote}"` : ""}. To improve your score next attempt, use more specific evidence and explain how each example supports your main point.`,
    },
  };
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

    const listColumns = {
      id: resultsTable.id,
      assessmentId: resultsTable.assessmentId,
      studentId: resultsTable.studentId,
      score: resultsTable.score,
      maxScore: resultsTable.maxScore,
      percentage: resultsTable.percentage,
      passed: resultsTable.passed,
      timeSpent: resultsTable.timeSpent,
      completedAt: resultsTable.completedAt,
    };

    const baseQuery = db.select(listColumns).from(resultsTable);
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
    const resultIds = results.map((r) => r.id);
    let commentByResultId: Record<string, string | null> = {};
    if (studentId && resultIds.length > 0) {
      const feedbackRows = await db
        .select({ id: resultsTable.id, feedback: resultsTable.feedback })
        .from(resultsTable)
        .where(inArray(resultsTable.id, resultIds));
      commentByResultId = Object.fromEntries(
        feedbackRows.map((row) => [row.id, extractTeacherFinalComment(row.feedback)]),
      );
    }

    // Do not include `feedback` here — it can be huge (JSON with full transcripts + AI payloads).
    // Listing all results with feedback caused multi-GB JSON.stringify and OOM. Use GET /results/:id for detail.
    let enriched: any[] = results.map((r) => ({
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
      achievedExceptional: false,
      timeSpent: Number(r.timeSpent) || 0,
      teacherFinalComment: commentByResultId[r.id] ?? null,
      completedAt: r.completedAt,
    }));

    if (studentId) {
      const feedbackRows =
        resultIds.length > 0
          ? await db
              .select({ id: resultsTable.id, feedback: resultsTable.feedback })
              .from(resultsTable)
              .where(inArray(resultsTable.id, resultIds))
          : [];
      const releasedById = Object.fromEntries(
        feedbackRows.map((row) => [row.id, extractTeacherScoreFinalized(row.feedback)]),
      );
      const exceptionalById = Object.fromEntries(
        feedbackRows.map((row) => [row.id, extractAchievedExceptional(row.feedback)]),
      );
      enriched = enriched.map((r) => {
        const released = Boolean(releasedById[r.id]);
        return {
          ...r,
          scoreReleased: released,
          achievedExceptional: Boolean(exceptionalById[r.id]),
          score: released ? r.score : null,
          maxScore: released ? r.maxScore : null,
          percentage: released ? r.percentage : null,
          passed: released ? r.passed : null,
        };
      });
    } else {
      const feedbackRows =
        resultIds.length > 0
          ? await db
              .select({ id: resultsTable.id, feedback: resultsTable.feedback })
              .from(resultsTable)
              .where(inArray(resultsTable.id, resultIds))
          : [];
      const exceptionalById = Object.fromEntries(
        feedbackRows.map((row) => [row.id, extractAchievedExceptional(row.feedback)]),
      );
      enriched = enriched.map((r) => ({
        ...r,
        scoreReleased: true,
        achievedExceptional: Boolean(exceptionalById[r.id]),
      }));
    }

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
  console.log("[POST /api/results] start", {
    assessmentId,
    studentId,
    answersCount: Array.isArray(answers) ? answers.length : 0,
    timeSpent,
  });

  const assessments = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, assessmentId)).limit(1);
  const assessment = assessments[0];
  if (!assessment) {
    console.log("[POST /api/results] assessment not found", { assessmentId });
    return res.status(404).json({ error: "not_found", message: "Assessment not found" });
  }
  console.log("[POST /api/results] assessment loaded", {
    assessmentId: assessment.id,
    title: assessment.title,
    type: assessment.type,
    grade: assessment.grade,
    subject: assessment.subject,
  });

  const questions = await db.select().from(questionsTable).where(eq(questionsTable.assessmentId, assessmentId));
  const questionMap = Object.fromEntries(questions.map(q => [q.id, q]));
  console.log("[POST /api/results] questions loaded", { questionCount: questions.length });

  const students = await db.select().from(usersTable).where(eq(usersTable.id, studentId)).limit(1);
  const student = students[0];
  if (!student) {
    console.log("[POST /api/results] student not found", { studentId });
    return res.status(404).json({ error: "not_found", message: "Student not found" });
  }
  console.log("[POST /api/results] student loaded", {
    studentId: student.id,
    studentName: student.name,
    grade: student.grade,
  });

  const payloadAttempts =
    questions
      .map((q) => parseWritingActivityPayload(q.explanation))
      .find((p) => p && Number.isFinite(Number(p.maxAttempts)))
      ?.maxAttempts ?? 1;
  const maxAttempts = Math.max(1, Math.min(10, Number(payloadAttempts) || 1));
  const existingAttempts = await db
    .select({ id: resultsTable.id })
    .from(resultsTable)
    .where(and(eq(resultsTable.assessmentId, assessmentId), eq(resultsTable.studentId, studentId)));
  const attemptNumber = existingAttempts.length + 1;
  if (existingAttempts.length >= maxAttempts) {
    return res.status(400).json({
      error: "attempt_limit_reached",
      message: `Maximum attempts reached (${maxAttempts}).`,
      maxAttempts,
      attemptsUsed: existingAttempts.length,
    });
  }

  let score = 0;
  let maxScore = 0;

  const answerFeedback: Array<{ questionId: string; grading?: unknown; rubric?: unknown }> = [];
  const performanceAnswers: Array<{
    questionId: string;
    text?: string;
    skill?: string | null;
    studentAnswer?: string;
    correctAnswer?: string | null;
    isCorrect: boolean | null;
  }> = [];

  for (const question of questions) {
    const pts = Number(question.points) || 0;
    maxScore += pts;
    const submitted = answers.find((a: { questionId: string; answer: string }) => a.questionId === question.id);
    if (submitted && question.correctAnswer && submitted.answer === question.correctAnswer) {
      score += pts;
      performanceAnswers.push({
        questionId: question.id,
        text: question.text,
        skill: question.skill,
        studentAnswer: submitted.answer,
        correctAnswer: question.correctAnswer,
        isCorrect: true,
      });
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
            studentName: student.name,
          });

          const awarded = Math.max(0, Math.min(pts, Number(grading?.totalScore) || 0));
          score += awarded;
          answerFeedback.push({
            questionId: question.id,
            grading,
            rubric: writingPayload.rubric ?? {},
          });
          performanceAnswers.push({
            questionId: question.id,
            text: question.text,
            skill: question.skill,
            studentAnswer: submitted.answer,
            correctAnswer: question.correctAnswer,
            isCorrect: null,
          });
        } catch (error) {
          console.error("[POST /api/results] Failed AI grade for essay:", error);
          const fallbackGrading = buildFallbackWritingGrading({
            points: pts,
            rubric: writingPayload.rubric ?? {},
            studentName: student.name,
          });
          const awarded = Math.max(0, Math.min(pts, Number(fallbackGrading.totalScore) || 0));
          score += awarded;
          answerFeedback.push({
            questionId: question.id,
            grading: fallbackGrading,
            rubric: writingPayload.rubric ?? {},
          });
          performanceAnswers.push({
            questionId: question.id,
            text: question.text,
            skill: question.skill,
            studentAnswer: submitted.answer,
            correctAnswer: question.correctAnswer,
            isCorrect: null,
          });
        }
      } else {
        score += pts * 0.5;
        performanceAnswers.push({
          questionId: question.id,
          text: question.text,
          skill: question.skill,
          studentAnswer: submitted.answer,
          correctAnswer: question.correctAnswer,
          isCorrect: null,
        });
      }
    } else if (submitted) {
      performanceAnswers.push({
        questionId: question.id,
        text: question.text,
        skill: question.skill,
        studentAnswer: submitted.answer,
        correctAnswer: question.correctAnswer,
        isCorrect: question.correctAnswer ? submitted.answer === question.correctAnswer : null,
      });
    }
  }
  console.log("[POST /api/results] scoring complete", {
    rawScore: score,
    maxScore,
    answeredTracked: performanceAnswers.length,
    writingFeedbackCount: answerFeedback.length,
  });

  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const passed = percentage >= 60;
  const safeTimeSpent = Number(timeSpent) || 0;
  console.log("[POST /api/results] normalized score", {
    percentage,
    passed,
    safeTimeSpent,
  });

  const id = uuidv4();

  const previousResults = await db
    .select()
    .from(resultsTable)
    .where(eq(resultsTable.studentId, studentId))
    .orderBy(desc(resultsTable.completedAt));
  console.log("[POST /api/results] previous results fetched", { previousResultCount: previousResults.length });

  // Rebuild the same rich context we previously used in analytics (historical right/wrong patterns).
  const combinedResults: Array<{
    id: string;
    assessmentId: string;
    percentage: number;
    feedbackSummary: string;
    answers: Array<{ questionId: string; answer: string }>;
  }> = [
    ...previousResults.map((r) => ({
      id: r.id,
      assessmentId: r.assessmentId,
      percentage: Number(r.percentage) || 0,
      feedbackSummary: extractFeedbackSummary(r.feedback),
      answers: Array.isArray(r.answers) ? (r.answers as Array<{ questionId: string; answer: string }>) : [],
    })),
    {
      id,
      assessmentId,
      percentage,
      feedbackSummary: "",
      answers: Array.isArray(answers) ? answers : [],
    },
  ];

  const combinedAssessmentIds = Array.from(new Set(combinedResults.map((r) => r.assessmentId)));
  const combinedAssessments =
    combinedAssessmentIds.length > 0
      ? await db
          .select()
          .from(assessmentsTable)
          .where(inArray(assessmentsTable.id, combinedAssessmentIds))
      : [];
  const combinedAssessmentMap = Object.fromEntries(combinedAssessments.map((a) => [a.id, a]));

  const combinedQuestionIds = Array.from(
    new Set(combinedResults.flatMap((r) => r.answers.map((a) => a.questionId))),
  );
  const combinedQuestions =
    combinedQuestionIds.length > 0
      ? await db
          .select()
          .from(questionsTable)
          .where(inArray(questionsTable.id, combinedQuestionIds))
      : [];
  const combinedQuestionMap = Object.fromEntries(combinedQuestions.map((q) => [q.id, q]));

  const skillStats: Record<string, { total: number; correct: number }> = {};
  for (const r of combinedResults) {
    for (const a of r.answers) {
      const q = combinedQuestionMap[a.questionId];
      if (!q || !q.skill) continue;
      if (!skillStats[q.skill]) skillStats[q.skill] = { total: 0, correct: 0 };
      skillStats[q.skill].total++;
      if (q.correctAnswer && a.answer === q.correctAnswer) {
        skillStats[q.skill].correct++;
      } else if (q.type === "short_answer" || q.type === "essay" || q.type === "speaking") {
        if (r.percentage >= 70) skillStats[q.skill].correct++;
      }
    }
  }
  const skillAverages = Object.entries(skillStats).map(([skill, stats]) => ({
    skill,
    percent: (stats.correct / stats.total) * 100,
  }));
  const strengthAreas = skillAverages.filter((s) => s.percent >= 75).map((s) => s.skill);
  const improvementAreas = skillAverages.filter((s) => s.percent < 60).map((s) => s.skill);
  const summary = await generateSummaryFromScore({
    studentName: student.name,
    percentage,
    passed,
    strengthAreas,
    improvementAreas,
  });
  const performanceBrief = combinedResults.map((r) => {
    const answeredQuestions = r.answers.map((a) => {
      const q = combinedQuestionMap[a.questionId];
      const isCorrect = q && q.correctAnswer ? a.answer === q.correctAnswer : null;
      return {
        text: q?.text,
        skill: q?.skill,
        studentAnswer: a.answer,
        correctAnswer: q?.correctAnswer,
        isCorrect,
      };
    });
    return {
      resultId: r.id,
      testTitle: combinedAssessmentMap[r.assessmentId]?.title ?? "Unknown",
      score: r.percentage,
      feedback: r.feedbackSummary,
      answeredQuestions,
    };
  });
  console.log("[POST /api/results] performance brief built", {
    combinedTranscriptCount: performanceBrief.length,
    combinedQuestionCount: combinedQuestions.length,
    strengthAreas,
    improvementAreas,
  });

  const mentorInsights = await generateMentorInsights({
    studentName: student.name,
    performanceBrief,
  });
  console.log("[POST /api/results] mentor insights generated", {
    mentorInsightsLength: typeof mentorInsights === "string" ? mentorInsights.length : 0,
  });

  let feedback = JSON.stringify({
    kind: "student_performance_v1",
    teacherScoreFinalized: false,
    achievedExceptional: percentage >= 90,
    summary,
    mentorInsights,
    strengthAreas,
    improvementAreas,
    detailedTranscript: performanceBrief,
  });

  if (answerFeedback.length > 0) {
    feedback = JSON.stringify({
      kind: "ai_writing_result_v1",
      teacherScoreFinalized: false,
      achievedExceptional: percentage >= 90,
      summary,
      questions: answerFeedback,
      mentorInsights,
      strengthAreas,
      improvementAreas,
      detailedTranscript: performanceBrief,
    });
  }
  feedback = JSON.stringify({
    ...(JSON.parse(feedback) as any),
    teacherScoreFinalized: false,
    achievedExceptional: percentage >= 90,
    detailedTranscript: performanceBrief,
  });
  console.log("[POST /api/results] feedback payload prepared", {
    kind: answerFeedback.length > 0 ? "ai_writing_result_v1" : "student_performance_v1",
  });

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
  console.log("[POST /api/results] result persisted", {
    resultId: result.id,
    assessmentId: result.assessmentId,
    studentId: result.studentId,
    percentage: result.percentage,
  });

  return res.status(201).json({
    id: result.id,
    assessmentId: result.assessmentId,
    assessmentTitle: assessment.title,
    assessmentType: assessment.type,
    studentId: result.studentId,
    studentName: "Student",
    score: null,
    maxScore: null,
    percentage: null,
    passed: null,
    scoreReleased: false,
    achievedExceptional: percentage >= 90,
    timeSpent: Number(result.timeSpent) || 0,
    attemptNumber,
    maxAttempts,
    attemptsRemaining: Math.max(0, maxAttempts - attemptNumber),
    teacherFinalComment: extractTeacherFinalComment(result.feedback),
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
    const isObjective = q.type === "multiple_choice" || q.type === "multiple_choice_single";
    const isCorrect = isObjective
      ? (q.correctAnswer ? a.answer === q.correctAnswer : null)
      : null;
    const pts = isCorrect === true ? q.points : (q.type === "essay" ? q.points * 0.5 : 0);
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

  const scoreReleased = extractTeacherScoreFinalized(result.feedback);
  const achievedExceptional = extractAchievedExceptional(result.feedback);

  return res.json({
    id: result.id,
    assessmentId: result.assessmentId,
    assessmentTitle: assessment?.title ?? "Unknown",
    assessmentType: assessment?.type ?? "CAASPP",
    studentId: result.studentId,
    studentName: students[0]?.name ?? "Unknown",
    score: scoreReleased ? Number(result.score) || 0 : null,
    maxScore: scoreReleased ? Number(result.maxScore) || 0 : null,
    percentage: scoreReleased ? Number(result.percentage) || 0 : null,
    passed: scoreReleased ? Boolean(result.passed) : null,
    scoreReleased,
    achievedExceptional,
    timeSpent: Number(result.timeSpent) || 0,
    teacherFinalComment: extractTeacherFinalComment(result.feedback),
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

    let nextFeedback: string = aiFeedback;
    if (typeof result.feedback === "string" && result.feedback.trim().length > 0) {
      try {
        const parsed = JSON.parse(result.feedback) as any;
        if (parsed && typeof parsed === "object") {
          if (parsed.kind === "ai_writing_result_v1" || parsed.kind === "student_performance_v1") {
            const updated = {
              ...parsed,
              mentorInsights: aiFeedback,
              summary: typeof parsed.summary === "string" ? parsed.summary : aiFeedback,
            };
            nextFeedback = JSON.stringify(updated);
          }
        }
      } catch {
        // keep plain text fallback in nextFeedback
      }
    }

    await db.update(resultsTable)
      .set({ feedback: nextFeedback })
      .where(eq(resultsTable.id, resultId as string));

    return res.json({ feedback: nextFeedback });
  } catch (error) {
    console.error("Failed to generate AI insights:", error);
    return res.status(500).json({ error: "ai_error", message: "Failed to generate AI insights" });
  }
});

router.patch("/results/:resultId/final-comment", async (req: Request, res: Response) => {
  const { resultId } = req.params;
  const teacherFinalComment =
    typeof req.body?.teacherFinalComment === "string"
      ? req.body.teacherFinalComment.trim()
      : "";

  const results = await db.select().from(resultsTable).where(eq(resultsTable.id, resultId as string)).limit(1);
  const result = results[0];
  if (!result) {
    return res.status(404).json({ error: "not_found", message: "Result not found" });
  }

  const nextFeedback = withTeacherFinalComment(result.feedback, teacherFinalComment.length > 0 ? teacherFinalComment : null);
  const [updated] = await db
    .update(resultsTable)
    .set({ feedback: nextFeedback })
    .where(eq(resultsTable.id, resultId as string))
    .returning();

  return res.json({
    id: updated.id,
    teacherFinalComment: extractTeacherFinalComment(updated.feedback),
  });
});

router.patch("/results/:resultId/finalize-scores", async (req: Request, res: Response) => {
  const { resultId } = req.params;
  const teacherFinalComment =
    typeof req.body?.teacherFinalComment === "string" ? req.body.teacherFinalComment.trim() : "";
  const manualPercentageRaw = Number(req.body?.manualPercentage);
  const manualScoreRaw = Number(req.body?.manualScore);
  const manualMaxScoreRaw = Number(req.body?.manualMaxScore);
  const manualQuestions = Array.isArray(req.body?.questions) ? req.body.questions : null;

  const results = await db.select().from(resultsTable).where(eq(resultsTable.id, resultId as string)).limit(1);
  const result = results[0];
  if (!result) {
    return res.status(404).json({ error: "not_found", message: "Result not found" });
  }

  const currentMaxScore = Number(result.maxScore) || 0;
  const manualMaxScore = Number.isFinite(manualMaxScoreRaw) && manualMaxScoreRaw > 0 ? manualMaxScoreRaw : currentMaxScore;
  const fallbackScore = Number(result.score) || 0;
  const manualScore =
    Number.isFinite(manualScoreRaw) && manualScoreRaw >= 0 ? Math.min(manualMaxScore, manualScoreRaw) : fallbackScore;
  const manualPercentage =
    Number.isFinite(manualPercentageRaw) && manualPercentageRaw >= 0
      ? Math.max(0, Math.min(100, manualPercentageRaw))
      : manualMaxScore > 0
        ? (manualScore / manualMaxScore) * 100
        : 0;
  const manualPassed = manualPercentage >= 60;

  const nextFeedback = withTeacherScoreFinalized(result.feedback, {
    teacherScoreFinalized: true,
    teacherFinalComment: teacherFinalComment.length > 0 ? teacherFinalComment : null,
    manualPercentage,
    manualScore,
    manualMaxScore,
    manualPassed,
    questions: manualQuestions ?? undefined,
  });

  const [updated] = await db
    .update(resultsTable)
    .set({
      score: manualScore,
      maxScore: manualMaxScore,
      percentage: manualPercentage,
      passed: manualPassed,
      feedback: nextFeedback,
    })
    .where(eq(resultsTable.id, resultId as string))
    .returning();

  return res.json({
    id: updated.id,
    scoreReleased: true,
    score: Number(updated.score) || 0,
    maxScore: Number(updated.maxScore) || 0,
    percentage: Number(updated.percentage) || 0,
    passed: Boolean(updated.passed),
    teacherFinalComment: extractTeacherFinalComment(updated.feedback),
  });
});

export default router;