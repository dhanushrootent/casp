import { pgTable, text, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const questionsTable = pgTable("questions", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull(),
  text: text("text").notNull(),
  type: text("type").notNull().$type<string>(),
  options: jsonb("options").$type<string[]>(),
  correctAnswer: text("correct_answer"),
  explanation: text("explanation"),
  audioScript: text("audio_script"),
  points: integer("points").default(1).notNull(),
  difficulty: text("difficulty").notNull().$type<"easy" | "medium" | "hard">(),
  skill: text("skill"),
  orderIndex: integer("order_index").notNull(),
});

export const insertQuestionSchema = createInsertSchema(questionsTable);
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;
