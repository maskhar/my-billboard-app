// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ini Warna Branding Utero (Merah)
        utero: {
          DEFAULT: '#ce181e', 
          hover: '#a61318' // Merah lebih gelap untuk efek hover
        }
      }
    },
  },
  plugins: [],
};
export default config;