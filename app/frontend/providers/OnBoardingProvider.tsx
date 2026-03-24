import { OnboardingContext } from "@/contexts/onBoardingContext";
import { invoke } from "@tauri-apps/api/core";
import React, { useEffect, useState } from "react";

interface LocalModelsStatus {
  embedding_exists: boolean;
  models_path: string;
}

export default function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);
  const [isOnboardingResolved, setIsOnboardingResolved] = useState(false);

  /**
   * Onboarding is complete if model files exist.
   * We check the shared models directory directly so onboarding does not depend
   * on the daemon already being up.
   */
  async function isOnboardingCompleted(): Promise<boolean> {
    try {
      const status = await invoke<LocalModelsStatus>("get_local_models_status");
      const completed = status.embedding_exists;

      console.log("Local model status:", status);
      console.log("Onboarding completed:", completed, "Path:", status.models_path);

      return completed;
    } catch (error) {
      console.log("Could not check local model status:", error);
      return false;
    }
  }

  useEffect(() => {
    isOnboardingCompleted().then((completed) => {
      console.log("Onboarding completed:", completed);
      setIsOnboardingComplete(completed);
      setIsOnboardingResolved(true);
    });
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        currentStep,
        setCurrentStep,
        isOnboardingComplete,
        setIsOnboardingComplete,
        isOnboardingResolved,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}
