'use client';

import ChatHome from "@/components/ChatHome";
import Thread from "@/components/Thread";
import { useRouter } from "next/navigation";


export default function Home() {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center  font-sans light:bg-white dark:bg-background">
      <ChatHome
        handleSend={(query: string): void => {
          router.push("/chat/123");
          console.log(query);
        }}
      />
    </div>
  );
}
