import { createContext } from "react";

interface OnBoardingContext {
  currentStep: number;
  setCurrentStep: (step: number) => void;

  isOnboardingComplete: boolean;
  setIsOnboardingComplete: (complete: boolean) => void;

  
}

export const OnboardingContext = createContext<OnBoardingContext | undefined>(
  undefined,
);
