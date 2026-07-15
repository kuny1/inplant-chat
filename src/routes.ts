import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import type { ChatRequest, ChatResponse, Message, AgentStep } from "./types.js";
import { guard } from "./guard.js";
import type { ReactAgent } from "./agent.js";
import type { MemoryStore } from "./memory/store.js";
import { validateResponse } from "./validation/checker.js";

/**
 * POST /api/chat — 核心问答接口
 *
 * 支持两种模式:
 * - stream=false（默认）: 返回完整 JSON 响应
 * - stream=true: SSE 流式输出，事件类型 step / content / done
 */
export async function chatRoutes(fastify: FastifyInstance) {
  fastify.post("/chat", async (request, reply) => {
    const { sessionId, message, stream } = request.body as ChatRequest;
    const { store, agent } = fastify.di as {
      store: MemoryStore;
      agent: ReactAgent;
    };

    // ===== 1. 领域守卫 =====
    const guardResult = guard(message);
    if (!guardResult.passed) {
      const rejectContent = guardResult.reason!;

      if (stream) {
        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        });
        reply.raw.write(
          `event: content\ndata: ${JSON.stringify({ delta: rejectContent })}\n\n`
        );
        reply.raw.write(
          `event: done\ndata: ${JSON.stringify({ confidence: 0 })}\n\n`
        );
        reply.raw.end();
        return;
      }

      return reply.send({
        sessionId: sessionId || "",
        content: rejectContent,
        sources: [],
        confidence: 0,
        modelUsed: "",
        tokensUsed: { input: 0, output: 0 },
        steps: [
          {
            type: "answer",
            content: rejectContent,
            status: "completed",
          },
        ],
      } satisfies ChatResponse);
    }

    // ===== 2. 会话管理 =====
    let session = sessionId ? store.getSession(sessionId) : null;
    if (!session) {
      session = store.createSession("demo-user");
    }
    const history = store.getMessages(session.id);

    // ===== 3. Agent 执行 + 输出 =====
    if (stream) {
      return handleSSE(reply, agent, store, session.id, message, history);
    } else {
      return handleJSON(reply, agent, store, session.id, message, history);
    }
  });

  /** GET /api/sessions/:id — 获取会话历史 */
  fastify.get("/sessions/:id", async (request, reply) => {
    const { store } = fastify.di as { store: MemoryStore };
    const session = store.getSession((request.params as { id: string }).id);
    if (!session) {
      return reply.code(404).send({ error: "会话不存在" });
    }
    return reply.send(session);
  });

  /** DELETE /api/sessions/:id — 删除会话 */
  fastify.delete("/sessions/:id", async (request, reply) => {
    const { store } = fastify.di as { store: MemoryStore };
    store.deleteSession((request.params as { id: string }).id);
    return reply.send({ success: true });
  });
}

// ============================================================
// SSE 流式模式
// ============================================================

async function handleSSE(
  reply: any,
  agent: ReactAgent,
  store: MemoryStore,
  sessionId: string,
  message: string,
  history: Message[]
) {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const steps: AgentStep[] = [];
  let finalContent = "";

  try {
    for await (const step of agent.run(sessionId, message, history)) {
      steps.push(step);

      if (step.type === "answer" && step.content) {
        finalContent = step.content;
        // 将完整回答作为 content 事件发送
        reply.raw.write(
          `event: content\ndata: ${JSON.stringify({ delta: step.content })}\n\n`
        );
      } else {
        // 中间步骤作为 step 事件发送
        reply.raw.write(`event: step\ndata: ${JSON.stringify(step)}\n\n`);
      }
    }

    // 校验
    const validation = await validateResponse(finalContent, []);
    const chatResponse: ChatResponse = {
      sessionId,
      content: finalContent,
      sources: [],
      confidence: validation.confidence,
      modelUsed: "deepseek-chat",
      tokensUsed: { input: 0, output: 0 },
      steps,
    };

    reply.raw.write(
      `event: done\ndata: ${JSON.stringify(chatResponse)}\n\n`
    );
    reply.raw.end();
  } catch (error) {
    const errMsg =
      error instanceof Error ? error.message : "处理请求时出错，请重试";
    reply.raw.write(
      `event: step\ndata: ${JSON.stringify({ type: "answer", status: "error", content: errMsg })}\n\n`
    );
    reply.raw.end();
  }

  // 持久化消息
  store.addMessage(sessionId, {
    id: randomUUID(),
    sessionId,
    role: "user",
    content: message,
    metadata: {},
  } as Message);
  store.addMessage(sessionId, {
    id: randomUUID(),
    sessionId,
    role: "assistant",
    content: finalContent,
    metadata: { steps },
  } as Message);
}

// ============================================================
// JSON 模式
// ============================================================

async function handleJSON(
  reply: any,
  agent: ReactAgent,
  store: MemoryStore,
  sessionId: string,
  message: string,
  history: Message[]
) {
  const steps: AgentStep[] = [];
  let finalContent = "";

  for await (const step of agent.run(sessionId, message, history)) {
    steps.push(step);
    if (step.type === "answer" && step.content) {
      finalContent = step.content;
    }
  }

  const validation = await validateResponse(finalContent, []);

  // 持久化消息
  store.addMessage(sessionId, {
    id: randomUUID(),
    sessionId,
    role: "user",
    content: message,
    metadata: {},
  } as Message);
  store.addMessage(sessionId, {
    id: randomUUID(),
    sessionId,
    role: "assistant",
    content: finalContent,
    metadata: { steps },
  } as Message);

  const chatResponse: ChatResponse = {
    sessionId,
    content: finalContent,
    sources: [],
    confidence: validation.confidence,
    modelUsed: "deepseek-chat",
    tokensUsed: { input: 0, output: 0 },
    steps,
  };

  return reply.send(chatResponse);
}
