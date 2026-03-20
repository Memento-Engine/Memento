import { OnboardingContext } from "@/contexts/onBoardingContext";
import React, { useEffect, useState } from "react";
import { checkModelsStatus } from "@/api/models";
import { waitForDaemonHealthy } from "@/api/base";

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
   * We check via the daemon API which verifies the actual model directories.
   */
  async function isOnboardingCompleted(): Promise<boolean> {
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const status = await checkModelsStatus();
        console.log("Model status from daemon:", status);
        // Models are ready if status is "ready" or "downloaded_not_loaded"
        const completed =
          status.status === "ready" || status.status === "downloaded_not_loaded";
        console.log(
          "Model status:",
          status.status,
          "Onboarding completed:",
          completed,
        );
        return completed;
      } catch (error) {
        console.log(
          `Could not check model status (attempt ${attempt}/${maxAttempts}):`,
          error,
        );

        if (attempt < maxAttempts) {
          try {
            await waitForDaemonHealthy(5000);
          } catch {
            // Daemon is still starting; retry loop will continue.
          }
        }
      }
    }

    return false;
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
