import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { Button, Card, CardContent } from '@/components/ui';
import { Clock, ChevronRight, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { formatTime } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { AudioPlayer } from '@/components/ui/audio-player';

// Mock data since we need a solid UI for the POC
const MOCK_ASSESSMENT = {
  title: "Grade 8 ELA Practice Test",
  duration: 45 * 60, // 45 mins in seconds
  questions: [
    { id: 'q1', type: 'multiple_choice', text: 'Read the sentence: "The cacophony of the city streets was overwhelming." What does cacophony mean in this context?', audioScript: undefined, options: ['A pleasant harmony', 'A harsh, discordant mixture of sounds', 'A quiet murmur', 'A rhythmic beat'] },
    { id: 'q2', type: 'short_answer', text: 'In one sentence, describe the main theme of the provided passage about the industrial revolution.', audioScript: undefined },
    { id: 'q3', type: 'multiple_choice', text: 'Which of the following is an example of a metaphor?', audioScript: undefined, options: ['The wind whispered through the trees.', 'He is a shining star.', 'She ran as fast as a cheetah.', 'The clock ticked loudly.'] }
  ]
};

export default function AssessmentTake() {
  const [, params] = useRoute('/student/assessment/:id');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(MOCK_ASSESSMENT.duration);
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    if (isSubmitted) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [isSubmitted]);

  const currentQ = MOCK_ASSESSMENT.questions[currentIdx];
  const progress = ((currentIdx) / MOCK_ASSESSMENT.questions.length) * 100;

  const handleAnswer = (val: string) => {
    setAnswers(prev => ({ ...prev, [currentQ.id]: val }));
  };

  const handleSubmit = () => {
    // In a real app, call useSubmitResult mutation here
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg text-center p-8 border-0 shadow-2xl">
          <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h2 className="text-3xl font-display font-bold mb-4">Assessment Complete!</h2>
          <p className="text-muted-foreground text-lg mb-8">Your answers have been securely submitted. Great job completing the {MOCK_ASSESSMENT.title}.</p>
          <Button size="lg" className="w-full" onClick={() => window.location.href = '/student/dashboard'}>
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6 sticky top-0 z-10 shadow-sm">
        <div className="font-display font-bold text-lg text-foreground">{MOCK_ASSESSMENT.title}</div>
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
          <span>Question {currentIdx + 1} of {MOCK_ASSESSMENT.questions.length}</span>
          <span>{currentQ.type.replace('_', ' ')}</span>
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
                  <AudioPlayer text={currentQ.audioScript || currentQ.text} buttonSize="default" className="shrink-0" />
                </div>

                {currentQ.type === 'multiple_choice' && currentQ.options && (
                  <div className="space-y-3">
                    {currentQ.options.map((opt, i) => {
                      const isSelected = answers[currentQ.id] === opt;
                      return (
                        <button
                          key={i}
                          onClick={() => handleAnswer(opt)}
                          className={`w-full text-left p-5 rounded-xl border-2 transition-all duration-200 flex items-center gap-4 ${
                            isSelected 
                              ? 'border-primary bg-primary/5 shadow-md shadow-primary/10' 
                              : 'border-border hover:border-primary/30 hover:bg-gray-50'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                            isSelected ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {String.fromCharCode(65 + i)}
                          </div>
                          <span className={`text-lg ${isSelected ? 'font-medium text-primary' : 'text-gray-700'}`}>
                            {opt}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {currentQ.type === 'short_answer' && (
                  <textarea
                    className="w-full h-40 p-5 rounded-xl border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all text-lg resize-none"
                    placeholder="Type your answer here..."
                    value={answers[currentQ.id] || ''}
                    onChange={(e) => handleAnswer(e.target.value)}
                  />
                )}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* Navigation Footer */}
        <div className="mt-8 flex justify-between items-center">
          <Button 
            variant="outline" 
            size="lg"
            onClick={() => setCurrentIdx(p => p - 1)}
            disabled={currentIdx === 0}
          >
            <ChevronLeft className="w-5 h-5 mr-2" /> Previous
          </Button>

          {currentIdx === MOCK_ASSESSMENT.questions.length - 1 ? (
            <Button 
              size="lg" 
              variant="accent"
              onClick={handleSubmit}
              className="px-10"
            >
              Submit Assessment <CheckCircle2 className="w-5 h-5 ml-2" />
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
