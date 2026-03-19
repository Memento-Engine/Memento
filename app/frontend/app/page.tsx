"use client";

import ChatHome from "@/components/ChatHome";
import ParticleBackground from "@/components/ParticleBackground";
import useChatContext from "@/hooks/useChatContext";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const { sendMessage } = useChatContext();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      {/* <ParticleBackground /> */}

      <ChatHome
        handleSend={(query, searchMode): void => {
          sendMessage(query, undefined, false, searchMode);
        }}
      />
    </div>
  );
}
