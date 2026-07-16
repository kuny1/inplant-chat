import type { LLMClient, ChatMessage } from "./llm/client";
import type { ToolRegistry } from "./tools/registry";
import type { Message, AgentStep } from "./types";
import { SYSTEM_PROMPT } from "./agent/prompt";
import { ToolExecutor } from "./agent/tool-executor";

/**
 * ReAct Agent — 细粒度步骤透出。
 *
 * 全生命周期 step：
 *   memory_loading → intent_recognition → thinking → calling → tool_* → generating → content* → validating → done
 *
 * 每个 error/degraded step 的 content 遵循：
 *   1. 可读懂（面向用户，非技术栈信息）
 *   2. 有归因（谁的失败：模型/工具/系统）
 *   3. 有出路（用户下一步可操作的建议）
 */
export class ReactAgent {
  private registry: ToolRegistry;
  private toolExecutor: ToolExecutor;

  constructor(
    private llm: LLMClient,
    registry: ToolRegistry,
    private options: { maxLoops?: number; systemPrompt?: string } = {}
  ) {
    this.registry = registry;
    this.toolExecutor = new ToolExecutor(registry);
  }

  async *run(
    _sessionId: string,
    userMessage: string,
    history: Message[] = [],
    runOptions?: { signal?: AbortSignal }
  ): AsyncGenerator<AgentStep> {
    const maxLoops = this.options.maxLoops ?? 5;
    const { signal } = runOptions ?? {};

    // ---- memory_loading ----
    yield {
      type: "memory_loading",
      status: "running",
      content: "正在加载历史上下文...",
    };
    // 历史消息已经在 history 参数中，无需异步加载。如果未来需要从 pgvector 检索
    // 历史会话，则在这里做。当前 always-pass。
    yield {
      type: "memory_loading",
      status: "completed",
      content: history.length > 0
        ? `已加载最近 ${history.length} 条历史消息`
        : "无历史会话，将基于当前问题进行回答",
    };

    // ---- intent_recognition ----
    yield {
      type: "intent_recognition",
      status: "running",
      content: "正在理解问题意图...",
    };
    // MVP: 简化处理，跳过 LLM 分类直接进入 ReAct。后续可在这里判断复杂查询 → plan 模式。
    yield {
      type: "intent_recognition",
      status: "completed",
      content: "已识别为设备知识问答",
    };

    // ---- 构建消息列表 ----
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: this.options.systemPrompt ?? SYSTEM_PROMPT,
      },
      ...history.map((m) => {
        const msg: ChatMessage = { role: m.role, content: m.content };
        if (m.toolCallId) msg.tool_call_id = m.toolCallId;
        if (m.toolCalls) msg.tool_calls = m.toolCalls;
        return msg;
      }),
      { role: "user", content: userMessage },
    ];

    const toolDefs = this.registry.getDefinitions();

    // ============================================================
    // ReAct Loop
    // ============================================================
    for (let loop = 0; loop < maxLoops; loop++) {
      if (signal?.aborted) {
        yield {
          type: "error",
          status: "error",
          content: "请求已被中断，请重新提问。",
        };
        return;
      }

      // ---- thinking ----
      yield {
        type: "thinking",
        status: "running",
        content: "正在分析问题...",
      };

      let response;
      try {
        response = await this.llm.chat(messages, toolDefs);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "未知错误";
        yield {
          type: "thinking",
          status: "error",
          content: `模型推理失败：${reason}。请稍后重试，或尝试更简短的问题。`,
        };
        yield {
          type: "error",
          status: "error",
          content: `回答生成中断：模型服务暂时不可用（${reason}）。建议稍后重试。`,
        };
        return;
      }
      yield { type: "thinking", status: "completed" };

      // ---- Act: 有 tool_calls 分支 ----
      if (response.toolCalls && response.toolCalls.length > 0) {
        // calling：LLM 已决定调工具，系统准备执行
        yield {
          type: "calling",
          status: "running",
          content: `准备调用 ${response.toolCalls.length} 个工具...`,
        };
        yield {
          type: "calling",
          status: "completed",
          content: `将调用：${response.toolCalls.map((tc) => tc.name).join("、")}`,
        };

        messages.push({
          role: "assistant",
          content: response.content || "",
          tool_calls: response.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });

        for await (const step of this.toolExecutor.execute(
          response.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })),
          signal
        )) {
          yield step;
        }

        messages.push(...this.toolExecutor.results);
        continue;
      }

      // ---- 无 tool_calls → generating + 流式 content ----
      yield {
        type: "generating",
        status: "running",
        content: "正在生成回答...",
      };

      try {
        for await (const chunk of this.llm.chatStream(messages)) {
          yield {
            type: "content",
            content: chunk.delta,
          };
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : "未知错误";
        yield {
          type: "generating",
          status: "error",
          content: `回答生成中断：${reason}。已接收的部分内容可能不完整，建议重新提问。`,
        };
        yield {
          type: "error",
          status: "error",
          content: `流式输出中断（${reason}）。请稍后重试。`,
        };
        return;
      }

      yield { type: "generating", status: "completed" };
      return;
    }

    // ============================================================
    // 达到最大轮数 → 降级回答
    // ============================================================
    yield {
      type: "degraded",
      status: "degraded",
      content:
        `模型推理未在预期轮数内完成（${maxLoops}轮上限）。` +
        "以下回答基于已获取的部分信息，分析可能不够全面。建议您尝试更具体地描述问题。",
    };

    messages.push({
      role: "user",
      content:
        "你已经进行了多轮工具调用和推理。请基于目前已获取的全部信息，" +
        "用中文给出你当前能做出的最佳分析和建议。" +
        "如果某些方面信息不足无法判断，请明确说明局限性，不要编造。",
    });

    yield {
      type: "generating",
      status: "running",
      content: "基于已有信息生成降级回答...",
    };

    try {
      for await (const chunk of this.llm.chatStream(messages)) {
        yield { type: "content", content: chunk.delta };
      }
    } catch {
      yield {
        type: "error",
        status: "error",
        content: "降级回答生成失败。请重新提问或尝试更简单的问题。",
      };
      return;
    }

    yield { type: "generating", status: "completed" };
  }
}
