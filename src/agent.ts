import type { LLMClient, ChatMessage } from "./llm/client.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { Message, AgentStep } from "./types.js";
import { SYSTEM_PROMPT } from "./agent/prompt.js";
import { ToolExecutor } from "./agent/tool-executor.js";

/**
 * ReAct Agent — 薄编排层。
 *
 * 核心职责：管理 ReAct 循环（Think → Act → Observe），
 * 将工具执行、重试、降级逻辑委托给 ToolExecutor。
 *
 * ## 中断机制
 * signal 只在「昂贵操作前」的自然边界检查，不散落在方法各处：
 * - 每轮 LLM 调用前（ReAct loop 顶部）
 * - 工具执行前（ToolExecutor.execute 内部）
 *
 * 多步任务（Plan-and-Execute）需要更多检查点时，
 * 由 PlanExecuteOrchestrator 在 Plan 阶段边界统一检查，不复制粘贴。
 *
 * ## 扩展方向
 * ```
 * interface Orchestrator { execute(ctx): AsyncGenerator<AgentStep> }
 * class ReActOrchestrator implements Orchestrator       // 当前
 * class PlanExecuteOrchestrator implements Orchestrator  // 未来
 * ```
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
      // ---- 中断检查（昂贵 LLM 调用前的自然边界） ----
      if (signal?.aborted) {
        yield { type: "answer", status: "error", content: "请求已被中断" };
        return;
      }

      // ---- Think ----
      yield {
        type: "thinking",
        status: "running",
        content: "正在分析问题...",
      };
      const response = await this.llm.chat(messages, toolDefs);
      yield { type: "thinking", status: "completed" };

      // ---- Act: 有 tool_calls → 委托 ToolExecutor ----
      if (response.toolCalls && response.toolCalls.length > 0) {
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

        // 委托 ToolExecutor（内含重试 + allSettled + 降级 + 中断检查）
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

        // 结果注入上下文
        messages.push(...this.toolExecutor.results);
        continue;
      }

      // ---- 无 tool_calls → 最终回答 ----
      yield {
        type: "answer",
        status: "completed",
        content: response.content ?? "",
      };
      return;
    }

    // ============================================================
    // 达到最大轮数 → 降级回答
    // ============================================================
    yield {
      type: "thinking",
      status: "completed",
      content:
        `推理轮数已达上限（${maxLoops}轮），基于已有信息生成降级回答。` +
        "如需更完整的分析，请尝试更具体地描述问题。",
    };

    messages.push({
      role: "user",
      content:
        "你已经进行了多轮工具调用和推理。请基于目前已获取的全部信息，" +
        "用中文给出你当前能做出的最佳分析和建议。" +
        "如果某些方面信息不足无法判断，请明确说明局限性，不要编造。",
    });

    const finalResponse = await this.llm.chat(messages, toolDefs);

    yield {
      type: "answer",
      status: "degraded",
      content:
        (finalResponse.content ?? "抱歉，我无法回答这个问题。") +
        "\n\n---\n⚡ 以上回答为降级结果：推理轮数超过限制，分析可能不够充分。" +
        "建议尝试更具体地描述您的问题。",
    };
  }
}
