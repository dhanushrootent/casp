import React, { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  useAddQuestionToAssessment,
  useCreateAssessment,
  useFinalizeWritingTopic,
  useGenerateWritingActivity,
  useListClasses,
  useSuggestWritingTopics,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AssessmentType = "" | "CAASPP" | "ELPAC";
type Difficulty = "" | "easy" | "medium" | "hard" | "mixed";
type RubricType = "" | "argumentative" | "explanatory" | "narrative" | "response" | "analysis" | "essay";
type WritingGenre =
  | ""
  | "political"
  | "geographical"
  | "personal_experience"
  | "historical"
  | "scientific"
  | "literary"
  | "social_issue"
  | "biographical"
  | "cultural"
  | "environmental";

type SourceType = "article" | "book" | "website" | "primary_source" | "video";

type WritingSource = {
  title: string;
  author?: string;
  year?: string;
  description: string;
  type: SourceType;
  url?: string;
};

type WritingPrompt = {
  id: string;
  text: string;
  type: string;
  skill: string;
  difficulty: string;
};

type RubricLevel = {
  score: number;
  label: string;
  description: string;
};

type RubricCriterion = {
  id: string;
  name: string;
  description: string;
  weight: number;
  points: number;
  levels: RubricLevel[];
};

type WritingRubric = {
  totalPoints: number;
  criteria: RubricCriterion[];
};

type RubricParams = {
  minWords: number;
  maxWords: number;
  minParagraphs: number;
  maxParagraphs: number;
  requireThesis: boolean;
  requireIntroConclusion: boolean;
  minCitations: number;
  maxCitations: number;
  additionalInstructions?: string;
};

type WritingGenerateResult = {
  assessmentTitle: string;
  summary: string;
  backgroundInformation: string;
  sources: WritingSource[];
  writingPrompts: WritingPrompt[];
  rubric: WritingRubric;
};

type FinalizedTopicData = {
  promptText: string;
  backgroundInformation: string;
  sources: WritingSource[];
};

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeWeightsTo100(criteria: RubricCriterion[]): RubricCriterion[] {
  if (criteria.length === 0) return criteria;
  const raw = criteria.map((c) => (Number.isFinite(c.weight) ? c.weight : 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const even = Math.floor(100 / criteria.length);
    const remainder = 100 - even * criteria.length;
    return criteria.map((c, i) => ({
      ...c,
      weight: even + (i === 0 ? remainder : 0),
    }));
  }
  const scaled = raw.map((w) => (w / sum) * 100);
  const rounded = scaled.map((w) => Math.round(w));
  const roundedSum = rounded.reduce((a, b) => a + b, 0);
  const delta = 100 - roundedSum;
  const maxIdx =
    rounded.length === 0
      ? -1
      : rounded.reduce((best, _, i) => (rounded[i] > rounded[best] ? i : best), 0);
  const fixed = rounded.map((w, i) => (i === maxIdx ? w + delta : w));
  return criteria.map((c, i) => ({ ...c, weight: fixed[i] }));
}

function calcWeightSum(criteria: RubricCriterion[]) {
  return criteria.reduce((sum, c) => sum + (Number.isFinite(c.weight) ? c.weight : 0), 0);
}

function calcPointsFromWeights(rubric: WritingRubric): WritingRubric {
  const totalPoints = Number.isFinite(rubric.totalPoints) ? rubric.totalPoints : 20;
  if (!rubric.criteria?.length) return { ...rubric, totalPoints, criteria: [] };
  const weights = rubric.criteria.map((c) => (Number.isFinite(c.weight) ? c.weight : 0));
  const sumWeights = weights.reduce((a, b) => a + b, 0) || 100;
  const rawPoints = weights.map((w) => (w / sumWeights) * totalPoints);
  const rounded = rawPoints.map((p) => Math.max(0, Math.round(p)));
  const sumRounded = rounded.reduce((a, b) => a + b, 0);
  const delta = totalPoints - sumRounded;
  const maxIdx =
    rounded.length === 0
      ? -1
      : rounded.reduce((best, _, i) => (weights[i] > weights[best] ? i : best), 0);
  const fixed = rounded.map((p, i) => (i === maxIdx ? p + delta : p));
  return {
    ...rubric,
    totalPoints,
    criteria: rubric.criteria.map((c, i) => ({ ...c, points: fixed[i] })),
  };
}

function newRubricCriterion(): RubricCriterion {
  const id =
    typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function"
      ? (crypto as any).randomUUID()
      : `crit_${Math.random().toString(16).slice(2)}`;

  return {
    id,
    name: "New Criterion",
    description: "Edit this description",
    weight: 0,
    points: 0,
    levels: [
      { score: 4, label: "Exemplary", description: "Edit level description" },
      { score: 3, label: "Proficient", description: "Edit level description" },
      { score: 2, label: "Developing", description: "Edit level description" },
      { score: 1, label: "Beginning", description: "Edit level description" },
    ],
  };
}

type RubricLevelDraft = {
  exemplary: string;
  proficient: string;
  developing: string;
  beginning: string;
};

function criterionLevelsToDraft(c: RubricCriterion): RubricLevelDraft {
  const get = (label: string) => c.levels?.find((l) => l.label === label)?.description ?? "";
  return {
    exemplary: get("Exemplary"),
    proficient: get("Proficient"),
    developing: get("Developing"),
    beginning: get("Beginning"),
  };
}

function applyLevelDraftToCriterion(c: RubricCriterion, draft: RubricLevelDraft): RubricCriterion {
  const pairs: [string, keyof RubricLevelDraft][] = [
    ["Exemplary", "exemplary"],
    ["Proficient", "proficient"],
    ["Developing", "developing"],
    ["Beginning", "beginning"],
  ];
  const nextLevels = [...(c.levels || [])];
  for (const [label, key] of pairs) {
    const i = nextLevels.findIndex((l) => l.label === label);
    if (i >= 0) nextLevels[i] = { ...nextLevels[i], description: draft[key] };
  }
  return { ...c, levels: nextLevels };
}

function parseTeacherProvidedSources(value: string): string[] {
  return value
    .split(/\n|,/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 12);
}

export default function WritingGenerator() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [topic, setTopic] = useState("");
  const [assessmentType, setAssessmentType] = useState<AssessmentType>("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("");
  const [promptCount, setPromptCount] = useState(3);
  const [rubricType, setRubricType] = useState<RubricType>("");
  const [genre, setGenre] = useState<WritingGenre>("");
  const [manualAssessmentTitle, setManualAssessmentTitle] = useState("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [maxAttemptsInput, setMaxAttemptsInput] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [teacherProvidedSourcesInput, setTeacherProvidedSourcesInput] = useState("");
  const [sourceDescriptionMaxWordsInput, setSourceDescriptionMaxWordsInput] = useState("220");

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rubricParams, setRubricParams] = useState<RubricParams>({
    minWords: 300,
    maxWords: 700,
    minParagraphs: 3,
    maxParagraphs: 6,
    requireThesis: true,
    requireIntroConclusion: true,
    minCitations: 0,
    maxCitations: 2,
    additionalInstructions: "",
  });

  const [phase, setPhase] = useState<"input" | "results">("input");
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generated, setGenerated] = useState<WritingGenerateResult | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<string>("");
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [finalizedTopicData, setFinalizedTopicData] = useState<FinalizedTopicData | null>(null);
  const [rubricSplitCriterionIdx, setRubricSplitCriterionIdx] = useState<number | null>(null);
  const [rubricSplitDraft, setRubricSplitDraft] = useState<RubricLevelDraft>({
    exemplary: "",
    proficient: "",
    developing: "",
    beginning: "",
  });

  const generateMutation = useGenerateWritingActivity();
  const finalizeMutation = useFinalizeWritingTopic();
  const suggestTopicsMutation = useSuggestWritingTopics();
  const createAssessmentMutation = useCreateAssessment();
  const addQuestionMutation = useAddQuestionToAssessment();
  const { data: classes } = useListClasses();

  const myClasses = useMemo(
    () => classes?.filter((c) => c.teacherId === user?.id) || [],
    [classes, user?.id],
  );

  const topicCharCount = topic.length;
  const maxAttempts = clampInt(parseInt(maxAttemptsInput || "1", 10), 1, 10);
  const sourceDescriptionMaxWords = clampInt(parseInt(sourceDescriptionMaxWordsInput || "220", 10), 40, 500);
  const teacherProvidedSources = useMemo(
    () => parseTeacherProvidedSources(teacherProvidedSourcesInput),
    [teacherProvidedSourcesInput],
  );
  const canSuggestTopics = Boolean(grade && rubricType && difficulty && genre);
  const canGenerate = Boolean(
    topic.trim().length >= 10 && assessmentType && subject && grade && difficulty && rubricType && genre,
  );

  useEffect(() => {
    if (phase !== "input") return;
    if (!canSuggestTopics) {
      setSuggestedTopics([]);
      return;
    }

    const timer = window.setTimeout(() => {
      suggestTopicsMutation.mutate(
        {
          data: {
            grade,
            rubricType,
            difficulty: difficulty as Exclude<Difficulty, "">,
            genre,
            subject,
            assessmentType: assessmentType ? (assessmentType as Exclude<AssessmentType, "">) : undefined,
          },
        },
        {
          onSuccess: (data) => {
            setSuggestedTopics(Array.isArray((data as any)?.suggestions) ? (data as any).suggestions : []);
          },
          onError: () => {
            setSuggestedTopics([]);
          },
        },
      );
    }, 350);

    return () => window.clearTimeout(timer);
  }, [assessmentType, canSuggestTopics, difficulty, genre, grade, phase, rubricType, subject]);

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsPreparing(true);
    try {
      await new Promise((r) => setTimeout(r, 450));
    } finally {
      setIsPreparing(false);
    }

    generateMutation.mutate(
      {
        data: {
          topic,
          grade,
          subject,
          assessmentType: assessmentType as Exclude<AssessmentType, "">,
          difficulty: difficulty as Exclude<Difficulty, "">,
          promptCount: clampInt(promptCount, 1, 5),
          rubricType,
          genre,
          rubricParams: {
            ...rubricParams,
            minWords: clampInt(rubricParams.minWords, 0, 2000),
            maxWords: clampInt(rubricParams.maxWords, 0, 5000),
            minParagraphs: clampInt(rubricParams.minParagraphs, 0, 20),
            maxParagraphs: clampInt(rubricParams.maxParagraphs, 0, 50),
            minCitations: clampInt(rubricParams.minCitations, 0, 20),
            maxCitations: clampInt(rubricParams.maxCitations, 0, 50),
          },
          ...(selectedClassId ? { classId: selectedClassId } : {}),
          metadata: {
            assessmentTitle: manualAssessmentTitle || undefined,
          },
          teacherProvidedSources: teacherProvidedSources.length > 0 ? teacherProvidedSources : undefined,
          sourceDescriptionMaxWords,
        } as any,
      },
      {
        onSuccess: (data) => {
          const normalizedRubric = calcPointsFromWeights(data.rubric as any);
          const next: WritingGenerateResult = {
            ...(data as any),
            rubric: normalizedRubric as any,
          };
          setGenerated(next);
          setSelectedPromptId(next.writingPrompts?.[0]?.id || "");
          setFinalizedTopicData(null);
          setPhase("results");
        },
        onError: (err) => {
          console.error("Writing generate failed", err);
          toast({
            variant: "destructive",
            title: "AI Generation Failed",
            description: "There was a problem generating the writing activity from your topic.",
          });
        },
      },
    );
  };

  const handleFinalizePrompt = async () => {
    if (!selectedPrompt?.text.trim() || !grade || !difficulty || !rubricType) return;

    try {
      const data = await finalizeMutation.mutateAsync({
        data: {
          topic: selectedPrompt.text,
          grade,
          subject: subject || undefined,
          assessmentType: assessmentType || undefined,
          difficulty: difficulty as Exclude<Difficulty, "">,
          rubricType,
          genre,
          teacherProvidedSources: teacherProvidedSources.length > 0 ? teacherProvidedSources : undefined,
          sourceDescriptionMaxWords,
        } as any,
      });

      const finalized = {
        promptText: selectedPrompt.text,
        backgroundInformation: (data as any).backgroundInformation || "",
        sources: Array.isArray((data as any).sources) ? (data as any).sources : [],
      };

      setFinalizedTopicData({
        ...finalized,
      });
      setGenerated((prev) =>
        prev
          ? {
              ...prev,
              backgroundInformation: finalized.backgroundInformation,
              sources: finalized.sources,
            }
          : prev,
      );

      toast({
        title: "Prompt finalized",
        description: `Generated student-facing background information and sources for the selected ${rubricType} prompt.`,
      });
    } catch (error) {
      console.error("Finalize prompt failed", error);
      toast({
        variant: "destructive",
        title: "Finalize Failed",
        description: "There was a problem generating background information and sources for the selected prompt.",
      });
    }
  };

  const handleDiscard = () => {
    setGenerated(null);
    setSelectedPromptId("");
    setFinalizedTopicData(null);
    setPhase("input");
  };

  const selectedPrompt = useMemo(() => {
    if (!generated) return null;
    return generated.writingPrompts.find((p) => p.id === selectedPromptId) || null;
  }, [generated, selectedPromptId]);

  const handleSave = async () => {
    if (!generated || !user) return;
    if (!selectedPrompt) {
      toast({
        variant: "destructive",
        title: "Select a prompt",
        description: "Please select exactly one writing prompt before saving.",
      });
      return;
    }

    setIsSaving(true);
    try {
      const sourceSetToPersist =
        finalizedTopicData &&
        selectedPrompt &&
        finalizedTopicData.promptText.trim() === selectedPrompt.text.trim()
          ? finalizedTopicData.sources
          : generated.sources;
      const backgroundToPersist =
        finalizedTopicData &&
        selectedPrompt &&
        finalizedTopicData.promptText.trim() === selectedPrompt.text.trim()
          ? finalizedTopicData.backgroundInformation
          : generated.backgroundInformation;

      const persistedPayload = {
        kind: "writing_activity_v1",
        writingPromptId: selectedPrompt.id,
        backgroundInformation: backgroundToPersist || "",
        sources: Array.isArray(sourceSetToPersist) ? sourceSetToPersist : [],
        rubric: generated.rubric,
        rubricParams,
        topic,
        maxAttempts,
        dueDate: dueDate || null,
        teacherProvidedSources,
        sourceDescriptionMaxWords,
      };

      const newAssessment = await createAssessmentMutation.mutateAsync({
        data: {
          title: generated.assessmentTitle,
          type: assessmentType as "CAASPP" | "ELPAC",
          subject,
          grade,
          duration: 60,
          difficulty,
          classId: selectedClassId || undefined,
          description: generated.summary,
        } as any,
      });

      await addQuestionMutation.mutateAsync({
        assessmentId: newAssessment.id,
        data: {
          text: selectedPrompt.text,
          type: "essay",
          options: [],
          correctAnswer: "",
          explanation: JSON.stringify(persistedPayload),
          audioScript: null,
          skill: selectedPrompt.skill || null,
          points: generated.rubric.totalPoints || 20,
          difficulty: difficulty === "mixed" ? "medium" : (difficulty as any),
          orderIndex: 0,
        } as any,
      });

      toast({
        title: "Assessment Saved!",
        description: "Successfully saved your writing activity to your assessments.",
      });

      setLocation("/teacher/assessments");
    } catch (error) {
      console.error("Failed to save writing activity:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "There was a problem saving your writing activity to the database.",
      });
      setIsSaving(false);
    }
  };

  const weightSum = generated ? calcWeightSum(generated.rubric.criteria) : 0;
  const weightsOk = Math.round(weightSum) === 100;
  const canEditRubric = Boolean(generated);

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2 flex items-center gap-3">
            Writing Prompt Generator <Sparkles className="w-6 h-6 text-accent" />
          </h1>
          <p className="text-muted-foreground text-lg">
            Generate rich, standards-aligned writing activities from a topic you type in — prompts, background info,
            sources, and a rubric.
          </p>
        </div>

        {phase === "input" ? (
          <div className="grid md:grid-cols-2 gap-8">
            <Card className="border-2 border-dashed border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary/70" />
                  Topic / Text
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <label className="block text-sm font-medium">
                  What topic or text are you teaching?
                </label>
                <textarea
                  className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[220px] resize-y"
                  placeholder='e.g. "The causes and effects of World War I", "To Kill a Mockingbird Chapter 5–8", "The water cycle and climate change"'
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value);
                  }}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{topicCharCount} characters</span>
                  <span>Be specific — the more detail you add, the better the AI can tailor the prompts.</span>
                </div>
                <div className="rounded-xl border border-primary/10 bg-white/70 p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-primary/80">
                      Suggested Topics
                    </div>
                    {suggestTopicsMutation.isPending ? (
                      <div className="flex items-center text-xs text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Gemini suggesting...
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedTopics.length > 0 ? (
                      suggestedTopics.map((suggestion, index) => (
                        <button
                          key={`${suggestion}-${index}`}
                          type="button"
                          className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors text-left"
                          onClick={() => setTopic(suggestion)}
                        >
                          {suggestion}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {canSuggestTopics
                          ? "No suggestions yet. Adjust the settings or wait a moment for Gemini."
                          : "Select grade, writing type, difficulty, and genre to load Gemini topic ideas."}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Writing Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Assessment Type</label>
                    <select
                      className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                      value={assessmentType}
                      onChange={(e) => setAssessmentType(e.target.value as any)}
                    >
                      <option value="">Select assessment type</option>
                      <option value="CAASPP">CAASPP</option>
                      <option value="ELPAC">ELPAC</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Subject Area</label>
                    <select
                      className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    >
                      <option value="" disabled hidden>
                        select subject area
                      </option>
                      <option value="English Language Arts">English Language Arts</option>
                      <option value="Mathematics">Mathematics</option>
                      <option value="Science">Science</option>
                      <option value="Listening/Speaking">Listening/Speaking</option>
                      <option value="History/Social Studies">History/Social Studies</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Grade Level</label>
                    <select
                      className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                    >
                      <option value="">Select grade level</option>
                      {Array.from({ length: 10 }).map((_, i) => {
                        const g = i + 3;
                        return (
                          <option key={g} value={String(g)}>
                            Grade {g}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Assessment Title (Optional)</label>
                    <Input
                      className="w-full h-11 rounded-xl"
                      placeholder="e.g. Civil War Writing Task"
                      value={manualAssessmentTitle}
                      onChange={(e) => setManualAssessmentTitle(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Max Attempts</label>
                    <Input
                      className="w-full h-11 rounded-xl"
                      type="number"
                      min={1}
                      max={10}
                      value={maxAttemptsInput}
                      onChange={(e) => setMaxAttemptsInput(e.target.value)}
                      onBlur={() => setMaxAttemptsInput(String(maxAttempts))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Due Date (Optional)</label>
                    <Input
                      className="w-full h-11 rounded-xl pr-12 scheme-light [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-100"
                      type="datetime-local"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Writing Type</label>
                    <select
                      className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                      value={rubricType}
                      onChange={(e) => setRubricType(e.target.value as any)}
                    >
                      <option value="">Select writing type</option>
                      <option value="argumentative">Argumentative</option>
                      <option value="explanatory">Explanatory</option>
                      <option value="narrative">Narrative</option>
                      <option value="response">Response to Text</option>
                      <option value="analysis">Analysis</option>
                      <option value="essay">Essay</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Subject Type</label>
                    <select
                      className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                      value={genre}
                      onChange={(e) => setGenre(e.target.value as any)}
                    >
                      <option value="">Select genre</option>
                      <option value="political">Political</option>
                      <option value="geographical">Geographical</option>
                      <option value="personal_experience">Personal Experience</option>
                      <option value="historical">Historical</option>
                      <option value="scientific">Scientific</option>
                      <option value="literary">Literary</option>
                      <option value="social_issue">Social Issue</option>
                      <option value="biographical">Biographical</option>
                      <option value="cultural">Cultural</option>
                      <option value="environmental">Environmental</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Difficulty</label>
                    <select
                      className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as any)}
                    >
                      <option value="">Select difficulty</option>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                      <option value="mixed">Mixed</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 flex justify-between">
                    <span>Number of Writing Prompts</span>
                    <span className="text-primary font-bold">{promptCount}</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={promptCount}
                    onChange={(e) => setPromptCount(parseInt(e.target.value, 10))}
                    className="w-full accent-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Assign to Class (Optional)</label>
                  <select
                    className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                  >
                    <option value="">Do not assign</option>
                    {myClasses.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} (Grade {cls.grade})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 border-t border-border">
                  <button
                    type="button"
                    className="flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    {showAdvanced ? (
                      <ChevronUp className="w-4 h-4 mr-1" />
                    ) : (
                      <ChevronDown className="w-4 h-4 mr-1" />
                    )}
                    Advanced Options (Rubric & Writing Parameters)
                  </button>

                  {showAdvanced && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="space-y-4 mt-4"
                    >
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Min Words</label>
                          <Input
                            className="w-full h-11 rounded-xl"
                            type="number"
                            value={rubricParams.minWords}
                            onChange={(e) =>
                              setRubricParams((p) => ({ ...p, minWords: parseInt(e.target.value || "0", 10) }))
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Max Words</label>
                          <Input
                            className="w-full h-11 rounded-xl"
                            type="number"
                            value={rubricParams.maxWords}
                            onChange={(e) =>
                              setRubricParams((p) => ({ ...p, maxWords: parseInt(e.target.value || "0", 10) }))
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Min Paragraphs</label>
                          <Input
                            className="w-full h-11 rounded-xl"
                            type="number"
                            value={rubricParams.minParagraphs}
                            onChange={(e) =>
                              setRubricParams((p) => ({
                                ...p,
                                minParagraphs: parseInt(e.target.value || "0", 10),
                              }))
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Max Paragraphs</label>
                          <Input
                            className="w-full h-11 rounded-xl"
                            type="number"
                            value={rubricParams.maxParagraphs}
                            onChange={(e) =>
                              setRubricParams((p) => ({
                                ...p,
                                maxParagraphs: parseInt(e.target.value || "0", 10),
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <button
                          type="button"
                          className={`h-11 rounded-xl border px-4 text-sm font-medium transition-colors ${
                            rubricParams.requireThesis
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-input text-foreground"
                          }`}
                          onClick={() => setRubricParams((p) => ({ ...p, requireThesis: !p.requireThesis }))}
                        >
                          Require Thesis Statement
                        </button>
                        <button
                          type="button"
                          className={`h-11 rounded-xl border px-4 text-sm font-medium transition-colors ${
                            rubricParams.requireIntroConclusion
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-input text-foreground"
                          }`}
                          onClick={() =>
                            setRubricParams((p) => ({ ...p, requireIntroConclusion: !p.requireIntroConclusion }))
                          }
                        >
                          Require Intro & Conclusion
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Min Citations</label>
                          <Input
                            className="w-full h-11 rounded-xl"
                            type="number"
                            value={rubricParams.minCitations}
                            onChange={(e) =>
                              setRubricParams((p) => ({ ...p, minCitations: parseInt(e.target.value || "0", 10) }))
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Max Citations</label>
                          <Input
                            className="w-full h-11 rounded-xl"
                            type="number"
                            value={rubricParams.maxCitations}
                            onChange={(e) =>
                              setRubricParams((p) => ({ ...p, maxCitations: parseInt(e.target.value || "0", 10) }))
                            }
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">Additional Instructions</label>
                        <textarea
                          className="w-full rounded-xl border border-input bg-background px-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[90px] resize-y"
                          placeholder="Optional custom rubric guidance for the AI..."
                          value={rubricParams.additionalInstructions || ""}
                          onChange={(e) =>
                            setRubricParams((p) => ({ ...p, additionalInstructions: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Specific Sources for Gemini (Optional)
                        </label>
                        <textarea
                          className="w-full rounded-xl border border-input bg-background px-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[110px] resize-y"
                          placeholder={"Paste source URLs/titles, one per line.\nExample:\nhttps://www.loc.gov/...\nNational Geographic: Water Scarcity"}
                          value={teacherProvidedSourcesInput}
                          onChange={(e) => setTeacherProvidedSourcesInput(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Gemini will prioritize these sources when generating background/context and source cards.
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Max Words per Source Description
                        </label>
                        <Input
                          className="w-full h-11 rounded-xl"
                          type="number"
                          min={40}
                          max={500}
                          value={sourceDescriptionMaxWordsInput}
                          onChange={(e) => setSourceDescriptionMaxWordsInput(e.target.value)}
                          onBlur={() => setSourceDescriptionMaxWordsInput(String(sourceDescriptionMaxWords))}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Limits how long each generated source description can be (40–500 words).
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>

                <Button
                  className="w-full h-12 text-lg mt-4 group"
                  disabled={!canGenerate || isPreparing || generateMutation.isPending}
                  onClick={handleGenerate}
                >
                  {isPreparing ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Preparing topic...
                    </>
                  ) : generateMutation.isPending ? (
                    <>
                      <Sparkles className="w-5 h-5 mr-2 animate-pulse text-yellow-300" /> Gemini AI Generating...
                    </>
                  ) : (
                    <>
                      Generate Writing Activity{" "}
                      <Sparkles className="w-5 h-5 ml-2 group-hover:rotate-12 transition-transform" />
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {generated ? (
                <>
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      <span className="font-medium">
                        Successfully generated {generated.writingPrompts.length} prompts using Gemini AI
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={handleDiscard} disabled={isSaving}>
                        Discard
                      </Button>
                      <Button variant="default" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {isSaving ? "Saving..." : "Save Assessment"} <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </div>

                  <Card className="overflow-hidden border-2 border-primary/10">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-accent" /> Writing Prompts
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Select exactly one prompt to save. You can edit the text, then finalize the selected prompt to generate student-facing background information and sources.
                      </p>
                      <div className="space-y-3">
                        {generated.writingPrompts.map((p, i) => {
                          const isSelected = p.id === selectedPromptId;
                          return (
                            <div
                              key={p.id}
                              className={`rounded-xl border-2 p-4 transition-colors ${
                                isSelected ? "border-primary bg-primary/5" : "border-border bg-white"
                              }`}
                            >
                              <button
                                type="button"
                                className="w-full text-left"
                                onClick={() => {
                                  setSelectedPromptId(p.id);
                                  setFinalizedTopicData((prev) =>
                                    prev && prev.promptText.trim() !== p.text.trim() ? null : prev,
                                  );
                                }}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                                        isSelected ? "border-primary bg-primary text-white" : "border-gray-200 bg-white"
                                      }`}
                                    >
                                      {i + 1}
                                    </span>
                                    <Badge variant="outline" className="bg-white/50">
                                      {p.type}
                                    </Badge>
                                    <Badge variant="outline" className="bg-white/50">
                                      {p.difficulty}
                                    </Badge>
                                    <Badge variant="outline" className="bg-white/50">
                                      {p.skill || "General Skill"}
                                    </Badge>
                                  </div>
                                  <div
                                    className={`text-xs font-semibold ${
                                      isSelected ? "text-primary" : "text-muted-foreground"
                                    }`}
                                  >
                                    {isSelected ? "Selected" : "Select"}
                                  </div>
                                </div>
                              </button>
                              <textarea
                                className="w-full mt-3 rounded-xl border border-border bg-white p-3 text-sm focus:ring-2 focus:ring-primary outline-none resize-y min-h-[120px]"
                                value={p.text}
                                onChange={(e) => {
                                  const text = e.target.value;
                                  if (isSelected) {
                                    setFinalizedTopicData((prev) =>
                                      prev && prev.promptText.trim() !== text.trim() ? null : prev,
                                    );
                                  }
                                  setGenerated((prev) => {
                                    if (!prev) return prev;
                                    return {
                                      ...prev,
                                      writingPrompts: prev.writingPrompts.map((x) =>
                                        x.id === p.id ? { ...x, text } : x,
                                      ),
                                    };
                                  });
                                }}
                              />
                              {isSelected ? (
                                <div className="mt-3 flex justify-end">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-full"
                                    disabled={!p.text.trim() || !grade || !difficulty || !rubricType || finalizeMutation.isPending}
                                    onClick={handleFinalizePrompt}
                                  >
                                    {finalizeMutation.isPending ? (
                                      <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finalizing...
                                      </>
                                    ) : (
                                      <>Finalize Selected Prompt</>
                                    )}
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden border-2 border-primary/10">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-muted-foreground" /> Background Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        This background text will be shared with students before the writing activity. Finalize the selected prompt to replace this with prompt-specific support materials.
                      </p>
                      <textarea
                        className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[180px] resize-y"
                        value={generated.backgroundInformation}
                        onChange={(e) =>
                          {
                            const value = e.target.value;
                            setGenerated((p) => (p ? { ...p, backgroundInformation: value } : p));
                            setFinalizedTopicData((prev) =>
                              prev ? { ...prev, backgroundInformation: value } : prev,
                            );
                          }
                        }
                      />
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden border-2 border-primary/10">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-muted-foreground" /> Sources
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setGenerated((p) =>
                              p
                                ? {
                                    ...p,
                                    sources: [
                                      ...p.sources,
                                      {
                                        title: "",
                                        author: "",
                                        year: "",
                                        description: "",
                                        type: "website",
                                        url: "",
                                      },
                                    ],
                                  }
                                : p,
                            )
                          }
                        >
                          <Plus className="w-4 h-4 mr-2" /> Add Source
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {finalizedTopicData && selectedPrompt && finalizedTopicData.promptText.trim() === selectedPrompt.text.trim() ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800">
                          These sources were generated from the currently selected writing prompt.
                        </div>
                      ) : null}
                      {generated.sources.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No sources generated yet.</div>
                      ) : null}
                      <div className="space-y-3">
                        {generated.sources.map((s, idx) => (
                          <div key={idx} className="rounded-xl border border-border bg-white p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-white/50">
                                  {s.type}
                                </Badge>
                              </div>
                              <button
                                type="button"
                                className="text-red-500 hover:text-red-700"
                                onClick={() =>
                                  setGenerated((p) =>
                                    p ? { ...p, sources: p.sources.filter((_, i) => i !== idx) } : p,
                                  )
                                }
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">
                                  Title
                                </label>
                                <Input
                                  className="w-full h-11 rounded-xl"
                                  value={s.title}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setGenerated((p) => {
                                      if (!p) return p;
                                      const next = [...p.sources];
                                      next[idx] = { ...next[idx], title: v };
                                      setFinalizedTopicData((prev) => {
                                        if (!prev) return prev;
                                        const nextFinalized = [...prev.sources];
                                        nextFinalized[idx] = { ...nextFinalized[idx], title: v };
                                        return { ...prev, sources: nextFinalized };
                                      });
                                      return { ...p, sources: next };
                                    });
                                  }}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">
                                  URL (optional)
                                </label>
                                <Input
                                  className="w-full h-11 rounded-xl"
                                  value={s.url || ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setGenerated((p) => {
                                      if (!p) return p;
                                      const next = [...p.sources];
                                      next[idx] = { ...next[idx], url: v };
                                      setFinalizedTopicData((prev) => {
                                        if (!prev) return prev;
                                        const nextFinalized = [...prev.sources];
                                        nextFinalized[idx] = { ...nextFinalized[idx], url: v };
                                        return { ...prev, sources: nextFinalized };
                                      });
                                      return { ...p, sources: next };
                                    });
                                  }}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">
                                  Author
                                </label>
                                <Input
                                  className="w-full h-11 rounded-xl"
                                  value={s.author || ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setGenerated((p) => {
                                      if (!p) return p;
                                      const next = [...p.sources];
                                      next[idx] = { ...next[idx], author: v };
                                      setFinalizedTopicData((prev) => {
                                        if (!prev) return prev;
                                        const nextFinalized = [...prev.sources];
                                        nextFinalized[idx] = { ...nextFinalized[idx], author: v };
                                        return { ...prev, sources: nextFinalized };
                                      });
                                      return { ...p, sources: next };
                                    });
                                  }}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">
                                  Year
                                </label>
                                <Input
                                  className="w-full h-11 rounded-xl"
                                  value={s.year || ""}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setGenerated((p) => {
                                      if (!p) return p;
                                      const next = [...p.sources];
                                      next[idx] = { ...next[idx], year: v };
                                      setFinalizedTopicData((prev) => {
                                        if (!prev) return prev;
                                        const nextFinalized = [...prev.sources];
                                        nextFinalized[idx] = { ...nextFinalized[idx], year: v };
                                        return { ...prev, sources: nextFinalized };
                                      });
                                      return { ...p, sources: next };
                                    });
                                  }}
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">
                                  Type
                                </label>
                                <select
                                  className="w-full h-11 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none"
                                  value={s.type}
                                  onChange={(e) => {
                                    const v = e.target.value as SourceType;
                                    setGenerated((p) => {
                                      if (!p) return p;
                                      const next = [...p.sources];
                                      next[idx] = { ...next[idx], type: v };
                                      setFinalizedTopicData((prev) => {
                                        if (!prev) return prev;
                                        const nextFinalized = [...prev.sources];
                                        nextFinalized[idx] = { ...nextFinalized[idx], type: v };
                                        return { ...prev, sources: nextFinalized };
                                      });
                                      return { ...p, sources: next };
                                    });
                                  }}
                                >
                                  <option value="article">article</option>
                                  <option value="book">book</option>
                                  <option value="website">website</option>
                                  <option value="primary_source">primary_source</option>
                                  <option value="video">video</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">
                                Description (background context; often long)
                              </label>
                              <textarea
                                className="w-full rounded-xl border border-input bg-background px-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[200px] max-h-[min(50vh,28rem)] resize-y overflow-y-auto"
                                value={s.description}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setGenerated((p) => {
                                    if (!p) return p;
                                    const next = [...p.sources];
                                    next[idx] = { ...next[idx], description: v };
                                    setFinalizedTopicData((prev) => {
                                      if (!prev) return prev;
                                      const nextFinalized = [...prev.sources];
                                      nextFinalized[idx] = { ...nextFinalized[idx], description: v };
                                      return { ...prev, sources: nextFinalized };
                                    });
                                    return { ...p, sources: next };
                                  });
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="overflow-hidden border-2 border-primary/10">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-muted-foreground" /> Rubric
                        </span>
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canEditRubric}
                            onClick={() =>
                              setGenerated((p) => {
                                if (!p) return p;
                                const nextCriteria = [...p.rubric.criteria, newRubricCriterion()];
                                const normalized = normalizeWeightsTo100(nextCriteria);
                                return { ...p, rubric: calcPointsFromWeights({ ...p.rubric, criteria: normalized }) };
                              })
                            }
                          >
                            <Plus className="w-4 h-4 mr-2" /> Add Criterion
                          </Button>
                          <div
                            className={`text-xs font-bold ${
                              weightsOk ? "text-emerald-700" : "text-red-600"
                            }`}
                          >
                            Weights total: {Math.round(weightSum)}%
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setGenerated((p) => {
                                if (!p) return p;
                                const normalized = normalizeWeightsTo100(p.rubric.criteria);
                                return { ...p, rubric: calcPointsFromWeights({ ...p.rubric, criteria: normalized }) };
                              })
                            }
                          >
                            Rebalance Weights
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Dialog
                        open={rubricSplitCriterionIdx !== null}
                        onOpenChange={(open) => {
                          if (!open) setRubricSplitCriterionIdx(null);
                        }}
                      >
                        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto sm:rounded-xl">
                          <DialogHeader>
                            <DialogTitle>
                              Rubric split
                              {rubricSplitCriterionIdx !== null && generated?.rubric.criteria[rubricSplitCriterionIdx] ? (
                                <span className="block text-sm font-normal text-muted-foreground mt-1">
                                  {generated.rubric.criteria[rubricSplitCriterionIdx].name}
                                </span>
                              ) : null}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="grid gap-4 sm:grid-cols-2">
                            {(
                              [
                                { key: "exemplary" as const, label: "Exemplary" },
                                { key: "proficient" as const, label: "Proficient" },
                                { key: "developing" as const, label: "Developing" },
                                { key: "beginning" as const, label: "Beginning" },
                              ] as const
                            ).map(({ key, label }) => (
                              <div key={key} className="space-y-1.5">
                                <label className="text-xs font-bold uppercase text-muted-foreground">{label}</label>
                                <textarea
                                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[100px] resize-y"
                                  value={rubricSplitDraft[key]}
                                  onChange={(e) =>
                                    setRubricSplitDraft((d) => ({ ...d, [key]: e.target.value }))
                                  }
                                />
                              </div>
                            ))}
                          </div>
                          <DialogFooter className="gap-2 sm:gap-0">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setRubricSplitCriterionIdx(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              className="gap-2"
                              onClick={() => {
                                if (rubricSplitCriterionIdx === null) return;
                                const idx = rubricSplitCriterionIdx;
                                setGenerated((p) => {
                                  if (!p) return p;
                                  const nextCriteria = [...p.rubric.criteria];
                                  nextCriteria[idx] = applyLevelDraftToCriterion(nextCriteria[idx], rubricSplitDraft);
                                  return { ...p, rubric: { ...p.rubric, criteria: nextCriteria } };
                                });
                                setRubricSplitCriterionIdx(null);
                              }}
                            >
                              <Check className="w-4 h-4" />
                              Save
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <div className="overflow-x-auto">
                        <table className="min-w-[640px] w-full border-collapse">
                          <thead>
                            <tr className="text-xs uppercase text-muted-foreground">
                              <th className="text-left p-2 border-b min-w-[200px]">Criterion</th>
                              <th className="text-left p-2 border-b w-24">Points</th>
                              <th className="text-left p-2 border-b w-28">Weight %</th>
                              <th className="text-left p-2 border-b w-36">Rubric split</th>
                              <th className="text-left p-2 border-b w-12"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {generated.rubric.criteria.map((c, idx) => (
                              <tr key={c.id} className="align-top">
                                <td className="p-2 border-b">
                                  <Input
                                    className="mb-2 h-9 rounded-xl font-semibold"
                                    value={c.name}
                                    placeholder="Criterion title"
                                    disabled={!canEditRubric}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setGenerated((p) => {
                                        if (!p) return p;
                                        const nextCriteria = [...p.rubric.criteria];
                                        nextCriteria[idx] = { ...nextCriteria[idx], name: v };
                                        return { ...p, rubric: { ...p.rubric, criteria: nextCriteria } };
                                      });
                                    }}
                                  />
                                  <textarea
                                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-muted-foreground focus:ring-2 focus:ring-primary outline-none min-h-[56px] resize-y"
                                    placeholder="Short description (optional)"
                                    value={c.description}
                                    disabled={!canEditRubric}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setGenerated((p) => {
                                        if (!p) return p;
                                        const nextCriteria = [...p.rubric.criteria];
                                        nextCriteria[idx] = { ...nextCriteria[idx], description: v };
                                        return { ...p, rubric: { ...p.rubric, criteria: nextCriteria } };
                                      });
                                    }}
                                  />
                                </td>
                                <td className="p-2 border-b font-semibold">{c.points}</td>
                                <td className="p-2 border-b">
                                  <Input
                                    className="w-24 h-9 rounded-xl"
                                    type="number"
                                    disabled={!canEditRubric}
                                    value={c.weight}
                                    onChange={(e) => {
                                      const v = Number(e.target.value);
                                      setGenerated((p) => {
                                        if (!p) return p;
                                        const nextCriteria = [...p.rubric.criteria];
                                        nextCriteria[idx] = { ...nextCriteria[idx], weight: Number.isFinite(v) ? v : 0 };
                                        return { ...p, rubric: calcPointsFromWeights({ ...p.rubric, criteria: nextCriteria }) };
                                      });
                                    }}
                                  />
                                </td>
                                <td className="p-2 border-b">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl whitespace-nowrap"
                                    disabled={!canEditRubric}
                                    onClick={() => {
                                      setRubricSplitCriterionIdx(idx);
                                      setRubricSplitDraft(criterionLevelsToDraft(c));
                                    }}
                                  >
                                    Rubric split
                                  </Button>
                                </td>
                                <td className="p-2 border-b">
                                  <button
                                    type="button"
                                    className="h-9 w-9 inline-flex items-center justify-center rounded-xl border border-border bg-white text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors disabled:opacity-50"
                                    title="Remove criterion"
                                    disabled={!canEditRubric}
                                    onClick={() => {
                                      setRubricSplitCriterionIdx(null);
                                      setGenerated((p) => {
                                        if (!p) return p;
                                        const nextCriteria = p.rubric.criteria.filter((_, i) => i !== idx);
                                        const normalized = normalizeWeightsTo100(nextCriteria);
                                        return { ...p, rubric: calcPointsFromWeights({ ...p.rubric, criteria: normalized }) };
                                      });
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            <tr>
                              <td className="p-2 font-bold">Total</td>
                              <td className="p-2 font-bold">{generated.rubric.totalPoints}</td>
                              <td className="p-2 font-bold">{Math.round(weightSum)}%</td>
                              <td className="p-2" colSpan={2} />
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                </>
              ) : null}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </DashboardLayout>
  );
}

