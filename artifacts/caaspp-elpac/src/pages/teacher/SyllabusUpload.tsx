import React, { useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Badge } from '@/components/ui';
import { Upload, FileText, Sparkles, CheckCircle2, Loader2, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
// Assume the API is working, we'll mock the hook for the POC UI flow if needed, 
// but we'll try to use the real signature
import { useLocation } from 'wouter';
import { useUploadSyllabus, useCreateAssessment, useAddQuestionToAssessment, useListClasses } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import * as pdfjsLib from 'pdfjs-dist';

// Use a static version of the worker that matches the installed pdfjs-dist version.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    text += pageText + '\\n';
  }
  return text;
}

export default function SyllabusUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [subject, setSubject] = useState('English Language Arts');
  const [grade, setGrade] = useState('8');
  const [difficulty, setDifficulty] = useState<'easy'|'medium'|'hard'|'mixed'>('medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[] | null>(null);
  const [assessmentTitle, setAssessmentTitle] = useState('');
  const [assessmentSummary, setAssessmentSummary] = useState('');
  
  const [listeningRubric, setListeningRubric] = useState('');
  const [readingRubric, setReadingRubric] = useState('');
  const [writingRubric, setWritingRubric] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  const uploadMutation = useUploadSyllabus();
  const createAssessmentMutation = useCreateAssessment();
  const addQuestionMutation = useAddQuestionToAssessment();
  const { data: classes } = useListClasses();
  
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const myClasses = classes?.filter(c => c.teacherId === user?.id) || [];

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1
  });

  const handleGenerate = async () => {
    if (!file) return;
    
    setIsExtracting(true);
    let extractedText = '';
    try {
      extractedText = await extractTextFromPDF(file);
    } catch (error) {
      console.error("PDF Extraction failed:", error);
      setIsExtracting(false);
      return;
    }
    setIsExtracting(false);

    // Call the actual AI generation endpoint
    uploadMutation.mutate({
      data: {
        syllabusText: extractedText,
        fileName: file.name,
        assessmentType: subject.includes('Language') ? 'ELPAC' : 'CAASPP',
        subject,
        grade,
        difficulty,
        questionCount,
        ...(listeningRubric ? { listeningRubric } : {}),
        ...(readingRubric ? { readingRubric } : {}),
        ...(writingRubric ? { writingRubric } : {}),
        ...(selectedClassId ? { classId: selectedClassId } : {})
      }
    }, {
      onSuccess: (data) => {
        setGeneratedQuestions(data.questions);
        setAssessmentTitle(data.assessmentTitle || `${grade} Grade ${subject} Assessment`);
        setAssessmentSummary(data.summary || `Generated from ${file.name}`);
      },
      onError: (err) => {
        console.error("Mutation failed", err);
        toast({
          variant: "destructive",
          title: "AI Generation Failed",
          description: "There was a problem generating the assessment from your syllabus.",
        });
      }
    });
  };

  const handleSaveAssessment = async () => {
    if (!generatedQuestions || !user) return;
    
    setIsSaving(true);
    try {
      // 1. Create the parent Assessment record
      const newAssessment = await createAssessmentMutation.mutateAsync({
        data: {
          title: assessmentTitle,
          type: subject.includes('Language') ? 'ELPAC' : 'CAASPP',
          subject,
          grade,
          duration: 60,
          difficulty,
          classId: selectedClassId || undefined,
          description: assessmentSummary,
        } as any
      });

      // 2. Loop through generatedQuestions and add each one
      const questionPromises = generatedQuestions.map((q, index) => {
        return addQuestionMutation.mutateAsync({
          assessmentId: newAssessment.id,
          data: {
            text: q.text,
            type: q.type,
            options: q.options || [],
            correctAnswer: q.correctAnswer || "",
            points: q.points || 1,
            difficulty: q.difficulty || difficulty,
            orderIndex: q.orderIndex
          }
        });
      });

      await Promise.all(questionPromises);

      toast({
        title: "Assessment Saved!",
        description: `Successfully saved ${generatedQuestions.length} questions to your assessments.`,
      });
      
      // Redirect to the Teacher Assessments dashboard
      setLocation('/teacher/assessments');
    } catch (error) {
      console.error("Failed to save assessment:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "There was a problem saving your assessment to the database.",
      });
      setIsSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2 flex items-center gap-3">
            Syllabus to Assessment <Sparkles className="w-6 h-6 text-accent" />
          </h1>
          <p className="text-muted-foreground text-lg">Upload a PDF syllabus and let Gemini AI generate a customized CAASPP or ELPAC assessment instantly.</p>
        </div>

        {!generatedQuestions ? (
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="border-2 border-dashed border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
              <div {...getRootProps()} className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center cursor-pointer outline-none">
                <input {...getInputProps()} />
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                  {file ? <FileText className="w-8 h-8 text-primary" /> : <Upload className="w-8 h-8 text-primary/60" />}
                </div>
                {file ? (
                  <>
                    <h3 className="text-lg font-semibold text-foreground mb-1">{file.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{(file.size / 1024 / 1024).toFixed(2)} MB • Ready to process</p>
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setFile(null); }}>Remove File</Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {isDragActive ? "Drop PDF here" : "Drag & Drop Syllabus PDF"}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">or click to browse from your computer</p>
                  </>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assessment Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2">Subject Area</label>
                  <select 
                    className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                    value={subject} onChange={e => setSubject(e.target.value)}
                  >
                    <option>English Language Arts</option>
                    <option>Mathematics</option>
                    <option>Science</option>
                    <option>ELPAC Listening/Speaking</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Grade Level</label>
                    <select 
                      className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                      value={grade} onChange={e => setGrade(e.target.value)}
                    >
                      {[3,4,5,6,7,8,11].map(g => <option key={g} value={g}>Grade {g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Difficulty</label>
                    <select 
                      className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                      value={difficulty} onChange={e => setDifficulty(e.target.value as any)}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                      <option value="mixed">Mixed</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-2">Assign to Class (Optional)</label>
                    <select 
                      className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                      value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}
                    >
                      <option value="">Do not assign</option>
                      {myClasses.map(cls => (
                         <option key={cls.id} value={cls.id}>{cls.name} (Grade {cls.grade})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 flex justify-between">
                    <span>Number of Questions</span>
                    <span className="text-primary font-bold">{questionCount}</span>
                  </label>
                  <input 
                    type="range" min="5" max="50" 
                    value={questionCount} onChange={e => setQuestionCount(parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>

                <div className="pt-2 border-t border-border">
                  <button 
                    type="button"
                    className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    {showAdvanced ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
                    Advanced Options (Rubrics)
                  </button>
                  
                  {showAdvanced && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-4 mt-4"
                    >
                      <div>
                        <label className="block text-sm font-medium mb-1">Reading Rubric / Standard</label>
                        <textarea 
                          className="w-full rounded-xl border border-input bg-background px-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[80px] resize-y"
                          placeholder="e.g. Focus on citing textual evidence (RL.8.1)"
                          value={readingRubric} onChange={e => setReadingRubric(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Writing Rubric / Prompt</label>
                        <textarea 
                          className="w-full rounded-xl border border-input bg-background px-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[80px] resize-y"
                          placeholder="e.g. Include argument and evidence rubrics (W.8.1)"
                          value={writingRubric} onChange={e => setWritingRubric(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Listening Rubric (ELPAC)</label>
                        <textarea 
                          className="w-full rounded-xl border border-input bg-background px-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[80px] resize-y"
                          placeholder="e.g. Ensure listening passages are 2 mins max"
                          value={listeningRubric} onChange={e => setListeningRubric(e.target.value)}
                        />
                      </div>
                    </motion.div>
                  )}
                </div>

                <Button 
                  className="w-full h-12 text-lg mt-4 group" 
                  disabled={!file || isExtracting || uploadMutation.isPending}
                  onClick={handleGenerate}
                >
                  {isExtracting ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Reading PDF...</>
                  ) : uploadMutation.isPending ? (
                    <><Sparkles className="w-5 h-5 mr-2 animate-pulse text-yellow-300" /> Gemini AI Generating...</>
                  ) : (
                    <>Generate Assessment <Sparkles className="w-5 h-5 ml-2 group-hover:rotate-12 transition-transform" /></>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  <span className="font-medium">Successfully generated {generatedQuestions.length} questions using Gemini AI</span>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setGeneratedQuestions(null)} disabled={isSaving}>Discard</Button>
                  <Button variant="default" onClick={handleSaveAssessment} disabled={isSaving}>
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {isSaving ? "Saving..." : "Save Assessment"} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>

              <div className="space-y-4">
                {generatedQuestions.map((q, i) => (
                  <Card key={i} className="overflow-hidden">
                    <div className="flex border-b border-border bg-gray-50/50 px-4 py-2 text-xs font-semibold text-muted-foreground justify-between">
                      <span>Question {i + 1} • {q.type.replace('_', ' ').toUpperCase()}</span>
                      <span>{q.points} Points</span>
                    </div>
                    <CardContent className="p-6">
                      <p className="text-lg font-medium text-foreground mb-4">{q.text}</p>
                      {q.options && q.options.length > 0 && (
                        <div className="space-y-2">
                          {q.options.map((opt: string, oi: number) => (
                            <div key={oi} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-white">
                              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-muted-foreground">
                                {String.fromCharCode(65 + oi)}
                              </div>
                              <span className="text-sm">{opt}</span>
                              {q.correctAnswer === opt && (
                                <Badge variant="success" className="ml-auto">Correct Answer</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </DashboardLayout>
  );
}
