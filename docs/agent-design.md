# Agent 编排设计

> 最后更新：2026-07-15 | 版本：0.1.0

## 一、System Prompt 设计

分为四个部分，各有明确目的：

| 部分 | 内容 | 目的 |
|------|------|------|
| 身份 | "聚合反应釜设备AI助手" | 限定角色，让 LLM 进入专业语境 |
| 能力 | 列出 knowledge_query + sensor_query | 让 LLM 知道有哪些工具可用、何时调用 |
| 回答原则 | 结论先行、来源引用、数据说话、可操作、不确定实说 | 对齐产品设计"结果可理解"目标 |
| 安全边界 | 不提供危险建议、紧急情况建议预案、不编造 | 防止 LLM 幻觉产生误导 |

## 二、ReAct 循环

```
ReactAgent.run(sessionId, message, history, { signal? }) → AsyncGenerator<AgentStep>

messages = [systemPrompt, ...history(最近10条), userMessage]
tools = registry.getDefinitions()

for loop in 0..maxLoops(5):

  // === Think ===
  if signal.aborted → yield answer(error) → return
  yield thinking(running)
  response = llm.chat(messages, tools)
  yield thinking(completed)

  // === Act ===
  if response.toolCalls:
    messages.push(assistantMsg + tool_calls)
    yield* toolExecutor.execute(toolCalls, signal)   // 委托 ToolExecutor
    messages.push(...toolExecutor.results)            // 注入工具结果
    continue

  // === Answer ===
  yield answer(completed, response.content)
  return

// 达到 maxLoops
yield thinking(degraded, "推理轮数已达上限...")
response = llm.chat(messages + 强制总结prompt, tools)
yield answer(degraded, response + "⚡ 降级回答...")
```

## 三、工具执行器（ToolExecutor）

从 ReactAgent 中独立出来的模块，负责工具调用全生命周期：

```
ToolExecutor.execute(toolCalls, signal):

  // 1. 通知前端
  for each tc: yield tool_call(running)

  // 2. 中断检查（昂贵操作前唯一检查点）
  if signal.aborted: yield tool_result(error, "已中断") for each → return

  // 3. 并发执行
  settled = Promise.allSettled(toolCalls.map(tc => executeOne(tc)))

  // 4. 收集结果
  for each s in settled:
    if rejected → yield tool_result(error)
    yield retryStep（如有）
    yield tool_result(completed | degraded | error)
    results.push({ role:"tool", content, tool_call_id })
```

**executeOne 重试逻辑**：

```
executeOne(tc):
  1st attempt → 成功 → return
  1st attempt → 失败 → 2nd attempt → 成功 → return + retryStep
  2nd attempt → 失败 → return degraded + retryStep
```

降级结果中注入上下文消息，告知 LLM 该工具不可用，请基于其他来源回答。

## 四、中断机制

使用 Web 标准 `AbortSignal`，检查点位于昂贵操作前：

| 位置 | 检查点 | 中断后行为 |
|------|--------|-----------|
| agent.ts 每轮循环开始 | LLM 调用前 | yield answer(error, "已中断") → return |
| tool-executor.ts | Promise.allSettled 前 | 标记所有未执行工具为 error → return |

调用方：`routes.ts` 从 HTTP 请求 `close` 事件创建 AbortController，传入 `agent.run()`。客户端断开连接（关闭页面、超时）→ Agent 在 <100ms 感知并停止。

## 五、过程透出矩阵

| step.type | step.status | 前端渲染 |
|-----------|-------------|---------|
| thinking | running | 黄色脉冲"正在分析..." |
| thinking | completed | 绿色"分析完成" / 降级时橙色说明文本 |
| tool_call | running | 黄色脉冲 + 工具名 |
| tool_result | completed | 绿色"xxx 完成" |
| tool_result | degraded | 橙色"xxx 已降级" |
| tool_result | error | 红色"xxx 失败" |
| answer | completed | 绿色边框回答气泡 |
| answer | degraded | 橙色边框 + ⚡ "降级结果" |
| answer | error | 红色边框 + 错误信息 |

## 六、扩展方向

### Plan-and-Execute（步骤 >5 时切换）

```
PlanExecuteOrchestrator.execute(ctx):
  plan = PlanGenerator.generate(query, tools)
  for phase in plan.phases:
    if signal.aborted → yield abort() → return
    yield* phase.execute()    // phase 内部可以是 ReactAgent 或 ToolExecutor
```

### Saga 补偿

有副作用的工具（task_create, alarm_acknowledge）注册 compensatingAction。
失败时逆序执行补偿，回滚是尽力而为的。

### Orchestrator 接口

```
interface Orchestrator {
  execute(ctx: AgentContext): AsyncGenerator<AgentStep>
}
class ReActOrchestrator implements Orchestrator       // 当前
class PlanExecuteOrchestrator implements Orchestrator  // 未来
```
