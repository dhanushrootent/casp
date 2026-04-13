import { Router, type IRouter, type Request, type Response } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import { v4 as uuidv4 } from "uuid";

const router: IRouter = Router();

router.post("/syllabus/upload", async (req: Request, res: Response) => {
  const { syllabusText, fileName, assessmentType, subject, grade, difficulty, questionCount, listeningRubric, readingRubric, writingRubric, typePercentages, metadata } = req.body;
  const customTitle = metadata?.assessmentTitle;

  if (!syllabusText || syllabusText.length < 50) {
    return res.status(400).json({ error: "bad_request", message: "Syllabus text is too short or empty" });
  }

  const difficultyGuidance: Record<string, string> = {
    easy: "Generate straightforward questions testing basic recall and comprehension.",
    medium: "Generate questions that require application and analysis of concepts.",
    hard: "Generate challenging questions requiring synthesis, evaluation, and higher-order thinking.",
    mixed: "Generate a mix of easy (30%), medium (50%), and hard (20%) questions.",
  };

  const assessmentGuidance = assessmentType === "ELPAC"
    ? "Focus on English language proficiency: listening comprehension, speaking (describe images/situations), reading comprehension, and writing tasks. Include questions for all four language skills."
    : `Focus on ${subject} academic content standards aligned with California Common Core. Use grade-appropriate academic vocabulary and real-world contexts.`;

  const CAASPP_TYPES = [
    'multiple_choice_single', 'multiple_choice_multiple', 'highlight_selection', 'matching_classification',
    'short_answer', 'numeric_response', 'equation_input', 'table_completion',
    'drag_drop_ordering', 'graph_plotting', 'interactive_table', 'select_text', 'multi_step_problem',
    'performance_task', 'argumentative_essay', 'explanatory_essay', 'narrative_writing', 'evidence_based_writing',
    'data_analysis', 'simulation_reasoning'
  ];

  const ELPAC_TYPES = [
    'listening_mcq', 'listening_image', 'listening_sequence',
    'read_aloud', 'describe_picture', 'answer_verbal', 'explain_opinion',
    'reading_mcq', 'vocabulary_context', 'matching_meaning',
    'sentence_construction', 'short_response', 'paragraph_writing', 'integrated_task'
  ];

  let typeGuidance = '';
  let validTypesString = assessmentType === "CAASPP" 
    ? CAASPP_TYPES.map(t => `"${t}"`).join(', ') 
    : ELPAC_TYPES.map(t => `"${t}"`).join(', ');

  if (typePercentages && Object.keys(typePercentages).length > 0) {
    const types = Object.keys(typePercentages);
    validTypesString = types.map(t => `"${t}"`).join(', ');
    
    const distribution = types.map(t => {
      const numQuestions = Math.max(1, Math.round((typePercentages[t] / 100) * questionCount));
      return `- ${t}: exactly ${numQuestions} questions (${typePercentages[t]}%)`;
    }).join('\n');

    typeGuidance = `\nQUESTION TYPE DISTRIBUTION STRATEGY:\nYou MUST generate exactly ${questionCount} questions following this exact breakdown:\n${distribution}\n`;
  }

  // Subject-specific guidance
  let subjectGuidance = "";
  if (subject === "Mathematics") {
    subjectGuidance = `
MATHEMATICS SPECIFIC REQUIREMENTS:
- Focus on the Major Clusters of the California Common Core State Standards for ${grade}th Grade Math.
- Ensure questions cover procedural fluidity, conceptual understanding, and application.
- Use "numeric_response" or "equation_input" for pure math answers.
- Use "graph_plotting" for coordinate geometry or data visualization tasks.
- Use "table_completion" for ratio/proportional reasoning or function tables.
`;
  } else if (subject === "English Language Arts") {
    subjectGuidance = `
ELA SPECIFIC REQUIREMENTS:
- Use complex, grade-level appropriate reading passages for reading comprehension items.
- Focus on "evidence-based_writing" or "argumentative_essay" for constructed responses.
- Use "highlight_selection" for identifying textual evidence or grammatical errors.
- Include vocabulary in context questions using "multiple_choice_single".
`;
  } else if (subject === "Science") {
    subjectGuidance = `
SCIENCE SPECIFIC REQUIREMENTS:
- Focus on Next Generation Science Standards (NGSS) for ${grade}th Grade.
- Include "simulation_reasoning" or "data_analysis" tasks based on scientific phenomena.
- Ensure "multi_step_problem" involves multiple phases of scientific inquiry.
`;
  }

  const prompt = `You are an expert California educational assessment designer creating questions for the ${assessmentType} assessment standard.

SYLLABUS CONTENT:
${syllabusText.substring(0, 8000)}

TASK: Generate exactly ${questionCount} high-quality assessment questions for Grade ${grade} ${subject} based on this syllabus.
${customTitle ? `The title of this assessment will be "${customTitle}". You can use this for context.` : ''}

ASSESSMENT STANDARDS:
- Assessment Type: ${assessmentType} (${assessmentType === "CAASPP" ? "California Assessment of Student Performance and Progress" : "English Language Proficiency Assessments for California"})
- Subject: ${subject}
- Grade Level: ${grade}
- Difficulty: ${difficulty}
- ${difficultyGuidance[difficulty] || difficultyGuidance.medium}
- ${assessmentGuidance}
${subjectGuidance}
${listeningRubric ? `- Listening Rubric Focus: ${listeningRubric}` : ''}
${readingRubric ? `- Reading Rubric Focus: ${readingRubric}` : ''}
${writingRubric ? `- Writing Rubric Focus: ${writingRubric}` : ''}
${typeGuidance}
REQUIREMENTS:
1. Generate exactly ${questionCount} questions total.
2. ${typePercentages && Object.keys(typePercentages).length > 0 ? "STRICTLY follow the Question Type Distribution Strategy above." : "Ensure a good mix of question types appropriate for the assessment, with at least 50% being multiple choice or similar."}
3. The valid values for "type" are strictly: ${validTypesString}. Do NOT invent new types.
4. Each question must align with the syllabus content.
5. Multiple choice questions must have exactly 4 options (A, B, C, D format). For other types, you may omit "options" and "correctAnswer" if inapplicable.
6. DO NOT use images in your questions or describe images in brackets (e.g. [Image of...]). Rely on purely text-based situations.
7. For listening questions, place the spoken transcript exclusively in the "audioScript" field, and DO NOT include the transcript in the "text" field.
8. For Scientific Reasoning, Data Analysis, or Comprehension items, ALWAYS provide a detailed "audioScript" that sets the scene or provides the data verbally.
9. For ELPAC: Ensure every question has a "skill" assigned from: "Listening", "Speaking", "Reading", or "Writing".
10. If a question is a simple multiple choice without text to listen to, set "audioScript" to null.

Return ONLY a valid JSON object in this exact format:
{
  "assessmentTitle": "descriptive title based on syllabus content",
  "summary": "brief 1-2 sentence summary of what the assessment covers",
  "questions": [
    {
      "text": "The prompt as seen by the student (e.g. 'Based on the passage you heard, why did...')",
      "audioScript": "The actual text of the passage/description to be read ALOUD (spoken) to the student.",
      "type": "one of the valid types listed above",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"], // ONLY if MCQ-like
      "correctAnswer": "The exact string match of the correct option", // Or the exact value for fill-in-the-blank
      "explanation": "Why this answer is correct",
      "points": 1,
      "difficulty": "${difficulty}",
      "skill": "The specific standard or skill being tested",
      "orderIndex": 0
    }
  ]
}

For questions that don't need options, omit them.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { 
      maxOutputTokens: 8192,
      responseMimeType: "application/json"
    },
  });

  const rawText = response.text ?? "";

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return res.status(500).json({ error: "ai_error", message: "Failed to parse AI response" });
  }

  const parsed = JSON.parse(jsonMatch[0]);

  const questions = (parsed.questions || []).map((q: any, i: number) => ({
    id: uuidv4(),
    assessmentId: "",
    text: q.text,
    type: q.type || (assessmentType === "CAASPP" ? "multiple_choice_single" : "reading_mcq"),
    options: q.options || null,
    correctAnswer: q.correctAnswer || null,
    explanation: q.explanation || null,
    audioScript: q.audioScript || null,
    points: q.points || 1,
    difficulty: q.difficulty || difficulty,
    skill: q.skill || null,
    orderIndex: q.orderIndex ?? i,
  }));
console.log("[syllabus] generated", {
    questionCount: questions.length,
    assessmentTitle: customTitle || parsed.assessmentTitle || `${grade} Grade ${subject} Assessment`,
    summary: parsed.summary || `Assessment covering ${subject} content for Grade ${grade}`,
  });
  return res.json({
    questions,
    assessmentTitle: customTitle || parsed.assessmentTitle || `${grade} Grade ${subject} Assessment`,
    summary: parsed.summary || `Assessment covering ${subject} content for Grade ${grade}`,
  });
});

export default router;
