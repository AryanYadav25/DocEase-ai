import { z } from 'zod';

const str = (max = 2000) => z.string().trim().max(max);
const strList = (max = 40) => z.array(z.string().trim().min(1).max(600)).max(max).default([]);
const pageRef = z.number().int().min(1).optional().nullable();

export const simplifyOutputSchema = z.object({
  overview: str(4000),
  mainPurpose: str(2000),
  keyPoints: strList(25),
  importantFacts: strList(25),
  importantDates: z.array(z.object({ date: str(100), meaning: str(400), page: pageRef })).max(25).default([]),
  peopleAndOrganizations: z.array(z.object({ name: str(200), role: str(400), page: pageRef })).max(30).default([]),
  technicalTerms: z.array(z.object({ term: str(120), explanation: str(600), page: pageRef })).max(30).default([]),
  actionItems: strList(20),
  unclearOrMissing: strList(15),
  conclusion: str(2000),
});
export type SimplifyOutput = z.infer<typeof simplifyOutputSchema>;

export const paragraphSummarySchema = z.object({ summary: str(4000) });
export const bulletSummarySchema = z.object({ bullets: strList(30) });
export const sectionSummarySchema = z.object({
  sections: z.array(z.object({ title: str(200), summary: str(2500), pageStart: pageRef, pageEnd: pageRef })).max(60),
});
export const executiveSummarySchema = z.object({ headline: str(300), summary: str(3000), recommendations: strList(12) });
export const takeawaysSchema = z.object({ takeaways: strList(20) });
export const quotesSchema = z.object({
  quotes: z.array(z.object({ quote: str(600), whyItMatters: str(500), page: pageRef })).max(20),
});

export const keyInformationSchema = z.object({
  names: z.array(z.object({ value: str(200), context: str(400), page: pageRef })).max(40).default([]),
  dates: z.array(z.object({ value: str(100), context: str(400), page: pageRef })).max(40).default([]),
  amounts: z.array(z.object({ value: str(100), context: str(400), page: pageRef })).max(40).default([]),
  deadlines: z.array(z.object({ value: str(200), context: str(400), page: pageRef })).max(30).default([]),
  requirements: z.array(z.object({ value: str(500), page: pageRef })).max(40).default([]),
  eligibilityCriteria: z.array(z.object({ value: str(500), page: pageRef })).max(30).default([]),
  responsibilities: z.array(z.object({ party: str(200), value: str(500), page: pageRef })).max(30).default([]),
  definitions: z.array(z.object({ term: str(120), definition: str(600), page: pageRef })).max(40).default([]),
  tasks: z.array(z.object({ value: str(500), page: pageRef })).max(30).default([]),
  warnings: z.array(z.object({ value: str(500), page: pageRef })).max(30).default([]),
  notFound: strList(12),
});

export const vocabularySchema = z.object({
  terms: z
    .array(
      z.object({
        term: str(120),
        simpleDefinition: str(500),
        inContext: str(700),
        exampleSentence: str(500),
        page: pageRef,
      }),
    )
    .max(40),
});

export const selectionOutputSchema = z.object({
  answer: str(6000),
  notes: strList(6),
});

export const translationOutputSchema = z.object({
  translation: str(16000),
  preservedTerms: strList(30),
  notes: strList(6),
});

export const flashcardsOutputSchema = z.object({
  flashcards: z
    .array(z.object({ id: str(40).optional(), front: str(500), back: str(1200), page: pageRef }))
    .min(1)
    .max(40),
});

export const quizOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        id: str(40).optional(),
        type: z.enum(['multiple_choice', 'short_answer']),
        question: str(800),
        options: z.array(str(400)).max(6).optional(),
        correctOptionIndex: z.number().int().min(0).max(5).optional().nullable(),
        answer: str(1200),
        explanation: str(1500),
        page: pageRef,
      }),
    )
    .min(1)
    .max(30),
});

export const revisionNotesSchema = z.object({
  keyDefinitions: z.array(z.object({ term: str(120), definition: str(600), page: pageRef })).max(30).default([]),
  notes: z.array(z.object({ heading: str(200), points: strList(12), page: pageRef })).max(25).default([]),
});

export const chatOutputSchema = z.object({
  answer: str(8000),
  foundInDocument: z.boolean(),
  citations: z.array(z.object({ chunkIndex: z.number().int().min(0), page: z.number().int().min(1), excerpt: str(400).optional() })).max(12).default([]),
});

export const suggestedQuestionsSchema = z.object({ questions: z.array(str(300)).min(1).max(8) });

export type FlashcardsOutput = z.infer<typeof flashcardsOutputSchema>;
export type QuizOutput = z.infer<typeof quizOutputSchema>;
export type ChatOutput = z.infer<typeof chatOutputSchema>;
