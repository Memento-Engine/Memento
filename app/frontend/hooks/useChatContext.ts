import { ChatContext } from "@/contexts/chatContext";
import { useContext } from "react";

export default function useChatContext() {
    const context = useContext(ChatContext);
    if (context == undefined) {
        throw new Error('useChatContext must be used with in the ChatProvider');
    }

    return context;
}