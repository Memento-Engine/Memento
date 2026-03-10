"use client";

import { ReferenceContext, ReferenceMeta } from "@/contexts/referenceContext";
import { useState } from "react";
import { SourceRecord } from "@/components/types";

interface ReferenceProviderProps {
  children: React.ReactNode;
}

export default function ReferenceProvider({
  children,
}: ReferenceProviderProps) {
  const [referenceMeta, setReferenceMeta] = useState<ReferenceMeta | undefined>(
    undefined,
  );
  const [sourceList, setSourceList] = useState<SourceRecord[]>([]);
  return (
    <ReferenceContext.Provider
      value={{
        referenceMeta,
        sourceList,
        setReferenceMeta,
        setSourceList,
      }}
    >
      {children}
    </ReferenceContext.Provider>
  );
}
