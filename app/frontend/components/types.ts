import { UIMessage } from "ai";
import { z } from "zod";

// Step search results schema
export const StepSearchResultsSchema = z.object({
  app_name: z.string(),
  window_name: z.string(),
  image_path: z.string(),
  captured_at: z.string(),
});

// Thinking schema - represents execution steps streamed from backend
export const thinkingSchema = z.object({
  // Step identification
  stepId: z.string(),
  stepType: z.enum([
    "planning", // planner generating plan
    "searching", // executor running search step
    "reasoning", // executor running reasoning step
    "completion", // final answer generation
  ]),

  // Step status and progress
  status: z.enum([
    "running", // currently executing
    "completed", // finished step
    "failed", // step failed but recovered
    "final", // entire pipeline finished
  ]),

  // Step description and details
  title: z.string(), // Human-readable step name
  description: z.string().optional(), // Detailed description
  query: z.string().optional(), // Search query or reasoning prompt
  
  // Search/execution results
  results: z.array(StepSearchResultsSchema).optional().nullable(),
  resultCount: z.number().optional(), // Count of results found
  
  // Reasoning and feedback
  message: z.string().optional().nullable(), // Info/warning/error message
  reasoning: z.string().optional(), // LLM reasoning for this step
  queries: z.array(z.string()).nullable().optional(), // Alternative queries tried
  
  // Timing
  duration: z.number().optional(), // Time taken in ms
  timestamp: z.string().optional(), // ISO timestamp
});

export type ThinkingStep = z.infer<typeof thinkingSchema>;

// Citation schema
export const citationSchema = z.object({
  sourceId: z.number().min(1),
  appName: z.string().min(1),
  windowName: z.string().min(1),
  capturedAt: z.string().min(1),
  url: z.string().optional().nullable(),

  bbox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    textStart: z.number(),
    textEnds: z.number(),
  }),

  imagePath: z.string(),
});

export const citationsSchema = z.array(citationSchema);

export type Citation = z.infer<typeof citationSchema>;
export type Citations = z.infer<typeof citationsSchema>;

const dataSchemas = {
  thinking: thinkingSchema,
  citations: citationsSchema, // plural
};

export type MyDataPart = {
  [K in keyof typeof dataSchemas]: z.infer<(typeof dataSchemas)[K]>;
};

export type MementoUIMessage = UIMessage<
  never, // no metadata
  MyDataPart, // custom data channels
  never // tools
>;

export type chatRequest = {
  message_id: string;
  chat_history: MementoUIMessage[];
};
