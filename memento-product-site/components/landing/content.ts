import type { LucideIcon } from "lucide-react";
import {
  Brain,
  Clock,
  EyeOff,
  HardDrive,
  Layers,
  Lock,
  Monitor,
  Search,
  Shield,
  Zap,
} from "lucide-react";

export type Highlight = {
  icon: LucideIcon;
  label: string;
  description: string;
};

export type ProblemItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export type HowItWorksStep = {
  icon: LucideIcon;
  title: string;
  description: string;
  visual: "capture" | "mask" | "ask";
};

export type FeatureCard = {
  icon: LucideIcon;
  title: string;
  description: string;
  gradient: string;
};

export type UseCase = {
  title: string;
  answer: string;
  icon: string;
};

export type Faq = {
  q: string;
  a: string;
};

export const highlights: Highlight[] = [
  {
    icon: HardDrive,
    label: "100% Local",
    description: "Your data never leaves your device",
  },
  {
    icon: Zap,
    label: "Instant Search",
    description: "Find anything in milliseconds",
  },
  {
    icon: Shield,
    label: "Private by Design",
    description: "No cloud, no tracking",
  },
];

export const problemItems: ProblemItem[] = [
  {
    icon: Clock,
    title: '"What was that thing I saw last week?"',
    description:
      "You know you saw it somewhere. A website, a document, an email. But where? Hours of searching leads nowhere.",
  },
  {
    icon: Layers,
    title: "Information overload",
    description:
      "Hundreds of tabs, documents, and apps. Your brain can't keep up with everything you see daily.",
  },
  {
    icon: Search,
    title: "Search fails you",
    description:
      "You remember the context but not the exact words. Traditional search can't help when you don't know what to search for.",
  },
];

export const howItWorksSteps: HowItWorksStep[] = [
  {
    icon: Monitor,
    title: "Works while you work",
    description:
      "Memento quietly runs in the background, remembering what appears on your screen throughout the day.",
    visual: "capture",
  },
  {
    icon: EyeOff,
    title: "You control what's private",
    description:
      "Mask specific apps, websites, or windows. Banking site? Work email? You decide what stays private.",
    visual: "mask",
  },
  {
    icon: Brain,
    title: "Ask in plain English",
    description:
      '"What was that restaurant my friend mentioned?" — Just ask naturally and get instant answers.',
    visual: "ask",
  },
];

export const featureCards: FeatureCard[] = [
  {
    icon: HardDrive,
    title: "Stays on your computer",
    description:
      "Everything is stored locally on your device. No cloud uploads, no external servers, your memories are yours alone.",
    gradient: "from-foreground/8 to-transparent",
  },
  {
    icon: EyeOff,
    title: "Mask what you want",
    description:
      "Exclude specific apps, websites, or windows from being captured. Perfect for sensitive work or personal browsing.",
    gradient: "from-muted-foreground/10 to-transparent",
  },
  {
    icon: Search,
    title: "Search the way you think",
    description:
      "Don't remember exact words? No problem. Ask questions like you'd ask a friend who was sitting next to you.",
    gradient: "from-foreground/6 to-transparent",
  },
  {
    icon: Clock,
    title: "Travel back in time",
    description:
      "Browse through your day, week, or month. See exactly what you were looking at and when.",
    gradient: "from-muted-foreground/8 to-transparent",
  },
  {
    icon: Zap,
    title: "Lightning fast",
    description:
      "Built for speed. Search through months of memories in milliseconds without slowing down your computer.",
    gradient: "from-foreground/7 to-transparent",
  },
  {
    icon: Lock,
    title: "No account needed",
    description:
      "No sign-ups, no subscriptions, no data collection. Download, install, and start remembering.",
    gradient: "from-muted-foreground/9 to-transparent",
  },
];

export const useCases: UseCase[] = [
  {
    title: '"What was that article about productivity I read?"',
    answer: "Found it! You read that on Medium last Tuesday at 3:42 PM.",
    icon: "📰",
  },
  {
    title: '"Show me that recipe from last week"',
    answer: "Here's the pasta recipe you saved from that cooking blog.",
    icon: "🍝",
  },
  {
    title: '"What did the meeting notes say about the deadline?"',
    answer: "From your Monday standup: deadline moved to March 15th.",
    icon: "📅",
  },
  {
    title: '"Find that meme my friend sent me"',
    answer: "Found 3 memes from this week. Here's the one about coding.",
    icon: "😂",
  },
];

export const faqs: Faq[] = [
  {
    q: "Is my data really private?",
    a: "Yes, 100%. Everything stays on your computer. We physically cannot see your data because it never leaves your device. No cloud, no servers, no access.",
  },
  {
    q: "Will it slow down my computer?",
    a: "Not at all. Memento uses minimal resources and runs silently in the background. Most users forget it's even running.",
  },
  {
    q: "Can I exclude certain apps or websites?",
    a: "Absolutely. You can mask any app, website, or window you want. Banking sites, private messages, work apps — you have full control.",
  },
  {
    q: "How far back can I search?",
    a: "As far as you want! Memento stores your memories locally, limited only by your hard drive space. Months or even years of searchable history.",
  },
  {
    q: "What if I want to delete something?",
    a: "You can delete any memory at any time. Select it and remove it permanently. It's your data, your control.",
  },
  {
    q: "Does it work offline?",
    a: "Yes! Since everything runs locally, you can search your memories even without an internet connection.",
  },
];
