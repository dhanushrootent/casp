import React, { useMemo, useState } from 'react';
import { useRoute, Link } from 'wouter';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from '@/components/ui';
import { useGetAssessment, getGetAssessmentQueryKey, useListClasses, useGradeWritingResponse } from '@workspace/api-client-react';
import { BookOpen, Clock, ArrowLeft, Loader2, Target, Users, CheckCircle2, Sparkles } from 'lucide-react';
import { AudioPlayer } from '@/components/ui/audio-player';
import { WritingRubricGradeView } from '@/components/teacher/WritingRubricGradeView';

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

  const gradeWritingMutation = useGradeWritingResponse();
  const [writingGradeByQuestionId, setWritingGradeByQuestionId] = useState<Record<string, {
    studentName: string;
    studentResponse: string;
    result: any | null;
  }>>({});
  const [editedRubricByQuestionId, setEditedRubricByQuestionId] = useState<Record<string, any>>({});

  const getWritingState = (questionId: string) => {
    return writingGradeByQuestionId[questionId] ?? { studentName: '', studentResponse: '', result: null };
  };

  const setWritingState = (questionId: string, patch: Partial<{ studentName: string; studentResponse: string; result: any | null }>) => {
    setWritingGradeByQuestionId(prev => ({
      ...prev,
      [questionId]: { ...getWritingState(questionId), ...patch }
    }));
  };

  const getEditableRubric = (questionId: string, payload: any) => {
    return editedRubricByQuestionId[questionId] ?? payload.rubric;
  };

  const setEditableRubric = (questionId: string, rubric: any) => {
    setEditedRubricByQuestionId(prev => ({ ...prev, [questionId]: rubric }));
  };

  const normalizeWeightsTo100 = (criteria: any[]) => {
    if (!criteria?.length) return [];
    const raw = criteria.map((c) => (Number.isFinite(c.weight) ? Number(c.weight) : 0));
    const sum = raw.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      const even = Math.floor(100 / criteria.length);
      const remainder = 100 - even * criteria.length;
      return criteria.map((c, i) => ({ ...c, weight: even + (i === 0 ? remainder : 0) }));
    }
    const scaled = raw.map((w) => (w / sum) * 100);
    const rounded = scaled.map((w) => Math.round(w));
    const roundedSum = rounded.reduce((a, b) => a + b, 0);
    const delta = 100 - roundedSum;
    const maxIdx = rounded.reduce((best, _, i) => (rounded[i] > rounded[best] ? i : best), 0);
    return criteria.map((c, i) => ({ ...c, weight: i === maxIdx ? rounded[i] + delta : rounded[i] }));
  };

  const calcWeightSum = (criteria: any[]) =>
    (criteria || []).reduce((sum, c) => sum + (Number.isFinite(c?.weight) ? Number(c.weight) : 0), 0);

  const applyPointsFromWeights = (rubric: any) => {
    if (!rubric?.criteria?.length) return rubric;
    const totalPoints = Number.isFinite(rubric.totalPoints) ? Number(rubric.totalPoints) : 20;
    const weights = rubric.criteria.map((c: any) => (Number.isFinite(c.weight) ? Number(c.weight) : 0));
    const sum = weights.reduce((a: number, b: number) => a + b, 0) || 100;
    const raw = weights.map((w: number) => (w / sum) * totalPoints);
    const rounded = raw.map((p: number) => Math.max(0, Math.round(p)));
    const roundedSum = rounded.reduce((a: number, b: number) => a + b, 0);
    const delta = totalPoints - roundedSum;
    const maxIdx = weights.reduce((best: number, _: number, i: number) => (weights[i] > weights[best] ? i : best), 0);
    const fixed = rounded.map((p: number, i: number) => (i === maxIdx ? p + delta : p));
    return {
      ...rubric,
      totalPoints,
      criteria: rubric.criteria.map((c: any, i: number) => ({ ...c, points: fixed[i] })),
    };
  };

  const parseWritingPayload = useMemo(() => {
    return (maybeJson: unknown) => {
      if (typeof maybeJson !== 'string' || maybeJson.trim().length === 0) return null;
      try {
        const parsed = JSON.parse(maybeJson);
        if (!parsed || typeof parsed !== 'object') return null;
        if ((parsed as any).kind !== 'writing_activity_v1') return null;
        return parsed as any;
      } catch {
        return null;
      }
    };
  }, []);
  
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

                  {(() => {
                    const payload = parseWritingPayload(q.explanation);
                    if (!payload) return null;
                    const st = getWritingState(q.id);
                    const rubric = getEditableRubric(q.id, payload);
                    const weightSum = Math.round(calcWeightSum(rubric?.criteria || []));
                    return (
                      <div className="mt-6 p-4 rounded-xl border border-primary/15 bg-primary/5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-accent" />
                            <span className="font-semibold">Grade Student Response</span>
                          </div>
                          <Badge variant="outline" className="bg-white/60">Writing Activity</Badge>
                        </div>

                        <div className="rounded-xl border border-border bg-white p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold">Editable Rubric</div>
                            <div className={`text-xs font-semibold ${weightSum === 100 ? 'text-emerald-700' : 'text-red-600'}`}>
                              Weight total: {weightSum}%
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const normalized = normalizeWeightsTo100(rubric.criteria || []);
                                setEditableRubric(q.id, applyPointsFromWeights({ ...rubric, criteria: normalized }));
                              }}
                            >
                              Rebalance Weights
                            </Button>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-[900px] w-full border-collapse">
                              <thead>
                                <tr className="text-xs uppercase text-muted-foreground">
                                  <th className="text-left p-2 border-b">Criterion</th>
                                  <th className="text-left p-2 border-b w-24">Points</th>
                                  <th className="text-left p-2 border-b w-28">Weight %</th>
                                  <th className="text-left p-2 border-b">Exemplary</th>
                                  <th className="text-left p-2 border-b">Proficient</th>
                                  <th className="text-left p-2 border-b">Developing</th>
                                  <th className="text-left p-2 border-b">Beginning</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(rubric?.criteria || []).map((c: any, idx: number) => {
                                  const levels = c.levels || [];
                                  const getLevel = (label: string) => levels.find((l: any) => l.label === label) || null;
                                  const exemplary = getLevel("Exemplary");
                                  const proficient = getLevel("Proficient");
                                  const developing = getLevel("Developing");
                                  const beginning = getLevel("Beginning");

                                  const setLevelDesc = (label: string, desc: string) => {
                                    const nextCriteria = [...(rubric.criteria || [])];
                                    const nextLevels = [...(nextCriteria[idx].levels || [])];
                                    const levelIdx = nextLevels.findIndex((l: any) => l.label === label);
                                    if (levelIdx >= 0) nextLevels[levelIdx] = { ...nextLevels[levelIdx], description: desc };
                                    nextCriteria[idx] = { ...nextCriteria[idx], levels: nextLevels };
                                    setEditableRubric(q.id, { ...rubric, criteria: nextCriteria });
                                  };

                                  return (
                                    <tr key={c.id ?? idx} className="align-top">
                                      <td className="p-2 border-b">
                                        <div className="font-semibold">{c.name}</div>
                                        <div className="text-xs text-muted-foreground">{c.description}</div>
                                      </td>
                                      <td className="p-2 border-b font-semibold">{c.points}</td>
                                      <td className="p-2 border-b">
                                        <input
                                          className="w-24 h-9 rounded-xl border border-input bg-background px-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                                          type="number"
                                          value={c.weight}
                                          onChange={(e) => {
                                            const nextCriteria = [...(rubric.criteria || [])];
                                            nextCriteria[idx] = { ...nextCriteria[idx], weight: Number(e.target.value) || 0 };
                                            setEditableRubric(q.id, applyPointsFromWeights({ ...rubric, criteria: nextCriteria }));
                                          }}
                                        />
                                      </td>
                                      <td className="p-2 border-b">
                                        <textarea
                                          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[96px] resize-y"
                                          value={exemplary?.description || ""}
                                          onChange={(e) => setLevelDesc("Exemplary", e.target.value)}
                                        />
                                      </td>
                                      <td className="p-2 border-b">
                                        <textarea
                                          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[96px] resize-y"
                                          value={proficient?.description || ""}
                                          onChange={(e) => setLevelDesc("Proficient", e.target.value)}
                                        />
                                      </td>
                                      <td className="p-2 border-b">
                                        <textarea
                                          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[96px] resize-y"
                                          value={developing?.description || ""}
                                          onChange={(e) => setLevelDesc("Developing", e.target.value)}
                                        />
                                      </td>
                                      <td className="p-2 border-b">
                                        <textarea
                                          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[96px] resize-y"
                                          value={beginning?.description || ""}
                                          onChange={(e) => setLevelDesc("Beginning", e.target.value)}
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">Student Name (optional)</label>
                            <input
                              className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                              value={st.studentName}
                              onChange={(e) => setWritingState(q.id, { studentName: e.target.value })}
                              placeholder="e.g. Maya"
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              className="w-full h-11"
                              disabled={gradeWritingMutation.isPending || st.studentResponse.trim().length < 10}
                              onClick={async () => {
                                try {
                                  setWritingState(q.id, { result: null });
                                  const result = await gradeWritingMutation.mutateAsync({
                                    data: {
                                      studentResponse: st.studentResponse,
                                      writingPrompt: q.text,
                                      backgroundInformation: payload.backgroundInformation ?? "",
                                      sources: Array.isArray(payload.sources) ? payload.sources : [],
                                      rubric,
                                      rubricParams: payload.rubricParams,
                                      grade: (assessment as any)?.grade ?? "",
                                      subject: (assessment as any)?.subject ?? "",
                                      studentName: st.studentName || undefined,
                                    } as any,
                                  });
                                  setWritingState(q.id, { result });
                                } catch (error) {
                                  console.error("Failed to grade writing response:", error);
                                }
                              }}
                            >
                              {gradeWritingMutation.isPending ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Grading...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-4 h-4 mr-2" /> Grade This Response
                                </>
                              )}
                            </Button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2">Paste Student Essay Here</label>
                          <textarea
                            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[180px] resize-y"
                            value={st.studentResponse}
                            onChange={(e) => setWritingState(q.id, { studentResponse: e.target.value })}
                          />
                        </div>

                        {st.result ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl">
                              <div className="font-semibold">
                                Score: {st.result.totalScore} / {st.result.maxScore} ({Math.round(st.result.percentage)}%)
                              </div>
                              <Badge variant="outline" className="bg-white/70">
                                {st.result.percentage >= 60 ? "Pass" : "Needs Support"}
                              </Badge>
                            </div>

                            <div className="space-y-2">
                              <div className="text-sm font-semibold text-foreground">Rubric &amp; criterion performance</div>
                              <WritingRubricGradeView rubric={rubric} grading={st.result} />
                              <p className="text-xs text-muted-foreground">
                                “Met” means at least 70% of points on that row; “Partial” is 40–69%; below that is “Not met”.
                              </p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4">
                              <div className="p-4 rounded-xl border bg-white">
                                <div className="text-sm font-semibold mb-2">Requirements</div>
                                {[
                                  ["Word Count", st.result.meetsRequirements?.wordCount],
                                  ["Paragraphs", st.result.meetsRequirements?.paragraphCount],
                                  ["Citations", st.result.meetsRequirements?.citations],
                                  ["Thesis", st.result.meetsRequirements?.thesis],
                                  ["Intro/Conclusion", st.result.meetsRequirements?.introConclusion],
                                ].map(([label, ok]) => (
                                  <div key={label as string} className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">{label}</span>
                                    <span className={ok ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>
                                      {ok ? "✓" : "✗"}
                                    </span>
                                  </div>
                                ))}
                                <div className="pt-2 mt-2 border-t text-xs text-muted-foreground">
                                  Word count: {st.result.wordCount} • Paragraphs: {st.result.paragraphCount} • Citations: {st.result.citationCount}
                                </div>
                              </div>
                              <div className="p-4 rounded-xl border bg-white">
                                <div className="text-sm font-semibold mb-2">Student-facing feedback</div>
                                <div className="text-sm text-muted-foreground whitespace-pre-line">
                                  {st.result.overallFeedback?.studentSummary}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
