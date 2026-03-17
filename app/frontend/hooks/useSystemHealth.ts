import { SystemHealthContext } from "@/contexts/SystemHealthContext";
import { useContext } from "react";

export default function useSystemHealth() {
    const context = useContext(SystemHealthContext);
    if (context == undefined) {
        throw new Error('useSystemHealth must be used with in the SystemHealthProvider');
    }

    return context;
}