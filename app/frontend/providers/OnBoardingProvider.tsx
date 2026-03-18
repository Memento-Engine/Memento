import { OnboardingContext } from "@/contexts/onBoardingContext";
import React, { useEffect, useState } from "react";
import { checkModelsStatus } from "@/api/models";

export default function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);

  /**
   * Onboarding is complete if model files exist.
   * We check via the daemon API which verifies the actual model directories.
   */
  async function isOnboardingCompleted(): Promise<boolean> {
    try {
      const status = await checkModelsStatus();
      console.log("Model status from daemon:", status);
      // Models are ready if status is "ready" or "downloaded_not_loaded"
      const completed = status.status === "ready" || status.status === "downloaded_not_loaded";
      console.log("Model status:", status.status, "Onboarding completed:", completed);
      return completed;
    } catch (error) {
      // If daemon isn't running yet, models aren't ready
      console.log("Could not check model status (daemon may not be running):", error);
      return false;
    }
  }

  useEffect(() => {
    isOnboardingCompleted().then((completed) => {
      console.log("Onboarding completed:", completed);
      setIsOnboardingComplete(completed);
    });
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        currentStep,
        setCurrentStep,
        isOnboardingComplete,
        setIsOnboardingComplete,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}
