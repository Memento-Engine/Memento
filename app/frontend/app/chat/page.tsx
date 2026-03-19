"use client";

import dynamic from "next/dynamic";

const Thread = dynamic(() => import("@/components/Thread"), {
  ssr: false,
});

export default function ChatPage(): React.ReactElement {
  return <Thread />;
}
