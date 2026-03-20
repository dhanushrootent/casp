import { pgTable, text, timestamp, integer, real, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const resultsTable = pgTable("results", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id").notNull(),
  studentId: text("student_id").notNull(),
  score: real("score").notNull(),
  maxScore: real("max_score").notNull(),
  percentage: real("percentage").notNull(),
  passed: boolean("passed").notNull(),
  timeSpent: integer("time_spent").notNull(),
  answers: jsonb("answers").$type<{ questionId: string; answer: string }[]>().notNull(),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});

export const insertResultSchema = createInsertSchema(resultsTable).omit({ completedAt: true });
export type InsertResult = z.infer<typeof insertResultSchema>;
export type Result = typeof resultsTable.$inferSelect;
