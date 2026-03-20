import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "spa-fallback",
      configureServer(server) {
        server.middlewares.use((req: { url?: string }, _res, next) => {
          if (req.url && !req.url.startsWith("/api") && !req.url.includes(".")) {
            req.url = "/index.html";
          }
          next();
        });
      },
    },
  ],
});
