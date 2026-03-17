import Thread from "@/components/Thread";

// Server component that wraps the client Thread component
// For static export with optional catch-all routes
export async function generateStaticParams() {
  return [{ id: [] }]; // Generates /chat route
}

export default function ChatPage(): React.ReactElement {
  return <Thread />;
}
