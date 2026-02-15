import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"

export default function MementoHome() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-100">

      <div className="flex flex-col items-center space-y-6">

        {/* Title */}
        <h1 className="text-5xl font-semibold tracking-tight text-gray-700">
          Memento
        </h1>

        {/* Search */}
        <div className="flex items-center rounded-full border bg-background overflow-hidden">

          <Input
            placeholder="Ask anything..."
            className="w-[520px] border-none focus-visible:ring-0 shadow-none"
          />

          <Button
            size="icon"
            className="rounded-none rounded-r-full"
          >
            <Search className="h-4 w-4" />
          </Button>

        </div>

        {/* Quick Links */}
        {/* <div className="flex gap-6 text-sm text-muted-foreground">

          <span className="cursor-pointer hover:text-foreground transition">
            Trending
          </span>

          <span className="cursor-pointer hover:text-foreground transition">
            News
          </span>

          <span className="cursor-pointer hover:text-foreground transition">
            Tech
          </span>

          <span className="cursor-pointer hover:text-foreground transition">
            Science
          </span>

        </div> */}

      </div>

    </div>
  )
}
