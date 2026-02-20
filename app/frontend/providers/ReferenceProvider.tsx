"use client";

import { ReferenceContext, ReferenceMeta } from "@/contexts/referenceContext";
import { useState } from "react";

interface ReferenceProviderProps {
  children: React.ReactNode;
}

export default function ReferenceProvider({
  children,
}: ReferenceProviderProps) {
  const [referenceMeta, setReferenceMeta] = useState<ReferenceMeta | undefined>(
    undefined,
  );
  return (
    <ReferenceContext.Provider
      value={{
        referenceMeta,
        setReferenceMeta,
      }}
    >
      {children}
    </ReferenceContext.Provider>
  );
}
