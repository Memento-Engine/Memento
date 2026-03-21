import { UpdateContext } from "@/contexts/updateContext";
import { useContext } from "react";

export default function useUpdate() {
  const context = useContext(UpdateContext);
  if (context === undefined) {
    throw new Error("useUpdate must be used within an UpdateProvider");
  }

  return context;
}
