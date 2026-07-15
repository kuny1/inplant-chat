import type { AgentStep } from "../types";
import type { ToolRegistry } from "../tools/registry";

/**
 * 单工具执行结果
 */
interface SingleResult {
  tc: { id: string; name: string; arguments: Record<string, unknown> };
  result: { toolCallId: string; name: string; content: string; error?: string };
  retryStep?: AgentStep;
  degraded?: boolean;
}

/**
 * 带重试的单工具执行。
 * 第一次失败 → 重试一次 → 仍失败 → 返回降级结果。
 *
 * 降级结果的 content 中包含结构化信息，LLM 可据此判断该数据源不可用，
 * 转而依赖其他工具或先验知识继续回答。
 */
async function executeOne(
  registry: ToolRegistry,
  tc: { id: string; name: string; arguments: Record<string, unknown> }
): Promise<SingleResult> {
  const args = { ...tc.arguments, _toolCallId: tc.id };

  // 第一次尝试
  let result = await registry.execute(tc.name, args);
  if (!result.error) {
    return { tc, result };
  }

  // 失败 → 重试一次
  const retryStep: AgentStep = {
    type: "tool_call",
    name: tc.name,
    status: "running",
    content: `${tc.name} 执行失败（${result.error}），正在重试...`,
  };

  result = await registry.execute(tc.name, args);
  if (!result.error) {
    return { tc, result, retryStep };
  }

  // 两次均失败 → 降级结果
  return {
    tc,
    result: {
      toolCallId: tc.id,
      name: tc.name,
      content: JSON.stringify({
        degraded: true,
        message:
          `工具 ${tc.name} 经 2 次尝试后仍失败，已使用降级方案。` +
          "请基于其他可用信息回答，并告知用户该部分数据暂不可用。",
        originalError: result.error,
      }),
    },
    retryStep,
    degraded: true,
  };
}

/**
 * 工具执行器。
 *
 * 接收 LLM 返回的 tool_calls，负责：
 * 1. 并发执行（同轮工具互不依赖）
 * 2. 自动重试一次
 * 3. Promise.allSettled 兜底（一个工具崩了不影响其他）
 * 4. 降级结果仍注入上下文（LLM 可据此降级推理）
 *
 * 通过 AsyncGenerator yield 每一步的状态变化，供上层透出到前端。
 *
 * 使用方式：
 * ```
 * const executor = new ToolExecutor(registry);
 * for await (const step of executor.execute(toolCalls)) {
 *   // step 可能是 tool_call(running) / tool_result(completed|degraded|error)
 * }
 * // 最后取 executor.results 获取注入 messages 的结果
 * ```
 */
export class ToolExecutor {
  /** 执行完成后，这里存放所有结果，供调用方注入 messages */
  results: Array<{
    role: "tool";
    content: string;
    tool_call_id: string;
  }> = [];

  constructor(private registry: ToolRegistry) {}

  async *execute(
    toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>,
    signal?: AbortSignal
  ): AsyncGenerator<AgentStep> {
    this.results = [];

    // ---- 通知前端「开始执行」 ----
    for (const tc of toolCalls) {
      yield {
        type: "tool_call",
        name: tc.name,
        status: "running",
        content: `正在调用 ${tc.name}...`,
      };
    }

    // ---- 中断检查（昂贵操作前唯一检查点） ----
    if (signal?.aborted) {
      for (const tc of toolCalls) {
        yield {
          type: "tool_result",
          name: tc.name,
          status: "error",
          content: "请求已被中断，工具未执行",
        };
      }
      return;
    }

    // ---- 并发执行（allSettled：一个崩不影响其他） ----
    const settled = await Promise.allSettled(
      toolCalls.map((tc) => executeOne(this.registry, tc))
    );

    // ---- 收集结果 + yield 状态 ----
    for (const s of settled) {
      if (s.status === "rejected") {
        // 极端情况：工具内部抛了未捕获异常
        yield {
          type: "tool_result",
          name: "unknown",
          status: "error",
          content: "工具执行发生未预期异常",
        };
        continue;
      }

      const { tc, result, retryStep, degraded } = s.value;

      // 重试步骤透出（前端感知到"失败→重试"的过程）
      if (retryStep) yield retryStep;

      if (degraded) {
        yield {
          type: "tool_result",
          name: tc.name,
          status: "degraded",
          content: `${tc.name} 已降级处理：两次尝试均失败`,
        };
      } else {
        yield {
          type: "tool_result",
          name: tc.name,
          status: result.error ? "error" : "completed",
          content: result.error
            ? `工具执行失败: ${result.error}`
            : "工具执行完成",
        };
      }

      // 无论成功/失败/降级，结果都注入上下文
      this.results.push({
        role: "tool",
        content: result.content,
        tool_call_id: tc.id,
      });
    }
  }
}
