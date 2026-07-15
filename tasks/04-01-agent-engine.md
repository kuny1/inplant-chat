# T4.1 Agent 引擎

**状态**：✅ 完整实现
**依赖**：T2.1（LLM 客户端）, T3.3（工具注册表）
**可并行**：否（需等待依赖完成）

## 产出文件

- `src/agent.ts`

## 实现内容

```typescript
import type { LLMClient } from "./llm/client.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { Message, AgentStep, ToolCall } from "./types.js";
import { randomUUID } from "crypto";

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

/**
 * ReAct Agent — 推理-行动-观察 循环
 *
 * ## ReAct 循环（最多 maxLoops 轮）
 *
 * Round 1-N:
 *   Think: LLM 分析用户问题，决定是否调用工具
 *   Act: 如果需要数据 → 调用 tool_calls 中的工具
 *   Observe: 工具结果追加到上下文
 *   Loop: 基于新信息继续推理，直到生成最终回答或达到轮数上限
 *
 * ## 过程透出
 * 每步通过 AsyncGenerator yield AgentStep，包含类型和状态。
 * 前端据此渲染：步骤进度条（yellow pulse→green done→red error）
 *
 * ## 工具并行执行
 * 同一轮中的多个 tool_calls 并发执行（Promise.all），因为它们互不依赖。
 *
 * ## 扩展点
 *
 * ### Plan-and-Execute 模式（当任务步骤 >5）
 *   1. PlanGenerator: LLM 分析 → 输出 Plan{steps[{type, tool, args}]}
 *   2. StepExecutor: 顺序执行步骤，每步 yield 状态
 *   3. 失败 → RetryHandler: 指数退避 1s→2s→4s→8s，最多3次
 *   4. 重试耗尽 → SagaManager 逆序补偿已执行的副作用步骤
 *
 * ### Saga 补偿事务
 *   有副作用的步骤（如 task_create, alarm_acknowledge）注册 compensatingAction：
 *     task_create → compensatingAction: task_delete(taskId)
 *     alarm_acknowledge → compensatingAction: alarm_unacknowledge(alarmId)
 *   失败时逆序执行所有已完成步骤的 compensatingAction。
 *   回滚是尽力而为的：某个补偿失败不影响其他步骤继续回滚。
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
    sessionId: string,
    userMessage: string,
    history: Message[] = []
  ): AsyncGenerator<AgentStep> {
    const maxLoops = this.options.maxLoops ?? 5;

    const messages: Array<{
      role: string;
      content: string;
      tool_call_id?: string;
      tool_calls?: unknown[];
    }> = [
      { role: "system", content: this.options.systemPrompt ?? SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
      })),
      { role: "user", content: userMessage },
    ];

    const tools = this.registry.getDefinitions();

    for (let loop = 0; loop < maxLoops; loop++) {
      // Think
      yield { type: "thinking", status: "running", content: "正在分析问题..." };

      const response = await this.llm.chat(messages, tools);

      yield { type: "thinking", status: "completed" };

      // 记录助手消息
      const assistantMsg: Record<string, unknown> = { role: "assistant", content: response.content || "" };

      // 如果有 tool_calls，处理工具调用
      if (response.toolCalls && response.toolCalls.length > 0) {
        assistantMsg["tool_calls"] = response.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }));
        messages.push(assistantMsg as any);

        // Act: 并发执行所有工具
        const toolPromises = response.toolCalls.map(async (tc) => {
          yield {
            type: "tool_call" as const,
            name: tc.name,
            status: "running" as const,
            content: `正在调用 ${tc.name}...`,
          };

          const result = await this.registry.execute(tc.name, {
            ...tc.arguments,
            _toolCallId: tc.id,
          });

          yield {
            type: "tool_result" as const,
            name: tc.name,
            status: result.error ? "error" as const : "completed" as const,
            content: result.error ? `工具执行失败: ${result.error}` : "工具执行完成",
          };

          return { tc, result };
        });

        const toolResults = [];
        for await (const tr of toolPromises) {
          toolResults.push(tr);
        }

        // Observe: 将工具结果注入 messages
        for (const { tc, result } of toolResults) {
          messages.push({
            role: "tool",
            content: result.content,
            tool_call_id: tc.id,
          });
        }

        // 继续下一轮推理
        continue;
      }

      // 没有 tool_calls，这是最终回答
      yield {
        type: "answer",
        status: "completed",
        content: response.content ?? "",
      };

      return; // 结束
    }

    // 达到最大轮数，强制生成回答
    messages.push({
      role: "user",
      content: "请基于已有的信息，用中文总结你的分析和建议。如果不确定，请明确说明。",
    });

    const finalResponse = await this.llm.chat(messages, tools);

    yield {
      type: "answer",
      status: "completed",
      content: finalResponse.content ?? "抱歉，我无法回答这个问题。",
    };
  }
}
```

## 验收标准

- [ ] ReAct 循环正确：Think → ToolCall → Observe → Answer
- [ ] 同一轮的多工具并发执行
- [ ] 达到 maxLoops 时强制生成回答
- [ ] 每步 yield AgentStep 用于前端渲染
- [ ] 注释中包含 Plan-and-Execute / Saga / Orchestrator 扩展方向
