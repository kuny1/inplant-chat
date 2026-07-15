# T4.3 API 路由 + 应用组装

**状态**：✅ 完整实现
**依赖**：T2.4（会话存储）, T2.5（限流）, T3.6（守卫）, T4.1（Agent）, T4.2（校验）
**可并行**：否（需等待所有依赖完成）

## 产出文件

- `src/routes.ts`
- `src/app.ts`
- `src/main.ts`

## 实现内容

### src/app.ts

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";
import rateLimiterPlugin from "./middleware/rate-limiter.js";
import { chatRoutes } from "./routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function createApp() {
  const app = Fastify({ logger: true });

  // CORS
  await app.register(cors, { origin: true });

  // 静态文件（serve frontend/）
  await app.register(fastifyStatic, {
    root: join(__dirname, "..", "frontend"),
    prefix: "/",
  });

  // 限流
  await app.register(rateLimiterPlugin);

  // 路由
  await app.register(chatRoutes, { prefix: "/api" });

  return app;
}
```

### src/routes.ts

```typescript
import type { FastifyInstance } from "fastify";
import type { ChatRequest, ChatResponse, SSEEvent, Message } from "./types.js";
import { guard } from "./guard.js";
import type { ReactAgent } from "./agent.js";
import type { MemoryStore } from "./memory/store.js";
import { validateResponse } from "./validation/checker.js";
import { randomUUID } from "crypto";

export async function chatRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/chat — 核心问答接口
   *
   * 支持两种模式：
   * - stream=false（默认）: 返回完整 JSON 响应
   * - stream=true: SSE 流式输出，事件类型 step / content / done
   */
  fastify.post("/chat", async (request, reply) => {
    const { sessionId, message, stream } = request.body as ChatRequest;

    // ===== 1. 领域守卫 =====
    const guardResult = guard(message);
    if (!guardResult.passed) {
      if (stream) {
        return sseReject(reply, guardResult.reason!);
      }
      return reply.send({
        sessionId: sessionId || "",
        content: guardResult.reason,
        sources: [],
        confidence: 0,
        modelUsed: "",
        tokensUsed: { input: 0, output: 0 },
        steps: [{ type: "answer", content: guardResult.reason, status: "completed" }],
      } satisfies ChatResponse);
    }

    // ===== 2. 会话管理 =====
    const store: MemoryStore = fastify.di.store;
    let session = sessionId ? store.getSession(sessionId) : null;
    if (!session) {
      session = store.createSession("demo-user");
    }
    const history = store.getMessages(session.id);

    // ===== 3. Agent 执行 =====
    const agent: ReactAgent = fastify.di.agent;

    if (stream) {
      // === SSE 流式模式 ===
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const steps: AgentStep[] = [];
      let finalContent = "";

      try {
        for await (const step of agent.run(session.id, message, history)) {
          steps.push(step);
          reply.raw.write(`event: step\ndata: ${JSON.stringify(step)}\n\n`);

          if (step.type === "answer" && step.content) {
            finalContent = step.content;
            reply.raw.write(`event: content\ndata: ${JSON.stringify({ delta: step.content })}\n\n`);
          }
        }

        // 校验
        const validation = await validateResponse(finalContent, []);
        const chatResponse: ChatResponse = {
          sessionId: session.id,
          content: finalContent,
          sources: [],
          confidence: validation.confidence,
          modelUsed: "deepseek-chat",
          tokensUsed: { input: 0, output: 0 },
          steps,
        };

        reply.raw.write(`event: done\ndata: ${JSON.stringify(chatResponse)}\n\n`);
        reply.raw.end();
      } catch (error) {
        reply.raw.write(
          `event: step\ndata: ${JSON.stringify({ type: "answer", status: "error", content: "处理请求时出错，请重试" })}\n\n`
        );
        reply.raw.end();
      }

      // 保存消息
      store.addMessage(session.id, {
        id: randomUUID(), sessionId: session.id, role: "user", content: message, metadata: {},
      } as Message);
      store.addMessage(session.id, {
        id: randomUUID(), sessionId: session.id, role: "assistant", content: finalContent, metadata: { steps },
      } as Message);
    } else {
      // === JSON 模式 ===
      const steps: AgentStep[] = [];
      let finalContent = "";

      for await (const step of agent.run(session.id, message, history)) {
        steps.push(step);
        if (step.type === "answer" && step.content) {
          finalContent = step.content;
        }
      }

      const validation = await validateResponse(finalContent, []);

      // 保存消息
      store.addMessage(session.id, {
        id: randomUUID(), sessionId: session.id, role: "user", content: message, metadata: {},
      } as Message);
      store.addMessage(session.id, {
        id: randomUUID(), sessionId: session.id, role: "assistant", content: finalContent, metadata: { steps },
      } as Message);

      return reply.send({
        sessionId: session.id,
        content: finalContent,
        sources: [],
        confidence: validation.confidence,
        modelUsed: "deepseek-chat",
        tokensUsed: { input: 0, output: 0 },
        steps,
      } satisfies ChatResponse);
    }
  });

  /** GET /api/sessions/:id — 获取会话历史 */
  fastify.get("/sessions/:id", async (request, reply) => {
    const store: MemoryStore = fastify.di.store;
    const session = store.getSession((request.params as any).id);
    if (!session) {
      return reply.code(404).send({ error: "会话不存在" });
    }
    return reply.send(session);
  });

  /** DELETE /api/sessions/:id — 删除会话 */
  fastify.delete("/sessions/:id", async (request, reply) => {
    const store: MemoryStore = fastify.di.store;
    store.deleteSession((request.params as any).id);
    return reply.send({ success: true });
  });
}

function sseReject(reply: any, reason: string) {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
  reply.raw.write(`event: content\ndata: ${JSON.stringify({ delta: reason })}\n\n`);
  reply.raw.write(`event: done\ndata: ${JSON.stringify({ confidence: 0 })}\n\n`);
  reply.raw.end();
}
```

### src/main.ts

```typescript
import { config } from "./config.js";
import { createLLMClient } from "./llm/client.js";
import { loadDocuments } from "./rag/loader.js";
import { embedDocuments } from "./rag/embedder.js";
import { MemoryStore } from "./memory/store.js";
import { ToolRegistry } from "./tools/registry.js";
import { KnowledgeTool } from "./tools/knowledge.js";
import { SensorTool } from "./tools/sensor.js";
import { ReactAgent } from "./agent.js";
import { createApp } from "./app.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("InPlant Chat MVP 启动中...\n");

  // 1. LLM 客户端
  const llm = createLLMClient();
  console.log("✓ LLM 客户端已初始化");

  // 2. 加载并向量化文档
  const docsDir = join(__dirname, "..", "data", "documents");
  const documents = loadDocuments(docsDir);
  console.log(`✓ 已加载 ${documents.length} 篇文档`);

  await embedDocuments(documents, llm);
  console.log(`✓ 文档向量化完成（${documents.reduce((sum, d) => sum + d.chunks.length, 0)} 个块）`);

  // 3. 工具注册
  const registry = new ToolRegistry();
  registry.register(new KnowledgeTool(documents, llm));
  registry.register(new SensorTool(join(__dirname, "..", "data")));
  console.log(`✓ 已注册 ${registry.list().length} 个工具: ${registry.list().join(", ")}`);

  // 4. 会话存储
  const store = new MemoryStore();

  // 5. Agent
  const agent = new ReactAgent(llm, registry);

  // 6. 组装应用
  const app = await createApp();

  // 依赖注入（简化版：挂到 fastify 实例上）
  app.decorate("di", { store, agent });

  // 7. 启动
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`\n 服务已启动: http://localhost:${config.port}`);
  console.log(` 环境: development`);
  console.log(` 模型: ${config.deepseek.model}\n`);
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
```

## 验收标准

- [ ] `pnpm dev` 能正常启动，监听 3000 端口
- [ ] POST /api/chat 能处理问答请求
- [ ] 拒答场景返回预设话术
- [ ] SSE 流式输出正常工作
- [ ] GET /api/sessions/:id 返回会话历史
- [ ] 前端页面可通过 http://localhost:3000 访问
