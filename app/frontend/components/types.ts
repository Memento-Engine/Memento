import { app } from "@tauri-apps/api";
import { InferUITools, UIMessage, tool } from "ai";
import { string, z } from "zod";

// Thinking schema
export const StepSearchResultsSchema = z.object({
  app_name: z.string(),
  window_name: z.string(),
  image_path: z.string(),
  captured_at: z.string(),
});

export const thinkingSchema = z.object({
  title: z.string(),
  status: z.enum([
    "running", // currently executing
    "completed", // finished step
    "final", // pipeline finished
  ]),

  results: z.array(StepSearchResultsSchema).optional().nullable(),
  message: z.string().optional().nullable(),
  queries: z.array(z.string()).nullable().optional(),
});

export type ThinkingStep = z.infer<typeof thinkingSchema>;

// Citation schema
const citationSchema = z.object({
  sourceId: z.string().min(1),
  appName: z.string().min(1),
  windowName: z.string().min(1),
  capturedAt: z.string().min(1),
  url: z.string().min(1),

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

const dataSchemas = {
  thinking: thinkingSchema,
  citation: citationSchema,
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
