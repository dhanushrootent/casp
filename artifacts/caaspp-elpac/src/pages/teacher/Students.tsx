import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { GraduationCap, TrendingUp, CheckCircle, XCircle, Loader2, Info, ChevronDown, ChevronUp, BrainCircuit, Sparkles } from 'lucide-react';
import { useListUsers, useListResults, useGetStudentAnalytics, useGenerateResultInsights, getGetStudentAnalyticsQueryKey } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { WritingRubricGradeView } from '@/components/teacher/WritingRubricGradeView';
import { API_BASE_URL } from '@/config/api';

function parseStoredFeedback(feedback: unknown): any | null {
  if (typeof feedback !== 'string' || feedback.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(feedback);
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed.kind === 'ai_writing_result_v1' || parsed.kind === 'student_performance_v1')
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export default function TeacherStudents() {
  const { user } = useAuth();
  const { data: allUsers, isLoading: usersLoading } = useListUsers({ role: 'student' });
  const { data: allResults, isLoading: resultsLoading } = useListResults({});

  const isLoading = usersLoading || resultsLoading;

  const students = allUsers ?? [];
  const results = allResults ?? [];

  const getStudentStats = (studentId: string) => {
    const studentResults = results.filter(r => r.studentId === studentId);
    if (studentResults.length === 0) return { attempts: 0, avgScore: null, passed: 0 };
    const avgScore = studentResults.reduce((s, r) => s + r.percentage, 0) / studentResults.length;
    const passed = studentResults.filter(r => r.passed).length;
    return { attempts: studentResults.length, avgScore: Math.round(avgScore * 10) / 10, passed };
  };

  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

  const StudentInsights = ({ studentId }: { studentId: string }) => {
    const { data: analytics, isLoading } = useGetStudentAnalytics(studentId);
    const generateInsightsMutation = useGenerateResultInsights();
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({});
    const [finalCommentDraftByResultId, setFinalCommentDraftByResultId] = useState<Record<string, string>>({});
    const [manualCriterionScoreByResultId, setManualCriterionScoreByResultId] = useState<
      Record<string, Record<string, number>>
    >({});

    const toggleResult = (idx: string) => {
      setExpandedResults(prev => ({ ...prev, [idx]: !prev[idx] }));
    };

    const handleGenerateInsights = (resultId: string) => {
      generateInsightsMutation.mutate({ resultId }, {
        onSuccess: () => {
          toast({ title: 'Insights Generated Successfully!' });
          queryClient.invalidateQueries({ queryKey: getGetStudentAnalyticsQueryKey(studentId) });
        },
        onError: () => {
          toast({ title: 'Failed to generate insights', variant: 'destructive' });
        }
      });
    };

    const saveFinalComment = async (resultId: string) => {
      const teacherFinalComment = (finalCommentDraftByResultId[resultId] ?? "").trim();
      try {
        const resp = await fetch(`${API_BASE_URL}/api/results/${resultId}/final-comment`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherFinalComment }),
        });
        if (!resp.ok) throw new Error("Failed to save final comment");
        toast({ title: "Final comment saved" });
        queryClient.invalidateQueries({ queryKey: getGetStudentAnalyticsQueryKey(studentId) });
      } catch {
        toast({ title: "Failed to save final comment", variant: "destructive" });
      }
    };

    const setManualCriterionScore = (resultId: string, criterionId: string, score: number) => {
      setManualCriterionScoreByResultId((prev) => ({
        ...prev,
        [resultId]: {
          ...(prev[resultId] || {}),
          [criterionId]: score,
        },
      }));
    };

    const saveFinalizedScores = async (resultId: string, writingFeedback: any) => {
      const criterionDraft = manualCriterionScoreByResultId[resultId] || {};
      const nextQuestions = (writingFeedback?.questions || []).map((item: any) => {
        const grading = item?.grading;
        if (!grading || !Array.isArray(grading.criteriaScores)) return item;
        const rubricCriteria = Array.isArray(item?.rubric?.criteria) ? item.rubric.criteria : [];
        const nextCriteria = grading.criteriaScores.map((cs: any, idx: number) => {
          const criterionId = String(cs?.criterionId ?? `criterion_${idx + 1}`);
          const maxScore = Number(cs?.maxScore) || 0;
          const raw = criterionDraft[criterionId];
          const score = Number.isFinite(raw) ? Math.max(0, Math.min(maxScore, raw)) : Number(cs?.score) || 0;
          const rubricCriterion =
            rubricCriteria.find((c: any) => String(c?.id ?? "") === criterionId) ||
            rubricCriteria.find((c: any) => String(c?.name ?? "") === String(cs?.criterionName ?? "")) ||
            rubricCriteria[idx];
          const rubricLevels = Array.isArray(rubricCriterion?.levels) ? rubricCriterion.levels : [];
          const scoredLevels = rubricLevels
            .map((lv: any) => ({
              label: String(lv?.label ?? ""),
              score: Number(lv?.score),
            }))
            .filter((lv: any) => lv.label.length > 0 && Number.isFinite(lv.score))
            .sort((a: any, b: any) => b.score - a.score);
          const computedLevel =
            scoredLevels.length > 0
              ? (scoredLevels.find((lv: any) => score >= lv.score)?.label ??
                scoredLevels[scoredLevels.length - 1].label)
              : String(cs?.level ?? "");
          return { ...cs, score, level: computedLevel };
        });
        const totalScore = nextCriteria.reduce((sum: number, cs: any) => sum + (Number(cs?.score) || 0), 0);
        const maxScore = nextCriteria.reduce((sum: number, cs: any) => sum + (Number(cs?.maxScore) || 0), 0);
        return {
          ...item,
          grading: {
            ...grading,
            criteriaScores: nextCriteria,
            totalScore,
            maxScore,
            percentage: maxScore > 0 ? (totalScore / maxScore) * 100 : 0,
          },
        };
      });

      const maxScoreFromQuestions = nextQuestions.reduce(
        (sum: number, item: any) => sum + (Number(item?.grading?.maxScore) || 0),
        0,
      );
      const totalScoreFromQuestions = nextQuestions.reduce(
        (sum: number, item: any) => sum + (Number(item?.grading?.totalScore) || 0),
        0,
      );
      const manualScore = Math.round(totalScoreFromQuestions * 100) / 100;
      const draftPercentage =
        maxScoreFromQuestions > 0 ? Math.round(((manualScore / maxScoreFromQuestions) * 100) * 100) / 100 : 0;
      const teacherFinalComment = (finalCommentDraftByResultId[resultId] ?? "").trim();

      try {
        const resp = await fetch(`${API_BASE_URL}/api/results/${resultId}/finalize-scores`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manualPercentage: draftPercentage,
            manualScore,
            manualMaxScore: maxScoreFromQuestions,
            teacherFinalComment: teacherFinalComment.length > 0 ? teacherFinalComment : undefined,
            questions: nextQuestions.map((q: any) => ({ questionId: q.questionId, grading: q.grading })),
          }),
        });
        if (!resp.ok) throw new Error("Failed to finalize scores");
        toast({ title: "Scores finalized and published" });
        queryClient.invalidateQueries({ queryKey: getGetStudentAnalyticsQueryKey(studentId) });
      } catch {
        toast({ title: "Failed to finalize scores", variant: "destructive" });
      }
    };

    if (isLoading) return <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing performance data...</div>;

    const insights = (analytics as any)?.mentorInsights || "No detailed insights available yet. Gemni is analyzing more assessment data to provide a personalized learning path.";
    const groupedTranscriptEntries = Object.entries(
      ((analytics as any)?.detailedTranscript ?? []).reduce(
        (acc: Record<string, { label: string; items: any[] }>, transcript: any) => {
          const key = String(transcript?.assessmentId ?? transcript?.testTitle ?? transcript?.resultId ?? "assessment");
          if (!acc[key]) {
            acc[key] = {
              label: String(transcript?.testTitle ?? transcript?.assessmentTitle ?? "Assessment"),
              items: [],
            };
          }
          acc[key].items.push(transcript);
          return acc;
        },
        {},
      ),
    ) as Array<[string, { label: string; items: any[] }]>;

    return (
      <div className="bg-linear-to-b from-blue-50/40 to-slate-50/40 p-5 rounded-xl border border-blue-100/60 m-3 mt-0 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-slate-900 font-display">AI Mentor Insights</h4>
            <p className="text-sm text-slate-500">Personalized concept analysis and training recommendations</p>
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-xs">
          <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed">
            {insights.split('\n').map((line: string, i: number) => (
              <p key={i} className="mb-2">{line}</p>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-white rounded-xl border border-slate-200 min-h-[92px]">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest block mb-2">Strength Areas</span>
            <div className="flex flex-wrap gap-1.5">
              {(analytics as any)?.strengthAreas?.length > 0
                ? (analytics as any).strengthAreas.map((s: string) => <span key={s} className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-md border border-emerald-100">{s}</span>)
                : <span className="text-xs text-muted-foreground italic tracking-tight">Gathering data...</span>
              }
            </div>
          </div>
        </div>

        {/* Detailed Transcript View */}
        {groupedTranscriptEntries.length > 0 && (
          <div className="mt-6">
            <h4 className="text-md font-bold text-slate-900 border-b border-blue-200 pb-2 mb-4 flex items-center justify-between">
              <span>Assessment Outcomes</span>
              <span className="text-xs font-semibold text-slate-500">{groupedTranscriptEntries.length} assessment(s)</span>
            </h4>
            <div className="space-y-4">
              {groupedTranscriptEntries.map(([assessmentKey, group]) => {
                const isResultExpanded = expandedResults[assessmentKey];
                return (
                  <div key={assessmentKey} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <button 
                      onClick={() => toggleResult(assessmentKey)}
                      className="w-full flex justify-between items-center p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isResultExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                        <span className="font-semibold text-slate-800 text-left">{group.label}</span>
                      </div>
                      <span className="text-sm font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
                        Attempts: {group.items.length}
                      </span>
                    </button>
                    
                    {isResultExpanded && (
                      <div className="p-5 border-t border-slate-100 space-y-4">
                        {group.items.map((transcript: any, idx: number) => {
                          const isGenerating = generateInsightsMutation.isPending && generateInsightsMutation.variables?.resultId === transcript.resultId;
                          const storedFeedback = parseStoredFeedback(transcript.feedback);
                          const writingFeedback = storedFeedback?.kind === 'ai_writing_result_v1' ? storedFeedback : null;
                          const transcriptSummary =
                            typeof storedFeedback?.summary === 'string'
                              ? storedFeedback.summary
                              : (typeof transcript.feedback === 'string' ? transcript.feedback : '');
                          const essayAnswers = (transcript.answeredQuestions || []).filter(
                            (q: any) =>
                              q &&
                              typeof q.studentAnswer === 'string' &&
                              q.studentAnswer.trim().length > 0 &&
                              (!q.correctAnswer || q.correctAnswer === 'Subjective'),
                          );

                          return (
                            <div key={transcript.resultId || idx} className="rounded-xl border border-slate-200 bg-slate-50/30 p-4 space-y-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold text-slate-800">Attempt {idx + 1}</div>
                                <span className="text-sm font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
                                  Score: {Math.round(transcript.score)}%
                                </span>
                              </div>

                              {writingFeedback ? (
                                <div className="space-y-4">
                                  <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 relative">
                                    <h5 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                      <Sparkles className="w-4 h-4" /> Gemini Writing Evaluation
                                    </h5>
                                    <p className="text-sm text-slate-700 pr-24">{writingFeedback.summary}</p>
                                    {transcript.resultId ? (
                                      <button
                                        disabled={isGenerating}
                                        onClick={() => handleGenerateInsights(transcript.resultId)}
                                        className="absolute top-4 right-4 text-xs font-medium bg-white text-blue-600 border border-blue-200 px-3 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-50"
                                      >
                                        {isGenerating ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                                        Regenerate
                                      </button>
                                    ) : null}
                                  </div>

                                  {(writingFeedback.questions || []).map((item: any, itemIdx: number) => {
                                    const grading = item?.grading;
                                    if (!grading) return null;
                                    return (
                                      <div key={item.questionId || itemIdx} className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                                        <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">Rubric &amp; criterion performance</div>
                                        <WritingRubricGradeView rubric={item.rubric} grading={grading} />
                                        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                                          <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">Teacher score controls</div>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {(grading.criteriaScores || []).map((cs: any, cIdx: number) => {
                                              const criterionId = String(cs?.criterionId ?? `criterion_${cIdx + 1}`);
                                              const current =
                                                manualCriterionScoreByResultId[transcript.resultId]?.[criterionId] ??
                                                Number(cs?.score) ??
                                                0;
                                              return (
                                                <div key={criterionId} className="flex items-center gap-2">
                                                  <span className="text-xs text-slate-700 min-w-40 truncate">
                                                    {cs?.criterionName || `Criterion ${cIdx + 1}`}
                                                  </span>
                                                  <input
                                                    type="number"
                                                    min={0}
                                                    max={Number(cs?.maxScore) || 0}
                                                    step={0.5}
                                                    value={current}
                                                    onChange={(e) =>
                                                      setManualCriterionScore(
                                                        transcript.resultId,
                                                        criterionId,
                                                        Number(e.target.value || 0),
                                                      )
                                                    }
                                                    className="w-24 rounded-md border border-input bg-white px-2 py-1 text-xs"
                                                  />
                                                  <span className="text-xs text-muted-foreground">/ {Number(cs?.maxScore) || 0}</span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : transcriptSummary ? (
                                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 relative">
                                  <h5 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4" /> AI Feedback on this Result
                                  </h5>
                                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{transcriptSummary}</p>
                                </div>
                              ) : null}

                              {essayAnswers.length > 0 ? (
                                <div className="space-y-3">
                                  <h5 className="text-sm font-bold text-slate-800">Student Essay Response</h5>
                                  {essayAnswers.map((q: any, qIdx: number) => (
                                    <div key={qIdx} className="rounded-xl border border-slate-200 bg-white p-4">
                                      <div className="font-semibold text-slate-800 mb-2">{q.text || `Essay Question ${qIdx + 1}`}</div>
                                      <div className="text-xs tracking-wider uppercase font-semibold text-slate-500 mb-1">Submitted Response</div>
                                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-44 overflow-y-auto pr-1">{q.studentAnswer}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              {transcript.resultId ? (
                                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4">
                                  <div className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-2">Final Teacher Comment (visible to student)</div>
                                  <textarea
                                    className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[100px] resize-y"
                                    value={
                                      finalCommentDraftByResultId[transcript.resultId] ??
                                      (typeof transcript.teacherFinalComment === "string" ? transcript.teacherFinalComment : "")
                                    }
                                    onChange={(e) =>
                                      setFinalCommentDraftByResultId((prev) => ({
                                        ...prev,
                                        [transcript.resultId]: e.target.value,
                                      }))
                                    }
                                  />
                                  <div className="mt-3 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => saveFinalComment(transcript.resultId)}
                                      className="text-xs font-medium bg-white text-violet-700 border border-violet-200 px-3 py-1.5 rounded hover:bg-violet-100 transition-colors"
                                    >
                                      Save Final Comment
                                    </button>
                                    <div className="ml-3 flex items-center gap-2">
                                      <span className="text-xs font-semibold text-slate-600">
                                        Final % auto-calculated from rubric rows
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => saveFinalizedScores(transcript.resultId, writingFeedback)}
                                        className="text-xs font-medium bg-violet-700 text-white border border-violet-700 px-3 py-1.5 rounded hover:bg-violet-800 transition-colors"
                                      >
                                        Finalize & Publish
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">My Students</h1>
          <p className="text-muted-foreground text-lg">Student progress across all assessments</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Students</p>
                    <p className="text-2xl font-bold font-display">{students.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Assessments Taken</p>
                    <p className="text-2xl font-bold font-display">{results.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Overall Pass Rate</p>
                    <p className="text-2xl font-bold font-display">
                      {results.length > 0
                        ? Math.round((results.filter(r => r.passed).length / results.length) * 100)
                        : 0}%
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Student Progress</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-6 py-3 font-semibold text-muted-foreground">Student</th>
                        <th className="text-left px-6 py-3 font-semibold text-muted-foreground">Grade</th>
                        <th className="text-center px-6 py-3 font-semibold text-muted-foreground">Attempts</th>
                        <th className="text-center px-6 py-3 font-semibold text-muted-foreground">Avg Score</th>
                        <th className="text-center px-6 py-3 font-semibold text-muted-foreground">Passed</th>
                        <th className="text-center px-6 py-3 font-semibold text-muted-foreground">Status</th>
                        <th className="text-right px-6 py-3 font-semibold text-muted-foreground">Detailed Insights</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {students.map(student => {
                        const isExpanded = expandedStudentId === student.id;
                        const stats = getStudentStats(student.id);
                        const performanceLevel =
                          stats.avgScore === null ? 'No Data'
                            : stats.avgScore >= 80 ? 'Proficient'
                              : stats.avgScore >= 60 ? 'Approaching'
                                : 'Needs Support';
                        const levelColor =
                          stats.avgScore === null ? 'bg-gray-100 text-gray-600'
                            : stats.avgScore >= 80 ? 'bg-emerald-100 text-emerald-700'
                              : stats.avgScore >= 60 ? 'bg-amber-100 text-amber-700'
                                : 'bg-red-100 text-red-700';

                        return (
                          <React.Fragment key={student.id}>
                            <tr className={`hover:bg-muted/20 transition-colors ${isExpanded ? 'bg-muted/10' : ''}`}>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                                    {student.name.charAt(0)}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-foreground">{student.name}</p>
                                    <p className="text-xs text-muted-foreground">{student.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-muted-foreground">
                                {student.grade ? `Grade ${student.grade}` : '—'}
                              </td>
                              <td className="px-6 py-4 text-center font-semibold">{stats.attempts}</td>
                              <td className="px-6 py-4 text-center">
                                {stats.avgScore !== null ? (
                                  <span className="font-bold text-foreground">{stats.avgScore}%</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                {stats.attempts > 0 ? (
                                  <span className="font-semibold">{stats.passed}/{stats.attempts}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${levelColor}`}>
                                  {performanceLevel}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <button
                                  onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                                  className={`p-2 rounded-lg transition-all ${isExpanded ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                                >
                                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <Info className="w-5 h-5" />}
                                </button>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={7} className="p-0 bg-slate-50/50">
                                  <StudentInsights studentId={student.id} />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {students.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-16 text-center text-muted-foreground">
                            <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p>No students found</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}