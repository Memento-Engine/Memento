import { UIMessage } from "ai";
import { z } from "zod";
import {
  normalizedOcrLayoutSchema,
  normalizedOcrTokenSchema,
  sourceSchema,
  SourceRecord,
  sourcesPayloadSchema,
  SourcesPayload,
  StepSearchResultsSchema,
  thinkingSchema,
  ThinkingStep,
} from "@shared/types/frontend";

export {
  normalizedOcrLayoutSchema,
  normalizedOcrTokenSchema,
  sourceSchema,
  sourcesPayloadSchema,
  StepSearchResultsSchema,
  thinkingSchema,
};
export type { SourceRecord, SourcesPayload, ThinkingStep };

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
  sources: sourcesPayloadSchema,
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
