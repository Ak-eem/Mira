import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deliberate accent for this admin tool — not the default Tailwind blue.
        accent: {
          DEFAULT: "#0f766e", // teal-700
          dark: "#115e59", // teal-800
        },
      },
    },
  },
  plugins: [],
};

export default config;
