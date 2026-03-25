import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { resultsTable, assessmentsTable, usersTable, questionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { ai } from "@workspace/integrations-gemini-ai";

const router: IRouter = Router();

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

  const students = await db.select().from(usersTable).where(eq(usersTable.id, studentId as string)).limit(1);
  const student = students[0];
  if (!student) {
    return res.status(404).json({ error: "not_found", message: "Student not found" });
  }

  const results = await db.select().from(resultsTable).where(eq(resultsTable.studentId, studentId as string));
  const assessments = await db.select().from(assessmentsTable);
  const assessmentMap = Object.fromEntries(assessments.map(a => [a.id, a]));

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

  // Define strength/improvement at the skill (concept) level
  let strengthAreas: string[] = [];
  let improvementAreas: string[] = [];
  let mentorInsights = "Gemini is analyzing the performance data...";
  let performanceBrief: any[] = [];

  if (results.length > 0) {
    const questionIds = Array.from(new Set(results.flatMap(r => r.answers.map(a => a.questionId))));
    const questions = questionIds.length > 0
      ? await db.select().from(questionsTable).where(inArray(questionsTable.id, questionIds))
      : [];
    const questionMap = Object.fromEntries(questions.map(q => [q.id, q]));

    // Calculate skill-based averages
    const skillStats: Record<string, { total: number; correct: number }> = {};
    for (const r of results) {
      for (const a of r.answers) {
        const q = questionMap[a.questionId];
        if (!q || !q.skill) continue;
        if (!skillStats[q.skill]) skillStats[q.skill] = { total: 0, correct: 0 };
        skillStats[q.skill].total++;
        if (q.correctAnswer && a.answer === q.correctAnswer) {
          skillStats[q.skill].correct++;
        } else if (q.type === 'short_answer' || q.type === 'essay' || q.type === 'speaking') {
          // For non-MC questions, assume "some partial credit" if test score was high or exclude
          // For now, simpler: use result percentage as proxy if skill is present
          if (r.percentage >= 70) skillStats[q.skill].correct++;
        }
      }
    }

    const skillAverages = Object.entries(skillStats).map(([skill, stats]) => ({
      skill,
      percent: (stats.correct / stats.total) * 100
    }));

    strengthAreas = skillAverages.filter(s => s.percent >= 75).map(s => s.skill);
    improvementAreas = skillAverages.filter(s => s.percent < 60).map(s => s.skill);

    // AI Mentor Insights Generation
    performanceBrief = results.map(r => {
      const answeredQuestions = r.answers.map(a => {
        const q = questionMap[a.questionId];
        const isCorrect = q && q.correctAnswer ? (a.answer === q.correctAnswer) : null;
        return {
          text: q?.text,
          skill: q?.skill,
          studentAnswer: a.answer,
          correctAnswer: q?.correctAnswer,
          isCorrect
        };
      });

      return {
        resultId: r.id,
        testTitle: assessmentMap[r.assessmentId]?.title,
        score: r.percentage,
        feedback: r.feedback,
        answeredQuestions
      };
    });

    const prompt = `You are an AI Education Mentor. Analyze the following student performance data and provide a concise (max 150 words) detailed explanation for their teacher.
    Student Name: ${student.name}
    Performance History (Contains both right and wrong answers to help gauge strengths and weaknesses): ${JSON.stringify(performanceBrief)}

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
      });
      mentorInsights = response.text || "Insight generation failed.";
    } catch (e: any) {
      console.error("AI Insights Error:", e?.message || e);
      if (e?.message?.includes("429") || e?.message?.includes("Quota") || e?.message?.includes("exhausted")) {
        mentorInsights = "Unable to generate insights: The Gemini API key has exceeded its rate limit or free tier quota. Please try again later or check your Google Cloud Console billing.";
      } else {
        mentorInsights = "Unable to generate insights at this moment due to a connection issue.";
      }
    }
  }

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