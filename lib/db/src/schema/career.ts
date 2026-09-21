import { createInsertSchema } from "drizzle-zod";
import {
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const profilesTable = pgTable("career_profiles", {
  userId: varchar("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  headline: text("headline"),
  location: text("location"),
  preferences: jsonb("preferences")
    .$type<Record<string, boolean>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const jobsTable = pgTable("career_jobs", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  companyName: text("company_name").notNull(),
  location: text("location").notNull(),
  sourceUrl: text("source_url"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const applicationsTable = pgTable("career_applications", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  jobId: varchar("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  status: varchar("status").notNull().default("saved"),
  matchScore: integer("match_score").notNull().default(82),
  cvVersion: varchar("cv_version"),
  appliedDate: date("applied_date", { mode: "string" }),
  summary: text("summary").notNull(),
  strengths: text("strengths").array().notNull().default([]),
  gaps: text("gaps").array().notNull().default([]),
  scoreBreakdown: jsonb("score_breakdown")
    .$type<Record<string, number>>()
    .notNull()
    .default({}),
  resumeName: text("resume_name").notNull(),
  initials: varchar("initials").notNull(),
  accent: varchar("accent").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const recommendationsTable = pgTable("career_recommendations", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  applicationId: varchar("application_id")
    .notNull()
    .references(() => applicationsTable.id, { onDelete: "cascade" }),
  section: text("section").notNull(),
  originalText: text("original_text").notNull(),
  suggestedText: text("suggested_text").notNull(),
  reason: text("reason").notNull(),
  evidence: text("evidence").array().notNull().default([]),
  alignment: text("alignment").array().notNull().default([]),
  risk: varchar("risk").notNull().default("low"),
  status: varchar("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const cvVersionsTable = pgTable("career_cv_versions", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  applicationId: varchar("application_id").references(() => applicationsTable.id, {
    onDelete: "set null",
  }),
  version: varchar("version").notNull(),
  name: text("name").notNull(),
  content: jsonb("content").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const interviewSessionsTable = pgTable("career_interview_sessions", {
  id: varchar("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  applicationId: varchar("application_id")
    .notNull()
    .references(() => applicationsTable.id, { onDelete: "cascade" }),
  questionIndex: integer("question_index").notNull().default(0),
  answerCount: integer("answer_count").notNull().default(0),
  answers: jsonb("answers")
    .$type<Array<{ answer: string; score: number; createdAt: string }>>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertProfileSchema = createInsertSchema(profilesTable);
export const insertJobSchema = createInsertSchema(jobsTable);
export const insertApplicationSchema = createInsertSchema(applicationsTable);
export const insertRecommendationSchema = createInsertSchema(recommendationsTable);
export const insertCvVersionSchema = createInsertSchema(cvVersionsTable);
export const insertInterviewSessionSchema = createInsertSchema(interviewSessionsTable);

export type Profile = typeof profilesTable.$inferSelect;
export type Job = typeof jobsTable.$inferSelect;
export type Application = typeof applicationsTable.$inferSelect;
export type Recommendation = typeof recommendationsTable.$inferSelect;
export type CvVersion = typeof cvVersionsTable.$inferSelect;
export type InterviewSession = typeof interviewSessionsTable.$inferSelect;