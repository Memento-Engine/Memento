"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const TimelineContext = React.createContext<{
  color?: "primary" | "secondary" | "info" | "success" | "warning" | "error"
}>({ color: "secondary" })

const timelineVariants = cva("relative", {
  variants: {
    orientation: {
      vertical: "flex flex-col",
      horizontal: "flex flex-row",
    },
  },
  defaultVariants: {
    orientation: "vertical",
  },
})

interface TimelineProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof timelineVariants> {
  color?: "primary" | "secondary" | "info" | "success" | "warning" | "error"
}

function Timeline({
  className,
  orientation,
  color = "secondary",
  children,
  ...props
}: TimelineProps) {
  return (
    <TimelineContext.Provider value={{ color }}>
      <div
        className={cn(timelineVariants({ orientation }), className)}
        {...props}
      >
        {children}
      </div>
    </TimelineContext.Provider>
  )
}

function TimelineItem({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative flex gap-4 pb-8 last:pb-0", className)}
      {...props}
    />
  )
}

function TimelineHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex w-6 shrink-0 flex-col items-center", className)}
      {...props}
    />
  )
}

function TimelineSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { color = "secondary" } = React.useContext(TimelineContext)

  const colorClasses = {
    primary: "bg-primary",
    secondary: "bg-secondary",
    info: "bg-blue-500",
    success: "bg-green-500",
    warning: "bg-yellow-500",
    error: "bg-destructive",
  }

  return (
    <div
      className={cn(
        "absolute top-3 left-[11px] h-full w-0.5",
        colorClasses[color],
        className
      )}
      {...props}
    />
  )
}

function TimelineIcon({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { color = "secondary" } = React.useContext(TimelineContext)

  const colorClasses = {
    primary: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    info: "bg-blue-500 text-white",
    success: "bg-green-500 text-white",
    warning: "bg-yellow-500 text-white",
    error: "bg-destructive text-white",
  }

  return (
    <div
      className={cn(
        "relative z-10 flex size-6 items-center justify-center rounded-full",
        colorClasses[color],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function TimelineBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 pt-0.5", className)} {...props} />
}

export {
  Timeline,
  TimelineItem,
  TimelineHeader,
  TimelineSeparator,
  TimelineIcon,
  TimelineBody,
  timelineVariants,
}
