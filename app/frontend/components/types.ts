import { InferUITools, UIMessage, tool } from "ai";
import { z } from "zod";

// Thinking schema
const thinkingSchema = z.object({
  title: z.string(),

  message: z.string(),

  status: z.enum([
    "running",     // currently executing
    "completed",   // finished step
    "final",       // pipeline finished
  ]),

});


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
  never,        // no metadata
  MyDataPart,   // custom data channels
  never       // tools
>;

