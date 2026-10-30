import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({ plugins: [react()], base: process.env.HANMO_BASE_PATH || "/hanmo-strategy/" });
