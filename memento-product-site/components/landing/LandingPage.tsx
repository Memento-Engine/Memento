"use client";

import { Button } from "@/components/ui/button";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  Download,
  EyeOff,
  HardDrive,
  Lock,
  MessageCircle,
  Shield,
} from "lucide-react";
import Image from "next/image";
import { useRef } from "react";

import {
  faqs,
  featureCards,
  highlights,
  howItWorksSteps,
  problemItems,
  useCases,
} from "@/components/landing/content";
import {
  fadeInUp,
  scaleIn,
  slideInLeft,
  slideInRight,
  staggerContainer,
} from "@/components/landing/motion";
import { UseCaseCard } from "@/components/landing/UseCaseCard";
import {
  AskVisual,
  CaptureVisual,
  MaskVisual,
} from "@/components/landing/visuals";

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 1], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 100]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="aurora-bg absolute inset-0" />
        <div className="aurora-glow absolute inset-0" />
        <div className="dot-grid absolute inset-0 opacity-40" />
      </div>

      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl"
      >
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="relative h-7 w-7">
              <Image
                src="/logo.svg"
                alt="Memento"
                fill
                sizes="w-8 h-8"
                className="object-contain w-8 h-8 dark:invert"
              />
            </div>
            <span className="text-xl font-medium tracking-tight">memento</span>
          </div>

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button size="sm" className="cursor-pointer rounded-full px-5">
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
          <motion.div
            style={{ opacity: heroOpacity, y: heroY }}
            className="w-full"
          >
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="mx-auto max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
            >
              Where memories
              <motion.span
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3 }}
                className="mt-2 block gradient-text pb-2"
              >
                become knowledge
              </motion.span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mx-auto mt-8 max-w-2xl text-xl leading-relaxed text-muted-foreground"
            >
              Memento remembers everything you see on your screen, so you can
              search your memory like you search the web. Ask questions, find
              anything, instantly.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="mt-12 flex flex-col gap-4 sm:flex-row sm:justify-center"
            >
              <motion.div
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  size="lg"
                  className="cursor-pointer rounded-full px-10 py-6 text-base"
                >
                  <Download className="mr-2 h-5 w-5" />
                  Download for Windows — Free
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
                    className="group rounded-2xl border border-border/60 bg-card/50 p-5 text-left backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/50 transition-colors group-hover:bg-muted">
                        <Icon className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">
                          {item.label}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.description}
                        </div>
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
              className="flex flex-col items-center gap-2 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
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
            <motion.p
              variants={fadeInUp}
              className="text-sm font-medium text-primary"
            >
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
              className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground"
            >
              Every day, you see hundreds of things on your screen. Important
              things. Useful things. And then they&apos;re gone.
            </motion.p>
          </motion.div>

          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="mt-20 grid gap-6 md:grid-cols-3"
          >
            {problemItems.map((item) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  variants={fadeInUp}
                  whileHover={{ y: -6, scale: 1.01 }}
                  className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/50 p-8"
                >
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100"
                    transition={{ duration: 0.4 }}
                  />
                  <div className="relative z-10">
                    <div className="inline-flex rounded-2xl bg-muted/50 p-4">
                      <Icon className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="mt-6 text-xl font-semibold">{item.title}</h3>
                    <p className="mt-3 text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </section>

        {/* How It Works Section */}
        <section
          id="how-it-works"
          className="mx-auto w-full max-w-7xl px-6 py-32"
        >
          <motion.div
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
          >
            <motion.p
              variants={fadeInUp}
              className="text-sm font-medium text-primary"
            >
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
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-transparent">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-sm font-semibold text-muted-foreground">
                        {index + 1}
                      </span>
                    </div>
                    <h3 className="text-3xl font-bold">{step.title}</h3>
                    <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </motion.div>

                  <motion.div
                    variants={isEven ? slideInRight : slideInLeft}
                    className={`rounded-3xl border border-border/60 bg-card/30 p-2 ${isEven ? "" : "md:col-start-1"}`}
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
            <motion.p
              variants={fadeInUp}
              className="text-sm font-medium text-primary"
            >
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
                  className="group relative overflow-hidden rounded-3xl border border-border/60 bg-card/50 p-8"
                >
                  <motion.div
                    className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100`}
                    transition={{ duration: 0.4 }}
                  />
                  <div className="relative z-10">
                    <motion.div
                      whileHover={{ rotate: 10, scale: 1.1 }}
                      className="inline-flex rounded-2xl bg-muted/50 p-4"
                    >
                      <Icon className="h-6 w-6 text-muted-foreground" />
                    </motion.div>
                    <h3 className="mt-6 text-xl font-semibold">
                      {feature.title}
                    </h3>
                    <p className="mt-3 text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
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
            <motion.p
              variants={fadeInUp}
              className="text-sm font-medium text-primary"
            >
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
              className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground"
            >
              From recipes to meeting notes, from memes to research — if you saw
              it, Memento remembers it.
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
            className="relative overflow-hidden rounded-[2.5rem] border border-border/60 bg-gradient-to-br from-primary/10 via-transparent to-foreground/5"
          >
            <div className="absolute inset-0 aurora-glow opacity-20" />
            <div className="relative z-10 p-12 md:p-20 text-center">
              <motion.div
                variants={scaleIn}
                className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10"
              >
                <Shield className="h-10 w-10 text-primary" />
              </motion.div>

              <motion.h2
                variants={fadeInUp}
                className="mx-auto max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl"
              >
                Your memories. Your device. Your control.
              </motion.h2>

              <motion.p
                variants={fadeInUp}
                className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground"
              >
                We believe your personal data should stay personal. That&apos;s
                why Memento never sends your data anywhere. Everything stays on
                your computer, always.
              </motion.p>

              <motion.div
                variants={staggerContainer}
                className="mt-16 grid gap-8 md:grid-cols-3"
              >
                {[
                  {
                    icon: HardDrive,
                    title: "100% Local",
                    desc: "All data stored on your device",
                  },
                  {
                    icon: Lock,
                    title: "Zero Cloud",
                    desc: "Nothing is ever uploaded",
                  },
                  {
                    icon: EyeOff,
                    title: "You Decide",
                    desc: "Mask any app or website",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.title}
                      variants={fadeInUp}
                      className="text-center"
                    >
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                        <Icon className="h-7 w-7 text-primary" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.desc}
                      </p>
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
            <motion.p
              variants={fadeInUp}
              className="text-sm font-medium text-primary"
            >
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
            {faqs.map((item) => (
              <motion.div
                key={item.q}
                variants={fadeInUp}
                whileHover={{ scale: 1.01 }}
                className="group overflow-hidden rounded-2xl border border-border/60 bg-card/50"
              >
                <div className="p-6">
                  <h3 className="text-lg font-semibold flex items-start gap-3">
                    <MessageCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                    {item.q}
                  </h3>
                  <p className="mt-3 pl-8 leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
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
            className="relative overflow-hidden rounded-[2.5rem] border border-border/60 bg-gradient-to-br from-primary/10 via-background to-foreground/5 p-12 text-center md:p-20"
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
                <span className="block mt-2 gradient-text">everything?</span>
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground"
              >
                Download Memento for free and never lose an important thought,
                idea, or memory again.
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
                    className="cursor-pointer rounded-full px-12 py-7 text-base font-semibold"
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
                className="mt-6 text-sm text-muted-foreground/70"
              >
                No sign-up required • Windows 10/11 • Free forever
              </motion.p>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-background/80">
        <div className="mx-auto w-full max-w-7xl px-6 py-12">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="relative h-7 w-7">
                <Image
                  src="/logo.svg"
                  alt="Memento"
                  fill
                  className="object-contain dark:invert"
                />
              </div>
              <span className="text-base font-semibold tracking-tight">
                Memento
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Memento. Your memory stays yours.
            </p>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-muted-foreground" />
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
