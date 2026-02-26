"use client";

import { useEffect, useState } from "react";

type Breakpoint = {
  width: number;
  isMobile: boolean;
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
  is2xl: boolean;
};

export function useBreakpoint(): Breakpoint {
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }

    handleResize(); // set initial
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return {
    width,

    // Tailwind default breakpoints
    isMobile: width < 768,

    isSm: width >= 640,
    isMd: width >= 768 && width < 1024,
    isLg: width >= 1024 && width < 1280,
    isXl: width >= 1280 && width < 1536,
    is2xl: width >= 1536,
  };
}