import { CreditsContext, CreditsContextType } from "@/contexts/creditsContext";
import { useContext } from "react";

export default function useCredits(): CreditsContextType {
  const context = useContext(CreditsContext);
  return context;
}
