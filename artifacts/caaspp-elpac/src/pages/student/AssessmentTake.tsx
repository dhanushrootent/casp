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
  const progress = ((currentIdx) / (questions.length || 1)) * 100;

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
      <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6 sticky top-0 z-10 shadow-sm">
        <div className="font-display font-bold text-lg text-foreground">{assessment.title}</div>
        <div className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-1.5 rounded-full font-mono font-bold text-lg border border-red-100">
          <Clock className="w-5 h-5" />
          {formatTime(timeLeft)}
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
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 flex flex-col justify-center">
        <div className="mb-6 flex justify-between items-center text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <span>Question {currentIdx + 1} of {questions.length}</span>
          <span>{currentQ?.type.replace('_', ' ')}</span>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="shadow-lg border-border/50">
              <CardContent className="p-8 md:p-12">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
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
                    buttonSize="default" 
                    className="shrink-0" 
                  />
                </div>

                {writingPayload ? (
                  <div className="mb-8 space-y-4">
                    <div className="p-5 bg-emerald-50/60 rounded-xl border border-emerald-200">
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 block">
                        Background Information
                      </span>
                      <p className="text-sm text-emerald-900 whitespace-pre-line">
                        {writingPayload.backgroundInformation}
                      </p>
                    </div>

                    {Array.isArray(writingPayload.sources) && writingPayload.sources.length > 0 ? (
                      <div className="p-5 bg-blue-50/50 rounded-xl border border-blue-100">
                        <span className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-3 block">
                          Suggested Sources
                        </span>
                        <div className="space-y-3">
                          {writingPayload.sources.map((source: any, idx: number) => (
                            <div key={idx} className="rounded-lg bg-white border border-blue-100 p-3">
                              <div className="font-semibold text-sm text-foreground">{source.title}</div>
                              <div className="text-xs text-muted-foreground mb-1">
                                {[source.author, source.year, source.type].filter(Boolean).join(' • ')}
                              </div>
                              <div className="text-sm text-gray-700">{source.description}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {currentQ.options && currentQ.options.length > 0 && (
                  <div className="space-y-3">
                    {currentQ.options.map((opt: string, i: number) => {
                      const isSelected = answers[currentQ.id] === opt;
                      const isChecked = checkedAnswers[currentQ.id];
                      const isCorrectAnswer = opt === currentQ.correctAnswer;

                      let btnStateClass = 'border-border hover:border-primary/30 hover:bg-gray-50';
                      let dotStateClass = 'bg-gray-100 text-gray-500';
                      let textStateClass = 'text-gray-700';

                      if (isChecked) {
                        if (isCorrectAnswer) {
                          btnStateClass = 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-500/10';
                          dotStateClass = 'bg-emerald-500 text-white';
                          textStateClass = 'font-bold text-emerald-900';
                        } else if (isSelected) {
                          btnStateClass = 'border-red-500 bg-red-50';
                          dotStateClass = 'bg-red-500 text-white';
                          textStateClass = 'font-bold text-red-900';
                        } else {
                          btnStateClass = 'border-border opacity-50';
                        }
                      } else if (isSelected) {
                        btnStateClass = 'border-primary bg-primary/5 shadow-md shadow-primary/10';
                        dotStateClass = 'bg-primary text-white';
                        textStateClass = 'font-medium text-primary';
                      }

                      return (
                        <button
                          key={i}
                          onClick={() => handleAnswer(opt)}
                          disabled={isChecked}
                          className={`w-full text-left p-5 rounded-xl border-2 transition-all duration-200 flex items-center gap-4 ${btnStateClass}`}
                        >
                          <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${dotStateClass}`}>
                            {String.fromCharCode(65 + i)}
                          </div>
                          <span className={`text-lg ${textStateClass}`}>
                            {opt}
                          </span>
                          {isChecked && isCorrectAnswer && <CheckCircle2 className="w-6 h-6 text-emerald-500 ml-auto shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {['short_answer', 'essay', 'speaking', 'listening'].includes(currentQ.type) && (
                  <textarea
                    className="w-full h-40 p-5 rounded-xl border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all text-lg resize-none disabled:opacity-75 disabled:bg-gray-50"
                    placeholder={currentQ.type === 'speaking' ? "Type out what you would say..." : "Type your answer here..."}
                    value={answers[currentQ.id] || ''}
                    disabled={checkedAnswers[currentQ.id]}
                    onChange={(e) => handleAnswer(e.target.value)}
                  />
                )}

                {checkedAnswers[currentQ.id] && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 space-y-4">
                    {currentQ.correctAnswer && (!currentQ.options || currentQ.options.length === 0) && (
                      <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 block">Rubric / Expected Answer</span>
                        <p className="text-sm text-emerald-900 font-medium">{currentQ.correctAnswer}</p>
                      </div>
                    )}
                    {currentQ.explanation && !writingPayload && (
                      <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                        <span className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1 block">Explanation</span>
                        <p className="text-sm text-blue-900/80">{currentQ.explanation}</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* Navigation Footer */}
        <div className="mt-8 flex flex-col gap-4">
          <div className="flex justify-center border-b border-border pb-6 mb-2">
            {!checkedAnswers[currentQ.id] && answers[currentQ.id] && (
              <Button
                onClick={handleCheck}
                variant="outline"
                className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              >
                Check Answer & Review
              </Button>
            )}
          </div>

          <div className="flex justify-between items-center">
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
        </div>
      </main>
    </div>
  );
}