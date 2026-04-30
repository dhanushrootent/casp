import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { Button, Card, CardContent } from '@/components/ui';
import { Clock, ChevronRight, ChevronLeft, CheckCircle2, Sparkles, Loader2, Bold, Italic, Underline, List, ListOrdered } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioPlayer } from '@/components/ui/audio-player';
import { WritingRubricGradeView } from '@/components/teacher/WritingRubricGradeView';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { useGetAssessment, getGetAssessmentQueryKey, useSubmitResult, useGetResult, getGetResultQueryKey, useListResults } from '@workspace/api-client-react';
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

type WritingHighlight = {
  id?: string;
  section: 'prompt' | 'background' | 'source';
  start: number;
  end: number;
  text?: string;
  sourceIndex?: number;
};

function renderHighlightedText(
  text: string,
  highlights: WritingHighlight[] | undefined,
  section: WritingHighlight['section'],
  sourceIndex?: number,
) {
  if (!text) return text;
  const list = (highlights || [])
    .filter((h) => h.section === section)
    .filter((h) => (section === 'source' ? h.sourceIndex === sourceIndex : true))
    .filter((h) => Number.isFinite(h.start) && Number.isFinite(h.end) && h.end > h.start)
    .sort((a, b) => a.start - b.start);
  if (!list.length) return text;

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (const h of list) {
    const start = Math.max(0, Math.min(text.length, h.start));
    const end = Math.max(start, Math.min(text.length, h.end));
    if (start > cursor) nodes.push(<span key={`t-${key++}`}>{text.slice(cursor, start)}</span>);
    if (end > start) {
      nodes.push(
        <mark key={`m-${key++}`} className="rounded bg-[#39ff14]/45 text-slate-900 px-0.5">
          {text.slice(start, end)}
        </mark>,
      );
      cursor = end;
    }
  }
  if (cursor < text.length) nodes.push(<span key={`t-${key++}`}>{text.slice(cursor)}</span>);
  return nodes;
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

function toEmbeddableVideoUrl(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      if (host.includes('youtu.be')) {
        const id = parsed.pathname.split('/').filter(Boolean)[0];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.split('/')[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      const id = parsed.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.includes('vimeo.com')) {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const id = segments[segments.length - 1];
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }

    return null;
  } catch {
    return null;
  }
}

function isDirectVideoFileUrl(url?: string): boolean {
  if (!url) return false;
  const normalized = url.trim().toLowerCase();
  if (!normalized) return false;
  const clean = normalized.split('?')[0];
  return ['.mp4', '.webm', '.ogg', '.mov', '.m3u8'].some((ext) => clean.endsWith(ext));
}

function htmlToPlainText(html: string): string {
  if (typeof document === 'undefined') return html;
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n');
  const el = document.createElement('div');
  el.innerHTML = withBreaks;
  return (el.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function RichTextEditor({
  value,
  disabled,
  placeholder,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (nextHtml: string, nextPlainText: string) => void;
}) {
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const resizeEditor = React.useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(180, el.scrollHeight)}px`;
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
    resizeEditor();
  }, [value, resizeEditor]);

  const applyCommand = (cmd: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(cmd);
    const html = editorRef.current?.innerHTML ?? '';
    resizeEditor();
    onChange(html, htmlToPlainText(html));
  };

  return (
    <div className="rounded-xl border-2 border-border bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
        <button type="button" className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted disabled:opacity-50" onClick={() => applyCommand('bold')} disabled={disabled} aria-label="Bold">
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted disabled:opacity-50" onClick={() => applyCommand('italic')} disabled={disabled} aria-label="Italic">
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted disabled:opacity-50" onClick={() => applyCommand('underline')} disabled={disabled} aria-label="Underline">
          <Underline className="h-4 w-4" />
        </button>
        <button type="button" className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted disabled:opacity-50" onClick={() => applyCommand('insertUnorderedList')} disabled={disabled} aria-label="Bulleted list">
          <List className="h-4 w-4" />
        </button>
        <button type="button" className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted disabled:opacity-50" onClick={() => applyCommand('insertOrderedList')} disabled={disabled} aria-label="Numbered list">
          <ListOrdered className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        data-placeholder={placeholder || 'Type your answer here...'}
        onInput={(e) => {
          const html = (e.currentTarget as HTMLDivElement).innerHTML;
          resizeEditor();
          onChange(html, htmlToPlainText(html));
        }}
        className="w-full p-5 text-lg leading-relaxed outline-none overflow-hidden [&:empty:before]:text-muted-foreground [&:empty:before]:content-[attr(data-placeholder)]"
        style={{ minHeight: 180 }}
      />
    </div>
  );
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
  const { data: priorResults } = useListResults({
    studentId: user?.id ?? '',
    assessmentId: id,
  });

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [richAnswers, setRichAnswers] = useState<Record<string, string>>({});
  const [checkedAnswers, setCheckedAnswers] = useState<Record<string, boolean>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [resultId, setResultId] = useState<string | null>(null);
  const [submittedResultImmediate, setSubmittedResultImmediate] = useState<any | null>(null);
  const [selectedSourceIdx, setSelectedSourceIdx] = useState(0);
  const [examStarted, setExamStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [isSecurityBlocked, setIsSecurityBlocked] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const videoInteractionBypassRef = React.useRef(false);
  const videoInteractionTimeoutRef = React.useRef<number | null>(null);
  const maxViolations = 3;
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
  const maxAttempts = Math.max(1, Number((assessment as any)?.maxAttempts) || 1);
  const dueDateRaw = typeof (assessment as any)?.dueDate === 'string' ? (assessment as any).dueDate : '';
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const isPastDue = dueDate ? dueDate.getTime() < Date.now() : false;
  const attemptsUsed = Array.isArray(priorResults) ? priorResults.length : 0;
  const attemptsRemaining = Math.max(0, maxAttempts - attemptsUsed);
  const canSubmitAttempt = attemptsRemaining > 0;

  useEffect(() => {
    setSelectedSourceIdx(0);
  }, [currentIdx, currentQ?.id]);

  useEffect(() => {
    return () => {
      if (videoInteractionTimeoutRef.current !== null) {
        window.clearTimeout(videoInteractionTimeoutRef.current);
      }
    };
  }, []);

  const markVideoInteractionBypass = () => {
    videoInteractionBypassRef.current = true;
    if (videoInteractionTimeoutRef.current !== null) {
      window.clearTimeout(videoInteractionTimeoutRef.current);
    }
    videoInteractionTimeoutRef.current = window.setTimeout(() => {
      videoInteractionBypassRef.current = false;
      videoInteractionTimeoutRef.current = null;
    }, 5000);
  };

  const handleAnswer = (val: string) => {
    if (!currentQ || checkedAnswers[currentQ.id]) return; // disable changing answer after checking
    setAnswers(prev => ({ ...prev, [currentQ.id]: val }));
  };

  const handleCheck = () => {
    if (!currentQ || !answers[currentQ.id]) return;
    setCheckedAnswers(prev => ({ ...prev, [currentQ.id]: true }));
  };

  const requestExamFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        setIsFullscreen(true);
        return true;
      }
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
      return true;
    } catch {
      toast({
        variant: 'destructive',
        title: 'Fullscreen required',
        description: 'Please allow fullscreen to start this assessment.',
      });
      return false;
    }
  };

  const handleStartAssessment = async () => {
    if (isPastDue) {
      toast({
        variant: 'destructive',
        title: 'Assessment closed',
        description: 'This assessment is past its due date and can no longer be started.',
      });
      return;
    }
    const ok = await requestExamFullscreen();
    if (!ok) return;
    setExamStarted(true);
    setIsSecurityBlocked(false);
  };

  const handleQuitAssessment = async () => {
    setShowQuitConfirm(true);
  };

  const confirmQuitAssessment = async () => {
    setShowQuitConfirm(false);
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Ignore fullscreen exit errors.
      }
    }
    window.location.href = '/student/dashboard';
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
      if (!canSubmitAttempt) {
        toast({
          variant: "destructive",
          title: "No attempts remaining",
          description: `You have used all ${maxAttempts} attempt(s) for this assessment.`,
        });
        return;
      }
      if (isPastDue) {
        toast({
          variant: "destructive",
          title: "Assessment closed",
          description: "The due date has passed. Submissions are no longer accepted.",
        });
        return;
      }
      const result = await submitMutation.mutateAsync({
        data: {
          assessmentId: assessment.id,
          studentId: user.id,
          answers: formattedAnswers as any,
          timeSpent
        }
      });
      setSubmittedResultImmediate(result as any);
      setResultId((result as any).id);
      setIsSubmitted(true);
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // Ignore fullscreen exit errors on submit completion.
        }
      }
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

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement);
      setIsFullscreen(active);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [examStarted, isSubmitted]);

  useEffect(() => {
    if (!examStarted || isSubmitted) return;

    const registerViolation = (reason: string) => {
      setViolationCount((prev) => {
        const next = prev + 1;
        toast({
          variant: 'destructive',
          title: 'Security violation detected',
          description: `${reason}. Violation ${next}/${maxViolations}.`,
        });
        if (next >= maxViolations) {
          toast({
            variant: 'destructive',
            title: 'Assessment auto-submitted',
            description: 'Maximum security violations reached.',
          });
          void handleSubmit();
        }
        return next;
      });
    };

    const onVisibilityChange = () => {
      if (videoInteractionBypassRef.current) return;
      if (document.hidden) {
        registerViolation('Leaving the assessment window is not allowed');
        setIsSecurityBlocked(true);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const blocked =
        e.key === 'F11' ||
        e.key === 'Escape' ||
        ((e.ctrlKey || e.metaKey) && ['p', 's', 't', 'n', 'w'].includes(e.key.toLowerCase()));
      if (!blocked) return;
      e.preventDefault();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [examStarted, isSubmitted, toast]);

  if (isLoading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">Loading assessment...</div>;
  }

  if (!assessment) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">Assessment not found.</div>;
  }

  if (isSubmitted) {
    const effectiveResult = (submittedResult as any) ?? submittedResultImmediate;
    const scoreReleased = Boolean((effectiveResult as any)?.scoreReleased);
    const achievedExceptional = Boolean((effectiveResult as any)?.achievedExceptional);
    const storedFeedback = parseStoredFeedback(effectiveResult?.feedback);
    const writingFeedback = storedFeedback?.kind === 'ai_writing_result_v1' ? storedFeedback : null;
    const summary =
      typeof storedFeedback?.summary === 'string'
        ? storedFeedback.summary
        : (typeof effectiveResult?.feedback === 'string' ? effectiveResult.feedback : 'Your result has been recorded.');
    const submitAttemptNumber = Number((effectiveResult as any)?.attemptNumber) || Math.max(1, attemptsUsed);
    const submitAttemptsRemaining =
      Number((effectiveResult as any)?.attemptsRemaining) >= 0
        ? Number((effectiveResult as any)?.attemptsRemaining)
        : Math.max(0, maxAttempts - submitAttemptNumber);
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
                  <p className="text-sm text-muted-foreground mt-1">
                    Attempt {submitAttemptNumber} of {maxAttempts} • Remaining: {submitAttemptsRemaining}
                  </p>
                  {achievedExceptional ? (
                    <p className="mt-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      You performed exceptionally well on this assessment. Another attempt is not necessary unless your teacher asks for one.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-2">
                {submitAttemptsRemaining > 0 && !achievedExceptional ? (
                  <Button
                    onClick={() => window.location.href = `/student/assessment/${assessment.id}`}
                  >
                    Retry Attempt
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => window.location.href = '/student/dashboard'}>
                  Return to Dashboard
                </Button>
              </div>
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
                {(effectiveResult as any)?.teacherFinalComment ? (
                  <div className="bg-violet-50/70 p-4 rounded-xl border border-violet-200">
                    <h5 className="text-xs font-bold text-violet-700 uppercase tracking-wider mb-2">
                      Teacher Final Comment
                    </h5>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">
                      {(effectiveResult as any).teacherFinalComment}
                    </p>
                  </div>
                ) : null}

                {writingFeedback?.questions?.map((item: any, itemIdx: number) => {
                  const grading = item?.grading;
                  if (!grading) return null;
                  return (
                    <div key={item.questionId || itemIdx} className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold text-slate-900">Writing Feedback</div>
                        {scoreReleased ? (
                          <span className="text-sm font-bold bg-blue-50 text-blue-700 px-3 py-1 rounded-full">
                            {grading.totalScore}/{grading.maxScore} ({Math.round(grading.percentage || 0)}%)
                          </span>
                        ) : (
                          <span className="text-xs font-semibold bg-amber-50 text-amber-700 px-3 py-1 rounded-full border border-amber-200">
                            Scores pending teacher finalization
                          </span>
                        )}
                      </div>
                      {(grading?.overallFeedback?.strengths?.length || grading?.overallFeedback?.areasForImprovement?.length) ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">What you did well</div>
                            {Array.isArray(grading?.overallFeedback?.strengths) && grading.overallFeedback.strengths.length > 0 ? (
                              <div className="space-y-1.5 text-sm text-slate-700">
                                {grading.overallFeedback.strengths.map((s: string, i: number) => (
                                  <div key={i} className="flex gap-2">
                                    <span className="text-emerald-700 font-bold">•</span>
                                    <span>{s}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-slate-500">No specific strengths were returned.</div>
                            )}
                          </div>
                          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">What to improve next</div>
                            {Array.isArray(grading?.overallFeedback?.areasForImprovement) && grading.overallFeedback.areasForImprovement.length > 0 ? (
                              <div className="space-y-1.5 text-sm text-slate-700">
                                {grading.overallFeedback.areasForImprovement.map((s: string, i: number) => (
                                  <div key={i} className="flex gap-2">
                                    <span className="text-amber-700 font-bold">•</span>
                                    <span>{s}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-slate-500">No specific improvements were returned.</div>
                            )}
                          </div>
                        </div>
                      ) : null}
                      {typeof grading?.overallFeedback?.studentSummary === 'string' && grading.overallFeedback.studentSummary.trim().length > 0 ? (
                        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                          <div className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">AI Observation</div>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{grading.overallFeedback.studentSummary}</p>
                        </div>
                      ) : null}
                      <WritingRubricGradeView rubric={item.rubric} grading={grading} />
                    </div>
                  );
                })}

                <div className="space-y-3">
                  <h5 className="text-sm font-bold text-slate-800">Submitted Answers</h5>
                  {Array.isArray(effectiveResult?.answers) && effectiveResult.answers.length > 0 ? (
                    effectiveResult.answers.map((q: any, qIdx: number) => (
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
      <Dialog open={showQuitConfirm} onOpenChange={setShowQuitConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quit assessment?</DialogTitle>
            <DialogDescription>
              Your current progress will not be submitted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuitConfirm(false)}>
              Continue Assessment
            </Button>
            <Button variant="destructive" onClick={confirmQuitAssessment}>
              Quit Assessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!examStarted ? (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl border-slate-200 shadow-2xl">
            <CardContent className="p-7 space-y-5">
              <h2 className="text-2xl font-display font-bold text-slate-900">Secure Assessment Mode</h2>
              <p className="text-slate-700">
                This assessment runs in fullscreen mode. Leaving fullscreen or switching tabs/apps will be logged as a security violation.
              </p>
              <ul className="list-disc pl-6 text-slate-700 space-y-1">
                <li>Fullscreen is required while taking the assessment.</li>
                <li>Switching tabs/windows can trigger auto-submit after repeated violations.</li>
                <li>You may quit anytime, but progress will not be submitted.</li>
              </ul>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={handleQuitAssessment}>Quit</Button>
                <Button onClick={handleStartAssessment} disabled={isPastDue}>Start in Fullscreen</Button>
              </div>
                {isPastDue ? (
                  <p className="text-sm text-red-600 font-semibold">This assessment is past due and closed for submission.</p>
                ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {examStarted && isSecurityBlocked && !isSubmitted ? (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-xl border-amber-200 shadow-2xl">
            <CardContent className="p-6 space-y-4">
              <h3 className="text-xl font-display font-bold text-slate-900">Assessment Paused</h3>
              <p className="text-slate-700">
                You exited fullscreen or switched away from the test. Resume fullscreen to continue.
              </p>
              <p className="text-sm font-semibold text-amber-700">
                Violations: {violationCount}/{maxViolations}
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleQuitAssessment}>Quit Assessment</Button>
                <Button
                  onClick={async () => {
                    const ok = await requestExamFullscreen();
                    if (ok) setIsSecurityBlocked(false);
                  }}
                >
                  Resume Fullscreen
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

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
        {dueDate ? (
          <div className={`mb-3 rounded-lg border px-3 py-2 text-sm ${isPastDue ? 'border-red-200 bg-red-50 text-red-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
            Due date: {dueDate.toLocaleString()}
          </div>
        ) : null}
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
                      {renderHighlightedText(currentQ.text, writingPayload?.highlights as WritingHighlight[] | undefined, 'prompt')}
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
                    {renderHighlightedText(
                      writingPayload.backgroundInformation || '',
                      writingPayload?.highlights as WritingHighlight[] | undefined,
                      'background',
                    )}
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
                              {renderHighlightedText(
                                source.description || '',
                                writingPayload?.highlights as WritingHighlight[] | undefined,
                                'source',
                                Math.min(selectedSourceIdx, writingPayload.sources.length - 1),
                              )}
                            </div>
                            {source.type === "video" ? (
                              (() => {
                                const embedUrl = toEmbeddableVideoUrl(source.url);
                                if (embedUrl) {
                                  return (
                                    <div
                                      className="mt-3 rounded-lg border border-blue-100 bg-slate-950/95 p-2"
                                      onPointerDown={markVideoInteractionBypass}
                                      onFocusCapture={markVideoInteractionBypass}
                                      onTouchStart={markVideoInteractionBypass}
                                    >
                                      <div className="relative w-full overflow-hidden rounded-md bg-black pb-[56.25%]">
                                        <iframe
                                          title={`Video source ${selectedSourceIdx + 1}`}
                                          src={embedUrl}
                                          className="absolute inset-0 h-full w-full"
                                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        />
                                      </div>
                                    </div>
                                  );
                                }

                                if (isDirectVideoFileUrl(source.url)) {
                                  return (
                                    <div
                                      className="mt-3 rounded-lg border border-blue-100 bg-slate-950/95 p-2"
                                      onPointerDown={markVideoInteractionBypass}
                                      onFocusCapture={markVideoInteractionBypass}
                                      onTouchStart={markVideoInteractionBypass}
                                    >
                                      <video
                                        key={`${selectedSourceIdx}-${source.url}`}
                                        controls
                                        preload="metadata"
                                        controlsList="nofullscreen noremoteplayback"
                                        disablePictureInPicture
                                        className="w-full rounded-md max-h-80 bg-black"
                                        src={source.url}
                                      >
                                        Your browser does not support video playback.
                                      </video>
                                    </div>
                                  );
                                }

                                if (source.url) {
                                  return (
                                    <div className="mt-3 text-xs text-muted-foreground rounded-lg border border-dashed border-blue-200 bg-blue-50 px-3 py-2">
                                      This link cannot be played inline. Use the source link below.
                                    </div>
                                  );
                                }

                                return (
                                  <div className="mt-3 text-xs text-muted-foreground rounded-lg border border-dashed border-blue-200 bg-blue-50 px-3 py-2">
                                    Video source selected, but no preview URL is available yet.
                                  </div>
                                );
                              })()
                            ) : null}
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
        <div className="mt-3 text-sm text-muted-foreground">
          Attempts: {attemptsUsed}/{maxAttempts} used
        </div>
        <div className="mt-1 text-xs text-amber-700 font-semibold">
          Security violations: {violationCount}/{maxViolations}
        </div>
        {['short_answer', 'essay', 'speaking', 'listening'].includes(currentQ.type) && (
          <div className="mt-5">
            <RichTextEditor
              placeholder={currentQ.type === 'speaking' ? "Type out what you would say..." : "Type your answer here..."}
              value={richAnswers[currentQ.id] || ''}
              disabled={checkedAnswers[currentQ.id]}
              onChange={(nextHtml, nextPlainText) => {
                setRichAnswers(prev => ({ ...prev, [currentQ.id]: nextHtml }));
                handleAnswer(nextPlainText);
              }}
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
              disabled={submitMutation.isPending || !canSubmitAttempt || isPastDue}
              className="px-10"
            >
              {submitMutation.isPending ? "Submitting..." : isPastDue ? "Past Due" : !canSubmitAttempt ? "No Attempts Left" : "Submit Assessment"} <CheckCircle2 className="w-5 h-5 ml-2" />
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