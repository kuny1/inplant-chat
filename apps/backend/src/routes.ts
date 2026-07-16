import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "crypto";
import type { ChatRequest, ChatResponse, Message, AgentStep } from "./types";
import { guard } from "./guard";
import type { ReactAgent } from "./agent";
import type { SessionStore } from "./memory/store";
import { DEMO_USER_ID } from "./memory/store";
import { validateResponse } from "./validation/checker";

// ---- 依赖获取 ----

interface Dependencies {
  store: SessionStore;
  agent: ReactAgent;
}

function getDeps(fastify: FastifyInstance): Dependencies {
  return (fastify as any).di as Dependencies;
}

// ---- 共享核心逻辑 ----

async function* runAgent(
  store: SessionStore,
  agent: ReactAgent,
  message: string,
  sessionId: string | undefined,
  signal: AbortSignal
): AsyncGenerator<{
  type: "reject" | "done";
  data: unknown;
  step?: AgentStep;
}> {
  const guardResult = guard(message);
  if (!guardResult.passed) {
    yield { type: "reject", data: guardResult.reason };
    return;
  }

  let session = sessionId ? await store.getSession(sessionId) : null;
  if (!session) session = await store.createSession(DEMO_USER_ID);
  const history = await store.getMessages(session.id);

  const steps: AgentStep[] = [];
  let finalContent = "";

  for await (const step of agent.run(session.id, message, history, { signal })) {
    steps.push(step);

    // content 类型的 chunk 累积为最终回答文本
    if (step.type === "content" && step.content) {
      finalContent += step.content;
    }

    yield { type: "done", data: null, step };
  }

  // 持久化
  await store.addMessage(session.id, {
    id: randomUUID(),
    sessionId: session.id,
    role: "user",
    content: message,
    metadata: {},
  } as Message);
  await store.addMessage(session.id, {
    id: randomUUID(),
    sessionId: session.id,
    role: "assistant",
    content: finalContent,
    metadata: { steps },
  } as Message);

  // 校验
  const validation = await validateResponse(finalContent, []);
  const chatResponse: ChatResponse = {
    sessionId: session.id,
    sources: [],
    confidence: validation.confidence,
    modelUsed: "deepseek-chat",
    tokensUsed: { input: 0, output: 0 },
  };

  yield { type: "done", data: chatResponse };
}

// ---- SSE 辅助 ----

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
      if (event.type === "reject") {
        writeSSE(reply.raw, "content", { delta: event.data as string });
        writeSSE(reply.raw, "done", { confidence: 0 });
        reply.raw.end();
        return;
      }

      if (event.type === "done") {
        if (event.step) {
          // 中间步骤：content → event:content，其他 → event:step
          if (event.step.type === "content") {
            writeSSE(reply.raw, "content", { delta: event.step.content });
          } else {
            writeSSE(reply.raw, "step", event.step);
          }
        } else {
          // 终端 done 事件
          writeSSE(reply.raw, "done", event.data);
          reply.raw.end();
        }
      }
    }
  });

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
        if (event.type === "reject") {
          writeSSE(reply.raw, "content", { delta: event.data as string });
          writeSSE(reply.raw, "done", { confidence: 0 });
          reply.raw.end();
          return;
        }

        if (event.type === "done") {
          if (event.step) {
            if (event.step.type === "content") {
              writeSSE(reply.raw, "content", { delta: event.step.content });
            } else {
              writeSSE(reply.raw, "step", event.step);
            }
          } else {
            writeSSE(reply.raw, "done", event.data);
            reply.raw.end();
          }
        }
      }
    } else {
      // JSON 模式
      const steps: AgentStep[] = [];
      let finalContent = "";
      let final: ChatResponse | null = null;

      for await (const event of runAgent(store, agent, message, sessionId, controller.signal)) {
        if (event.type === "reject") {
          return reply.send({
            sessionId: sessionId || "",
            sources: [],
            confidence: 0,
            modelUsed: "",
            tokensUsed: { input: 0, output: 0 },
          } satisfies ChatResponse);
        }

        if (event.type === "done") {
          if (event.step) {
            steps.push(event.step);
            if (event.step.type === "content" && event.step.content) {
              finalContent += event.step.content;
            }
          } else {
            final = event.data as ChatResponse;
          }
        }
      }

      return reply.send({ ...final!, content: finalContent, steps } as any);
    }
  });

  /** GET /api/sessions — 列出当前用户的所有会话 */
  fastify.get("/sessions", async (_request, reply) => {
    const { store } = getDeps(fastify);
    const sessions = await store.listSessions(DEMO_USER_ID);
    return reply.send(sessions.map((s) => ({
      id: s.id,
      title: s.title,
      updatedAt: s.updatedAt,
    })));
  });

  fastify.get("/sessions/:id", async (request, reply) => {
    const { store } = getDeps(fastify);
    const session = await store.getSession((request.params as { id: string }).id);
    if (!session) return reply.code(404).send({ error: "会话不存在" });
    return reply.send(session);
  });

  fastify.delete("/sessions/:id", async (request, reply) => {
    const { store } = getDeps(fastify);
    await store.deleteSession((request.params as { id: string }).id);
    return reply.send({ success: true });
  });
}
