import { z } from "zod";
import { PlannerPlanSchema } from "../planner/planner.schema";

export enum KnowledgeSource {
  PersonalMemory = "PersonalMemory",
  WebSearch = "WebSearch",
  LLMKnowledge = "LLMKnowledge",
}

export enum RetrievalDepth {
  None = "None",
  Shallow = "Shallow",
  Deep = "Deep",
}

export enum CitationPolicy {
  Mandatory = "Mandatory",
  Preferred = "Preferred",
  None = "None",
}

export enum WebAction {
  Return = "Return",
  Offer = "Offer",
  Auto = "Auto",
}

export interface WebIntegrationPolicy {
  on_results_found: WebAction;
  on_no_results: WebAction;
}

export interface ExecutionPlan {
  knowledge_priority: KnowledgeSource[];
  retrieval_depth: RetrievalDepth;
  citation_policy: CitationPolicy;
  include_images: boolean;
  web_policy: WebIntegrationPolicy;
  rewritten_query: string;
  personal_search_queries: string[];
  web_search_queries: string[];
}

export const KnowledgeSourceSchema = z.nativeEnum(KnowledgeSource);
export const RetrievalDepthSchema = z.nativeEnum(RetrievalDepth);
export const CitationPolicySchema = z.nativeEnum(CitationPolicy);
export const WebActionSchema = z.nativeEnum(WebAction);

export const WebIntegrationPolicySchema = z.object({
  on_results_found: WebActionSchema,
  on_no_results: WebActionSchema,
});

export const ExecutionPlanSchema = z.object({
  knowledge_priority: z.array(KnowledgeSourceSchema),
  retrieval_depth: RetrievalDepthSchema,
  citation_policy: CitationPolicySchema,
  include_images: z.boolean(),
  web_policy: WebIntegrationPolicySchema,
  rewritten_query: z.string(),
  personal_search_queries: z.array(z.string()),
  web_search_queries: z.array(z.string()),
});

export const RouterPlannerOutputSchema = z.object({
  executionPlan: ExecutionPlanSchema,
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().optional(),
  plannerPlan: PlannerPlanSchema,
});

export type RouterPlannerOutput = z.infer<typeof RouterPlannerOutputSchema>;