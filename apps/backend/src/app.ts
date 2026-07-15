import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import rateLimiterPlugin from "./middleware/rate-limiter";
import { chatRoutes } from "./routes";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 创建并配置 Fastify 应用实例
 *
 * 注册顺序:
 * 1. CORS — 允许前端跨域访问
 * 2. Static — serve frontend/ 目录下的静态文件
 * 3. Rate Limiter — 限流中间件
 * 4. Chat Routes — 核心 API 路由
 */
export async function createApp() {
  const app = Fastify({ logger: true });

  // CORS：开发阶段允许 Vite dev server 跨域
  await app.register(cors, { origin: true });

  // 静态文件：serve Vite 构建产物（pnpm build:ui 后生成 frontend/dist/）
  await app.register(fastifyStatic, {
    root: join(__dirname, "..", "..", "frontend", "dist"),
    prefix: "/",
  });

  // 限流
  await app.register(rateLimiterPlugin);

  // API 路由
  await app.register(chatRoutes, { prefix: "/api" });

  return app;
}
