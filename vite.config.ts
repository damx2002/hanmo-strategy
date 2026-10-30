import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({ plugins: [react()], base: loadEnv(mode, ".", "HANMO_").HANMO_BASE_PATH || "/hanmo-strategy/" }));
