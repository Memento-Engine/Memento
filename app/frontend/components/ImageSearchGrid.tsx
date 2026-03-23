"use client"

import React, { memo } from "react"
import {
  Card,
  CardContent,
} from "@/components/ui/card"

import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog"

import { Badge } from "@/components/ui/badge"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { SourceRecord } from "./types"
import { renderDate } from "@/lib/utils"
import { resolveImageSrc } from "@/lib/imageSrc"

interface ImageSearchGridProps {
  sources: SourceRecord[]
  onSelect?: (source: SourceRecord) => void
}

export default function ImageSearchGrid({ sources, onSelect }: ImageSearchGridProps) {
  const imageSources = sources.filter((source) => !!source.imagePath)

  if (imageSources.length === 0) {
    return null
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
      {imageSources.map((source) => (
        <Dialog key={source.chunkId}>
          <DialogTrigger asChild>
            <Card
              className="group cursor-pointer overflow-hidden rounded-md border border-border shadow-none"
              onClick={() => onSelect?.(source)}
            >
              <CardContent className="p-0 relative">
                <AspectRatio ratio={1}>
                  <img
                    src={resolveImageSrc(source.imagePath)}
                    alt={source.windowTitle || source.appName || "Source image"}
                    className="object-cover rounded-md transition-transform duration-300 group-hover:scale-105"
                  />
                </AspectRatio>

                <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 opacity-0 transition group-hover:opacity-100">
                  <Badge variant="secondary" className="truncate max-w-[65%]">
                    {source.appName || "Unknown App"}
                  </Badge>
                  <span className="rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground">
                    {source.capturedAt ? renderDate(source.capturedAt) : "Unknown"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>

          <DialogContent className="max-w-4xl p-0">
            <img
              src={resolveImageSrc(source.imagePath)}
              className="w-full h-auto rounded-lg"
            />
          </DialogContent>
        </Dialog>
      ))}
    </div>
  )
}

// export default memo(ImageSearchGrid)