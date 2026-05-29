import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server runs on 5173, which is already in the API's CORS allow-list (Program.cs).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
