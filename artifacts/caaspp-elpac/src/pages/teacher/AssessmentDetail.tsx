import React from 'react';
import { useRoute, Link } from 'wouter';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui';
import { useGetAssessment, getGetAssessmentQueryKey, useListClasses } from '@workspace/api-client-react';
import { BookOpen, Clock, ArrowLeft, Loader2, Target, Users, CheckCircle2 } from 'lucide-react';
import { AudioPlayer } from '@/components/ui/audio-player';

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

export default function AssessmentDetail() {
  const [, params] = useRoute('/teacher/assessments/:id');
  const id = params?.id;
  
  const { data: assessment, isLoading, error } = useGetAssessment(id as string, {
    query: { 
      queryKey: getGetAssessmentQueryKey(id as string),
      enabled: !!id 
    }
  });
  
  const { data: classes } = useListClasses();
  const assignedClass = classes?.find(c => c.id === (assessment as any)?.classId);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !assessment) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
          <BookOpen className="w-16 h-16 text-muted-foreground opacity-20" />
          <h2 className="text-2xl font-bold">Assessment Not Found</h2>
          <p className="text-muted-foreground">The assessment you requested does not exist or has been deleted.</p>
          <Link href="/teacher/assessments">
            <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Assessments</Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link href="/teacher/assessments">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <h1 className="text-3xl font-display font-bold flex-1 truncate">{assessment.title}</h1>
          <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${assessment.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'}`}>
                {assessment.status}
              </span>
              {assignedClass ? (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1.5 py-1">
                  <Users className="w-3.5 h-3.5" /> Assigned to: {assignedClass.name}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground gap-1.5 py-1">
                  <Users className="w-3.5 h-3.5" /> Unassigned
                </Badge>
              )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="md:col-span-3">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5 text-muted-foreground" /> Assessment Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-line mb-6">
                {assessment.description || "No description provided."}
              </p>
              
              <div className="flex flex-wrap items-center gap-4">
                 <Badge variant="outline" className={`px-3 py-1 ${typeColor[assessment.type] ?? ''} border-transparent`}>
                   {assessment.type}
                 </Badge>
                 <Badge variant="outline" className={`px-3 py-1 capitalize ${difficultyColor[assessment.difficulty] ?? ''} border-transparent`}>
                   Difficulty: {assessment.difficulty}
                 </Badge>
                 <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                    <Clock className="w-4 h-4" /> Duration: {assessment.duration} min
                 </div>
                 <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
                    Grade {assessment.grade} • {assessment.subject}
                 </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-center">Questions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center pt-2 pb-6">
               <span className="text-5xl font-display font-bold text-primary">{assessment.questions?.length || 0}</span>
               <span className="text-sm text-muted-foreground mt-2">Total Questions</span>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold font-display mt-8 mb-4">Question List</h2>
          
          {(!assessment.questions || assessment.questions.length === 0) ? (
            <Card className="p-12 text-center text-muted-foreground border-dashed">
               <p>No questions have been added to this assessment yet.</p>
            </Card>
          ) : (
            assessment.questions.map((q: any, i: number) => (
              <Card key={q.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <div className="flex border-b border-border bg-gray-50/50 px-6 py-3 text-xs font-bold tracking-wider text-muted-foreground justify-between uppercase">
                  <span>Question {i + 1} • {q.type.replace('_', ' ')}</span>
                  <span>{q.points} Points</span>
                </div>
                <CardContent className="p-6 md:p-8">
                  {q.audioScript && (
                    <div className="mb-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
                      <span className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 block">Audio Transcript (Hidden from student)</span>
                      <p className="text-sm text-amber-900 leading-relaxed italic">"{q.audioScript}"</p>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <p className="text-lg font-medium text-foreground leading-relaxed flex-1">{q.text}</p>
                    <AudioPlayer text={q.audioScript || q.text} className="shrink-0" />
                  </div>
                  
                  {q.options && q.options.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {q.options.map((opt: string, oi: number) => {
                        const isCorrect = q.correctAnswer === opt;
                        return (
                          <div 
                            key={oi} 
                            className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all ${
                              isCorrect 
                                ? 'border-emerald-200 bg-emerald-50/50 shadow-sm' 
                                : 'border-border bg-white'
                            }`}
                          >
                            <div className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${
                              isCorrect ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'
                            }`}>
                              {String.fromCharCode(65 + oi)}
                            </div>
                            <span className={`text-sm leading-tight ${isCorrect ? 'font-medium text-emerald-900' : 'text-gray-700'}`}>
                              {opt}
                            </span>
                            {isCorrect && (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 ml-auto shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(!q.options || q.options.length === 0) && q.correctAnswer && (
                    <div className="mt-4 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 block">Correct Answer / Rubric</span>
                      <p className="text-sm text-emerald-900 font-medium">{q.correctAnswer}</p>
                    </div>
                  )}
                  
                  {q.explanation && (
                    <div className="mt-4 p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                      <span className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1 block">Explanation</span>
                      <p className="text-sm text-blue-900/80">{q.explanation}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
