import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useListUsers, useListResults } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { GraduationCap, TrendingUp, CheckCircle, XCircle, Loader2 } from 'lucide-react';

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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {students.map(student => {
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
                          <tr key={student.id} className="hover:bg-muted/20 transition-colors">
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
                          </tr>
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
