import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assessmentsTable = pgTable("assessments", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull().$type<"CAASPP" | "ELPAC">(),
  subject: text("subject").notNull(),
  grade: text("grade").notNull(),
  classId: text("class_id"),
  description: text("description"),
  duration: integer("duration").notNull(),
  questionCount: integer("question_count").default(0).notNull(),
  difficulty: text("difficulty").notNull().$type<"easy" | "medium" | "hard" | "mixed">(),
  status: text("status").default("active").notNull().$type<"active" | "draft" | "archived">(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssessmentSchema = createInsertSchema(assessmentsTable).omit({ createdAt: true, questionCount: true });
export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;
export type Assessment = typeof assessmentsTable.$inferSelect;
