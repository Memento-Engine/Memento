"use client";

import React, { useState, useEffect } from "react";
import { motion, Variants, AnimatePresence } from "framer-motion";
import {
  BrainCircuit,
  ArrowRight,
  Database,
  Search,
  LogIn,
  Server,
  ShieldCheck,
  HardDrive,
  Cloud,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { MementoLogo } from "@/components/Logo";
import useOnboarding from "@/hooks/useOnboarding";
import { registerDevice } from "@/api/registerDevice";
import { cn } from "@/lib/utils";

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="flex gap-4 p-4 rounded-xl border border-border/40 bg-muted/30 backdrop-blur-sm"
    >
      <div className="text-primary">{icon}</div>

      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
    </motion.div>
  );
}

export default function OnboardingPage() {
  const { currentStep, setCurrentStep, setIsOnboardingComplete } =
    useOnboarding();

  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setCurrentStep(Math.min(currentStep + 1, 3));

      if (e.key === "ArrowLeft") setCurrentStep(Math.max(currentStep - 1, 0));
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentStep, setCurrentStep]);

  const handleDeviceRegistration = async (): Promise<void> => {
    setIsRegistering(true);
    try {
      await registerDevice();
      setCurrentStep(3);
    } catch (err: unknown) {
      console.error("Device registration failed:", err);
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground relative overflow-hidden px-4 select-none">
      {/* ambient glow */}
      <div className="absolute w-[900px] h-[700px] bg-primary/5 blur-[140px] rounded-full" />

      <AnimatePresence mode="wait">
        {currentStep === 0 && (
          <SlideWrapper key="welcome">
            <WelcomeSlide next={() => setCurrentStep(1)} />
          </SlideWrapper>
        )}

        {currentStep === 1 && (
          <SlideWrapper key="privacy">
            <PrivacySlide onContinue={() => setCurrentStep(2)} />
          </SlideWrapper>
        )}

        {currentStep === 2 && (
          <SlideWrapper key="device">
            <DeviceRegistrationSlide
              onRegister={handleDeviceRegistration}
              isLoading={isRegistering}
            />
          </SlideWrapper>
        )}

        {currentStep === 3 && (
          <SlideWrapper key="login">
            <LoginSlide onLogin={() => {}} onSkip={() => {}} />
          </SlideWrapper>
        )}
      </AnimatePresence>

      <ProgressDots step={currentStep} total={4} setStep={setCurrentStep} />
    </div>
  );
}

function SlideWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
      className="absolute inset-0 flex items-center justify-center px-6"
    >
      {children}
    </motion.div>
  );
}

function ProgressDots({
  step,
  total,
  setStep,
}: {
  step: number;
  total: number;
  setStep: (s: number) => void;
}) {
  return (
    <div className="absolute bottom-10 flex gap-3">
      {Array.from({ length: total }).map((_, i) => (
        <motion.button
          key={i}
          onClick={() => setStep(i)}
          animate={{
            width: i === step ? 28 : 10,
            opacity: i === step ? 1 : 0.4,
          }}
          transition={{ duration: 0.25 }}
          className="h-2 rounded-full bg-primary cursor-pointer"
        />
      ))}
    </div>
  );
}

function WelcomeSlide({ next }: { next: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const container: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.2 },
    },
  };

  const item: Variants = {
    hidden: { opacity: 0, y: 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 90, damping: 16 },
    },
  };

  const handleContinue = () => {
    setIsSubmitting(true);

    setTimeout(() => {
      next();
      setIsSubmitting(false);
    }, 400);
  };

return (
    // Added a full-screen wrapper to center everything vertically and horizontally
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-12">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        // Changed from grid to a narrower, centered flex container
        className="relative z-10 w-full max-w-3xl flex flex-col items-center text-center"
      >
        <motion.div variants={item} className="space-y-10 flex flex-col items-center">
          
          {/* Centered Logo & Brand */}
          <div className="flex items-center justify-center gap-3">
            <MementoLogo size={60} />
            <span className="text-2xl font-semibold tracking-tight">
              memento ai
            </span>
          </div>

          {/* Centered Typography */}
          <div className="space-y-6 flex flex-col items-center">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
              Where memory
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                becomes knowledge
              </span>
            </h1>

            <p className="text-muted-foreground text-lg sm:text-xl max-w-lg mx-auto">
              Memento captures your digital activity and transforms it into
              searchable knowledge so you never lose context again.
            </p>
          </div>

          {/* Button aligned to the center */}
          <Button
            size="lg"
            className="group text-base px-8 cursor-pointer rounded-full" // Added rounded-full for a softer onboarding look (optional)
            onClick={handleContinue}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Initializing..." : "Get Started"}

            {!isSubmitting && (
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            )}
          </Button>

        </motion.div>
      </motion.div>
    </div>
  );
}

function PrivacySlide({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="w-full max-w-6xl grid lg:grid-cols-2 grid-cols-1 gap-12 lg:gap-16 items-center px-4">
      <div className="space-y-6">
        <div className="flex items-center gap-3 text-primary">
          <ShieldCheck size={28} />
          <span className="font-semibold text-lg">Privacy First</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
          Your data stays
          <br />
          <span className="text-primary">on your device</span>
        </h1>

        <p className="text-muted-foreground text-lg max-w-lg">
          Memento observes your screen to build memory, but everything is
          processed and stored locally on your machine.
        </p>

        <Button size="lg" onClick={onContinue} className="cursor-pointer">
          Continue
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
      </div>

      <div className="space-y-4 lg:space-y-6">
        <Feature
          icon={<HardDrive />}
          title="Local Storage"
          text="Your activity timeline is stored securely on your device."
        />

        <Feature
          icon={<Cloud />}
          title="Smart Sync"
          text="Only minimal information required for AI search is sent to the server."
        />

        <Feature
          icon={<ShieldCheck />}
          title="Private by Design"
          text="Your screen data never leaves your machine unless needed."
        />
      </div>
    </div>
  );
}

function DeviceRegistrationSlide({
  onRegister,
  isLoading,
}: {
  onRegister: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="w-full max-w-xl text-center space-y-8 px-6">
      <div className="flex justify-center">
        <Server className="text-primary" size={40} />
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold">Register this device</h1>

      <p className="text-muted-foreground text-lg">
        To prevent spam and abuse, Memento registers your device with our
        servers.
      </p>

      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck size={16} className="text-primary" />
        This only creates a device ID. Your data stays local.
      </div>

      <Button
        className={cn(isLoading ? "cursor-not-allowed" : "", "cursor-pointer")}
        size="lg"
        onClick={onRegister}
        disabled={isLoading}
      >
        {isLoading ? "Registering device..." : "Register device"}
        {!isLoading && <ArrowRight className="ml-2 h-5 w-5" />}
      </Button>
    </div>
  );
}

function LoginSlide({
  onLogin,
  onSkip,
}: {
  onLogin: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="w-full max-w-xl text-center space-y-8 px-6">
      <div className="flex justify-center">
        <HardDrive className="text-primary" size={40} />
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold">
        Use Memento <span className="text-primary">without an account</span>
      </h1>

      <p className="text-muted-foreground text-lg">
        Memento is local-first. Your data stays on your machine.
      </p>

      <p className="text-muted-foreground text-sm">
        Sign in only if you want optional cloud features like sync or backup.
      </p>

      <div className="flex flex-col gap-4 items-center pt-4">
        <Button size="lg" onClick={onSkip} className="w-72 cursor-pointer">
          Continue without account
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="lg"
          onClick={onLogin}
          className="w-72 text-muted-foreground cursor-pointer"
        >
          <LogIn className="mr-2 h-4 w-4" />
          Sign in
        </Button>
      </div>
    </div>
  );
}
