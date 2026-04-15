import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui';
import { PlayCircle, Clock, BookOpen } from 'lucide-react';
import { Link } from 'wouter';

import { useListAssessments, useListResults } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data: assessments, isLoading: assessmentsLoading } = useListAssessments();
  const { data: results, isLoading: resultsLoading } = useListResults({ studentId: user?.id ?? '' });

  const isLoading = assessmentsLoading || resultsLoading;

  // Assessments assigned to the student's classes
  const rawAssigned = assessments?.filter((a: any) =>
    a.classId && user?.classIds?.includes(a.classId) && a.status === 'active'
  ) || [];

  const attemptsUsedByAssessmentId = (results ?? []).reduce((acc: Record<string, number>, r: any) => {
    acc[r.assessmentId] = (acc[r.assessmentId] || 0) + 1;
    return acc;
  }, {});

  const assignedAssessments = rawAssigned
    .map((a: any) => {
      const maxAttempts = Math.max(1, Number(a.maxAttempts) || 1);
      const attemptsUsed = attemptsUsedByAssessmentId[a.id] || 0;
      const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);
      const dueDate = typeof a.dueDate === 'string' && a.dueDate.length > 0 ? new Date(a.dueDate) : null;
      const isExpired = dueDate ? dueDate.getTime() < Date.now() : false;
      return { ...a, maxAttempts, attemptsUsed, attemptsRemaining, dueDate, isExpired };
    })
    .filter((a: any) => a.attemptsRemaining > 0);

  // KPI Calculations
  const completedCount = results?.length ?? 0;
  const avgScore = results && results.length > 0
    ? Math.round(results.reduce((acc, r) => acc + (r.percentage || 0), 0) / results.length)
    : 0;
  return (
    <DashboardLayout>
      <div className="space-y-8">
        <section>
          <h1 className="text-3xl font-display font-bold mb-2">Welcome back, {user?.name || user?.username}!</h1>
          <p className="text-muted-foreground text-lg">You have {assignedAssessments.length} assessment(s) available for attempts.</p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-linear-to-br from-primary to-primary/90 text-primary-foreground border-0 shadow-lg shadow-primary/20">
            <CardContent className="p-6">
              <BookOpen className="w-8 h-8 mb-4 opacity-80" />
              <p className="text-4xl font-bold font-display mb-1">{assignedAssessments.length}</p>
              <p className="text-primary-foreground/80 font-medium">Pending Assessments</p>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="p-6">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-4xl font-bold font-display mb-1 text-foreground">{completedCount}</p>
              <p className="text-muted-foreground font-medium">Completed Total</p>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="p-6">
              <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-4">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <p className="text-4xl font-bold font-display mb-1 text-foreground">{avgScore}%</p>
              <p className="text-muted-foreground font-medium">Average Score</p>
            </CardContent>
          </Card>
        </div>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-display font-bold">Assigned Assessments</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {isLoading ? (
              <div className="col-span-full py-10 text-center text-muted-foreground">Loading assessments...</div>
            ) : assignedAssessments.length === 0 ? (
              <div className="col-span-full py-10 text-center text-muted-foreground">You have no pending assessments assigned to your classes at this time.</div>
            ) : (
              assignedAssessments.map((assessment: any) => (
                <Card
                  key={assessment.id}
                  className={`flex flex-col transition-all duration-300 ${
                    assessment.isExpired
                      ? 'bg-muted/40 border-muted-foreground/20 opacity-75'
                      : 'hover:border-primary/50 hover:shadow-lg'
                  }`}
                >
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant={assessment.type === 'CAASPP' ? 'default' : 'secondary'}>
                        {assessment.type}
                      </Badge>
                      <Badge variant="outline">{assessment.subject}</Badge>
                    </div>
                    <CardTitle className="text-xl leading-tight">{assessment.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-6 flex-1">
                    <div className="flex items-center text-sm text-muted-foreground gap-4">
                      <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {assessment.duration} mins</span>
                      <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> {assessment.questionCount} Questions</span>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Attempts: {assessment.attemptsUsed}/{assessment.maxAttempts}
                    </div>
                    {assessment.dueDate ? (
                      <div className={`mt-1 text-sm ${assessment.isExpired ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                        Due: {assessment.dueDate.toLocaleString()}
                      </div>
                    ) : null}
                    {assessment.isExpired ? (
                      <div className="mt-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-full px-3 py-1 inline-block">
                        Assessment has expired
                      </div>
                    ) : null}
                  </CardContent>
                  <div className="p-6 pt-0 mt-auto">
                    {assessment.isExpired ? (
                      <Button className="w-full" variant="outline" disabled>
                        Assessment Expired
                      </Button>
                    ) : (
                      <Link href={`/student/assessment/${assessment.id}`} className="block">
                        <Button className="w-full group" variant="default">
                          {assessment.attemptsUsed > 0 ? 'Continue / Retry Assessment' : 'Start Assessment'}
                          <PlayCircle className="w-4 h-4 ml-2 group-hover:scale-110 transition-transform" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}