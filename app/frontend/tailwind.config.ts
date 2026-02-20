import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-jetbrains-mono)'],
        // This maps 'font-sans' to your Inter variable
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui"],
        // This creates 'font-display' for Studio Feixen
        display: ["var(--font-feixen)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;