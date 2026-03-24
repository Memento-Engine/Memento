import { UIMessage } from "ai";
import { z } from "zod";
import {
  normalizedOcrLayoutSchema,
  normalizedOcrTokenSchema,
  messageSearchModeSchema,
  MessageSearchMode,
  sourceSchema,
  SourceRecord,
  SearchMode,
  SearchModeEnum,
  sourcesPayloadSchema,
  SourcesPayload,
  StepSearchResultsSchema,
  thinkingSchema,
  ThinkingStep,
  ActionType,
  ActionTypeEnum,
} from "@shared/types/frontend";

export {
  normalizedOcrLayoutSchema,
  normalizedOcrTokenSchema,
  sourceSchema,
  sourcesPayloadSchema,
  StepSearchResultsSchema,
  thinkingSchema,
  ActionTypeEnum,
  messageSearchModeSchema,
  SearchModeEnum,
};
export type {
  SourceRecord,
  SourcesPayload,
  ThinkingStep,
  ActionType,
  SearchMode,
  MessageSearchMode,
};

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
export const followupsSchema = z.array(z.string()).max(3);

export type Citation = z.infer<typeof citationSchema>;
export type Citations = z.infer<typeof citationsSchema>;
export type Followups = z.infer<typeof followupsSchema>;

const dataSchemas = {
  thinking: thinkingSchema,
  searchMode: messageSearchModeSchema,
  citations: citationsSchema, // plural
  sources: sourcesPayloadSchema,
  followups: followupsSchema,
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
