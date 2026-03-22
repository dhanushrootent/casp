import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { GraduationCap, TrendingUp, CheckCircle, XCircle, Loader2, Info, ChevronDown, ChevronUp, BrainCircuit } from 'lucide-react';
import { useListUsers, useListResults, useGetStudentAnalytics } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { useState } from 'react';

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

    if (isLoading) return <div className="p-8 flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing performance data...</div>;

    const insights = (analytics as any)?.mentorInsights || "No detailed insights available yet. Gemni is analyzing more assessment data to provide a personalized learning path.";

    return (
      <div className="bg-blue-50/30 p-8 rounded-xl border border-blue-100/50 m-4 mt-0 animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
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
            <h4 className="text-md font-bold text-slate-900 border-b border-blue-200 pb-2 mb-4">Detailed Assessment Transcript</h4>
            <div className="space-y-6">
              {(analytics as any).detailedTranscript.map((transcript: any, idx: number) => (
                <div key={idx} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <span className="font-semibold text-slate-800">{transcript.testTitle}</span>
                    <span className="text-sm font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full">Score: {Math.round(transcript.score)}%</span>
                  </div>
                  <div className="space-y-3">
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
                      <div className="text-sm text-slate-500 italic">No answered questions recorded.</div>
                    )}
                  </div>
                </div>
              ))}
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