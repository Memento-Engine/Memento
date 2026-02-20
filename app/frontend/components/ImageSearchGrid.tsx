"use client"

import Image from "next/image"
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

const images = [
  {
    id: 1,
    src: "https://picsum.photos/600/600?1",
    source: "Unsplash",
  },
  {
    id: 2,
    src: "https://picsum.photos/600/600?2",
    source: "Pexels",
  },
  {
    id: 3,
    src: "https://picsum.photos/600/600?3",
    source: "Pinterest",
  },
  {
    id: 4,
    src: "https://picsum.photos/600/600?4",
    source: "Google",
  },
  
]

export default function ImageSearchGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
      {images.map((img) => (
        <Dialog key={img.id}>
          <DialogTrigger asChild>
            <Card className="overflow-hidden rounded-md cursor-pointer group border-none shadow-none">
              <CardContent className="p-0 relative">
                
                <AspectRatio ratio={1}>
                  <img
                    src={img.src}
                    alt=""
                    // fill
                    className="object-cover rounded-md transition-transform duration-300 group-hover:scale-105"
                  />
                </AspectRatio>

                {/* source badge */}
                <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition">
                  <Badge variant="secondary">
                    {img.source}
                  </Badge>
                </div>

              </CardContent>
            </Card>
          </DialogTrigger>

          {/* Fullscreen preview */}
          <DialogContent className="max-w-4xl p-0">
            <img
              src={img.src}
              className="w-full h-auto rounded-lg"
            />
          </DialogContent>
        </Dialog>
      ))}
    </div>
  )
}