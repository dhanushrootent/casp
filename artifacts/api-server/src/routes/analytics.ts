import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { resultsTable, assessmentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

function parseStoredPerformance(feedback: unknown): {
  mentorInsights?: string;
  strengthAreas?: string[];
  improvementAreas?: string[];
  detailedTranscript?: any[];
} | null {
  if (typeof feedback !== "string" || feedback.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(feedback);
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as any;
    if (
      p.kind === "student_performance_v1" ||
      p.kind === "ai_writing_result_v1"
    ) {
      return {
        mentorInsights: typeof p.mentorInsights === "string" ? p.mentorInsights : undefined,
        strengthAreas: Array.isArray(p.strengthAreas) ? p.strengthAreas : undefined,
        improvementAreas: Array.isArray(p.improvementAreas) ? p.improvementAreas : undefined,
        detailedTranscript: Array.isArray(p.detailedTranscript) ? p.detailedTranscript : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function stripRecursiveTranscriptFromFeedback(feedback: unknown): string {
  if (typeof feedback !== "string" || feedback.trim().length === 0) return "";
  try {
    const parsed = JSON.parse(feedback) as any;
    if (!parsed || typeof parsed !== "object") return feedback;
    if (parsed.kind === "student_performance_v1" || parsed.kind === "ai_writing_result_v1") {
      // Keep complete per-result report (summary/questions/mentor insights),
      // but drop nested detailed transcript to prevent response explosion/OOM.
      const compact = { ...parsed };
      delete compact.detailedTranscript;
      return JSON.stringify(compact);
    }
    return feedback;
  } catch {
    return feedback;
  }
}

router.get("/analytics/overview", async (req: Request, res: Response) => {
  const { assessmentType } = req.query;

  const allResults = await db.select().from(resultsTable);
  const allAssessments = await db.select().from(assessmentsTable);
  const allStudents = await db.select().from(usersTable).where(eq(usersTable.role, "student"));

  const assessmentMap = Object.fromEntries(allAssessments.map(a => [a.id, a]));
  const studentMap = Object.fromEntries(allStudents.map(s => [s.id, s]));

  let filteredResults = allResults;
  if (assessmentType) {
    filteredResults = allResults.filter(r => assessmentMap[r.assessmentId]?.type === assessmentType);
  }

  const caasppResults = allResults.filter(r => assessmentMap[r.assessmentId]?.type === "CAASPP");
  const elpacResults = allResults.filter(r => assessmentMap[r.assessmentId]?.type === "ELPAC");

  const avgScore = filteredResults.length > 0
    ? filteredResults.reduce((s, r) => s + r.percentage, 0) / filteredResults.length
    : 0;

  const passRate = filteredResults.length > 0
    ? (filteredResults.filter(r => r.passed).length / filteredResults.length) * 100
    : 0;

  const getSubjectBreakdown = (results: typeof allResults) => {
    const bySubject: Record<string, { total: number; passed: number; sum: number }> = {};
    for (const r of results) {
      const subject = assessmentMap[r.assessmentId]?.subject ?? "Unknown";
      if (!bySubject[subject]) bySubject[subject] = { total: 0, passed: 0, sum: 0 };
      bySubject[subject].total++;
      bySubject[subject].sum += r.percentage;
      if (r.passed) bySubject[subject].passed++;
    }
    return Object.entries(bySubject).map(([subject, data]) => ({
      subject,
      averageScore: data.total > 0 ? data.sum / data.total : 0,
      passRate: data.total > 0 ? (data.passed / data.total) * 100 : 0,
      studentCount: data.total,
    }));
  };

  const scoreDistribution = [
    { range: "90-100%", count: 0, percentage: 0 },
    { range: "80-89%", count: 0, percentage: 0 },
    { range: "70-79%", count: 0, percentage: 0 },
    { range: "60-69%", count: 0, percentage: 0 },
    { range: "Below 60%", count: 0, percentage: 0 },
  ];
  for (const r of filteredResults) {
    const p = r.percentage;
    if (p >= 90) scoreDistribution[0].count++;
    else if (p >= 80) scoreDistribution[1].count++;
    else if (p >= 70) scoreDistribution[2].count++;
    else if (p >= 60) scoreDistribution[3].count++;
    else scoreDistribution[4].count++;
  }
  const total = filteredResults.length || 1;
  scoreDistribution.forEach(b => { b.percentage = (b.count / total) * 100; });

  const recentResults = [...filteredResults]
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, 10)
    .map(r => ({
      id: r.id,
      assessmentId: r.assessmentId,
      assessmentTitle: assessmentMap[r.assessmentId]?.title ?? "Unknown",
      assessmentType: assessmentMap[r.assessmentId]?.type ?? "CAASPP",
      studentId: r.studentId,
      studentName: studentMap[r.studentId]?.name ?? "Unknown",
      score: r.score,
      maxScore: r.maxScore,
      percentage: r.percentage,
      passed: r.passed,
      timeSpent: r.timeSpent,
      completedAt: r.completedAt,
    }));

  return res.json({
    totalStudents: allStudents.length,
    totalAssessments: allAssessments.length,
    averageScore: Math.round(avgScore * 10) / 10,
    passRate: Math.round(passRate * 10) / 10,
    caasppStats: {
      totalStudents: [...new Set(caasppResults.map(r => r.studentId))].length,
      averageScore: caasppResults.length > 0 ? caasppResults.reduce((s, r) => s + r.percentage, 0) / caasppResults.length : 0,
      passRate: caasppResults.length > 0 ? (caasppResults.filter(r => r.passed).length / caasppResults.length) * 100 : 0,
      subjectBreakdown: getSubjectBreakdown(caasppResults),
    },
    elpacStats: {
      totalStudents: [...new Set(elpacResults.map(r => r.studentId))].length,
      averageScore: elpacResults.length > 0 ? elpacResults.reduce((s, r) => s + r.percentage, 0) / elpacResults.length : 0,
      passRate: elpacResults.length > 0 ? (elpacResults.filter(r => r.passed).length / elpacResults.length) * 100 : 0,
      subjectBreakdown: getSubjectBreakdown(elpacResults),
    },
    recentResults,
    scoreDistribution,
    subjectPerformance: getSubjectBreakdown(filteredResults),
  });
});

router.get("/analytics/student/:studentId", async (req: Request, res: Response) => {
  const { studentId } = req.params;
  console.log("[GET /api/analytics/student/:studentId] start", { studentId });

  const students = await db.select().from(usersTable).where(eq(usersTable.id, studentId as string)).limit(1);
  const student = students[0];
  if (!student) {
    console.log("[GET /api/analytics/student/:studentId] student not found", { studentId });
    return res.status(404).json({ error: "not_found", message: "Student not found" });
  }
  console.log("[GET /api/analytics/student/:studentId] student loaded", {
    studentId: student.id,
    studentName: student.name,
  });

  const results = await db.select().from(resultsTable).where(eq(resultsTable.studentId, studentId as string));
  const assessments = await db.select().from(assessmentsTable);
  const assessmentMap = Object.fromEntries(assessments.map(a => [a.id, a]));
  console.log("[GET /api/analytics/student/:studentId] data loaded", {
    resultsCount: results.length,
    assessmentsCount: assessments.length,
  });

  const avgScore = results.length > 0 ? results.reduce((s, r) => s + r.percentage, 0) / results.length : 0;
  const passRate = results.length > 0 ? (results.filter(r => r.passed).length / results.length) * 100 : 0;

  const recentResults = [...results]
    .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
    .slice(0, 10)
    .map(r => ({
      id: r.id,
      assessmentId: r.assessmentId,
      assessmentTitle: assessmentMap[r.assessmentId]?.title ?? "Unknown",
      assessmentType: assessmentMap[r.assessmentId]?.type ?? "CAASPP",
      studentId: r.studentId,
      studentName: student.name,
      score: r.score,
      maxScore: r.maxScore,
      percentage: r.percentage,
      passed: r.passed,
      timeSpent: r.timeSpent,
      completedAt: r.completedAt,
    }));

  const progressOverTime = [...results]
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())
    .map(r => ({
      date: r.completedAt,
      score: r.percentage,
      assessmentTitle: assessmentMap[r.assessmentId]?.title ?? "Unknown",
      assessmentType: assessmentMap[r.assessmentId]?.type ?? "CAASPP",
    }));

  const subjectScores: Record<string, number[]> = {};
  for (const r of results) {
    const subject = assessmentMap[r.assessmentId]?.subject ?? "Unknown";
    if (!subjectScores[subject]) subjectScores[subject] = [];
    subjectScores[subject].push(r.percentage);
  }

  let strengthAreas: string[] = [];
  let improvementAreas: string[] = [];
  let mentorInsights = "No stored performance insight available yet.";
  let performanceBrief: any[] = [];

  const latestByCompletedAt = [...results].sort(
    (a, b) => b.completedAt.getTime() - a.completedAt.getTime(),
  );
  const feedbackByResultId = Object.fromEntries(
    results.map((rr) => [rr.id, typeof rr.feedback === "string" ? rr.feedback : ""]),
  );
  for (const r of latestByCompletedAt) {
    const stored = parseStoredPerformance(r.feedback);
    if (!stored) continue;
    strengthAreas = stored.strengthAreas ?? [];
    improvementAreas = stored.improvementAreas ?? [];
    mentorInsights = stored.mentorInsights ?? mentorInsights;
    performanceBrief = (stored.detailedTranscript ?? []).map((entry: any) => {
      const resultId = typeof entry?.resultId === "string" ? entry.resultId : "";
      const fullFeedback = resultId ? feedbackByResultId[resultId] : "";
      return {
        ...entry,
        // Surface complete report fields but remove recursive transcript payload.
        feedback: stripRecursiveTranscriptFromFeedback(
          fullFeedback || (typeof entry?.feedback === "string" ? entry.feedback : ""),
        ),
      };
    });
    console.log("[GET /api/analytics/student/:studentId] using stored performance", {
      sourceResultId: r.id,
      hasMentorInsights: typeof stored.mentorInsights === "string" && stored.mentorInsights.length > 0,
      strengthAreasCount: strengthAreas.length,
      improvementAreasCount: improvementAreas.length,
      transcriptCount: performanceBrief.length,
    });
    break;
  }
  if (performanceBrief.length === 0) {
    console.log("[GET /api/analytics/student/:studentId] no stored performance payload found", { studentId });
  }

  console.log("[GET /api/analytics/student/:studentId] response summary", {
    totalAssessments: results.length,
    averageScore: Math.round(avgScore * 10) / 10,
    passRate: Math.round(passRate * 10) / 10,
    recentResultsCount: recentResults.length,
    progressPoints: progressOverTime.length,
  });
  return res.json({
    student: {
      id: student.id,
      username: student.username,
      name: student.name,
      email: student.email,
      role: student.role,
      grade: student.grade,
      classIds: student.classIds,
      className: null,
      createdAt: student.createdAt,
    },
    totalAssessments: results.length,
    averageScore: Math.round(avgScore * 10) / 10,
    passRate: Math.round(passRate * 10) / 10,
    recentResults,
    progressOverTime,
    strengthAreas,
    improvementAreas,
    mentorInsights,
    detailedTranscript: performanceBrief
  });
});

export default router;