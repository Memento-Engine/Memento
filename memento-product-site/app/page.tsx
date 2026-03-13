"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  Brain,
  ChevronDown,
  Clock,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Layers,
  Lock,
  MessageCircle,
  Monitor,
  Search,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";
import { useRef } from "react";

// Animation variants
const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.8 },
};

const scaleIn = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const slideInLeft = {
  initial: { opacity: 0, x: -40 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const slideInRight = {
  initial: { opacity: 0, x: 40 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const highlights = [
  { icon: HardDrive, label: "100% Local", description: "Your data never leaves your device" },
  { icon: Zap, label: "Instant Search", description: "Find anything in milliseconds" },
  { icon: Shield, label: "Private by Design", description: "No cloud, no tracking" },
];

const problemItems = [
  {
    icon: Clock,
    title: "\"What was that thing I saw last week?\"",
    description: "You know you saw it somewhere. A website, a document, an email. But where? Hours of searching leads nowhere.",
  },
  {
    icon: Layers,
    title: "Information overload",
    description: "Hundreds of tabs, documents, and apps. Your brain can't keep up with everything you see daily.",
  },
  {
    icon: Search,
    title: "Search fails you",
    description: "You remember the context but not the exact words. Traditional search can't help when you don't know what to search for.",
  },
];

const howItWorksSteps = [
  {
    icon: Monitor,
    title: "Works while you work",
    description: "Memento quietly runs in the background, remembering what appears on your screen throughout the day.",
    visual: "capture",
  },
  {
    icon: EyeOff,
    title: "You control what's private",
    description: "Mask specific apps, websites, or windows. Banking site? Work email? You decide what stays private.",
    visual: "mask",
  },
  {
    icon: Brain,
    title: "Ask in plain English",
    description: "\"What was that restaurant my friend mentioned?\" — Just ask naturally and get instant answers.",
    visual: "ask",
  },
];

const featureCards = [
  {
    icon: HardDrive,
    title: "Stays on your computer",
    description: "Everything is stored locally on your device. No cloud uploads, no external servers, your memories are yours alone.",
    gradient: "from-emerald-500/20 to-teal-500/20",
  },
  {
    icon: EyeOff,
    title: "Mask what you want",
    description: "Exclude specific apps, websites, or windows from being captured. Perfect for sensitive work or personal browsing.",
    gradient: "from-violet-500/20 to-purple-500/20",
  },
  {
    icon: Search,
    title: "Search the way you think",
    description: "Don't remember exact words? No problem. Ask questions like you'd ask a friend who was sitting next to you.",
    gradient: "from-cyan-500/20 to-blue-500/20",
  },
  {
    icon: Clock,
    title: "Travel back in time",
    description: "Browse through your day, week, or month. See exactly what you were looking at and when.",
    gradient: "from-amber-500/20 to-orange-500/20",
  },
  {
    icon: Zap,
    title: "Lightning fast",
    description: "Built for speed. Search through months of memories in milliseconds without slowing down your computer.",
    gradient: "from-pink-500/20 to-rose-500/20",
  },
  {
    icon: Lock,
    title: "No account needed",
    description: "No sign-ups, no subscriptions, no data collection. Download, install, and start remembering.",
    gradient: "from-green-500/20 to-emerald-500/20",
  },
];

const useCases = [
  {
    title: "\"What was that article about productivity I read?\"",
    answer: "Found it! You read that on Medium last Tuesday at 3:42 PM.",
    icon: "📰",
  },
  {
    title: "\"Show me that recipe from last week\"",
    answer: "Here's the pasta recipe you saved from that cooking blog.",
    icon: "🍝",
  },
  {
    title: "\"What did the meeting notes say about the deadline?\"",
    answer: "From your Monday standup: deadline moved to March 15th.",
    icon: "📅",
  },
  {
    title: "\"Find that meme my friend sent me\"",
    answer: "Found 3 memes from this week. Here's the one about coding.",
    icon: "😂",
  },
];

const faqs = [
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

// Animated visual components
function CaptureVisual() {
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent">
      <motion.div
        className="absolute inset-4 rounded-lg border border-white/10 bg-white/[0.02]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Screen content mockup */}
        <div className="p-3">
          <div className="flex gap-1.5 mb-3">
            <div className="h-2 w-2 rounded-full bg-white/20" />
            <div className="h-2 w-2 rounded-full bg-white/20" />
            <div className="h-2 w-2 rounded-full bg-white/20" />
          </div>
          <div className="space-y-2">
            <div className="h-2 w-3/4 rounded bg-white/10" />
            <div className="h-2 w-1/2 rounded bg-white/10" />
            <div className="h-2 w-2/3 rounded bg-white/10" />
          </div>
        </div>
      </motion.div>
      {/* Scanning line animation */}
      <motion.div
        className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
        initial={{ top: "1rem" }}
        animate={{ top: ["1rem", "10rem", "1rem"] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Capture indicator */}
      <motion.div
        className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-emerald-500/20 px-3 py-1"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0.5, 1, 0.5], scale: 1 }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="text-[10px] text-emerald-400">Remembering</span>
      </motion.div>
    </div>
  );
}

function MaskVisual() {
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent">
      <div className="absolute inset-4 grid grid-cols-2 gap-2">
        {/* Visible app */}
        <motion.div
          className="rounded-lg border border-white/10 bg-white/[0.02] p-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <div className="h-3 w-3 rounded bg-cyan-400/40" />
            <div className="h-1.5 w-12 rounded bg-white/20" />
          </div>
          <div className="space-y-1">
            <div className="h-1.5 w-full rounded bg-white/10" />
            <div className="h-1.5 w-2/3 rounded bg-white/10" />
          </div>
          <motion.div 
            className="mt-2 flex items-center gap-1 text-[8px] text-emerald-400"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <Eye className="h-2 w-2" /> Visible
          </motion.div>
        </motion.div>
        
        {/* Masked app with blur */}
        <motion.div
          className="relative rounded-lg border border-violet-400/30 bg-violet-500/10 p-2 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <motion.div
            className="absolute inset-0 backdrop-blur-sm bg-violet-900/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          />
          <div className="relative z-10">
            <div className="flex items-center gap-1.5 mb-2 opacity-30">
              <div className="h-3 w-3 rounded bg-white/40" />
              <div className="h-1.5 w-12 rounded bg-white/20" />
            </div>
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.8, type: "spring" }}
            >
              <div className="rounded-full bg-violet-500/30 p-2">
                <EyeOff className="h-4 w-4 text-violet-300" />
              </div>
            </motion.div>
          </div>
          <motion.div 
            className="absolute bottom-2 left-2 flex items-center gap-1 text-[8px] text-violet-300 z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <EyeOff className="h-2 w-2" /> Masked
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

function AskVisual() {
  return (
    <div className="relative h-48 w-full overflow-hidden rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent p-4">
      <div className="space-y-3">
        {/* User question */}
        <motion.div
          className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-cyan-500/20 p-3"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <p className="text-[11px] text-cyan-100">What was that coffee shop recommendation?</p>
        </motion.div>
        
        {/* Thinking animation */}
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ delay: 0.6, duration: 1.5 }}
        >
          <div className="h-6 w-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Sparkles className="h-3 w-3 text-emerald-400" />
          </div>
          <div className="flex gap-1">
            <motion.div className="h-1.5 w-1.5 rounded-full bg-white/40" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0 }} />
            <motion.div className="h-1.5 w-1.5 rounded-full bg-white/40" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }} />
            <motion.div className="h-1.5 w-1.5 rounded-full bg-white/40" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }} />
          </div>
        </motion.div>

        {/* AI response */}
        <motion.div
          className="max-w-[85%] rounded-2xl rounded-tl-sm bg-emerald-500/10 border border-emerald-500/20 p-3"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 2 }}
        >
          <div className="flex items-start gap-2">
            <div className="h-5 w-5 rounded-full bg-emerald-500/30 flex-shrink-0 flex items-center justify-center mt-0.5">
              <Sparkles className="h-2.5 w-2.5 text-emerald-400" />
            </div>
            <div>
              <p className="text-[11px] text-emerald-100">Found it! Sarah mentioned "Blue Bottle Coffee" when you were chatting on Tuesday.</p>
              <p className="text-[9px] text-white/40 mt-1">From: iMessage • 2 days ago</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function UseCaseCard({ item, index }: { item: typeof useCases[0]; index: number }) {
  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ scale: 1.02, y: -4 }}
      className="group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-5"
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100"
        transition={{ duration: 0.3 }}
      />
      <div className="relative z-10">
        <span className="text-3xl">{item.icon}</span>
        <p className="mt-3 text-sm font-medium text-white/80">{item.title}</p>
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          whileInView={{ opacity: 1, height: "auto" }}
          transition={{ delay: 0.3 + index * 0.1 }}
          className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3"
        >
          <div className="flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-emerald-200/80">{item.answer}</p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 100]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0a0a0a] text-white">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="aurora-bg absolute inset-0" />
        <div className="aurora-glow absolute inset-0" />
        <div className="dot-grid absolute inset-0 opacity-30" />
      </div>

      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="sticky top-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl"
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <motion.div
              whileHover={{ rotate: 180 }}
              transition={{ duration: 0.4 }}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400"
            >
              <Sparkles className="h-4 w-4 text-black" />
            </motion.div>
            <span className="text-base font-semibold tracking-tight">Memento</span>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-white/60 md:flex">
            {["How it works", "Features", "Use cases", "FAQ"].map((item) => (
              <motion.a
                key={item}
                href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                className="relative transition-colors hover:text-white"
                whileHover={{ y: -1 }}
              >
                {item}
              </motion.a>
            ))}
          </nav>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              size="sm"
              className="cursor-pointer rounded-full bg-white px-5 text-black hover:bg-white/90"
            >
              <Download className="mr-2 h-4 w-4" />
              Download Free
            </Button>
          </motion.div>
        </div>
      </motion.header>

      <main>
        {/* Hero Section */}
        <section
          ref={heroRef}
          className="relative mx-auto flex min-h-[95vh] w-full max-w-7xl flex-col items-center justify-center px-6 py-20 text-center"
        >
          <motion.div style={{ opacity: heroOpacity, y: heroY }} className="w-full">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="mb-8"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400">
                <motion.span
                  animate={{ rotate: [0, 15, -15, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  ✨
                </motion.span>
                Your personal memory assistant
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="max-w-4xl mx-auto text-5xl font-bold tracking-tight sm:text-7xl lg:text-8xl"
            >
              Never forget
              <motion.span
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3 }}
                className="mt-2 block bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent"
              >
                anything again
              </motion.span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mx-auto mt-8 max-w-2xl text-xl leading-relaxed text-white/60"
            >
              Memento remembers everything you see on your screen, so you can search your memory like you search the web. Ask questions, find anything, instantly.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center"
            >
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Button
                  size="lg"
                  className="cursor-pointer rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 px-10 py-6 text-base font-semibold text-black hover:opacity-90"
                >
                  <Download className="mr-2 h-5 w-5" />
                  Download for Windows — Free
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.98 }}>
                <Button
                  size="lg"
                  variant="outline"
                  className="cursor-pointer rounded-full border-white/10 bg-white/5 px-8 py-6 text-base text-white hover:bg-white/10"
                >
                  See it in action
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="mt-20 grid max-w-3xl mx-auto gap-6 sm:grid-cols-3"
            >
              {highlights.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 + index * 0.1 }}
                    whileHover={{ y: -4, scale: 1.02 }}
                    className="group rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-left backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 group-hover:from-emerald-500/30 group-hover:to-cyan-500/30 transition-colors">
                        <Icon className="h-5 w-5 text-emerald-400" />
                      </div>
                      <div>
                        <div className="font-semibold text-white">{item.label}</div>
                        <div className="text-xs text-white/40">{item.description}</div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.2 }}
            className="absolute bottom-8"
          >
            <motion.a
              href="#problem"
              className="flex flex-col items-center gap-2 text-white/30 transition-colors hover:text-white/50"
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="text-xs">Scroll to explore</span>
              <ChevronDown className="h-4 w-4" />
            </motion.a>
          </motion.div>
        </section>

        {/* Problem Section */}
        <section id="problem" className="mx-auto w-full max-w-7xl px-6 py-32">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="text-center"
          >
            <motion.p variants={fadeInUp} className="text-sm font-medium text-violet-400">
              Sound familiar?
            </motion.p>
            <motion.h2
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl"
            >
              Your brain wasn&apos;t built to remember everything
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-6 max-w-2xl text-lg text-white/50"
            >
              Every day, you see hundreds of things on your screen. Important things. Useful things. And then they&apos;re gone.
            </motion.p>
          </motion.div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="mt-20 grid gap-6 md:grid-cols-3"
          >
            {problemItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  variants={fadeInUp}
                  whileHover={{ y: -6, scale: 1.01 }}
                  className="group relative rounded-3xl border border-white/5 bg-white/[0.02] p-8 overflow-hidden"
                >
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100"
                    transition={{ duration: 0.4 }}
                  />
                  <div className="relative z-10">
                    <div className="inline-flex rounded-2xl bg-white/5 p-4">
                      <Icon className="h-6 w-6 text-white/50" />
                    </div>
                    <h3 className="mt-6 text-xl font-semibold">{item.title}</h3>
                    <p className="mt-3 text-white/40 leading-relaxed">{item.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="mx-auto w-full max-w-7xl px-6 py-32">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
          >
            <motion.p variants={fadeInUp} className="text-sm font-medium text-emerald-400">
              How it works
            </motion.p>
            <motion.h2
              variants={fadeInUp}
              className="mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl"
            >
              Simple. Private. Powerful.
            </motion.h2>
          </motion.div>

          <div className="mt-20 space-y-24">
            {howItWorksSteps.map((step, index) => {
              const Icon = step.icon;
              const isEven = index % 2 === 0;
              return (
                <motion.div
                  key={step.title}
                  initial="initial"
                  whileInView="animate"
                  viewport={{ once: true, margin: "-100px" }}
                  variants={staggerContainer}
                  className={`grid gap-12 items-center md:grid-cols-2 ${isEven ? "" : "md:grid-flow-dense"}`}
                >
                  <motion.div
                    variants={isEven ? slideInLeft : slideInRight}
                    className={isEven ? "" : "md:col-start-2"}
                  >
                    <div className="flex items-center gap-4 mb-6">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20">
                        <Icon className="h-6 w-6 text-emerald-400" />
                      </div>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-sm font-semibold text-white/60">
                        {index + 1}
                      </span>
                    </div>
                    <h3 className="text-3xl font-bold">{step.title}</h3>
                    <p className="mt-4 text-lg text-white/50 leading-relaxed">{step.description}</p>
                  </motion.div>
                  
                  <motion.div
                    variants={isEven ? slideInRight : slideInLeft}
                    className={`rounded-3xl border border-white/5 bg-white/[0.01] p-2 ${isEven ? "" : "md:col-start-1"}`}
                  >
                    {step.visual === "capture" && <CaptureVisual />}
                    {step.visual === "mask" && <MaskVisual />}
                    {step.visual === "ask" && <AskVisual />}
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="mx-auto w-full max-w-7xl px-6 py-32">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="text-center"
          >
            <motion.p variants={fadeInUp} className="text-sm font-medium text-cyan-400">
              Features
            </motion.p>
            <motion.h2
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl"
            >
              Everything you need, nothing you don&apos;t
            </motion.h2>
          </motion.div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="mt-20 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {featureCards.map((feature) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  variants={fadeInUp}
                  whileHover={{ y: -6, scale: 1.01 }}
                  className="group relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.02] p-8"
                >
                  <motion.div
                    className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100`}
                    transition={{ duration: 0.4 }}
                  />
                  <div className="relative z-10">
                    <motion.div
                      whileHover={{ rotate: 10, scale: 1.1 }}
                      className="inline-flex rounded-2xl bg-white/5 p-4"
                    >
                      <Icon className="h-6 w-6 text-white/70" />
                    </motion.div>
                    <h3 className="mt-6 text-xl font-semibold">{feature.title}</h3>
                    <p className="mt-3 text-white/40 leading-relaxed">{feature.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </section>

        {/* Use Cases Section */}
        <section id="use-cases" className="mx-auto w-full max-w-7xl px-6 py-32">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="text-center"
          >
            <motion.p variants={fadeInUp} className="text-sm font-medium text-amber-400">
              Real examples
            </motion.p>
            <motion.h2
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl"
            >
              Ask anything, find everything
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-6 max-w-2xl text-lg text-white/50"
            >
              From recipes to meeting notes, from memes to research — if you saw it, Memento remembers it.
            </motion.p>
          </motion.div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="mt-16 grid gap-6 sm:grid-cols-2"
          >
            {useCases.map((item, index) => (
              <UseCaseCard key={item.title} item={item} index={index} />
            ))}
          </motion.div>
        </section>

        {/* Privacy Section */}
        <section className="mx-auto w-full max-w-7xl px-6 py-32">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-gradient-to-br from-emerald-500/5 via-transparent to-violet-500/5"
          >
            <div className="absolute inset-0 aurora-glow opacity-20" />
            <div className="relative z-10 p-12 md:p-20 text-center">
              <motion.div
                variants={scaleIn}
                className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20"
              >
                <Shield className="h-10 w-10 text-emerald-400" />
              </motion.div>
              
              <motion.h2
                variants={fadeInUp}
                className="mx-auto max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl"
              >
                Your memories. Your device. Your control.
              </motion.h2>
              
              <motion.p
                variants={fadeInUp}
                className="mx-auto mt-6 max-w-2xl text-lg text-white/50"
              >
                We believe your personal data should stay personal. That&apos;s why Memento never sends your data anywhere. Everything stays on your computer, always.
              </motion.p>

              <motion.div
                variants={staggerContainer}
                className="mt-16 grid gap-8 md:grid-cols-3"
              >
                {[
                  { icon: HardDrive, title: "100% Local", desc: "All data stored on your device" },
                  { icon: Lock, title: "Zero Cloud", desc: "Nothing is ever uploaded" },
                  { icon: EyeOff, title: "You Decide", desc: "Mask any app or website" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <motion.div key={item.title} variants={fadeInUp} className="text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
                        <Icon className="h-7 w-7 text-emerald-400" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                      <p className="mt-1 text-sm text-white/40">{item.desc}</p>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          </motion.div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="mx-auto w-full max-w-4xl px-6 py-32">
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="text-center"
          >
            <motion.p variants={fadeInUp} className="text-sm font-medium text-emerald-400">
              FAQ
            </motion.p>
            <motion.h2
              variants={fadeInUp}
              className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl"
            >
              Common questions
            </motion.h2>
          </motion.div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="mt-16 space-y-4"
          >
            {faqs.map((item, index) => (
              <motion.div
                key={item.q}
                variants={fadeInUp}
                whileHover={{ scale: 1.01 }}
                className="group rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden"
              >
                <div className="p-6">
                  <h3 className="text-lg font-semibold flex items-start gap-3">
                    <MessageCircle className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    {item.q}
                  </h3>
                  <p className="mt-3 text-white/50 pl-8 leading-relaxed">{item.a}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* CTA Section */}
        <section className="mx-auto w-full max-w-7xl px-6 pb-32 pt-8">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative overflow-hidden rounded-[2.5rem] border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-violet-500/10 p-12 text-center md:p-20"
          >
            <div className="aurora-bg pointer-events-none absolute inset-0 opacity-40" />
            <div className="relative z-10">
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="text-4xl font-bold tracking-tight sm:text-6xl"
              >
                Ready to remember
                <span className="block mt-2 bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent">
                  everything?
                </span>
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="mx-auto mt-6 max-w-xl text-lg text-white/50"
              >
                Download Memento for free and never lose an important thought, idea, or memory again.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="mt-10"
              >
                <motion.div
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-block"
                >
                  <Button
                    size="lg"
                    className="cursor-pointer rounded-full bg-white px-12 py-7 text-base font-semibold text-black hover:bg-white/90"
                  >
                    <Download className="mr-2 h-5 w-5" />
                    Download for Windows — It&apos;s Free
                  </Button>
                </motion.div>
              </motion.div>
              <motion.p
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.5 }}
                className="mt-6 text-sm text-white/30"
              >
                No sign-up required • Windows 10/11 • Free forever
              </motion.p>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#0a0a0a]/90">
        <div className="mx-auto w-full max-w-7xl px-6 py-12">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-400">
                <Sparkles className="h-4 w-4 text-black" />
              </div>
              <span className="text-base font-semibold tracking-tight">Memento</span>
            </div>
            
            <p className="text-sm text-white/30">
              © {new Date().getFullYear()} Memento. Your memory stays yours.
            </p>

            <div className="flex items-center gap-4 text-sm text-white/30">
              <span className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-emerald-400/60" />
                100% Local
              </span>
              <span>•</span>
              <span>Windows 10/11</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}