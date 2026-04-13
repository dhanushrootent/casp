import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { Button, Card, CardContent } from '@/components/ui';
import { Clock, ChevronRight, ChevronLeft, CheckCircle2, Sparkles, Loader2 } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioPlayer } from '@/components/ui/audio-player';
import { WritingRubricGradeView } from '@/components/teacher/WritingRubricGradeView';

import { useGetAssessment, getGetAssessmentQueryKey, useSubmitResult, useGetResult, getGetResultQueryKey } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

function parseWritingActivityPayload(explanation?: string | null) {
  if (!explanation) return null;
  try {
    const parsed = JSON.parse(explanation);
    if (parsed && typeof parsed === 'object' && parsed.kind === 'writing_activity_v1') {
      return parsed as any;
    }
    return null;
  } catch {
    return null;
  }
}

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

export default function AssessmentTake() {
  const [, params] = useRoute('/student/assessment/:id');
  const id = params?.id as string;
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: assessment, isLoading } = useGetAssessment(id, {
    query: {
      queryKey: getGetAssessmentQueryKey(id),
      enabled: !!id
    }
  });

  const submitMutation = useSubmitResult();

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checkedAnswers, setCheckedAnswers] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
  const { data: submittedResult, isLoading: isLoadingSubmittedResult } = useGetResult(resultId || '', {
    query: {
      queryKey: getGetResultQueryKey(resultId || ''),
      enabled: Boolean(resultId),
    },
  });

  // Initialize time remaining when assessment loads
  useEffect(() => {
    if (assessment?.duration && timeLeft === 0 && !isSubmitted) {
      setTimeLeft(assessment.duration * 60);
    }
  }, [assessment, timeLeft, isSubmitted]);

  useEffect(() => {
    if (isSubmitted) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isSubmitted]);

  const questions = assessment?.questions || [];
  const currentQ = questions[currentIdx];
  const writingPayload = parseWritingActivityPayload(currentQ?.explanation);
  const rubricData = (assessment as any)?.rubric ?? writingPayload?.rubric ?? null;
  const progress = ((currentIdx) / (questions.length || 1)) * 100;

  useEffect(() => {
    setSelectedSourceIdx(0);
  }, [currentIdx, currentQ?.id]);

  const handleAnswer = (val: string) => {
    if (!currentQ || checkedAnswers[currentQ.id]) return; // disable changing answer after checking
    setAnswers(prev => ({ ...prev, [currentQ.id]: val }));
  };

  const handleCheck = () => {
    if (!currentQ || !answers[currentQ.id]) return;
    setCheckedAnswers(prev => ({ ...prev, [currentQ.id]: true }));
  };

  const handleSubmit = async () => {
    if (!user || !assessment) return;

    // Build the format expected by the API
    const formattedAnswers = Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer
    }));

    const timeSpent = (assessment.duration * 60) - timeLeft;

    try {
      const result = await submitMutation.mutateAsync({
        data: {
          assessmentId: assessment.id,
          studentId: user.id,
          answers: formattedAnswers as any,
          timeSpent
        }
      });
      setResultId((result as any).id);
      setIsSubmitted(true);
      toast({
        title: "Assessment Submitted",
        description: "Your responses have been successfully recorded."
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: "There was a problem submitting your assessment."
      });
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">Loading assessment...</div>;
  }

  if (!assessment) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">Assessment not found.</div>;
  }

  if (isSubmitted) {
    const storedFeedback = parseStoredFeedback((submittedResult as any)?.feedback);
    const writingFeedback = storedFeedback?.kind === 'ai_writing_result_v1' ? storedFeedback : null;
    const summary =
      typeof storedFeedback?.summary === 'string'
        ? storedFeedback.summary
        : (typeof (submittedResult as any)?.feedback === 'string' ? (submittedResult as any).feedback : 'Your result has been recorded.');
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <Card className="border-border/60 shadow-sm">
            <CardContent className="p-5 md:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-display font-bold">Assessment Complete!</h2>
                  <p className="text-sm text-muted-foreground">Great job completing {assessment.title}.</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => window.location.href = '/student/dashboard'}>
                Return to Dashboard
              </Button>
            </CardContent>
          </Card>

          {isLoadingSubmittedResult ? (
            <Card className="border-border/60">
              <CardContent className="p-6 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading detailed result...
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/60 shadow-sm">
              <CardContent className="p-5 md:p-6 space-y-5">
                <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-100">
                  <h5 className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> AI Feedback
                  </h5>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{summary}</p>
                </div>

                {writingFeedback?.questions?.map((item: any, itemIdx: number) => {
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
                      <WritingRubricGradeView rubric={item.rubric} grading={grading} />
                    </div>
                  );
                })}

                <div className="space-y-3">
                  <h5 className="text-sm font-bold text-slate-800">Submitted Answers</h5>
                  {Array.isArray((submittedResult as any)?.answers) && (submittedResult as any).answers.length > 0 ? (
                    (submittedResult as any).answers.map((q: any, qIdx: number) => (
                      <div key={qIdx} className={`p-3 rounded-lg border-l-4 text-sm ${
                        q.isCorrect === true
                          ? 'bg-emerald-50/50 border-emerald-400'
                          : q.isCorrect === false
                            ? 'bg-red-50/50 border-red-400'
                            : 'bg-slate-50 border-slate-300'
                      }`}>
                        <div className="flex gap-2 mb-2">
                          <span className="font-semibold shrink-0">Q{qIdx + 1}:</span>
                          <span className="text-slate-700">{q.questionText || "Unknown Question"}</span>
                        </div>
                        <div className="mt-2 space-y-3">
                          <div>
                            <span className="text-xs tracking-wider uppercase font-semibold text-slate-500 block mb-0.5">Student Answer:</span>
                            <div className={`font-medium whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto pr-1 ${
                              q.isCorrect === true ? 'text-emerald-700' : q.isCorrect === false ? 'text-red-700' : 'text-slate-700'
                            }`}>
                              {q.answer || "No Answer"}
                            </div>
                          </div>
                          <div>
                            <span className="text-xs tracking-wider uppercase font-semibold text-slate-500 block mb-0.5">Correct Answer:</span>
                            <span className={`font-medium ${q.correctAnswer ? 'text-emerald-700' : 'text-slate-600'}`}>
                              {q.correctAnswer || "Subjective"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500 italic p-4 bg-slate-50 rounded-lg border border-slate-100">
                      No answered questions recorded.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="h-16 bg-white border-b border-border grid grid-cols-3 items-center px-6 sticky top-0 z-10 shadow-sm">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {currentQ?.type?.replace('_', ' ') || 'Essay'}
        </div>
        <div className="font-display font-bold text-lg text-foreground text-center truncate px-3">{assessment.title}</div>
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-1.5 rounded-full font-mono font-bold text-lg border border-red-100 shadow absolute right-6 top-4 z-20">
            <Clock className="w-5 h-5" />
            {formatTime(timeLeft)}
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-1.5 bg-gray-200 w-full">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 w-full px-4 md:px-6 py-5">
        <div className="flex flex-col lg:flex-row gap-5 lg:items-stretch">
          <aside className="lg:w-[35%] lg:min-w-[340px] lg:max-w-[35%]">
            <Card className="shadow-sm border-border/60 h-full min-h-[560px]">
              <CardContent className="p-5 md:p-6 h-full overflow-y-auto">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rubric</div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Question {currentIdx + 1} of {questions.length}
                  </span>
                </div>
                <div className="mb-4">
                  {rubricData ? (
                    <div className="text-sm text-muted-foreground mt-1">
                      Total Points: <span className="font-semibold text-foreground">{rubricData.totalPoints}</span>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground mt-1">No rubric available.</div>
                  )}
                </div>
                {rubricData?.criteria?.length ? (
                  <div className="space-y-3">
                    {rubricData.criteria.map((criterion: any, idx: number) => (
                      <div key={criterion.id || idx} className="rounded-xl border border-border bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-semibold text-sm text-foreground">{criterion.name}</div>
                          <div className="text-xs font-bold text-primary whitespace-nowrap">{criterion.points} pts</div>
                        </div>
                        {criterion.description ? (
                          <div className="text-xs text-muted-foreground mt-1">{criterion.description}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </aside>

          <section className="lg:w-[65%] lg:max-w-[65%] flex-1 min-w-0 flex flex-col">
            <Card className="shadow-sm border-border/60 h-full min-h-[560px]">
              <CardContent className="p-5 md:p-6 h-full overflow-y-auto">
                <div className="mb-4 p-4 md:p-5 rounded-xl border border-border bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-2xl font-medium text-foreground leading-relaxed flex-1">
                      {currentQ.text}
                    </h3>
                    <AudioPlayer
                      text={
                        (currentQ.audioScript || currentQ.text) +
                        (currentQ.options && currentQ.options.length > 0
                          ? '. The options are: ' + currentQ.options.map((opt: string, i: number) => `Option ${String.fromCharCode(65 + i)}: ${opt}`).join('. ')
                          : '')
                      }
                      buttonSize="sm"
                      iconOnly
                      className="h-8 w-8 p-0 shrink-0"
                    />
                  </div>
                </div>

            {writingPayload ? (
              <div className="mb-4 space-y-3">
                <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200">
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 block">
                    Background Information
                  </span>
                  <div className="text-sm text-emerald-900 whitespace-pre-line max-h-48 overflow-y-auto pr-1">
                    {writingPayload.backgroundInformation}
                  </div>
                </div>

                {Array.isArray(writingPayload.sources) && writingPayload.sources.length > 0 ? (
                  <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                    <span className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3 block">
                      Suggested Sources
                    </span>
                    <div className="mb-3 overflow-x-auto pb-1">
                      <div className="inline-flex gap-2 min-w-full">
                        {writingPayload.sources.map((source: any, idx: number) => {
                          const active = idx === selectedSourceIdx;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setSelectedSourceIdx(idx)}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
                                active
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-white text-muted-foreground border-blue-200 hover:border-primary/40 hover:text-foreground'
                              }`}
                            >
                              Source {idx + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white border border-blue-100 p-3">
                      {(() => {
                        const source =
                          writingPayload.sources[
                            Math.min(selectedSourceIdx, writingPayload.sources.length - 1)
                          ];
                        if (!source) return null;
                        return (
                          <>
                            <div className="font-semibold text-sm text-foreground">{source.title}</div>
                            <div className="text-xs text-muted-foreground mb-1">
                              {[source.author, source.year, source.type].filter(Boolean).join(' • ')}
                            </div>
                            <div className="text-sm text-gray-700 whitespace-pre-line max-h-64 overflow-y-auto pr-1">
                              {source.description}
                            </div>
                            {source.url ? (
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block mt-2 text-xs font-semibold text-primary hover:underline"
                              >
                                Open source link
                              </a>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

              </CardContent>
            </Card>
          </section>
        </div>
        {['short_answer', 'essay', 'speaking', 'listening'].includes(currentQ.type) && (
          <div className="mt-5">
            <textarea
              className="w-full h-44 p-5 rounded-xl border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all text-lg resize-none disabled:opacity-75 disabled:bg-gray-50"
              placeholder={currentQ.type === 'speaking' ? "Type out what you would say..." : "Type your answer here..."}
              value={answers[currentQ.id] || ''}
              disabled={checkedAnswers[currentQ.id]}
              onChange={(e) => handleAnswer(e.target.value)}
            />
          </div>
        )}
        <div className="mt-4 flex justify-between items-center">
          <Button
            variant="outline"
            size="lg"
            onClick={() => setCurrentIdx(p => p - 1)}
            disabled={currentIdx === 0}
          >
            <ChevronLeft className="w-5 h-5 mr-2" /> Previous
          </Button>

          {currentIdx === questions.length - 1 ? (
            <Button
              size="lg"
              variant="accent"
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="px-10"
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Assessment"} <CheckCircle2 className="w-5 h-5 ml-2" />
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => setCurrentIdx(p => p + 1)}
            >
              Next Question <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}