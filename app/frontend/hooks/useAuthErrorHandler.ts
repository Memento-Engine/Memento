import { useContext, useCallback } from "react";
import { OnboardingContext } from "@/contexts/onBoardingContext";
import { clearAuthState, isAuthError } from "@/lib/auth";
import { notify } from "@/lib/notify";

/**
 * Hook to handle authentication errors and trigger re-onboarding.
 * 
 * Usage:
 * const { handleAuthError, triggerReOnboarding } = useAuthErrorHandler();
 * 
 * try {
 *   await someApiCall();
 * } catch (error) {
 *   const wasAuthError = await handleAuthError(error);
 *   if (!wasAuthError) {
 *     // Handle other errors
 *   }
 * }
 */
export function useAuthErrorHandler() {
  const context = useContext(OnboardingContext);

  if (!context) {
    throw new Error("useAuthErrorHandler must be used within OnboardingProvider");
  }

  const { setIsOnboardingComplete, setCurrentStep } = context;

  /**
   * Clears auth state and triggers the onboarding flow.
   */
  const triggerReOnboarding = useCallback(async () => {
    await clearAuthState();
    setCurrentStep(0);
    setIsOnboardingComplete(false);
    notify.info("Please register your device to continue.");
  }, [setCurrentStep, setIsOnboardingComplete]);

  /**
   * Handles an error - if it's an auth error, triggers re-onboarding.
   * Returns true if it was an auth error that was handled.
   */
  const handleAuthError = useCallback(async (error: unknown): Promise<boolean> => {
    if (isAuthError(error)) {
      console.error("Auth error detected, triggering re-onboarding:", error);
      await triggerReOnboarding();
      return true;
    }
    return false;
  }, [triggerReOnboarding]);

  return {
    handleAuthError,
    triggerReOnboarding,
  };
}
