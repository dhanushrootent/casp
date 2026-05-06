import React, { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from "@/components/ui";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  Plus,
  Settings2,
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
type RubricType = "" | "essay" | "response";
type WritingGenre = "" | "argumentative" | "explanatory" | "narrative";
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

type RubricLevel = { score: number; label: string; description: string };
type RubricCriterion = {
  id: string;
  name: string;
  description: string;
  weight: number;
  points: number;
  levels: RubricLevel[];
};
type WritingRubric = { totalPoints: number; criteria: RubricCriterion[] };

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

type WritingHighlight = {
  id: string;
  section: "prompt" | "background" | "source";
  start: number;
  end: number;
  text: string;
  sourceIndex?: number;
};

type RubricLevelDraft = {
  exemplary: string;
  proficient: string;
  developing: string;
  beginning: string;
};

// ─── helpers ────────────────────────────────────────────────────────────────

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeWeightsTo100(criteria: RubricCriterion[]): RubricCriterion[] {
  if (!criteria.length) return criteria;
  const raw = criteria.map((c) => (Number.isFinite(c.weight) ? c.weight : 0));
  const sum = raw.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const even = Math.floor(100 / criteria.length);
    const rem = 100 - even * criteria.length;
    return criteria.map((c, i) => ({ ...c, weight: even + (i === 0 ? rem : 0) }));
  }
  const rounded = raw.map((w) => Math.round((w / sum) * 100));
  const delta = 100 - rounded.reduce((a, b) => a + b, 0);
  const maxIdx = rounded.reduce((best, _, i) => (raw[i] > raw[best] ? i : best), 0);
  return criteria.map((c, i) => ({ ...c, weight: rounded[i] + (i === maxIdx ? delta : 0) }));
}

function calcWeightSum(criteria: RubricCriterion[]) {
  return criteria.reduce((s, c) => s + (Number.isFinite(c.weight) ? c.weight : 0), 0);
}

function calcPointsFromWeights(rubric: WritingRubric): WritingRubric {
  const total = Number.isFinite(rubric.totalPoints) ? rubric.totalPoints : 20;
  if (!rubric.criteria?.length) return { ...rubric, totalPoints: total, criteria: [] };
  const weights = rubric.criteria.map((c) => (Number.isFinite(c.weight) ? c.weight : 0));
  const sumW = weights.reduce((a, b) => a + b, 0) || 100;
  const rounded = weights.map((w) => Math.max(0, Math.round((w / sumW) * total)));
  const delta = total - rounded.reduce((a, b) => a + b, 0);
  const maxIdx = weights.reduce((best, _, i) => (weights[i] > weights[best] ? i : best), 0);
  return {
    ...rubric,
    totalPoints: total,
    criteria: rubric.criteria.map((c, i) => ({ ...c, points: rounded[i] + (i === maxIdx ? delta : 0) })),
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

function criterionLevelsToDraft(c: RubricCriterion): RubricLevelDraft {
  const get = (label: string) => c.levels?.find((l) => l.label === label)?.description ?? "";
  return { exemplary: get("Exemplary"), proficient: get("Proficient"), developing: get("Developing"), beginning: get("Beginning") };
}

function applyLevelDraftToCriterion(c: RubricCriterion, draft: RubricLevelDraft): RubricCriterion {
  const pairs: [string, keyof RubricLevelDraft][] = [
    ["Exemplary", "exemplary"], ["Proficient", "proficient"],
    ["Developing", "developing"], ["Beginning", "beginning"],
  ];
  const next = [...(c.levels || [])];
  for (const [label, key] of pairs) {
    const i = next.findIndex((l) => l.label === label);
    if (i >= 0) next[i] = { ...next[i], description: draft[key] };
  }
  return { ...c, levels: next };
}

function parseTeacherProvidedSources(value: string): string[] {
  return value.split(/\n|,/g).map((s) => s.trim()).filter((s) => s.length > 0).slice(0, 12);
}

function toEmbeddableVideoUrl(url?: string): string | null {
  if (!url?.trim()) return null;
  try {
    const p = new URL(url.trim());
    const h = p.hostname.toLowerCase();
    if (h.includes("youtu.be")) {
      const id = p.pathname.split("/").filter(Boolean)[0];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
    if (h.includes("youtube.com")) {
      if (p.pathname.startsWith("/shorts/")) return `https://www.youtube.com/embed/${p.pathname.split("/")[2]}`;
      const id = p.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
    if (h.includes("vimeo.com")) {
      const segs = p.pathname.split("/").filter(Boolean);
      const id = segs[segs.length - 1];
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch { return null; }
}

function isDirectVideoFileUrl(url?: string): boolean {
  if (!url) return false;
  return [".mp4", ".webm", ".ogg", ".mov", ".m3u8"].some((ext) => url.trim().toLowerCase().split("?")[0].endsWith(ext));
}

function renderHighlightedTextInline(
  text: string,
  sectionHighlights: Array<{ start: number; end: number; id: string }>,
  markClassName = "bg-yellow-300 text-inherit rounded-sm px-0.5",
) {
  if (!text) return <span />;
  if (!sectionHighlights.length) return <span className="whitespace-pre-wrap">{text}</span>;
  const sorted = [...sectionHighlights]
    .filter((h) => Number.isFinite(h.start) && Number.isFinite(h.end) && h.end > h.start)
    .sort((a, b) => a.start - b.start);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const h of sorted) {
    const start = Math.max(0, Math.min(text.length, h.start));
    const end = Math.max(0, Math.min(text.length, h.end));
    if (start > cursor) {
      parts.push(<span key={`${h.id}-plain-${cursor}`}>{text.slice(cursor, start)}</span>);
    }
    if (end > start) {
      parts.push(<mark key={`${h.id}-mark`} className={markClassName}>{text.slice(start, end)}</mark>);
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < text.length) {
    parts.push(<span key={`tail-${cursor}`}>{text.slice(cursor)}</span>);
  }
  return <span className="whitespace-pre-wrap">{parts}</span>;
}

// ─── platform libraries ──────────────────────────────────────────────────────

const HISTORY_PLATFORM_LIBRARIES = [
  "American History, 1450–1877",
  "American History, 1877–present",
  "American Government",
  "American Women's History",
  "World History, Prehistory to 1500",
  "World History, 1500 to present",
  "Western Civilization: Prehistory to 1500",
  "Western Civilizations: 1500 to present",
  "Psychology",
  "Texas Government",
] as const;

// ─── small UI helpers ────────────────────────────────────────────────────────

const SELECT_CLS = "w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none";

function SettingSelect({
  label, value, onChange, children,
}: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <select className={SELECT_CLS} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function WritingGenerator() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // ── settings
  const [assessmentType, setAssessmentType] = useState<AssessmentType>("CAASPP");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [rubricType, setRubricType] = useState<RubricType>("");
  const [genre, setGenre] = useState<WritingGenre>("");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");

  // ── topic
  const [topic, setTopic] = useState("");
  const [selectedSuggestedPrompt, setSelectedSuggestedPrompt] = useState("");
  const [finalizedPromptDraft, setFinalizedPromptDraft] = useState("");

  // ── platform library (History/Social Studies only)
  const [selectedLibrary, setSelectedLibrary] = useState<string>("");

  // ── optional / advanced
  const [promptCount, setPromptCount] = useState(3);
  const [manualAssessmentTitle, setManualAssessmentTitle] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [maxAttemptsInput, setMaxAttemptsInput] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [teacherProvidedSourcesInput, setTeacherProvidedSourcesInput] = useState("");
  const [sourceDescriptionMaxWordsInput, setSourceDescriptionMaxWordsInput] = useState("220");
  const [showOptional, setShowOptional] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [rubricParams, setRubricParams] = useState<RubricParams>({
    minWords: 300, maxWords: 700, minParagraphs: 3, maxParagraphs: 6,
    requireThesis: true, requireIntroConclusion: true, minCitations: 0, maxCitations: 2,
    additionalInstructions: "",
  });

  // ── generation state
  const [phase, setPhase] = useState<"input" | "results">("input");
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generated, setGenerated] = useState<WritingGenerateResult | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [finalizedTopicData, setFinalizedTopicData] = useState<FinalizedTopicData | null>(null);
  const [highlights, setHighlights] = useState<WritingHighlight[]>([]);
  const [rubricSplitCriterionIdx, setRubricSplitCriterionIdx] = useState<number | null>(null);
  const [rubricSplitDraft, setRubricSplitDraft] = useState<RubricLevelDraft>({
    exemplary: "", proficient: "", developing: "", beginning: "",
  });
  const sourceCardRefs = React.useRef<Record<number, HTMLDivElement | null>>({});
  const promptTextareaRefs = React.useRef<Record<string, HTMLTextAreaElement | null>>({});
  const backgroundInfoRef = React.useRef<HTMLTextAreaElement | null>(null);
  const sourceDescriptionRefs = React.useRef<Record<number, HTMLTextAreaElement | null>>({});

  const autoResizeTextarea = React.useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const addHighlightFromSelection = React.useCallback(
    (
      section: WritingHighlight["section"],
      textValue: string,
      selectionStart: number | null | undefined,
      selectionEnd: number | null | undefined,
      sourceIndex?: number,
    ) => {
      if (selectionStart == null || selectionEnd == null) return;
      if (selectionEnd <= selectionStart) return;
      const snippet = textValue.slice(selectionStart, selectionEnd).trim();
      if (!snippet) return;
      const id =
        typeof crypto !== "undefined" && typeof (crypto as any).randomUUID === "function"
          ? (crypto as any).randomUUID()
          : `hl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      setHighlights((prev) => [
        ...prev,
        { id, section, start: selectionStart, end: selectionEnd, text: snippet, sourceIndex },
      ]);
      toast({ title: "Highlight added", description: "This highlighted text will be shown to students." });
    },
    [toast],
  );

  const undoLastHighlight = React.useCallback(
    (section: WritingHighlight["section"], sourceIndex?: number) => {
      setHighlights((prev) => {
        const idx = [...prev]
          .map((h, i) => ({ h, i }))
          .filter(({ h }) => h.section === section && (section !== "source" || h.sourceIndex === sourceIndex))
          .map(({ i }) => i)
          .pop();
        if (idx == null) return prev;
        return prev.filter((_, i) => i !== idx);
      });
    },
    [],
  );

  const removeHighlightFromSelection = React.useCallback(
    (
      section: WritingHighlight["section"],
      textValue: string,
      selectionStart: number | null | undefined,
      selectionEnd: number | null | undefined,
      sourceIndex?: number,
    ) => {
      if (selectionStart == null || selectionEnd == null) return;
      if (selectionEnd <= selectionStart) return;
      const selStart = selectionStart;
      const selEnd = selectionEnd;
      let removedAny = false;
      setHighlights((prev) =>
        prev.flatMap((h) => {
          const sameSection = h.section === section && (section !== "source" || h.sourceIndex === sourceIndex);
          if (!sameSection) return [h];
          const overlapStart = Math.max(h.start, selStart);
          const overlapEnd = Math.min(h.end, selEnd);
          if (overlapEnd <= overlapStart) return [h];
          removedAny = true;
          const next: WritingHighlight[] = [];
          if (h.start < selStart) {
            const beforeStart = h.start;
            const beforeEnd = selStart;
            const beforeText = textValue.slice(beforeStart, beforeEnd).trim();
            if (beforeText) {
              next.push({
                ...h,
                id: `${h.id}-a-${beforeStart}-${beforeEnd}`,
                start: beforeStart,
                end: beforeEnd,
                text: beforeText,
              });
            }
          }
          if (h.end > selEnd) {
            const afterStart = selEnd;
            const afterEnd = h.end;
            const afterText = textValue.slice(afterStart, afterEnd).trim();
            if (afterText) {
              next.push({
                ...h,
                id: `${h.id}-b-${afterStart}-${afterEnd}`,
                start: afterStart,
                end: afterEnd,
                text: afterText,
              });
            }
          }
          return next;
        }),
      );
      if (removedAny) {
        toast({ title: "Highlight removed", description: "Selected text was unhighlighted." });
      }
    },
    [toast],
  );

  // ── mutations
  const generateMutation = useGenerateWritingActivity();
  const suggestPromptsMutation = useGenerateWritingActivity();
  const finalizeMutation = useFinalizeWritingTopic();
  const suggestTopicsMutation = useSuggestWritingTopics();
  const createAssessmentMutation = useCreateAssessment();
  const addQuestionMutation = useAddQuestionToAssessment();
  const { data: classes } = useListClasses();

  const suggestPromptsMutateRef = React.useRef(suggestPromptsMutation.mutate);
  suggestPromptsMutateRef.current = suggestPromptsMutation.mutate;
  const suggestTopicsMutateRef = React.useRef(suggestTopicsMutation.mutate);
  suggestTopicsMutateRef.current = suggestTopicsMutation.mutate;
  const skipNextTopicPromptSuggestionRef = React.useRef(false);

  const myClasses = useMemo(() => classes?.filter((c) => c.teacherId === user?.id) || [], [classes, user?.id]);
  const maxAttempts = clampInt(parseInt(maxAttemptsInput || "1", 10), 1, 10);
  const sourceDescriptionMaxWords = clampInt(parseInt(sourceDescriptionMaxWordsInput || "220", 10), 40, 500);
  const teacherProvidedSources = useMemo(() => parseTeacherProvidedSources(teacherProvidedSourcesInput), [teacherProvidedSourcesInput]);

  const canSuggestTopics = Boolean(subject && grade);
  const canSuggestPrompts = topic.trim().length >= 3;
  const hasPromptCandidate = Boolean(finalizedPromptDraft.trim() || selectedSuggestedPrompt.trim() || suggestedPrompts.length > 0 || topic.trim().length > 0);
  const finalizedPromptPreview = selectedSuggestedPrompt.trim() || topic.trim();
  const canGenerate = Boolean(hasPromptCandidate && assessmentType && subject && grade && difficulty && rubricType && genre);

  const missingFields = useMemo(() => {
    const m: string[] = [];
    if (!subject) m.push("Subject");
    if (!grade) m.push("Grade");
    if (!rubricType) m.push("Writing Type");
    if (!genre) m.push("Genre");
    if (!hasPromptCandidate) m.push("Prompt suggestion");
    return m;
  }, [genre, grade, hasPromptCandidate, rubricType, subject]);

  const requestPromptSuggestions = React.useCallback(
    (seedTopic?: string) => {
      const effectiveSubject =
        selectedLibrary && subject === "History/Social Studies"
          ? `${subject} — ${selectedLibrary}`
          : (subject || "English Language Arts");
      const fallbackTopic =
        selectedLibrary ||
        (canSuggestTopics ? `${subject} Grade ${grade} ${genre || "writing"} prompt` : "");
      const promptTopic = (seedTopic || topic).trim() || fallbackTopic.trim();
      if (!promptTopic) return;

        suggestPromptsMutateRef.current(
          {
            data: {
            topic: promptTopic,
            grade: grade || "8",
            subject: effectiveSubject,
            assessmentType: (assessmentType || "CAASPP") as any,
            difficulty: (difficulty || "easy") as any,
              promptCount,
            rubricType: (rubricType || "essay") as any,
            genre: (genre || "explanatory") as any,
              rubricParams: {
                ...rubricParams,
                minWords: clampInt(rubricParams.minWords, 0, 2000),
                maxWords: clampInt(rubricParams.maxWords, 0, 5000),
                minParagraphs: clampInt(rubricParams.minParagraphs, 0, 20),
                maxParagraphs: clampInt(rubricParams.maxParagraphs, 0, 50),
                minCitations: clampInt(rubricParams.minCitations, 0, 20),
                maxCitations: clampInt(rubricParams.maxCitations, 0, 50),
              },
            } as any,
          },
          {
          onSuccess: (d) => {
            const prompts = Array.isArray((d as any)?.writingPrompts)
              ? (d as any).writingPrompts
                  .map((p: any) => String(p?.text ?? "").trim())
                  .filter((p: string) => p.length > 0)
                  .slice(0, Math.max(1, Math.min(5, promptCount)))
                : [];
              setSuggestedPrompts(prompts);
            },
          onError: () => setSuggestedPrompts([]),
        },
      );
    },
    [
      assessmentType,
      canSuggestTopics,
      difficulty,
      genre,
      grade,
      promptCount,
      rubricParams,
      rubricType,
      selectedLibrary,
      subject,
      topic,
    ],
  );

  // Keep the visible suggested prompts aligned with the slider value.
  useEffect(() => {
    setSuggestedPrompts((prev) => prev.slice(0, Math.max(1, Math.min(5, promptCount))));
  }, [promptCount]);

  // ── effects: suggest topics when settings complete (no topic typed)
  useEffect(() => {
    if (phase !== "input" || topic.trim().length > 0) return;
    if (!canSuggestTopics) { setSuggestedTopics([]); return; }
    const libraryPrefix = selectedLibrary ? `[Platform Library: ${selectedLibrary}] ` : "";
    const t = window.setTimeout(() => {
      suggestTopicsMutateRef.current(
        {
          data: {
            grade,
            subject: libraryPrefix ? `${subject} — ${selectedLibrary}` : subject,
            assessmentType: (assessmentType || "CAASPP") as any,
            difficulty: (difficulty || "easy") as any,
            rubricType: (rubricType || "essay") as any,
            genre: (genre || "explanatory") as any,
          },
        },
        { onSuccess: (d) => setSuggestedTopics(Array.isArray((d as any)?.suggestions) ? (d as any).suggestions : []), onError: () => setSuggestedTopics([]) },
      );
    }, 350);
    return () => window.clearTimeout(t);
  }, [assessmentType, canSuggestTopics, difficulty, grade, phase, selectedLibrary, subject, topic]);

  // ── effects: suggest prompts when topic typed
  useEffect(() => {
    if (phase !== "input" || !canSuggestPrompts) { return; }
    if (skipNextTopicPromptSuggestionRef.current) {
      skipNextTopicPromptSuggestionRef.current = false;
      return;
    }
    setSuggestedTopics([]);
    const t = window.setTimeout(() => {
      requestPromptSuggestions(topic.trim());
    }, 300);
    return () => window.clearTimeout(t);
  }, [canSuggestPrompts, phase, requestPromptSuggestions, topic]);

  // ── suggest prompts from settings changes (even before typing)
  useEffect(() => {
    if (phase !== "input" || !canSuggestTopics) return;
    if (topic.trim().length > 0) return;
    const t = window.setTimeout(() => {
      requestPromptSuggestions();
    }, 250);
    return () => window.clearTimeout(t);
  }, [assessmentType, canSuggestTopics, difficulty, genre, grade, phase, requestPromptSuggestions, rubricType, subject, topic]);

  useEffect(() => {
    setFinalizedPromptDraft(finalizedPromptPreview);
  }, [finalizedPromptPreview]);

  // ── auto-finalize when prompt is selected in results
  const autoFinalize = React.useCallback(async (promptText: string) => {
    if (!promptText.trim() || !grade || !difficulty || !rubricType) return;
    try {
      const data = await finalizeMutation.mutateAsync({
        data: {
          topic: promptText,
          promptText,
    grade,
          subject: subject || undefined,
          assessmentType: assessmentType || undefined,
          difficulty: difficulty as any,
    rubricType,
          genre,
          teacherProvidedSources: teacherProvidedSources.length > 0 ? teacherProvidedSources : undefined,
          sourceDescriptionMaxWords,
        } as any,
      });
      const finalized = {
        promptText,
        backgroundInformation: (data as any).backgroundInformation || "",
        sources: Array.isArray((data as any).sources) ? (data as any).sources : [],
      };
      setFinalizedTopicData(finalized);
      setGenerated((prev) => prev ? { ...prev, backgroundInformation: finalized.backgroundInformation, sources: finalized.sources } : prev);
    } catch {
      // silent — user can retry via button
    }
  }, [assessmentType, difficulty, finalizeMutation, genre, grade, rubricType, sourceDescriptionMaxWords, subject, teacherProvidedSources]);

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setIsPreparing(true);
    try { await new Promise((r) => setTimeout(r, 450)); } finally { setIsPreparing(false); }

    const effectiveSubjectForGenerate = selectedLibrary && subject === "History/Social Studies"
      ? `${subject} — ${selectedLibrary}`
      : subject;
    const chosenPromptText = finalizedPromptDraft.trim() || selectedSuggestedPrompt.trim() || suggestedPrompts[0]?.trim() || topic.trim();
    if (!chosenPromptText) {
      toast({
        variant: "destructive",
        title: "No prompt selected",
        description: "Select or generate a writing prompt before creating the activity.",
      });
      setIsPreparing(false);
      return;
    }

    generateMutation.mutate(
      {
        data: {
          topic: chosenPromptText, grade, subject: effectiveSubjectForGenerate,
          assessmentType: assessmentType as any,
          difficulty: difficulty as any,
          promptCount: 1,
          rubricType, genre,
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
          metadata: { assessmentTitle: manualAssessmentTitle || undefined },
          teacherProvidedSources: teacherProvidedSources.length > 0 ? teacherProvidedSources : undefined,
          sourceDescriptionMaxWords,
        } as any,
      },
      {
        onSuccess: (data) => {
          const normalizedRubric = calcPointsFromWeights(data.rubric as any);
          const generatedPrompts = Array.isArray((data as any).writingPrompts) ? (data as any).writingPrompts : [];
          const template = generatedPrompts[0];
          const prompts: WritingPrompt[] = [{
            id: `selected-${Date.now()}`,
            text: chosenPromptText,
                type: template?.type || rubricType || "Essay",
                skill: template?.skill || "Focused analysis",
                difficulty: template?.difficulty || (difficulty ? difficulty[0].toUpperCase() + difficulty.slice(1) : "Medium"),
          }];
          const next: WritingGenerateResult = { ...(data as any), writingPrompts: prompts, rubric: normalizedRubric as any };
          setGenerated(next);
          const firstId = next.writingPrompts?.[0]?.id || "";
          setSelectedPromptId(firstId);
          setFinalizedTopicData(null);
          setHighlights([]);
          setPhase("results");
        },
        onError: (err) => {
          console.error(err);
          toast({ variant: "destructive", title: "Generation Failed", description: "There was a problem generating the writing activity." });
        },
      },
    );
  };

  const handleDiscard = () => { setGenerated(null); setSelectedPromptId(""); setFinalizedTopicData(null); setHighlights([]); setPhase("input"); };

  const selectedPrompt = useMemo(
    () => (generated ? generated.writingPrompts.find((p) => p.id === selectedPromptId) || null : null),
    [generated, selectedPromptId],
  );

  const handleSave = async () => {
    if (!generated || !user || !selectedPrompt) {
      toast({ variant: "destructive", title: "Select a prompt", description: "Please select a writing prompt before saving." });
      return;
    }
    setIsSaving(true);
    try {
      const sourceSetToPersist = finalizedTopicData?.promptText.trim() === selectedPrompt.text.trim() ? finalizedTopicData!.sources : generated.sources;
      const bgToPersist = finalizedTopicData?.promptText.trim() === selectedPrompt.text.trim() ? finalizedTopicData!.backgroundInformation : generated.backgroundInformation;

      const newAssessment = await createAssessmentMutation.mutateAsync({
        data: { title: generated.assessmentTitle, type: assessmentType as any, subject, grade, duration: 60, difficulty, classId: selectedClassId || undefined, description: generated.summary } as any,
      });
      await addQuestionMutation.mutateAsync({
        assessmentId: newAssessment.id,
        data: {
          text: selectedPrompt.text, type: "essay", options: [], correctAnswer: "",
          explanation: JSON.stringify({ kind: "writing_activity_v1", writingPromptId: selectedPrompt.id, backgroundInformation: bgToPersist || "", sources: sourceSetToPersist || [], rubric: generated.rubric, rubricParams, topic, maxAttempts, dueDate: dueDate || null, teacherProvidedSources, sourceDescriptionMaxWords, highlights }),
          audioScript: null, skill: selectedPrompt.skill || null,
          points: generated.rubric.totalPoints || 20,
          difficulty: difficulty === "mixed" ? "medium" : difficulty as any,
          orderIndex: 0,
        } as any,
      });
      toast({ title: "Assessment Saved!", description: "Your writing activity has been saved." });
      setLocation("/teacher/assessments");
    } catch {
      toast({ variant: "destructive", title: "Save Failed", description: "There was a problem saving. Please try again." });
      setIsSaving(false);
    }
  };

  const weightSum = generated ? calcWeightSum(generated.rubric.criteria) : 0;
  const weightsOk = Math.round(weightSum) === 100;

  const triggerTopicSuggestions = (overrides: { rubricType?: RubricType; genre?: WritingGenre } = {}) => {
    if (topic.trim().length > 0 || !subject || !grade) return;
    const rt = overrides.rubricType ?? rubricType;
    const g = overrides.genre ?? genre;
    suggestTopicsMutateRef.current(
      { data: { grade, subject, assessmentType: (assessmentType || "CAASPP") as any, difficulty: (difficulty || "easy") as any, rubricType: (rt || "essay") as any, genre: (g || "explanatory") as any } },
      { onSuccess: (d) => setSuggestedTopics(Array.isArray((d as any)?.suggestions) ? (d as any).suggestions : []), onError: () => setSuggestedTopics([]) },
    );
  };

  const isSuggestingTopics = suggestTopicsMutation.isPending;
  const isSuggestingPrompts = suggestPromptsMutation.isPending;
  const isGenerating = generateMutation.isPending || isPreparing;
  const isFinalizing = finalizeMutation.isPending;

  useEffect(() => {
    autoResizeTextarea(backgroundInfoRef.current);
    Object.values(sourceDescriptionRefs.current).forEach((el) => autoResizeTextarea(el));
  }, [autoResizeTextarea, generated?.backgroundInformation, generated?.sources]);

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="w-auto space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              Writing Activity Generator <Sparkles className="w-5 h-5 text-accent" />
          </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Pick your settings, type a topic, and let AI do the rest.
          </p>
        </div>
          <div className="flex items-start gap-3">
            {phase === "input" && (
              <div className="w-[340px] max-w-[42vw]">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">
                  Assessment Title (optional)
                </label>
                <Input
                  className="h-11 rounded-xl"
                  placeholder="e.g. Civil War Writing Task"
                  value={manualAssessmentTitle}
                  onChange={(e) => setManualAssessmentTitle(e.target.value)}
                />
                </div>
            )}
            {phase === "results" && (
              <Button variant="outline" size="sm" onClick={handleDiscard} className="gap-2">
                <ArrowLeft className="w-4 h-4" /> New Activity
              </Button>
            )}
                  </div>
                </div>

        {/* ── INPUT PHASE ── */}
        {phase === "input" && (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

              {/* ── Settings bar ── */}
            <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-muted-foreground" /> Writing Settings
                  </CardTitle>
              </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <SettingSelect label="Subject" value={subject} onChange={(v) => { setSubject(v); if (v !== "History/Social Studies") setSelectedLibrary(""); }}>
                      <option value="" disabled hidden>Select subject</option>
                      <option value="English Language Arts">English Language Arts</option>
                      <option value="Mathematics">Mathematics</option>
                      <option value="Science">Science</option>
                      <option value="Listening/Speaking">Listening/Speaking</option>
                      <option value="History/Social Studies">History/Social Studies</option>
                    </SettingSelect>

                    <SettingSelect label="Grade" value={grade} onChange={setGrade}>
                      <option value="">Select grade</option>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <option key={i + 3} value={String(i + 3)}>Grade {i + 3}</option>
                      ))}
                    </SettingSelect>

                    <SettingSelect label="Writing Type" value={rubricType} onChange={(v) => {
                      setRubricType(v as RubricType);
                      triggerTopicSuggestions({ rubricType: v as RubricType });
                    }}>
                      <option value="">Select type</option>
                      <option value="response">Response</option>
                      <option value="essay">Essay</option>
                    </SettingSelect>

                    <SettingSelect label="Genre" value={genre} onChange={(v) => {
                      setGenre(v as WritingGenre);
                      triggerTopicSuggestions({ genre: v as WritingGenre });
                    }}>
                      <option value="">Select genre</option>
                      <option value="argumentative">Argumentative</option>
                      <option value="explanatory">Explanatory</option>
                      <option value="narrative">Narrative</option>
                    </SettingSelect>

                    <SettingSelect label="Difficulty" value={difficulty} onChange={(v) => setDifficulty(v as Difficulty)}>
                      <option value="">Select difficulty</option>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                      <option value="mixed">Mixed</option>
                    </SettingSelect>

                    <SettingSelect label="Assessment Type" value={assessmentType} onChange={(v) => setAssessmentType(v as AssessmentType)}>
                      <option value="">Select type</option>
                      <option value="CAASPP">CAASPP</option>
                      <option value="ELPAC">ELPAC</option>
                    </SettingSelect>
                </div>

                  {/* Number of prompts */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Number of Prompts</span>
                      <span className="text-sm font-bold text-primary">{promptCount}</span>
                    </div>
                    <input type="range" min="1" max="5" value={promptCount} onChange={(e) => setPromptCount(parseInt(e.target.value, 10))} className="w-full accent-primary h-1.5" />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                      {[1, 2, 3, 4, 5].map((n) => <span key={n}>{n}</span>)}
                    </div>
                </div>

                  {/* Optional settings accordion */}
                  <div className="border-t pt-3">
                    <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowOptional(!showOptional)}>
                      {showOptional ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      Assignment Options (class, due date, title)
                    </button>
                    {showOptional && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="grid grid-cols-2 gap-3 mt-3">
                <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Assign to Class</span>
                          <select className={SELECT_CLS} value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
                    <option value="">Do not assign</option>
                            {myClasses.map((cls) => <option key={cls.id} value={cls.id}>{cls.name} (Grade {cls.grade})</option>)}
                  </select>
                </div>
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Max Attempts</span>
                          <Input className="h-10 rounded-xl" type="number" min={1} max={10} value={maxAttemptsInput} onChange={(e) => setMaxAttemptsInput(e.target.value)} onBlur={() => setMaxAttemptsInput(String(maxAttempts))} />
                        </div>
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Due Date (optional)</span>
                          <Input className="h-10 rounded-xl" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                        </div>
                      </motion.div>
                    )}
                      </div>

                  {/* Advanced accordion */}
                  <div className="border-t pt-3">
                    <button type="button" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setShowAdvanced(!showAdvanced)}>
                      {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      Advanced (rubric params, custom sources)
                    </button>
                    {showAdvanced && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-3 mt-3">
                        <div className="grid grid-cols-2 gap-3">
                          {([["Min Words", "minWords"], ["Max Words", "maxWords"], ["Min Paragraphs", "minParagraphs"], ["Max Paragraphs", "maxParagraphs"], ["Min Citations", "minCitations"], ["Max Citations", "maxCitations"]] as const).map(([label, key]) => (
                            <div key={key}>
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">{label}</span>
                              <Input className="h-10 rounded-xl" type="number" value={rubricParams[key]} onChange={(e) => setRubricParams((p) => ({ ...p, [key]: parseInt(e.target.value || "0", 10) }))} />
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {([["requireThesis", "Require Thesis Statement"], ["requireIntroConclusion", "Require Intro & Conclusion"]] as const).map(([key, label]) => (
                            <button key={key} type="button"
                              className={`h-10 rounded-xl border px-3 text-sm font-medium transition-colors ${rubricParams[key] ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input"}`}
                              onClick={() => setRubricParams((p) => ({ ...p, [key]: !p[key] }))}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Additional Instructions</span>
                          <textarea className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[80px] resize-y" placeholder="Optional custom rubric guidance..." value={rubricParams.additionalInstructions || ""} onChange={(e) => setRubricParams((p) => ({ ...p, additionalInstructions: e.target.value }))} />
                        </div>
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground block mb-1">Max Words per Source Description</span>
                          <Input className="h-10 rounded-xl" type="number" min={40} max={500} value={sourceDescriptionMaxWordsInput} onChange={(e) => setSourceDescriptionMaxWordsInput(e.target.value)} onBlur={() => setSourceDescriptionMaxWordsInput(String(sourceDescriptionMaxWords))} />
                        </div>
                      </motion.div>
                    )}
                      </div>
                </CardContent>
              </Card>

              {/* ── Platform Libraries (History/Social Studies only) ── */}
              {subject === "History/Social Studies" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.25 }}
                >
                  <Card className="border-2 border-amber-200 bg-amber-50/40">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-amber-600" />
                        Platform Libraries
                        <span className="text-xs font-normal text-muted-foreground ml-1">— pick a library to focus topic suggestions</span>
                        {selectedLibrary && (
                        <button
                          type="button"
                            className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                            onClick={() => { setSelectedLibrary(""); setTopic(""); setSuggestedTopics([]); setSuggestedPrompts([]); setSelectedSuggestedPrompt(""); }}
                          >
                            <X className="w-3 h-3" /> Clear
                        </button>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {HISTORY_PLATFORM_LIBRARIES.map((lib) => {
                          const isChosen = selectedLibrary === lib;
                          return (
                        <button
                              key={lib}
                          type="button"
                              onClick={() => {
                                const next = isChosen ? "" : lib;
                                setSelectedLibrary(next);
                                setSuggestedTopics([]);
                                setSuggestedPrompts([]);
                                setSelectedSuggestedPrompt("");

                                if (!next) {
                                  setTopic("");
                                  return;
                                }

                                // Put the library name directly in the topic box
                                setTopic(next);

                                const effectiveSubject = `${subject} — ${next}`;

                                // Also fetch topic suggestions for this platform library context.
                                suggestTopicsMutateRef.current(
                                  {
                                    data: {
                                      grade: grade || "8",
                                      subject: effectiveSubject,
                                      assessmentType: (assessmentType || "CAASPP") as any,
                                      difficulty: (difficulty || "easy") as any,
                                      rubricType: (rubricType || "essay") as any,
                                      genre: (genre || "explanatory") as any,
                                    },
                                  },
                                  {
                                    onSuccess: (d) => setSuggestedTopics(Array.isArray((d as any)?.suggestions) ? (d as any).suggestions : []),
                                    onError: () => setSuggestedTopics([]),
                                  },
                                );

                                // Suggest writing prompts based on library as topic.
                                suggestPromptsMutateRef.current(
                                  {
                                    data: {
                                      topic: next,
                                      grade: grade || "8",
                                      subject: effectiveSubject,
                                      assessmentType: (assessmentType || "CAASPP") as any,
                                      difficulty: (difficulty || "easy") as any,
                                      promptCount,
                                      rubricType: (rubricType || "essay") as any,
                                      genre: (genre || "explanatory") as any,
                                      rubricParams: {
                                        ...rubricParams,
                                        minWords: clampInt(rubricParams.minWords, 0, 2000),
                                        maxWords: clampInt(rubricParams.maxWords, 0, 5000),
                                        minParagraphs: clampInt(rubricParams.minParagraphs, 0, 20),
                                        maxParagraphs: clampInt(rubricParams.maxParagraphs, 0, 50),
                                        minCitations: clampInt(rubricParams.minCitations, 0, 20),
                                        maxCitations: clampInt(rubricParams.maxCitations, 0, 50),
                                      },
                                    } as any,
                                  },
                                  {
                                    onSuccess: (d) => {
                                      const prompts = Array.isArray((d as any)?.writingPrompts)
                                        ? (d as any).writingPrompts
                                            .map((p: any) => String(p?.text ?? "").trim())
                                            .filter((p: string) => p.length > 0)
                                            .slice(0, Math.max(1, Math.min(5, promptCount)))
                                        : [];
                                      setSuggestedPrompts(prompts);
                                    },
                                    onError: () => {
                                      setSuggestedPrompts([]);
                                      toast({
                                        variant: "destructive",
                                        title: "Prompt suggestions unavailable",
                                        description: "Gemini couldn't return prompts for this library right now. Please try another library or topic.",
                                      });
                                    },
                                  },
                                );
                              }}
                              className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-all ${
                                isChosen
                                  ? "bg-amber-600 text-white border-amber-600 shadow-sm"
                                  : "bg-white text-amber-800 border-amber-200 hover:bg-amber-100 hover:border-amber-400"
                              }`}
                            >
                              {isChosen && <Check className="w-3 h-3 inline mr-1.5 -mt-0.5" />}
                              {lib}
                        </button>
                          );
                        })}
                      </div>
                      {selectedLibrary && (
                        <p className="mt-3 text-xs text-amber-700 bg-amber-100 rounded-lg px-3 py-1.5">
                          Topics and prompts will be focused on <strong>{selectedLibrary}</strong>. Type a topic below or use the AI suggestions.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* ── Topic card ── */}
              <Card className="border-2 border-primary/20 bg-primary/3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary/70" /> Topic / Text
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(isSuggestingTopics || isSuggestingPrompts || isFinalizing) ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                          <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-blue-900 leading-tight">
                            AI is working…
                          </div>
                          <div className="text-sm text-blue-900/80 mt-0.5">
                            {isFinalizing
                              ? "Generating background information and sources for the selected prompt."
                              : "Thinking through suggestions based on your topic and settings."}
                          </div>
                          <div className="text-xs text-blue-900/70 mt-1">
                            Please don’t navigate away while this is running.
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <textarea
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[160px] resize-y"
                    placeholder='e.g. "The causes of World War I", "To Kill a Mockingbird Ch. 5–8", "The water cycle and climate change"'
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground -mt-1">
                    <span>{topic.length} characters</span>
                    <span>More detail → better AI output</span>
                        </div>

                  {/* Suggestions */}
                  <div className="rounded-xl border border-primary/10 bg-white/60 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary/70">
                        Suggested Writing Prompts
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-full px-2.5 text-xs"
                          onClick={() => requestPromptSuggestions()}
                        >
                          Regenerate Writing Prompts
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {suggestedPrompts.length > 0 ? suggestedPrompts.map((s, i) => {
                        const chosen = selectedSuggestedPrompt === s;
                        return (
                          <button key={i} type="button"
                            className={`rounded-xl border-2 px-3 py-2 text-xs font-medium text-left w-full transition-colors ${chosen ? "border-primary bg-primary/10 text-primary" : "border-primary/20 bg-primary/5 text-primary hover:bg-primary/10"}`}
                            onClick={() => {
                              skipNextTopicPromptSuggestionRef.current = true;
                              setSelectedSuggestedPrompt((prev) => prev === s ? "" : s);
                              setTopic(s);
                            }}>
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${chosen ? "border-primary bg-primary" : "border-primary/30"}`}>
                                {chosen && <Check className="w-2.5 h-2.5 text-white" />}
                              </span>
                              {s}
                            </div>
                          </button>
                        );
                      }) : (
                        <span className="text-xs text-muted-foreground">
                          {isSuggestingPrompts ? "Waiting for Gemini…" : "No prompt suggestions yet. Click regenerate or adjust settings."}
                        </span>
                      )}
                        </div>
                      </div>

                  {finalizedPromptPreview ? (
                    <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary/80">
                          Finalize
                        </span>
                        <Badge variant="outline" className="text-[10px]">Selected Prompt</Badge>
                      </div>
                      <textarea
                        className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[110px] resize-y"
                        value={finalizedPromptDraft}
                        onChange={(e) => setFinalizedPromptDraft(e.target.value)}
                        placeholder="Edit the final prompt before creating the writing activity"
                      />
                      </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* ── Generate CTA ── */}
              <div className="space-y-2">
                {isGenerating ? (
                  <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-950/50" />
                    <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl p-6">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xl font-display font-bold text-foreground">
                            Please wait while AI does the magic
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground leading-relaxed">
                            Until then, please sit back and relax.
                          </div>
                          <div className="mt-3 text-xs text-muted-foreground">
                            This can take a few seconds. Please don’t close or refresh this page.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                {missingFields.length > 0 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Still needed: <span className="font-medium text-foreground">{missingFields.join(", ")}</span>
                  </p>
                )}
                <Button
                  className="w-full h-13 text-base gap-2 group"
                  disabled={!canGenerate || isGenerating}
                  onClick={handleGenerate}
                >
                  {isPreparing ? (<><Loader2 className="w-5 h-5 animate-spin" /> Preparing…</>) :
                    isGenerating ? (<><Sparkles className="w-5 h-5 animate-pulse text-yellow-300" /> AI Generating…</>) :
                      (<><Sparkles className="w-5 h-5 group-hover:rotate-12 transition-transform" /> Create Writing Activity</>)}
                </Button>
          </div>
            </motion.div>
          </AnimatePresence>
        )}

        {/* ── RESULTS PHASE ── */}
        {phase === "results" && generated && (
          <AnimatePresence>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

              {/* Success banner */}
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-medium">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                Generated {generated.writingPrompts.length} writing prompt{generated.writingPrompts.length > 1 ? "s" : ""}.
                {isFinalizing && (
                  <span className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-blue-800 bg-blue-50 border border-blue-200 rounded-full px-3 py-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating background & sources…
                  </span>
                )}
                  </div>

              {selectedPrompt && (
                <Card className="border-2 border-primary/20 bg-primary/3">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between gap-2">
                      <span>Finalized Prompt</span>
                      <Badge variant="outline" className="text-[13px]">
                        {finalizedTopicData && finalizedTopicData.promptText.trim() === selectedPrompt.text.trim()
                          ? "Background + Sources Generated"
                          : "Pending Background + Sources"}
                      </Badge>
                      </CardTitle>
                    </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 whitespace-pre-wrap">{selectedPrompt.text}</p>
                  </CardContent>
                </Card>
              )}

              {/* Prompts */}
              <Card className="border-2 border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent" /> Writing Prompt
                    <span className="text-xm font-normal text-muted-foreground ml-1">— Edit the writing prompt if needed</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                        {generated.writingPrompts.map((p, i) => {
                          const isSelected = p.id === selectedPromptId;
                          return (
                      <div key={p.id} className={`rounded-xl border-2 transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border bg-white"}`}>
                        {/* Prompt header – click to select */}
                        <button type="button" className="w-full text-left px-4 pt-3 pb-2" onClick={() => {
                          if (selectedPromptId !== p.id) {
                            setHighlights([]);
                          }
                                  setSelectedPromptId(p.id);
                          setFinalizedTopicData((prev) => (prev && prev.promptText.trim() !== p.text.trim() ? null : prev));
                        }}>
                                  <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${isSelected ? "border-primary bg-primary text-white" : "border-gray-200"}`}>{i + 1}</span>
                            <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
                            <Badge variant="outline" className="text-[10px]">{p.difficulty}</Badge>
                            <Badge variant="outline" className="text-[10px]">{p.skill || "General"}</Badge>
                            <span className={`ml-auto text-xs font-semibold ${isSelected ? "text-primary" : "text-muted-foreground"}`}>{isSelected ? "Selected ✓" : "Select"}</span>
                                </div>
                              </button>
                        {/* Editable textarea */}
                        <div className="px-4 pb-4">
                              <textarea
                            ref={(el) => {
                              promptTextareaRefs.current[p.id] = el;
                              autoResizeTextarea(el);
                            }}
                            className="w-full rounded-xl border border-border bg-white p-3 text-sm focus:ring-2 focus:ring-primary outline-none resize-none min-h-[100px] overflow-hidden"
                                value={p.text}
                            onInput={(e) => autoResizeTextarea(e.currentTarget)}
                                onChange={(e) => {
                                  const text = e.target.value;
                              if (isSelected) setFinalizedTopicData((prev) => (prev && prev.promptText.trim() !== text.trim() ? null : prev));
                              setGenerated((prev) => prev ? { ...prev, writingPrompts: prev.writingPrompts.map((x) => x.id === p.id ? { ...x, text } : x) } : prev);
                            }}
                          />
                          {isSelected && (
                            <div className="flex justify-end mt-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                className="rounded-full gap-1.5 mr-2"
                                onClick={() => {
                                  const el = promptTextareaRefs.current[p.id];
                                  addHighlightFromSelection("prompt", p.text, el?.selectionStart, el?.selectionEnd);
                                }}
                              >
                                Highlight Selected Text
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full gap-1.5 mr-2"
                                onClick={() => undoLastHighlight("prompt")}
                              >
                                Undo Highlight
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full gap-1.5 mr-2"
                                onClick={() => {
                                  const el = promptTextareaRefs.current[p.id];
                                  removeHighlightFromSelection("prompt", p.text, el?.selectionStart, el?.selectionEnd);
                                }}
                              >
                                Unhighlight Selected Text
                              </Button>
                              <Button variant="outline" size="sm" className="rounded-full gap-1.5" disabled={!p.text.trim() || isFinalizing} onClick={() => autoFinalize(p.text)}>
                                {isFinalizing ? (
                                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Finalizing…</>
                                ) : finalizedTopicData && finalizedTopicData.promptText.trim() === p.text.trim() ? (
                                  "↻ Regenerate Background & Sources"
                                ) : (
                                  "Finalize Writing Prompt"
                                    )}
                                  </Button>
                                </div>
                          )}
                          {isSelected && (
                            <div className="mt-2 rounded-lg border border-yellow-300/80 bg-yellow-50 px-3 py-2 text-sm text-foreground">
                              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                Student view
                              </div>
                              {renderHighlightedTextInline(
                                p.text,
                                highlights
                                  .filter((h) => h.section === "prompt")
                                  .map((h) => ({ id: h.id, start: h.start, end: h.end })),
                              )}
                            </div>
                          )}
                        </div>
                            </div>
                          );
                        })}
                    </CardContent>
                  </Card>

              <Card className="border-2 border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Add References to Improve AI Source Generation (Optional)</CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[90px] resize-y"
                    placeholder={"URLs or titles, one per line"}
                    value={teacherProvidedSourcesInput}
                    onChange={(e) => setTeacherProvidedSourcesInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Add custom sources first, then click <strong>Finalize Writing Prompt</strong> or <strong>Regenerate Background & Sources</strong> on the selected prompt to generate background info and sources.
                  </p>
                </CardContent>
              </Card>

              {/* Background Info */}
                  {finalizedTopicData ? (
                <>
                <Card className="border-2 border-primary/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-muted-foreground" /> Background Information
                      <span className="text-xs font-normal text-muted-foreground ml-1">— shown to students before writing</span>
                        </CardTitle>
                      </CardHeader>
                  <CardContent>
                    <div className="flex justify-end mb-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full gap-1.5"
                        onClick={() =>
                          addHighlightFromSelection(
                            "background",
                            generated.backgroundInformation || "",
                            backgroundInfoRef.current?.selectionStart,
                            backgroundInfoRef.current?.selectionEnd,
                          )
                        }
                      >
                        Highlight Selected Text
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full gap-1.5"
                        onClick={() => undoLastHighlight("background")}
                      >
                        Undo Highlight
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full gap-1.5"
                        onClick={() =>
                          removeHighlightFromSelection(
                            "background",
                            generated.backgroundInformation || "",
                            backgroundInfoRef.current?.selectionStart,
                            backgroundInfoRef.current?.selectionEnd,
                          )
                        }
                      >
                        Unhighlight Selected Text
                      </Button>
                    </div>
                        <textarea
                      ref={(el) => {
                        backgroundInfoRef.current = el;
                        autoResizeTextarea(el);
                      }}
                      className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[160px] resize-none overflow-hidden"
                          value={generated.backgroundInformation}
                      onInput={(e) => autoResizeTextarea(e.currentTarget)}
                          onChange={(e) => {
                        const v = e.target.value;
                        setGenerated((p) => (p ? { ...p, backgroundInformation: v } : p));
                        setFinalizedTopicData((prev) => (prev ? { ...prev, backgroundInformation: v } : prev));
                      }}
                    />
                    <div className="mt-2 rounded-lg border border-[#DDEFE2] bg-[#f3faf5] px-3 py-2 text-sm text-foreground">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        Student view
                      </div>
                      {renderHighlightedTextInline(
                        generated.backgroundInformation || "",
                        highlights
                          .filter((h) => h.section === "background")
                          .map((h) => ({ id: h.id, start: h.start, end: h.end })),
                        "bg-[#5DF8D8] text-inherit rounded-sm px-0.5",
                      )}
                    </div>
                      </CardContent>
                    </Card>
                </>
                  ) : (
                !isFinalizing && (
                  <div className="rounded-xl border-2 border-dashed border-primary/20 bg-primary/5 p-4 flex items-center gap-3 text-muted-foreground text-sm">
                      <BookOpen className="w-5 h-5 shrink-0 text-primary/40" />
                    Select a prompt above to generate background information and sources.
                    </div>
                )
              )}

              {/* Sources */}
              <Card className="border-2 border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground" /> Sources</span>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                      const nextSourceIndex = generated?.sources?.length ?? 0;
                      const ns = { title: "", author: "", year: "", description: "", type: "website" as SourceType, url: "" };
                      setGenerated((p) => p ? { ...p, sources: [...p.sources, ns] } : p);
                      setFinalizedTopicData((prev) => {
                        if (!prev || !selectedPrompt || prev.promptText.trim() !== selectedPrompt.text.trim()) return prev;
                        return { ...prev, sources: [...prev.sources, ns] };
                      });
                      window.setTimeout(() => {
                        sourceCardRefs.current[nextSourceIndex]?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }, 80);
                    }}>
                      <Plus className="w-3.5 h-3.5" /> Add Source
                    </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {finalizedTopicData && selectedPrompt && finalizedTopicData.promptText.trim() === selectedPrompt.text.trim() ? (
                    finalizedTopicData.sources.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No sources generated. You can add them manually.</p>
                    ) : (
                      finalizedTopicData.sources.map((s, idx) => (
                        <div
                          key={idx}
                          ref={(el) => { sourceCardRefs.current[idx] = el; }}
                          className="rounded-xl border border-border bg-white p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">{s.type}</Badge>
                            <button type="button" className="text-red-500 hover:text-red-700" onClick={() => {
                              setGenerated((p) => p ? { ...p, sources: p.sources.filter((_, i) => i !== idx) } : p);
                                  setFinalizedTopicData((prev) => {
                                if (!prev || !selectedPrompt || prev.promptText.trim() !== selectedPrompt.text.trim()) return prev;
                                    return { ...prev, sources: prev.sources.filter((_, i) => i !== idx) };
                                  });
                            }}><X className="w-4 h-4" /></button>
                            </div>
                          <div className="grid grid-cols-2 gap-3">
                            {(["title", "url", "author", "year"] as const).map((field) => {
                              const labels: Record<string, string> = { title: "Title", url: "URL (optional)", author: "Author", year: "Year" };
                              return (
                                <div key={field}>
                                  <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">{labels[field]}</label>
                                  <Input className="h-9 rounded-xl" value={(s as any)[field] || ""} onChange={(e) => {
                                    const v = e.target.value;
                                    const update = (arr: WritingSource[]) => { const n = [...arr]; n[idx] = { ...n[idx], [field]: v }; return n; };
                                    setGenerated((p) => p ? { ...p, sources: update(p.sources) } : p);
                                    setFinalizedTopicData((prev) => prev ? { ...prev, sources: update(prev.sources) } : prev);
                                  }} />
                              </div>
                              );
                            })}
                              </div>
                              <div>
                            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Source Type</label>
                            <select className={SELECT_CLS} value={s.type} onChange={(e) => {
                              const v = e.target.value as SourceType;
                              const update = (arr: WritingSource[]) => { const n = [...arr]; n[idx] = { ...n[idx], type: v }; return n; };
                              setGenerated((p) => p ? { ...p, sources: update(p.sources) } : p);
                              setFinalizedTopicData((prev) => prev ? { ...prev, sources: update(prev.sources) } : prev);
                            }}>
                              <option value="article">Article</option>
                              <option value="book">Book</option>
                              <option value="website">Website</option>
                              <option value="primary_source">Primary Source</option>
                              <option value="video">Video</option>
                            </select>
                                        </div>
                          {s.type === "video" && (() => {
                            const embed = toEmbeddableVideoUrl(s.url);
                            if (embed) return <div className="relative w-full pb-[56.25%] rounded-xl overflow-hidden bg-black"><iframe src={embed} className="absolute inset-0 h-full w-full" allowFullScreen /></div>;
                            if (isDirectVideoFileUrl(s.url)) return <video controls preload="metadata" className="w-full rounded-xl bg-black max-h-64" src={s.url} />;
                            return <p className="text-xs text-muted-foreground">Add a YouTube, Vimeo, or direct video URL to preview.</p>;
                          })()}
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-muted-foreground mb-1">Description</label>
                            <div className="flex justify-end mb-1 gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full gap-1.5"
                                onClick={() =>
                                  addHighlightFromSelection(
                                    "source",
                                    s.description || "",
                                    sourceDescriptionRefs.current[idx]?.selectionStart,
                                    sourceDescriptionRefs.current[idx]?.selectionEnd,
                                    idx,
                                  )
                                }
                              >
                                Highlight Selected Text
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full gap-1.5"
                                onClick={() => undoLastHighlight("source", idx)}
                              >
                                Undo Highlight
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full gap-1.5"
                                onClick={() =>
                                  removeHighlightFromSelection(
                                    "source",
                                    s.description || "",
                                    sourceDescriptionRefs.current[idx]?.selectionStart,
                                    sourceDescriptionRefs.current[idx]?.selectionEnd,
                                    idx,
                                  )
                                }
                              >
                                Unhighlight Selected Text
                              </Button>
                              </div>
                              <textarea
                              ref={(el) => {
                                sourceDescriptionRefs.current[idx] = el;
                                autoResizeTextarea(el);
                              }}
                              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[120px] resize-none overflow-hidden"
                                value={s.description}
                              onInput={(e) => autoResizeTextarea(e.currentTarget)}
                                onChange={(e) => {
                                  const v = e.target.value;
                                const update = (arr: WritingSource[]) => { const n = [...arr]; n[idx] = { ...n[idx], description: v }; return n; };
                                setGenerated((p) => p ? { ...p, sources: update(p.sources) } : p);
                                setFinalizedTopicData((prev) => prev ? { ...prev, sources: update(prev.sources) } : prev);
                              }}
                            />
                            <div className="mt-2 rounded-lg border border-[#C9996B] bg-[#f9f2eb] px-3 py-2 text-sm text-foreground">
                              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                Student view
                              </div>
                              {renderHighlightedTextInline(
                                s.description || "",
                                highlights
                                  .filter((h) => h.section === "source" && h.sourceIndex === idx)
                                  .map((h) => ({ id: h.id, start: h.start, end: h.end })),
                                "bg-[#C9996B] text-inherit rounded-sm px-0.5",
                              )}
                            </div>
                          </div>
                          </div>
                      ))
                    )
                      ) : (
                    !isFinalizing && (
                      <div className="rounded-xl border-2 border-dashed border-primary/20 bg-primary/5 p-4 flex items-center gap-3 text-muted-foreground text-sm">
                          <FileText className="w-5 h-5 shrink-0 text-primary/40" />
                        Sources will appear once a prompt is finalized above.
                        </div>
                    )
                  )}
                    </CardContent>
                  </Card>

              {/* Rubric */}
              <Card className="border-2 border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-muted-foreground" /> Rubric</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold ${weightsOk ? "text-emerald-700" : "text-red-600"}`}>Weights: {Math.round(weightSum)}%</span>
                      <Button variant="outline" size="sm" onClick={() => setGenerated((p) => {
                                if (!p) return p;
                        const norm = normalizeWeightsTo100(p.rubric.criteria);
                        return { ...p, rubric: calcPointsFromWeights({ ...p.rubric, criteria: norm }) };
                      })}>Auto-balance</Button>
                      <Button variant="outline" size="sm" onClick={() => setGenerated((p) => {
                                if (!p) return p;
                        const next = [...p.rubric.criteria, newRubricCriterion()];
                        return { ...p, rubric: calcPointsFromWeights({ ...p.rubric, criteria: normalizeWeightsTo100(next) }) };
                      })}><Plus className="w-4 h-4 mr-1" /> Criterion</Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                <CardContent>
                  {/* Rubric split dialog */}
                  <Dialog open={rubricSplitCriterionIdx !== null} onOpenChange={(open) => { if (!open) setRubricSplitCriterionIdx(null); }}>
                        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto sm:rounded-xl">
                          <DialogHeader>
                            <DialogTitle>
                          Level Descriptions
                          {rubricSplitCriterionIdx !== null && generated?.rubric.criteria[rubricSplitCriterionIdx] && (
                            <span className="block text-sm font-normal text-muted-foreground mt-1">{generated.rubric.criteria[rubricSplitCriterionIdx].name}</span>
                          )}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="grid gap-4 sm:grid-cols-2">
                        {(["exemplary", "proficient", "developing", "beginning"] as const).map((key) => (
                              <div key={key} className="space-y-1.5">
                            <label className="text-xs font-bold uppercase text-muted-foreground">{key}</label>
                            <textarea className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none min-h-[100px] resize-y" value={rubricSplitDraft[key]} onChange={(e) => setRubricSplitDraft((d) => ({ ...d, [key]: e.target.value }))} />
                              </div>
                            ))}
                          </div>
                          <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => setRubricSplitCriterionIdx(null)}>Cancel</Button>
                        <Button onClick={() => {
                                if (rubricSplitCriterionIdx === null) return;
                          const i = rubricSplitCriterionIdx;
                                setGenerated((p) => {
                                  if (!p) return p;
                            const next = [...p.rubric.criteria];
                            next[i] = applyLevelDraftToCriterion(next[i], rubricSplitDraft);
                            return { ...p, rubric: { ...p.rubric, criteria: next } };
                                });
                                setRubricSplitCriterionIdx(null);
                        }}><Check className="w-4 h-4 mr-1.5" />Save</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <div className="overflow-x-auto">
                    <table className="min-w-[580px] w-full border-collapse">
                          <thead>
                        <tr className="text-[11px] uppercase text-muted-foreground">
                          <th className="text-left p-2 border-b">Criterion</th>
                          <th className="text-left p-2 border-b w-20">Pts</th>
                          <th className="text-left p-2 border-b w-24">Weight %</th>
                          <th className="text-left p-2 border-b w-32">Levels</th>
                          <th className="p-2 border-b w-10" />
                            </tr>
                          </thead>
                          <tbody>
                            {generated.rubric.criteria.map((c, idx) => (
                              <tr key={c.id} className="align-top">
                                <td className="p-2 border-b">
                              <Input className="mb-1.5 h-8 rounded-xl font-semibold text-sm" value={c.name} placeholder="Criterion title" onChange={(e) => {
                                      const v = e.target.value;
                                      setGenerated((p) => {
                                        if (!p) return p;
                                  const next = [...p.rubric.criteria]; next[idx] = { ...next[idx], name: v };
                                  return { ...p, rubric: { ...p.rubric, criteria: next } };
                                });
                              }} />
                              <textarea className="w-full rounded-xl border border-input bg-background px-2 py-1.5 text-xs text-muted-foreground focus:ring-2 focus:ring-primary outline-none min-h-[44px] resize-y" placeholder="Description (optional)" value={c.description} onChange={(e) => {
                                      const v = e.target.value;
                                      setGenerated((p) => {
                                        if (!p) return p;
                                  const next = [...p.rubric.criteria]; next[idx] = { ...next[idx], description: v };
                                  return { ...p, rubric: { ...p.rubric, criteria: next } };
                                      });
                              }} />
                                </td>
                            <td className="p-2 border-b font-semibold text-sm">{c.points}</td>
                                <td className="p-2 border-b">
                              <Input className="w-20 h-8 rounded-xl text-sm" type="number" value={c.weight} onChange={(e) => {
                                      const v = Number(e.target.value);
                                      setGenerated((p) => {
                                        if (!p) return p;
                                  const next = [...p.rubric.criteria]; next[idx] = { ...next[idx], weight: Number.isFinite(v) ? v : 0 };
                                  return { ...p, rubric: calcPointsFromWeights({ ...p.rubric, criteria: next }) };
                                      });
                              }} />
                                </td>
                                <td className="p-2 border-b">
                              <Button type="button" variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => { setRubricSplitCriterionIdx(idx); setRubricSplitDraft(criterionLevelsToDraft(c)); }}>Edit levels</Button>
                                </td>
                                <td className="p-2 border-b">
                              <button type="button" className="h-8 w-8 flex items-center justify-center rounded-xl border border-border text-red-500 hover:bg-red-50 transition-colors" onClick={() => {
                                      setRubricSplitCriterionIdx(null);
                                      setGenerated((p) => {
                                        if (!p) return p;
                                  const next = p.rubric.criteria.filter((_, i) => i !== idx);
                                  return { ...p, rubric: calcPointsFromWeights({ ...p.rubric, criteria: normalizeWeightsTo100(next) }) };
                                      });
                              }}><Trash2 className="w-3.5 h-3.5" /></button>
                                </td>
                              </tr>
                            ))}
                            <tr>
                          <td className="p-2 font-bold text-sm">Total</td>
                          <td className="p-2 font-bold text-sm">{generated.rubric.totalPoints}</td>
                          <td className="p-2 font-bold text-sm">{Math.round(weightSum)}%</td>
                          <td colSpan={2} />
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

              {/* Save / Discard */}
              <div className="flex items-center justify-end gap-3 pb-4">
                <Button variant="outline" onClick={handleDiscard} disabled={isSaving}>Discard</Button>
                <Button onClick={handleSave} disabled={isSaving || !selectedPrompt} className="gap-2">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isSaving ? "Saving…" : "Save Assessment"}
                  {!isSaving && <ArrowRight className="w-4 h-4" />}
                    </Button>
                  </div>

            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </DashboardLayout>
  );
}
