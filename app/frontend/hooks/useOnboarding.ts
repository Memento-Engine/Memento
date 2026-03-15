import { OnboardingContext } from "@/contexts/onBoardingContext";
import { useContext } from "react";

export default function useOnboarding() {
    const context = useContext(OnboardingContext);
    if (context == undefined) {
        throw new Error('useOnboarding must be used within the OnboardingProvider');
    }

    return context;
}