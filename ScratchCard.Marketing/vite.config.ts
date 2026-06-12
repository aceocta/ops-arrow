import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Marketing site runs on 5174 — the portal (ScratchCard.Web) owns 5173.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
