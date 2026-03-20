import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Badge } from '@/components/ui';
import { useListAssessments, useListClasses } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { BookOpen, Clock, BarChart2, Users, ChevronRight, Loader2, GraduationCap } from 'lucide-react';
import { Link } from 'wouter';

const difficultyColor: Record<string, string> = {
  easy: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
  mixed: 'bg-purple-100 text-purple-700',
};

const typeColor: Record<string, string> = {
  CAASPP: 'bg-blue-100 text-blue-700',
  ELPAC: 'bg-teal-100 text-teal-700',
};

export default function TeacherAssessments() {
  const { user } = useAuth();
  const { data: assessments, isLoading: isAssessmentsLoading } = useListAssessments({});
  const { data: classes, isLoading: isClassesLoading } = useListClasses();
  
  const myClasses = classes?.filter(c => c.teacherId === user?.id) || [];
  const isLoading = isAssessmentsLoading || isClassesLoading;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">Assessments</h1>
          <p className="text-muted-foreground text-lg">All available CAASPP & ELPAC assessments for your classes</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-8">
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-primary" /> My Classes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {myClasses.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {myClasses.map(cls => (
                      <div key={cls.id} className="bg-background rounded-lg p-4 border shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-foreground truncate">{cls.name}</h3>
                          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">
                            Grade {cls.grade}
                          </span>
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground gap-4">
                          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {cls.studentCount} Students</span>
                          {(cls as any).section && <span>Sec. {(cls as any).section}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm italic">You typically get assigned classes by an administrator.</p>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Assessments</p>
                    <p className="text-2xl font-bold font-display">{assessments?.length ?? 0}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <BarChart2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">CAASPP</p>
                    <p className="text-2xl font-bold font-display">
                      {assessments?.filter(a => a.type === 'CAASPP').length ?? 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">ELPAC</p>
                    <p className="text-2xl font-bold font-display">
                      {assessments?.filter(a => a.type === 'ELPAC').length ?? 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>All Assessments</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {(assessments ?? []).map(assessment => (
                    <Link key={assessment.id} href={`/teacher/assessments/${assessment.id}`}>
                      <div className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors cursor-pointer">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-foreground truncate">{assessment.title}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor[assessment.type] ?? ''}`}>
                            {assessment.type}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${difficultyColor[assessment.difficulty] ?? ''}`}>
                            {assessment.difficulty}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Grade {assessment.grade}</span>
                          <span>•</span>
                          <span>{assessment.subject}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {assessment.duration} min
                          </span>
                          <span>•</span>
                          <span>{assessment.questionCount} questions</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${assessment.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          {assessment.status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Link>
                  ))}
                  {(assessments?.length ?? 0) === 0 && (
                    <div className="py-16 text-center text-muted-foreground">
                      <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No assessments found</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
