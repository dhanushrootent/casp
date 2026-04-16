import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useListResults, getGetResultQueryKey } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { CheckCircle, XCircle, Clock, TrendingUp, Loader2, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { WritingRubricGradeView } from '@/components/teacher/WritingRubricGradeView';
import { useQueries } from '@tanstack/react-query';
import { API_BASE_URL } from '@/config/api';

const typeColor: Record<string, string> = {
  CAASPP: 'bg-blue-100 text-blue-700',
  ELPAC: 'bg-teal-100 text-teal-700',
};

function parseStoredFeedback(feedback: unknown): any | null {
  if (typeof feedback !== 'string' || feedback.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(feedback);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export default function StudentResults() {
  const { user } = useAuth();
  const { data: results, isLoading } = useListResults({ studentId: user?.id ?? '' });
  const [expandedAssessmentKey, setExpandedAssessmentKey] = useState<string | null>(null);

  const sortedResults = [...(results ?? [])].sort(
    (a, b) => {
      const dateA = new Date(a.completedAt).getTime();
      const dateB = new Date(b.completedAt).getTime();
      return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
    }
  );

  const releasedResults = sortedResults.filter((r: any) => Boolean((r as any).scoreReleased));
  const avgScore = releasedResults.length > 0
    ? Math.round(releasedResults.reduce((s, r: any) => s + Number(r.percentage || 0), 0) / releasedResults.length * 10) / 10
    : 0;
  const passCount = releasedResults.filter((r: any) => r.passed).length;
  const groupedResults = Object.entries(
    sortedResults.reduce((acc: Record<string, { label: string; items: any[] }>, result: any) => {
      const key = String(result.assessmentId ?? result.assessmentTitle ?? result.id);
      if (!acc[key]) {
        acc[key] = {
          label: String(result.assessmentTitle ?? 'Assessment'),
          items: [],
        };
      }
      acc[key].items.push(result);
      return acc;
    }, {}),
  ) as Array<[string, { label: string; items: any[] }]>;
  const expandedGroup = groupedResults.find(([key]) => key === expandedAssessmentKey)?.[1] ?? null;
  const expandedAttemptQueries = useQueries({
    queries: (expandedGroup?.items ?? []).map((result: any) => ({
      queryKey: getGetResultQueryKey(result.id),
      queryFn: async () => {
        const resp = await fetch(`${API_BASE_URL}/api/results/${result.id}`);
        if (!resp.ok) throw new Error('Failed to load result');
        return resp.json();
      },
      enabled: Boolean(expandedAssessmentKey),
    })),
  });
  const expandedAttemptDetailsById = Object.fromEntries(
    (expandedGroup?.items ?? []).map((result: any, idx: number) => [result.id, expandedAttemptQueries[idx]?.data]),
  );
  const expandedGroupLoading = expandedAttemptQueries.some((q) => q.isLoading);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">My Results</h1>
          <p className="text-muted-foreground text-lg">Your assessment history and scores</p>
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
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tests Taken</p>
                    <p className="text-2xl font-bold font-display">{sortedResults.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Average Score</p>
                    <p className="text-2xl font-bold font-display">{releasedResults.length > 0 ? `${avgScore}%` : "Pending"}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tests Passed</p>
                    <p className="text-2xl font-bold font-display">{passCount}/{releasedResults.length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Assessment History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {groupedResults.map(([groupKey, group]) => (
                    <div key={groupKey}>
                      <button
                        type="button"
                        onClick={() => setExpandedAssessmentKey((prev) => (prev === groupKey ? null : groupKey))}
                        className="w-full text-left flex items-center gap-4 px-6 py-4 hover:bg-muted/20 transition-colors"
                      >
                      {(() => {
                        const latestResult = group.items[0];
                        return (
                      <>
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${(latestResult as any).scoreReleased ? (latestResult.passed ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600') : 'bg-amber-100 text-amber-700'}`}>
                        {(latestResult as any).scoreReleased
                          ? (latestResult.passed
                          ? <CheckCircle className="w-5 h-5" />
                          : <XCircle className="w-5 h-5" />
                        )
                          : <Clock className="w-5 h-5" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-semibold text-foreground truncate">{latestResult.assessmentTitle}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor[latestResult.assessmentType] ?? ''}`}>
                            {latestResult.assessmentType}
                          </span>
                        {(latestResult as any).achievedExceptional ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            Exceptional Performance
                          </span>
                        ) : null}
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          Attempts: {group.items.length}
                        </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {Math.floor((latestResult.timeSpent ?? 0) / 60)}m {(latestResult.timeSpent ?? 0) % 60}s
                          </span>
                          <span>•</span>
                          <span>{latestResult.completedAt ? format(new Date(latestResult.completedAt), 'MMM d, yyyy') : 'N/A'}</span>
                        </div>
                        {(latestResult as any).teacherFinalComment ? (
                          <div className="mt-2 text-sm text-violet-800 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
                            <span className="font-semibold">Teacher Final Comment: </span>
                            <span>{(latestResult as any).teacherFinalComment}</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="text-right shrink-0">
                        {(latestResult as any).scoreReleased ? (
                          <>
                            <p className={`text-2xl font-bold font-display ${latestResult.passed ? 'text-emerald-600' : 'text-red-500'}`}>
                              {Math.round(Number(latestResult.percentage || 0))}%
                            </p>
                            <p className="text-xs text-muted-foreground">{latestResult.score}/{latestResult.maxScore} pts</p>
                          </>
                        ) : (
                          <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                            Pending teacher review
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-muted-foreground">
                        {expandedAssessmentKey === groupKey ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                      </>
                        );
                      })()}
                      </button>

                      {expandedAssessmentKey === groupKey ? (
                        <div className="px-6 pb-5 pt-1 bg-muted/10">
                          {expandedGroupLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="w-4 h-4 animate-spin" /> Loading assessment insights...
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {group.items.map((result: any, attemptIdx: number) => {
                              const detail = expandedAttemptDetailsById[result.id] as any;
                              const parsed = parseStoredFeedback(detail?.feedback);
                              const writingQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
                              const aiWhatWentWell = Array.from(
                                new Set(
                                  writingQuestions
                                    .flatMap((q: any) =>
                                      Array.isArray(q?.grading?.overallFeedback?.strengths)
                                        ? q.grading.overallFeedback.strengths
                                        : [],
                                    )
                                    .map((s: any) => String(s ?? '').trim())
                                    .filter((s: string) => s.length > 0),
                                ),
                              );
                              const aiWhatToImprove = Array.from(
                                new Set(
                                  writingQuestions
                                    .flatMap((q: any) =>
                                      Array.isArray(q?.grading?.overallFeedback?.areasForImprovement)
                                        ? q.grading.overallFeedback.areasForImprovement
                                        : [],
                                    )
                                    .map((s: any) => String(s ?? '').trim())
                                    .filter((s: string) => s.length > 0),
                                ),
                              );
                              return (
                                <div key={result.id} className="rounded-xl border border-slate-200 bg-white/70 p-4">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                  <div className="text-sm font-semibold text-slate-800">Attempt {attemptIdx + 1}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {result.completedAt ? format(new Date(result.completedAt), 'MMM d, yyyy h:mm a') : 'N/A'}
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  {(aiWhatWentWell.length > 0 || aiWhatToImprove.length > 0) ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                                        <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">
                                          What Went Well
                                        </div>
                                        {aiWhatWentWell.length > 0 ? (
                                          <div className="space-y-1.5 text-sm text-slate-700">
                                            {aiWhatWentWell.map((s: string, i: number) => (
                                              <div key={i} className="flex gap-2">
                                                <span className="text-emerald-700 font-bold">•</span>
                                                <span>{s}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="text-sm text-slate-500">No “what went well” insights were provided.</div>
                                        )}
                                      </div>
                                      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                                        <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">
                                          What To Improve
                                        </div>
                                        {aiWhatToImprove.length > 0 ? (
                                          <div className="space-y-1.5 text-sm text-slate-700">
                                            {aiWhatToImprove.map((s: string, i: number) => (
                                              <div key={i} className="flex gap-2">
                                                <span className="text-amber-700 font-bold">•</span>
                                                <span>{s}</span>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="text-sm text-slate-500">No “what to improve” insights were provided.</div>
                                        )}
                                      </div>
                                    </div>
                                  ) : null}

                                  {writingQuestions.length > 0 ? (
                                    writingQuestions.map((item: any, idx: number) => {
                                      const grading = item?.grading;
                                      if (!grading) return null;
                                      return (
                                        <div key={item?.questionId || idx} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="font-semibold text-slate-900">Rubric Scores & AI Comments</div>
                                            {(result as any).scoreReleased ? (
                                              <span className="text-sm font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
                                                {Math.round(Number(grading?.percentage || 0))}%
                                              </span>
                                            ) : (
                                              <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
                                                Pending teacher finalization
                                              </span>
                                            )}
                                          </div>
                                          {(result as any).scoreReleased ? (
                                            <WritingRubricGradeView rubric={item?.rubric} grading={grading} />
                                          ) : (
                                            <p className="text-sm text-muted-foreground">
                                              Rubric row scores will appear once your teacher finalizes this attempt.
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })
                                  ) : (
                                    <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-muted-foreground">
                                      No rubric-level AI grading was recorded for this attempt.
                                    </div>
                                  )}
                                </div>
                                </div>
                              );
                              })}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {sortedResults.length === 0 && (
                    <div className="py-16 text-center text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No results yet</p>
                      <p className="text-sm mt-1">Take an assessment to see your results here</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
