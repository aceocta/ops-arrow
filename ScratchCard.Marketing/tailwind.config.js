/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d9e6ff",
          200: "#bcd3ff",
          300: "#8eb6ff",
          400: "#598dff",
          500: "#3366ff",
          600: "#1f47f5",
          700: "#1836e1",
          800: "#1a2fb6",
          900: "#1c2e8f",
        },
        ink: {
          900: "#0a0f1e",
          950: "#060913",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.06), 0 1px 3px rgba(16,24,40,0.10)",
        glow: "0 0 60px -12px rgba(51,102,255,0.45)",
        "glow-sm": "0 0 28px -8px rgba(51,102,255,0.4)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.55", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.06)" },
        },
        "draw-line": {
          from: { "stroke-dashoffset": "1" },
          to: { "stroke-dashoffset": "0" },
        },
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        "float-delayed": "float 8s ease-in-out 1.2s infinite",
        "glow-pulse": "glow-pulse 6s ease-in-out infinite",
        "draw-line": "draw-line 2.4s cubic-bezier(0.4,0,0.2,1) 0.5s both",
      },
    },
  },
  plugins: [],
};
