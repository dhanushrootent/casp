import React, { useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useListAssessments, useListClasses, useListResults, useListUsers } from '@workspace/api-client-react';
import { Loader2, Clock3, CalendarClock, Timer, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';

type TimingBucket = 'early' | 'near_deadline' | 'late_or_after_due' | 'no_due_date';

function timingBucket(submittedAt: Date, dueDate: Date | null): TimingBucket {
  if (!dueDate) return 'no_due_date';
  const msBeforeDue = dueDate.getTime() - submittedAt.getTime();
  if (msBeforeDue < 0) return 'late_or_after_due';
  const hoursBeforeDue = msBeforeDue / (1000 * 60 * 60);
  if (hoursBeforeDue <= 24) return 'near_deadline';
  return 'early';
}

export default function SubmissionAnalysis() {
  const [expandedStudentKey, setExpandedStudentKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'upcoming' | 'expired' | 'no_due_date'>('all');
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const { user } = useAuth();
  const { data: assessments, isLoading: assessmentsLoading } = useListAssessments({});
  const { data: classes, isLoading: classesLoading } = useListClasses();
  const { data: results, isLoading: resultsLoading } = useListResults({});
  const { data: users, isLoading: usersLoading } = useListUsers({ role: 'student' });

  const isLoading = assessmentsLoading || classesLoading || resultsLoading || usersLoading;

  const myClassIds = useMemo(
    () => (classes ?? []).filter((c: any) => c.teacherId === user?.id).map((c: any) => c.id),
    [classes, user?.id],
  );

  const myAssessments = useMemo(
    () => (assessments ?? []).filter((a: any) => a.classId && myClassIds.includes(a.classId)),
    [assessments, myClassIds],
  );

  const studentNameById = useMemo(
    () => Object.fromEntries((users ?? []).map((u: any) => [u.id, u.name || u.username || 'Student'])),
    [users],
  );

  const analysis = useMemo(() => {
    return myAssessments
      .map((assessment: any) => {
        const dueDate = assessment?.dueDate ? new Date(assessment.dueDate) : null;
        const assessmentResults = (results ?? [])
          .filter((r: any) => r.assessmentId === assessment.id)
          .sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

        const buckets = {
          early: 0,
          near_deadline: 0,
          late_or_after_due: 0,
          no_due_date: 0,
        };

        const rows = assessmentResults.map((r: any, idx: number) => {
          const submittedAt = new Date(r.completedAt);
          const bucket = timingBucket(submittedAt, dueDate);
          buckets[bucket] += 1;
          return {
            id: r.id,
            studentId: r.studentId,
            studentName: studentNameById[r.studentId] ?? 'Student',
            submittedAt,
            bucket,
            attemptNumber: idx + 1,
          };
        });

        const students = Object.values(
          rows.reduce((acc: Record<string, { studentId: string; studentName: string; attempts: typeof rows }>, row) => {
            if (!acc[row.studentId]) {
              acc[row.studentId] = {
                studentId: row.studentId,
                studentName: row.studentName,
                attempts: [],
              };
            }
            acc[row.studentId].attempts.push(row);
            return acc;
          }, {}),
        );

        const total = rows.length;
        const nearDeadlinePct = total > 0 ? Math.round((buckets.near_deadline / total) * 100) : 0;
        return {
          assessment,
          dueDate,
          total,
          nearDeadlinePct,
          buckets,
          students,
        };
      })
      .sort((a, b) => {
        const at = a.dueDate ? a.dueDate.getTime() : 0;
        const bt = b.dueDate ? b.dueDate.getTime() : 0;
        return bt - at;
      });
  }, [myAssessments, results, studentNameById]);

  const filteredAnalysis = useMemo(() => {
    const query = search.trim().toLowerCase();
    return analysis.filter((item) => {
      const matchesSearch =
        !query || String(item.assessment.title ?? '').toLowerCase().includes(query);
      const dueTs = item.dueDate ? item.dueDate.getTime() : null;
      const now = Date.now();
      const fromTs = deadlineFrom ? new Date(`${deadlineFrom}T00:00:00`).getTime() : null;
      const toTs = deadlineTo ? new Date(`${deadlineTo}T23:59:59`).getTime() : null;
      const matchesDeadline =
        deadlineFilter === 'all' ||
        (deadlineFilter === 'upcoming' && dueTs != null && dueTs >= now) ||
        (deadlineFilter === 'expired' && dueTs != null && dueTs < now) ||
        (deadlineFilter === 'no_due_date' && dueTs == null);
      const matchesDateRange =
        dueTs == null
          ? !(fromTs != null || toTs != null)
          : (fromTs == null || dueTs >= fromTs) && (toTs == null || dueTs <= toTs);
      return matchesSearch && matchesDeadline && matchesDateRange;
    });
  }, [analysis, search, deadlineFilter, deadlineFrom, deadlineTo]);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Submission Timing Analysis</h1>
          <p className="text-muted-foreground text-lg">
            Track how many students submitted close to each assessment deadline.
          </p>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="max-w-md flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assessment title..."
              className="w-full"
            />
          </div>
          <div className="w-full md:w-56">
            <select
              value={deadlineFilter}
              onChange={(e) => setDeadlineFilter(e.target.value as typeof deadlineFilter)}
              className="w-full h-11 rounded-xl border border-input bg-background px-4 text-base focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="all">All deadlines</option>
              <option value="upcoming">Upcoming deadlines</option>
              <option value="expired">Expired deadlines</option>
              <option value="no_due_date">No due date</option>
            </select>
          </div>
          <div className="w-full md:w-48">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">Deadline From</label>
              <Input
                type="date"
                value={deadlineFrom}
                onChange={(e) => setDeadlineFrom(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <div className="w-full md:w-48">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-muted-foreground">Deadline To</label>
              <Input
                type="date"
                value={deadlineTo}
                onChange={(e) => setDeadlineTo(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredAnalysis.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              {search.trim().length > 0
                ? 'No assessments matched your filters.'
                : 'No assigned assessments found for your classes.'}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            {filteredAnalysis.map((item) => (
              <Card key={item.assessment.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>{item.assessment.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.dueDate ? (
                        <Badge variant="outline" className="gap-1.5">
                          <CalendarClock className="w-3.5 h-3.5" />
                          Due: {format(item.dueDate, 'MMM d, yyyy h:mm a')}
                        </Badge>
                      ) : (
                        <Badge variant="outline">No due date</Badge>
                      )}
                      <Badge variant="secondary" className="gap-1.5">
                        <Timer className="w-3.5 h-3.5" />
                        Near deadline: {item.nearDeadlinePct}%
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-200 p-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">Total submissions</div>
                      <div className="text-2xl font-bold font-display">{item.total}</div>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                      <div className="text-xs uppercase tracking-wide text-emerald-700">Early (&gt;24h before)</div>
                      <div className="text-2xl font-bold font-display text-emerald-700">{item.buckets.early}</div>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                      <div className="text-xs uppercase tracking-wide text-amber-700">Near deadline (&le;24h)</div>
                      <div className="text-2xl font-bold font-display text-amber-700">{item.buckets.near_deadline}</div>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
                      <div className="text-xs uppercase tracking-wide text-red-700">After due date</div>
                      <div className="text-2xl font-bold font-display text-red-700">{item.buckets.late_or_after_due}</div>
                    </div>
                  </div>

                  {item.students.length > 0 ? (
                    <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
                      {item.students.map((student: any) => {
                        const accordionKey = `${item.assessment.id}:${student.studentId}`;
                        const isExpanded = expandedStudentKey === accordionKey;
                        const latestAttempt = student.attempts[0];
                        return (
                          <div key={accordionKey} className="bg-white">
                            <button
                              type="button"
                              onClick={() => setExpandedStudentKey((prev) => (prev === accordionKey ? null : accordionKey))}
                              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                            >
                              <div>
                                <div className="font-semibold text-slate-900">{student.studentName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {student.attempts.length} attempt{student.attempts.length === 1 ? '' : 's'}
                                  {' • '}
                                  Latest: {format(latestAttempt.submittedAt, 'MMM d, yyyy h:mm a')}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {latestAttempt.bucket === 'near_deadline' ? (
                                  <Badge className="bg-amber-100 text-amber-700 border-amber-200">Near deadline</Badge>
                                ) : latestAttempt.bucket === 'late_or_after_due' ? (
                                  <Badge className="bg-red-100 text-red-700 border-red-200">After due date</Badge>
                                ) : latestAttempt.bucket === 'early' ? (
                                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Early</Badge>
                                ) : (
                                  <Badge variant="outline" className="gap-1.5"><Clock3 className="w-3.5 h-3.5" />No due date</Badge>
                                )}
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                              </div>
                            </button>
                            {isExpanded ? (
                              <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                                  <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                      <tr>
                                        <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Attempt</th>
                                        <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Submitted At</th>
                                        <th className="text-left px-4 py-2 font-semibold text-muted-foreground">Timing</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {student.attempts.map((attempt: any, idx: number) => (
                                        <tr key={attempt.id}>
                                          <td className="px-4 py-2">Attempt {student.attempts.length - idx}</td>
                                          <td className="px-4 py-2">{format(attempt.submittedAt, 'MMM d, yyyy h:mm a')}</td>
                                          <td className="px-4 py-2">
                                            {attempt.bucket === 'near_deadline' ? (
                                              <Badge className="bg-amber-100 text-amber-700 border-amber-200">Near deadline</Badge>
                                            ) : attempt.bucket === 'late_or_after_due' ? (
                                              <Badge className="bg-red-100 text-red-700 border-red-200">After due date</Badge>
                                            ) : attempt.bucket === 'early' ? (
                                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Early</Badge>
                                            ) : (
                                              <Badge variant="outline" className="gap-1.5"><Clock3 className="w-3.5 h-3.5" />No due date</Badge>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No submissions recorded for this assessment yet.</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
