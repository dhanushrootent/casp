import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { Button, Card, CardContent } from '@/components/ui';
import { Clock, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioPlayer } from '@/components/ui/audio-player';

import { useGetAssessment, getGetAssessmentQueryKey, useSubmitResult } from '@workspace/api-client-react';
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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg text-center p-8 border-0 shadow-2xl">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-3xl font-display font-bold mb-4">Assessment Complete!</h2>
          <p className="text-muted-foreground text-lg mb-8">Your answers have been securely submitted. Great job completing {assessment.title}.</p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button variant="outline" size="lg" className="w-full" onClick={() => window.location.href = '/student/dashboard'}>
              Return to Dashboard
            </Button>
            {resultId && (
              <Button size="lg" className="w-full" onClick={() => window.location.href = `/student/results`}>
                View Results & Feedback
              </Button>
            )}
          </div>
        </Card>
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
                            <div className="text-sm text-gray-700">{source.description}</div>
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