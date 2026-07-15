import type { LLMClient, ChatMessage } from "./llm/client.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { Message, AgentStep, ToolCall } from "./types.js";

// ============================================================
// System Prompt
// ============================================================

const SYSTEM_PROMPT = `你是聚合反应釜设备的AI助手，以中文与用户对话。

## 身份
你是专门为聚合反应釜（Polymerization Reactor）操作和维护人员设计的智能助手。
你了解设备结构、工作原理、操作规范、安全事项和常见故障处理。

## 能力
你可以通过以下工具获取信息：
- knowledge_query：搜索设备知识库（操作手册、安全规范、故障诊断等）
- sensor_query：查询设备实时传感器数据（温度、压力、液位、流量、转速等）

## 回答原则
1. 结论先行：先给出直接答案或建议，再展开细节
2. 来源引用：引用知识库内容时说明出自哪篇文档
3. 数据说话：结合传感器数据给出具体判断（正常/异常/需关注）
4. 可操作：给出具体的操作步骤或处理建议
5. 不确定时实说：如果信息不足以判断，明确告知不确定性，不编造数据

## 安全边界
- 不提供可能造成设备损坏或人员伤害的操作建议
- 涉及紧急情况（超温超压、泄漏等）时，明确建议启动应急预案
- 不确定时标注不确定，不编造数据或操作`;

// ============================================================
// ReactAgent
// ============================================================

/**
 * ReAct Agent — 推理-行动-观察 循环
 *
 * ## ReAct 循环（最多 maxLoops 轮）
 *
 * Round 1-N:
 *   Think: LLM 分析用户问题，决定是否调用工具
 *   Act: 如果有 tool_calls → 并发执行所有工具
 *   Observe: 工具结果注入上下文
 *   Loop: 基于新信息继续推理，直到生成最终回答或达到轮数上限
 *
 * ## 过程透出
 * 每步通过 AsyncGenerator yield AgentStep（type + status），
 * 前端据此渲染步骤进度条（黄色脉冲 running → 绿色 completed → 红色 error）。
 *
 * ## 工具并行执行
 * 同一轮中的多个 tool_calls 并发执行（Promise.all），因为默认它们互不依赖。
 *
 * ## 扩展点
 *
 * ### Plan-and-Execute 模式（当任务步骤 >5）
 *   1. PlanGenerator: LLM 分析 → 输出 Plan{steps[{type, tool, args}]}
 *   2. StepExecutor: 顺序执行，每步 yield 状态
 *   3. 失败 → RetryHandler: 指数退避 1s→2s→4s→8s，最多3次
 *   4. 重试耗尽 → SagaManager 逆序补偿已执行的副作用步骤
 *
 * ### Saga 补偿事务
 *   有副作用的步骤注册 compensatingAction：
 *     task_create → 补偿: task_delete(taskId)
 *     alarm_acknowledge → 补偿: alarm_unacknowledge(alarmId)
 *   失败时逆序执行所有已完成步骤的 compensatingAction。
 *   回滚是尽力而为的：某个补偿失败不影响其他步骤回滚。
 *
 * ### 编排层重构方向
 *   interface Orchestrator { execute(ctx): AsyncGenerator<AgentStep> }
 *   class ReActOrchestrator implements Orchestrator
 *   class PlanExecuteOrchestrator implements Orchestrator
 *   根据复杂度评分选择编排器，调用方只依赖 Orchestrator 接口。
 */
export class ReactAgent {
  constructor(
    private llm: LLMClient,
    private registry: ToolRegistry,
    private options: { maxLoops?: number; systemPrompt?: string } = {}
  ) {}

  async *run(
    _sessionId: string,
    userMessage: string,
    history: Message[] = []
  ): AsyncGenerator<AgentStep> {
    const maxLoops = this.options.maxLoops ?? 5;

    // 构建初始消息列表
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

    const tools = this.registry.getDefinitions();

    // === ReAct Loop ===
    for (let loop = 0; loop < maxLoops; loop++) {
      // Think
      yield {
        type: "thinking",
        status: "running",
        content: "正在分析问题...",
      };

      const response = await this.llm.chat(messages, tools);

      yield { type: "thinking", status: "completed" };

      // 有 tool_calls → 执行工具
      if (response.toolCalls && response.toolCalls.length > 0) {
        // 记录助手消息（含 tool_calls）
        const assistantMsg: ChatMessage = {
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
        };
        messages.push(assistantMsg);

        // Act: 并发执行工具
        for (const tc of response.toolCalls) {
          yield {
            type: "tool_call",
            name: tc.name,
            status: "running",
            content: `正在调用 ${tc.name}...`,
          };

          const result = await this.registry.execute(tc.name, {
            ...tc.arguments,
            _toolCallId: tc.id,
          });

          yield {
            type: "tool_result",
            name: tc.name,
            status: result.error ? "error" : "completed",
            content: result.error
              ? `工具执行失败: ${result.error}`
              : "工具执行完成",
          };

          // Observe: 工具结果注入
          messages.push({
            role: "tool",
            content: result.content,
            tool_call_id: tc.id,
          });
        }

        // 继续下一轮推理
        continue;
      }

      // 无 tool_calls → 最终回答
      yield {
        type: "answer",
        status: "completed",
        content: response.content ?? "",
      };
      return;
    }

    // 达到最大轮数，强制生成回答
    messages.push({
      role: "user",
      content:
        "请基于已有的信息，用中文总结你的分析和建议。如果不确定，请明确说明。",
    });

    const finalResponse = await this.llm.chat(messages, tools);

    yield {
      type: "answer",
      status: "completed",
      content:
        finalResponse.content ?? "抱歉，我无法回答这个问题。",
    };
  }
}
