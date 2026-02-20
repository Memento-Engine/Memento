import {
  Timeline,
  TimelineBody,
  TimelineHeader,
  TimelineIcon,
  TimelineItem,
  TimelineSeparator,
} from "@/components/ui/timeline";

import { MementoUIMessage, MyDataPart } from "./types";

type Props = {
  parts: MementoUIMessage["parts"];
};

export function Thinking({ parts }: Props) {
  const thinkingParts = parts.filter((p) => p.type === "data-thinking");

  return (
    <Timeline
      color="secondary"
      orientation="vertical"
      className="relative overflow-hidden"
    >
      {thinkingParts.map((m, index) => {
        // Check if this is the very last item in the array
        const isLast = index === thinkingParts.length - 1;

        return (
          <TimelineItem key={index}>
            <TimelineHeader>
              <TimelineSeparator />
              <TimelineIcon 
                className={`h-3 w-3 ${isLast ? "animate-pulse" : ""}`} 
              />
            </TimelineHeader>

            <TimelineBody className="-translate-y-1.5">
              <div className="space-y-1">
                <h3 
                  className={`text-sm ${
                    isLast 
                      ? "text-foreground animate-pulse" 
                      : "text-muted-foreground"
                  }`}
                >
                  {m.data.title}
                </h3>
              </div>

              <p 
                className={`mt-3 text-xs ${
                  isLast 
                    ? "text-foreground animate-pulse" 
                    : "text-muted-foreground"
                }`}
              >
                {m.data.message}
              </p>
            </TimelineBody>
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}