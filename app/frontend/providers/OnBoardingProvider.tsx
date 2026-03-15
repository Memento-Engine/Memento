import { OnboardingContext } from "@/contexts/onBoardingContext";
import React, { useMemo, useState } from "react";
import { getPassword } from "tauri-plugin-keyring-api";

export default function OnboardingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isOnboardingComplete, setIsOnboardingComplete] = useState(false);

  async function isOnboardingCompleted(): Promise<boolean> {
    try {
      // Check if device ID exists in localStorage
      const deviceId = localStorage.getItem("deviceId");
      if (!deviceId) {
        console.log("No device ID found in localStorage");
        return false;
      }

      // Check if refresh token exists in keyring
      const serviceName = "memento-ai";
      const accountName = "device-token";

      const savedPassword = await getPassword(serviceName, accountName);
      return savedPassword !== null && savedPassword !== undefined;
    } catch (error) {
      // If the credential doesn't exist or permissions fail, it will throw an error
      console.error("No credential found or failed to read:", error);
      return false;
    }
  }

  useMemo(() => {
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
