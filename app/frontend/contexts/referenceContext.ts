"use client";
import { createContext } from "react";

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

  chunk_id: number;

  image_path: string;
}

type ReferenceMetaContextType = {
  referenceMeta?: ReferenceMeta;
  setReferenceMeta: React.Dispatch<
    React.SetStateAction<ReferenceMeta | undefined>
  >;
};
export const ReferenceContext = createContext<ReferenceMetaContextType | undefined>(
  undefined,
);
