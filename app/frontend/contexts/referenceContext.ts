"use client";
import { createContext } from "react";
import { SourceRecord } from "@/components/types";
import { z } from "zod";
import { normalizedOcrLayoutSchema } from "@/components/types";

export interface ReferenceMeta {
  captured_at: string;

  app_name: string;
  window_title: string;
  text_content: string;
  browser_url: string;


  window_x: number;
  window_y: number;
  window_width: number;
  window_height: number;

  chunk_id: string;

  image_path: string;
  text_json?: string;
  normalized_text_layout?: z.infer<typeof normalizedOcrLayoutSchema>;
}

type ReferenceMetaContextType = {
  referenceMeta?: ReferenceMeta;
  sourceList: SourceRecord[];
  setReferenceMeta: React.Dispatch<
    React.SetStateAction<ReferenceMeta | undefined>
  >;
  setSourceList: React.Dispatch<React.SetStateAction<SourceRecord[]>>;
};
export const ReferenceContext = createContext<ReferenceMetaContextType | undefined>(
  undefined,
);
