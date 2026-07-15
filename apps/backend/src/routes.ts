import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import type { ChatRequest, ChatResponse, Message, AgentStep } from "./types";
import { guard } from "./guard";
import type { ReactAgent } from "./agent";
import type { MemoryStore } from "./memory/store";
import { validateResponse } from "./validation/checker";

// ---- 依赖获取 ----

interface Dependencies {
  store: MemoryStore;
  agent: ReactAgent;
}

function getDeps(fastify: FastifyInstance): Dependencies {
  return fastify.di as Dependencies;
}

// ---- 共享核心逻辑：guard → session → agent 执行 ----

async function* runAgent(
  store: MemoryStore,
  agent: ReactAgent,
  message: string,
  sessionId: string | undefined,
  signal: AbortSignal
): AsyncGenerator<{
  type: "reject" | "stream-start" | "step" | "done";
  data: unknown;
}> {
  // 1. 领域守卫
  const guardResult = guard(message);
  if (!guardResult.passed) {
    yield { type: "reject", data: guardResult.reason };
    return;
  }

  // 2. 会话
  let session = sessionId ? store.getSession(sessionId) : null;
  if (!session) session = store.createSession("demo-user");
  const history = store.getMessages(session.id);

  // 3. Agent 执行
  const steps: AgentStep[] = [];
  let finalContent = "";

  yield { type: "stream-start", data: { sessionId: session.id } };

  for await (const step of agent.run(session.id, message, history, { signal })) {
    steps.push(step);
    yield { type: "step", data: step };

    if (step.type === "answer" && step.content) {
      finalContent = step.content;
    }
  }

  // 4. 持久化
  store.addMessage(session.id, {
    id: randomUUID(),
    sessionId: session.id,
    role: "user",
    content: message,
    metadata: {},
  } as Message);
  store.addMessage(session.id, {
    id: randomUUID(),
    sessionId: session.id,
    role: "assistant",
    content: finalContent,
    metadata: { steps },
  } as Message);

  // 5. 校验
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

  yield { type: "done", data: chatResponse };
}

// ---- SSE 输出辅助 ----

function writeSSE(raw: any, event: string, data: unknown): void {
  raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseHeaders(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
}

// ============================================================
// 路由注册
// ============================================================

export async function chatRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/chat?message=xxx&sessionId=yyy
   *
   * 为浏览器标准 EventSource 设计（EventSource 只支持 GET）。
   * 响应固定为 SSE 流式格式。
   */
  fastify.get("/chat", async (request, reply) => {
    const { store, agent } = getDeps(fastify);
    const query = request.query as { message?: string; sessionId?: string };
    const message = query.message?.trim();

    if (!message) {
      return reply.code(400).send({ error: "缺少 message 参数" });
    }

    const controller = new AbortController();
    request.raw.on("close", () => controller.abort());

    sseHeaders(reply);

    for await (const event of runAgent(store, agent, message, query.sessionId, controller.signal)) {
      switch (event.type) {
        case "reject":
          writeSSE(reply.raw, "content", { delta: event.data as string });
          writeSSE(reply.raw, "done", { confidence: 0 });
          reply.raw.end();
          return;

        case "stream-start":
          // sessionId 已包含在 done 事件中，无需单独发送
          break;

        case "step": {
          const step = event.data as AgentStep;
          if (step.type === "answer" && step.content) {
            writeSSE(reply.raw, "content", { delta: step.content });
          } else {
            writeSSE(reply.raw, "step", step);
          }
          break;
        }

        case "done":
          writeSSE(reply.raw, "done", event.data);
          reply.raw.end();
          break;
      }
    }
  });

  /**
   * POST /api/chat
   *
   * 支持 JSON 和 SSE 双模式，通过 body.stream 控制。
   */
  fastify.post("/chat", async (request, reply) => {
    const { store, agent } = getDeps(fastify);
    const { sessionId, message, stream } = request.body as ChatRequest;

    if (!message?.trim()) {
      return reply.code(400).send({ error: "缺少 message 参数" });
    }

    const controller = new AbortController();
    request.raw.on("close", () => controller.abort());

    if (stream) {
      sseHeaders(reply);
      for await (const event of runAgent(store, agent, message, sessionId, controller.signal)) {
        switch (event.type) {
          case "reject":
            writeSSE(reply.raw, "content", { delta: event.data as string });
            writeSSE(reply.raw, "done", { confidence: 0 });
            reply.raw.end();
            return;

          case "stream-start":
            break;

          case "step": {
            const step = event.data as AgentStep;
            if (step.type === "answer" && step.content) {
              writeSSE(reply.raw, "content", { delta: step.content });
            } else {
              writeSSE(reply.raw, "step", step);
            }
            break;
          }

          case "done":
            writeSSE(reply.raw, "done", event.data);
            reply.raw.end();
            break;
        }
      }
    } else {
      // JSON 模式：收集所有步骤，返回 ChatResponse
      let final: ChatResponse | null = null;

      for await (const event of runAgent(store, agent, message, sessionId, controller.signal)) {
        if (event.type === "reject") {
          return reply.send({
            sessionId: sessionId || "",
            content: event.data as string,
            sources: [],
            confidence: 0,
            modelUsed: "",
            tokensUsed: { input: 0, output: 0 },
            steps: [{ type: "answer", content: event.data as string, status: "completed" }],
          } satisfies ChatResponse);
        }
        if (event.type === "done") {
          final = event.data as ChatResponse;
        }
      }

      return reply.send(final!);
    }
  });

  /** GET /api/sessions/:id */
  fastify.get("/sessions/:id", async (request, reply) => {
    const { store } = getDeps(fastify);
    const session = store.getSession((request.params as { id: string }).id);
    if (!session) return reply.code(404).send({ error: "会话不存在" });
    return reply.send(session);
  });

  /** DELETE /api/sessions/:id */
  fastify.delete("/sessions/:id", async (request, reply) => {
    const { store } = getDeps(fastify);
    store.deleteSession((request.params as { id: string }).id);
    return reply.send({ success: true });
  });
}
