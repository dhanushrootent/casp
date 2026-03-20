import { Router, type IRouter, type Request, type Response } from "express";
import { ai } from "@workspace/integrations-gemini-ai";
import { v4 as uuidv4 } from "uuid";

const router: IRouter = Router();

router.post("/syllabus/upload", async (req: Request, res: Response) => {
  const { syllabusText, fileName, assessmentType, subject, grade, difficulty, questionCount, listeningRubric, readingRubric, writingRubric } = req.body;

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

  const prompt = `You are an expert California educational assessment designer creating questions for the ${assessmentType} assessment standard.

SYLLABUS CONTENT:
${syllabusText.substring(0, 8000)}

TASK: Generate exactly ${questionCount} high-quality assessment questions for Grade ${grade} ${subject} based on this syllabus.

ASSESSMENT STANDARDS:
- Assessment Type: ${assessmentType} (${assessmentType === "CAASPP" ? "California Assessment of Student Performance and Progress" : "English Language Proficiency Assessments for California"})
- Subject: ${subject}
- Grade Level: ${grade}
- Difficulty: ${difficulty}
- ${difficultyGuidance[difficulty] || difficultyGuidance.medium}
- ${assessmentGuidance}
${listeningRubric ? `- Listening Rubric Focus: ${listeningRubric}` : ''}
${readingRubric ? `- Reading Rubric Focus: ${readingRubric}` : ''}
${writingRubric ? `- Writing Rubric Focus: ${writingRubric}` : ''}

REQUIREMENTS:
1. Generate exactly ${questionCount} questions
2. At least 60% should be multiple_choice type
3. Include some short_answer questions
4. For ELPAC, include listening and speaking questions
5. Each question must align with the syllabus content
6. Multiple choice questions must have exactly 4 options (A, B, C, D format)
7. Include correct answers for multiple_choice questions
8. DO NOT use images in your questions or describe images in brackets (e.g. [Image of...]). Even for ELPAC Speaking, rely on purely text-based situations.
9. For listening questions, place the spoken transcript exclusively in the "audioScript" field, and DO NOT include the transcript in the "text" field. The "text" field should ONLY contain the question the student must answer.

Return ONLY a valid JSON object in this exact format:
{
  "assessmentTitle": "descriptive title based on syllabus content",
  "summary": "brief 1-2 sentence summary of what the assessment covers",
  "questions": [
    {
      "text": "question text here (NO transcripts here)",
      "audioScript": "Optional transcript that will be spoken aloud to the student",
      "type": "multiple_choice",
      "options": ["First option", "Second option", "Third option", "Fourth option"],
      "correctAnswer": "First option",
      "explanation": "Brief explanation of why this is correct",
      "points": 1,
      "difficulty": "easy",
      "skill": "Reading Comprehension",
      "orderIndex": 0
    }
  ]
}

For short_answer questions, omit "options" and "correctAnswer".
For essay questions, omit "options" and "correctAnswer".`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { maxOutputTokens: 8192 },
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
    type: q.type || "multiple_choice",
    options: q.options || null,
    correctAnswer: q.correctAnswer || null,
    explanation: q.explanation || null,
    audioScript: q.audioScript || null,
    points: q.points || 1,
    difficulty: q.difficulty || difficulty,
    skill: q.skill || null,
    orderIndex: q.orderIndex ?? i,
  }));

  return res.json({
    questions,
    assessmentTitle: parsed.assessmentTitle || `${grade} Grade ${subject} Assessment`,
    summary: parsed.summary || `Assessment covering ${subject} content for Grade ${grade}`,
  });
});

export default router;
