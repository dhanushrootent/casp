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

function parseWritingResultFeedback(feedback: unknown): any | null {
  if (typeof feedback !== 'string' || feedback.trim().length === 0) return null;
  try {
    const parsed = JSON.parse(feedback);
    if (parsed && typeof parsed === 'object' && parsed.kind === 'ai_writing_result_v1') {
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

    if (isLoading) return <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing performance data...</div>;

    const insights = (analytics as any)?.mentorInsights || "No detailed insights available yet. Gemni is analyzing more assessment data to provide a personalized learning path.";

    return (
      <div className="bg-blue-50/30 p-8 rounded-xl border border-blue-100/50 m-4 mt-0 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
            <BrainCircuit className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-slate-900 font-display">AI Mentor Insights</h4>
            <p className="text-sm text-slate-500">Personalized concept analysis and training recommendations</p>
          </div>
        </div>

        <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed">
          {insights.split('\n').map((line: string, i: number) => (
            <p key={i} className="mb-3">{line}</p>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest block mb-2">Strength Areas</span>
            <div className="flex flex-wrap gap-2">
              {(analytics as any)?.strengthAreas?.length > 0
                ? (analytics as any).strengthAreas.map((s: string) => <span key={s} className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-md border border-emerald-100">{s}</span>)
                : <span className="text-xs text-muted-foreground italic tracking-tight">Gathering data...</span>
              }
            </div>
          </div>
          <div className="p-4 bg-white rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-widest block mb-1">Concepts Needing Review</span>
            <div className="flex flex-wrap gap-2">
              {(analytics as any)?.improvementAreas?.length > 0
                ? (analytics as any).improvementAreas.map((s: string) => <span key={s} className="px-2 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-md border border-amber-100">{s}</span>)
                : <span className="text-xs text-muted-foreground italic tracking-tight">Gathering data...</span>
              }
            </div>
          </div>
        </div>

        {/* Detailed Transcript View */}
        {(analytics as any)?.detailedTranscript?.length > 0 && (
          <div className="mt-8">
            <h4 className="text-md font-bold text-slate-900 border-b border-blue-200 pb-2 mb-4">Assessment Outcomes</h4>
            <div className="space-y-4">
              {(analytics as any).detailedTranscript.map((transcript: any, idx: number) => {
                const isResultExpanded = expandedResults[idx.toString()];
                const isGenerating = generateInsightsMutation.isPending && generateInsightsMutation.variables?.resultId === transcript.resultId;
                const writingFeedback = parseWritingResultFeedback(transcript.feedback);
                const essayAnswers = (transcript.answeredQuestions || []).filter(
                  (q: any) =>
                    q &&
                    typeof q.studentAnswer === 'string' &&
                    q.studentAnswer.trim().length > 0 &&
                    (!q.correctAnswer || q.correctAnswer === 'Subjective'),
                );
                return (
                  <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <button 
                      onClick={() => toggleResult(idx.toString())}
                      className="w-full flex justify-between items-center p-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {isResultExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                        <span className="font-semibold text-slate-800">{transcript.testTitle}</span>
                      </div>
                      <span className="text-sm font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full">Score: {Math.round(transcript.score)}%</span>
                    </button>
                    
                    {isResultExpanded && (
                      <div className="p-5 pt-0 border-t border-slate-100">
                        {writingFeedback ? (
                          <div className="space-y-4 mb-6 mt-4">
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 relative">
                              <h5 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Sparkles className="w-4 h-4" /> Gemini Writing Evaluation
                              </h5>
                              <p className="text-sm text-slate-700">{writingFeedback.summary}</p>
                              <button
                                disabled={isGenerating}
                                onClick={() => handleGenerateInsights(transcript.resultId)}
                                className="absolute top-4 right-4 text-xs font-medium bg-white text-blue-600 border border-blue-200 px-3 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-50"
                              >
                                {isGenerating ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                                Regenerate
                              </button>
                            </div>

                            {essayAnswers.length > 0 ? (
                              <div className="space-y-3">
                                <h5 className="text-sm font-bold text-slate-800">Student Essay Response</h5>
                                {essayAnswers.map((q: any, qIdx: number) => (
                                  <div key={qIdx} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="font-semibold text-slate-800 mb-2">{q.text || `Essay Question ${qIdx + 1}`}</div>
                                    <div className="text-xs tracking-wider uppercase font-semibold text-slate-500 mb-1">Submitted Response</div>
                                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{q.studentAnswer}</p>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            {(writingFeedback.questions || []).map((item: any, itemIdx: number) => {
                              const grading = item?.grading;
                              if (!grading) return null;
                              return (
                                <div key={item.questionId || itemIdx} className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="font-semibold text-slate-900">Writing Feedback</div>
                                    <span className="text-sm font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
                                      {grading.totalScore}/{grading.maxScore} ({Math.round(grading.percentage || 0)}%)
                                    </span>
                                  </div>

                                  <div>
                                    <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                                      Rubric &amp; criterion performance
                                    </div>
                                    <WritingRubricGradeView rubric={item.rubric} grading={grading} />
                                    <p className="mt-2 text-xs text-slate-500">
                                      “Met” means the student earned at least 70% of the points for that row; “Partial” is 40–69%; below that is “Not met”.
                                    </p>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                                      <div className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">Strengths</div>
                                      {(grading.overallFeedback?.strengths || []).length > 0 ? (
                                        <div className="space-y-2 text-sm text-slate-700">
                                          {(grading.overallFeedback?.strengths || []).map((strength: string, strengthIdx: number) => (
                                            <div key={strengthIdx} className="flex gap-2">
                                              <span className="text-emerald-600 font-bold">•</span>
                                              <span>{strength}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="text-sm text-slate-500">No strength notes returned.</div>
                                      )}
                                    </div>

                                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                                      <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">Areas of Weakness</div>
                                      {(grading.overallFeedback?.areasForImprovement || []).length > 0 ? (
                                        <div className="space-y-2 text-sm text-slate-700">
                                          {(grading.overallFeedback?.areasForImprovement || []).map((area: string, areaIdx: number) => (
                                            <div key={areaIdx} className="flex gap-2">
                                              <span className="text-amber-600 font-bold">•</span>
                                              <span>{area}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="text-sm text-slate-500">No improvement notes returned.</div>
                                      )}
                                    </div>
                                  </div>

                                  {grading.overallFeedback?.teacherNote ? (
                                    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                                      <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">Teacher Note</div>
                                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{grading.overallFeedback.teacherNote}</p>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : transcript.feedback ? (
                          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 mb-6 mt-4 relative">
                            <h5 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                              <Sparkles className="w-4 h-4" /> AI Feedback on this Result
                            </h5>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{transcript.feedback}</p>
                            <button
                              disabled={isGenerating}
                              onClick={() => handleGenerateInsights(transcript.resultId)}
                              className="absolute top-4 right-4 text-xs font-medium bg-white text-blue-600 border border-blue-200 px-3 py-1 rounded hover:bg-blue-50 transition-colors disabled:opacity-50"
                            >
                              {isGenerating ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
                              Regenerate
                            </button>
                          </div>
                        ) : (
                          <div className="bg-slate-50 border-2 border-dashed border-slate-200 p-6 rounded-xl flex flex-col items-center justify-center text-center mb-6 mt-4">
                            <BrainCircuit className="w-8 h-8 text-slate-300 mb-3" />
                            <p className="text-sm text-slate-600 mb-4 max-w-sm">Generate AI-powered insights to analyze this specific test result and understand the student's strengths and areas for improvement.</p>
                            <button 
                              onClick={() => handleGenerateInsights(transcript.resultId)}
                              disabled={isGenerating}
                              className="flex items-center justify-center gap-2 bg-linear-to-r from-blue-500 to-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all w-full md:w-auto disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                              {isGenerating ? "Analyzing Responses..." : "Generate Test Insights"}
                            </button>
                          </div>
                        )}

                        <div className="space-y-3">
                          <h5 className="text-sm font-bold text-slate-800 mb-2">Submitted Answers</h5>
                          {transcript.answeredQuestions?.length > 0 ? transcript.answeredQuestions.map((q: any, qIdx: number) => (
                            <div key={qIdx} className={`p-3 rounded-lg border-l-4 text-sm ${q.isCorrect ? 'bg-emerald-50/50 border-emerald-400' : q.isCorrect === false ? 'bg-red-50/50 border-red-400' : 'bg-slate-50 border-slate-300'}`}>
                              <div className="flex gap-2 mb-2">
                                <span className="font-semibold shrink-0">Q{qIdx + 1}:</span>
                                <span className="text-slate-700">{q.text || "Unknown Question"}</span>
                              </div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs tracking-wider uppercase font-semibold text-slate-500">Skill:</span>
                                <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-700">{q.skill || "General"}</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                                <div>
                                  <span className="text-xs tracking-wider uppercase font-semibold text-slate-500 block mb-0.5">Student Answer:</span>
                                  <span className={`font-medium ${q.isCorrect ? 'text-emerald-700' : 'text-red-700'}`}>{q.studentAnswer || "No Answer"}</span>
                                </div>
                                <div>
                                  <span className="text-xs tracking-wider uppercase font-semibold text-slate-500 block mb-0.5">Correct Answer:</span>
                                  <span className="font-medium text-emerald-700">{q.correctAnswer || "Subjective"}</span>
                                </div>
                              </div>
                            </div>
                          )) : (
                            <div className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-lg border border-slate-100">No answered questions recorded.</div>
                          )}
                        </div>
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
                          <td colSpan={6} className="py-16 text-center text-muted-foreground">
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