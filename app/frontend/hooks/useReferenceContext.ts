import {ReferenceContext} from "@/contexts/referenceContext";
import { useContext } from "react";

export default function useReferenceContext() {
    const context = useContext(ReferenceContext);
    if (context == undefined) {
        throw new Error('useReferenceContext must be used with in the ReferenceProvider');
    }

    return context;
}