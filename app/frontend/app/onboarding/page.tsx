"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, Variants, AnimatePresence } from "framer-motion";
import {
  BrainCircuit,
  ArrowRight,
  LogIn,
  ShieldCheck,
  HardDrive,
  Cloud,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Cpu,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { checkDaemonHealth, onDaemonStatusChange, DaemonStatus } from "@/api/base";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MementoLogo } from "@/components/Logo";
import useOnboarding from "@/hooks/useOnboarding";
import { checkModelsStatus, downloadModelsWithProgress, ModelDownloadProgress } from "@/api/models";
import { cn } from "@/lib/utils";
import useAuth from "@/hooks/useAuth";

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

// Track which steps have been completed
interface StepState {
  completed: boolean;
  canProceed: boolean;
}

export default function OnboardingPage() {
  const { currentStep, setCurrentStep, setIsOnboardingComplete } =
    useOnboarding();

  // Track completion state for each step
  // Step 0: Welcome (always completable)
  // Step 1: Daemon Startup (must wait for daemon)
  // Step 2: Privacy (always completable)  
  // Step 3: Model Download (must complete download)
  // Step 4: Login/Skip (final step)
  const [stepStates, setStepStates] = useState<StepState[]>([
    { completed: false, canProceed: true },  // Welcome
    { completed: false, canProceed: false }, // Daemon Startup
    { completed: false, canProceed: true },  // Privacy
    { completed: false, canProceed: false }, // Model Download
    { completed: false, canProceed: true },  // Login/Skip
  ]);

  // Mark a step as completed and allow proceeding
  const completeStep = useCallback((stepIndex: number) => {
    setStepStates(prev => {
      const newStates = [...prev];
      newStates[stepIndex] = { ...newStates[stepIndex], completed: true, canProceed: true };
      return newStates;
    });
  }, []);

  // Handler to go to next step (restricted by completion)
  const goToNextStep = useCallback((fromStep: number) => {
    if (stepStates[fromStep].canProceed) {
      completeStep(fromStep);
      setCurrentStep(fromStep + 1);
    }
  }, [stepStates, completeStep, setCurrentStep]);

  const handleModelsDownloaded = useCallback(() => {
    completeStep(3);
    setCurrentStep(4);
  }, [completeStep, setCurrentStep]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground relative overflow-hidden px-4 select-none">
      {/* ambient glow */}
      <div className="absolute w-[900px] h-[700px] bg-primary/5 blur-[140px] rounded-full" />

      <AnimatePresence mode="wait">
        {currentStep === 0 && (
          <SlideWrapper key="welcome">
            <WelcomeSlide next={() => goToNextStep(0)} />
          </SlideWrapper>
        )}

        {currentStep === 1 && (
          <SlideWrapper key="daemon-startup">
            <DaemonStartupSlide
              onReady={() => {
                completeStep(1);
                setCurrentStep(2);
              }}
            />
          </SlideWrapper>
        )}

        {currentStep === 2 && (
          <SlideWrapper key="privacy">
            <PrivacySlide onContinue={() => goToNextStep(2)} />
          </SlideWrapper>
        )}

        {currentStep === 3 && (
          <SlideWrapper key="models">
            <ModelDownloadSlide onComplete={handleModelsDownloaded} />
          </SlideWrapper>
        )}

        {currentStep === 4 && (
          <SlideWrapper key="login">
            <LoginSlide 
              onComplete={() => setIsOnboardingComplete(true)} 
            />
          </SlideWrapper>
        )}
      </AnimatePresence>

      <ProgressDots 
        step={currentStep} 
        total={5} 
        stepStates={stepStates}
      />
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
  stepStates,
}: {
  step: number;
  total: number;
  stepStates: StepState[];
}) {
  return (
    <div className="absolute bottom-10 flex gap-3">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            width: i === step ? 28 : 10,
            opacity: stepStates[i]?.completed ? 1 : (i === step ? 1 : 0.4),
          }}
          transition={{ duration: 0.25 }}
          className={cn(
            "h-2 rounded-full",
            stepStates[i]?.completed ? "bg-green-500" : "bg-primary"
          )}
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
    <div className="min-h-screen flex items-center justify-center p-6 sm:p-12">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 w-full max-w-3xl flex flex-col items-center text-center"
      >
        <motion.div variants={item} className="space-y-10 flex flex-col items-center">
          
          <div className="flex items-center justify-center gap-3">
            <MementoLogo size={60} />
            <span className="text-2xl font-semibold tracking-tight">
              memento ai
            </span>
          </div>

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

          <Button
            size="lg"
            className="group text-base px-8 cursor-pointer rounded-full"
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

type DownloadState = "checking" | "ready" | "downloading" | "completed" | "error";

function ModelDownloadSlide({ onComplete }: { onComplete: () => void }) {
  const [downloadState, setDownloadState] = useState<DownloadState>("checking");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Checking model status...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if models are already downloaded on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await checkModelsStatus();
        
        switch (status.status) {
          case "ready":
            setDownloadState("completed");
            setStatusMessage("Models already downloaded and ready!");
            setProgress(100);
            break;
          case "downloaded_not_loaded":
            // Models exist but need restart - treat as complete for onboarding
            setDownloadState("completed");
            setStatusMessage("Models downloaded. They'll be loaded when the app restarts.");
            setProgress(100);
            break;
          case "partial_download":
            setDownloadState("ready");
            setStatusMessage("Some models are missing. Please complete the download.");
            break;
          case "corrupted":
            setDownloadState("error");
            setErrorMessage("Model files appear corrupted. Please re-download.");
            break;
          case "not_downloaded":
          default:
            setDownloadState("ready");
            setStatusMessage(status.message || "AI models need to be downloaded for local processing.");
            break;
        }
      } catch (err) {
        // If daemon is not running, we still need to show the download option
        setDownloadState("ready");
        setStatusMessage("AI models need to be downloaded for local processing.");
      }
    };

    checkStatus();
  }, []);

  const startDownload = () => {
    setDownloadState("downloading");
    setErrorMessage(null);
    setProgress(0);
    setStatusMessage("Starting download...");

    const cleanup = downloadModelsWithProgress(
      (progressData: ModelDownloadProgress) => {
        setProgress(Math.round(progressData.progress * 100));
        setStatusMessage(progressData.message);
        
        if (progressData.completed) {
          setDownloadState("completed");
        }
        
        if (progressData.error) {
          setDownloadState("error");
          setErrorMessage(progressData.error);
        }
      },
      () => {
        setDownloadState("completed");
        setStatusMessage("All models downloaded successfully!");
        setProgress(100);
      },
      (error: string) => {
        setDownloadState("error");
        setErrorMessage(error);
        setStatusMessage("Download failed");
      }
    );

    // Cleanup on unmount
    return cleanup;
  };

  const canContinue = downloadState === "completed";

  return (
    <div className="w-full max-w-xl text-center space-y-8 px-6">
      <div className="flex justify-center">
        {downloadState === "completed" ? (
          <CheckCircle2 className="text-green-500" size={48} />
        ) : downloadState === "error" ? (
          <AlertCircle className="text-destructive" size={48} />
        ) : downloadState === "downloading" ? (
          <Loader2 className="text-primary animate-spin" size={48} />
        ) : (
          <Download className="text-primary" size={48} />
        )}
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold">
        {downloadState === "completed" 
          ? "Models Ready!" 
          : downloadState === "error"
          ? "Download Failed"
          : "Download AI Models"}
      </h1>

      <p className="text-muted-foreground text-lg">
        {downloadState === "completed"
          ? "Your AI models are ready for local processing."
          : downloadState === "error"
          ? "There was a problem downloading the models."
          : "Memento uses local AI models to process your data privately on your device."}
      </p>

      {(downloadState === "downloading" || downloadState === "completed") && (
        <div className="space-y-3">
          <Progress value={progress} className="h-3" />
          <p className="text-sm text-muted-foreground">{statusMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      <div className="flex flex-col items-center gap-4 pt-4">
        {downloadState === "ready" && (
          <Button
            size="lg"
            onClick={startDownload}
            className="cursor-pointer"
          >
            <Download className="mr-2 h-5 w-5" />
            Download Models (~500 MB)
          </Button>
        )}

        {downloadState === "error" && (
          <Button
            size="lg"
            onClick={startDownload}
            variant="outline"
            className="cursor-pointer"
          >
            <Download className="mr-2 h-5 w-5" />
            Retry Download
          </Button>
        )}

        {downloadState === "completed" && (
          <Button
            size="lg"
            onClick={onComplete}
            className="cursor-pointer"
          >
            Continue
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        )}

        {downloadState === "downloading" && (
          <p className="text-sm text-muted-foreground">
            Please wait while models are being downloaded...
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <BrainCircuit size={16} className="text-primary" />
        Models are stored locally and never leave your device.
      </div>
    </div>
  );
}

function LoginSlide({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const { loginWithGoogle, isAuthenticated, isLoading } = useAuth();

  // If user successfully authenticates, complete onboarding
  useEffect(() => {
    if (isAuthenticated) {
      onComplete();
    }
  }, [isAuthenticated, onComplete]);

  const handleSignIn = async () => {
    try {
      await loginWithGoogle();
      // Advance immediately on successful login; auth effect remains a fallback.
      onComplete();
    } catch {
      // AuthProvider already surfaces a toast with the error.
    }
  };

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
        <Button size="lg" onClick={onComplete} className="w-72 cursor-pointer">
          Continue without account
          <ArrowRight className="ml-2 h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="lg"
          onClick={handleSignIn}
          disabled={isLoading}
          className="w-72 text-muted-foreground cursor-pointer"
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LogIn className="mr-2 h-4 w-4" />
          )}
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}

type DaemonState = "starting" | "connecting" | "ready" | "error";

function DaemonStartupSlide({ onReady }: { onReady: () => void }) {
  const [daemonState, setDaemonState] = useState<DaemonState>("starting");
  const [statusMessage, setStatusMessage] = useState("Starting Memento services...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const startAndWaitForDaemon = async () => {
      try {
        // Start the daemon
        setDaemonState("starting");
        setStatusMessage("Starting Memento services...");
        
        await invoke("start_daemon", { isDev: process.env.NODE_ENV === "development" });
        
        setDaemonState("connecting");
        setStatusMessage("Preparing your experience...");

        // Poll for daemon health
        const maxAttempts = 30;
        let attempts = 0;
        
        const pollHealth = async (): Promise<boolean> => {
          while (attempts < maxAttempts) {
            try {
              const isHealthy = await checkDaemonHealth();
              if (isHealthy) {
                return true;
              }
            } catch {
              // Daemon not ready yet, continue polling
            }
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          return false;
        };

        const isReady = await pollHealth();
        
        if (isReady) {
          setDaemonState("ready");
          setStatusMessage("Memento is ready!");
          // Auto-proceed after a brief moment
          setTimeout(() => {
            onReady();
          }, 500);
        } else {
          setDaemonState("error");
          setErrorMessage("Could not connect to Memento services. Please try restarting the app.");
        }
      } catch (err) {
        setDaemonState("error");
        setErrorMessage(String(err));
        setStatusMessage("Failed to start services");
      }
    };

    startAndWaitForDaemon();
  }, [onReady]);

  const retry = async () => {
    hasStarted.current = false;
    setDaemonState("starting");
    setErrorMessage(null);
    setStatusMessage("Starting Memento services...");
    
    // Trigger the effect again
    hasStarted.current = true;
    
    try {
      await invoke("start_daemon", { isDev: process.env.NODE_ENV === "development" });
      setDaemonState("connecting");
      setStatusMessage("Preparing your experience...");

      const maxAttempts = 30;
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        try {
          const isHealthy = await checkDaemonHealth();
          if (isHealthy) {
            setDaemonState("ready");
            setStatusMessage("Memento is ready!");
            setTimeout(() => onReady(), 500);
            return;
          }
        } catch {
          // Continue polling
        }
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      setDaemonState("error");
      setErrorMessage("Could not connect to Memento services. Please try restarting the app.");
    } catch (err) {
      setDaemonState("error");
      setErrorMessage(String(err));
    }
  };

  return (
    <div className="w-full max-w-xl text-center space-y-8 px-6">
      <div className="flex justify-center">
        {daemonState === "ready" ? (
          <CheckCircle2 className="text-green-500" size={48} />
        ) : daemonState === "error" ? (
          <AlertCircle className="text-destructive" size={48} />
        ) : (
          <div className="relative">
            <Cpu className="text-primary" size={48} />
            <Loader2 className="absolute -bottom-1 -right-1 text-primary animate-spin" size={20} />
          </div>
        )}
      </div>

      <h1 className="text-3xl sm:text-4xl font-bold">
        {daemonState === "ready"
          ? "All Set!"
          : daemonState === "error"
          ? "Something Went Wrong"
          : "Setting Things Up"}
      </h1>

      <p className="text-muted-foreground text-lg">
        {daemonState === "ready"
          ? "Memento services are running and ready."
          : daemonState === "error"
          ? "We couldn't start Memento's background services."
          : statusMessage}
      </p>

      {daemonState !== "ready" && daemonState !== "error" && (
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="animate-spin text-primary" size={20} />
          <span className="text-sm text-muted-foreground">{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      {daemonState === "error" && (
        <Button
          size="lg"
          onClick={retry}
          variant="outline"
          className="cursor-pointer"
        >
          Try Again
        </Button>
      )}

      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck size={16} className="text-primary" />
        This runs entirely on your device.
      </div>
    </div>
  );
}
