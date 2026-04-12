import type { FastifyPluginAsync } from "fastify";

export const publicRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/public/config", async () => {
    return {
      siteName: "4-2.рф",
      apiBaseUrl: app.env.API_PUBLIC_BASE_URL,
      chatEnabled: true,
      installersEnabled: true,
      memoryEnabled: true,
      supportedPlatforms: ["windows", "macos", "linux"],
    };
  });
};
