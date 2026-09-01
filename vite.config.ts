import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [tsconfigPaths(), tailwindcss(), tanstackStart(), nitro({ preset: "vercel" }), react()],
  server: {
    port: 3000,
    host: true,
  },
});
