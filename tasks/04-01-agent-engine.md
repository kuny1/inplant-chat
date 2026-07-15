# T4.1 Agent 引擎

**状态**：✅ 已完成
**依赖**：T2.1（LLM 客户端）, T3.3（工具注册表）
**可并行**：否（需等待依赖完成）

## 产出文件

- `src/agent.ts`

## 实现要点

### System Prompt 设计

Prompt 包含四个部分：

1. **身份**：明确角色为"聚合反应釜设备AI助手"，限定领域范围
2. **能力**：列出可用工具（knowledge_query + sensor_query），让 LLM 知道何时调用
3. **回答原则**：结论先行、来源引用、数据说话、可操作、不确定实说——五条原则对齐产品设计中"结果可理解"的目标
4. **安全边界**：不提供危险建议、紧急情况建议启动预案、不编造数据——防止 LLM 幻觉产生误导

### ReAct 循环

```
ReactAgent.run(sessionId, userMessage, history) → AsyncGenerator<AgentStep>:

  messages = [systemPrompt, ...history, userMessage]
  tools = registry.getDefinitions()

  for loop = 0..maxLoops(5):
    yield { type: "thinking", status: "running" }
    response = llm.chat(messages, tools)
    yield { type: "thinking", status: "completed" }

    if response.toolCalls 存在且非空:
      // 记录助手消息（包含 tool_calls）到 messages
      // 逐个执行工具，每个工具 yield 两个步骤：
      //   { type: "tool_call",  name, status: "running" }
      //   { type: "tool_result", name, status: "completed"|"error" }
      // 工具结果以 role="tool" 追加到 messages
      // continue（下一轮推理）

    else:
      // 无 tool_calls → 最终回答
      yield { type: "answer", status: "completed", content }
      return

  // 达到最大轮数 → 追加提示消息，强制生成最终回答
  yield { type: "answer", status: "completed", content }
```

### 为什么选 AsyncGenerator 而非回调或 EventEmitter

这是 AsyncGenerator 的专长场景——"逐步产出数据，调用方逐步消费"。

- **回调模式**的问题：回调内不能 await、异常处理分散、违背"推理与业务分离"
- **EventEmitter** 的问题：非 JS 标准（仅 Node）、需手动管理监听器生命周期、存在事件错过风险
- **AsyncGenerator** 的优势：内置背压、调用方自然控制消费节奏、SSE 和 JSON 两种模式都能工作

JSON 模式的困扰不是 Generator 的问题——可以在 Agent 上加一个 `runSync` 便利方法：

```
async runSync(sessionId, message, history?):
  steps = []
  content = ""
  for await (step of this.run(...)):
    steps.push(step)
    if step.type == "answer": content = step.content
  return { content, steps }
```

这样 JSON 模式一行调用，SSE 模式继续用 `for await...of`。

### 中断机制

通过 `AbortSignal` 支持调用方随时中断 Agent：

```
run(sessionId, message, history, options?: { signal?: AbortSignal })
```

**检查点分布**：每个 `yield` 之后都先检查 `signal.aborted`。具体位置：

1. 每轮 ReAct 循环开始时（LLM 调用前）
2. 工具执行前（yield running 之后，Promise.all 之前）
3. 被中断时：将所有未执行的工具标记为 `error` + "请求已被中断，工具未执行"，最后 yield `answer{status:"error"}` 结束

**调用方示例**：

```
const controller = new AbortController();
setTimeout(() => controller.abort(), 30000);  // 30s 超时自动中断
for await (const step of agent.run(sid, msg, hist, { signal: controller.signal })) {
  // 渲染 step
}
```

**为什么用 AbortSignal 而不是自定义 CancellationToken？**
- AbortSignal 是 Web 标准，浏览器和 Node.js 通用
- AbortController 可以被 timeout、用户点击"停止"按钮、fetch 超时等多个来源触发
- 不需要引入额外抽象，调用方已经熟悉这个 API

### 工具并行执行

同一轮 LLM 返回的多个 tool_calls 默认无依赖（不同工具查询不同数据源），应用 `Promise.all` 并发：

```
// yield 所有 tool_call { status: "running" } — 通知前端 N 个工具开始执行
// signal 检查 — 如果已中断，标记剩余工具为 error，结束
// results = Promise.all(toolCalls.map(tc => registry.execute(tc.name, tc.args)))
// yield 每个 tool_result { status: "completed"|"error" }
```

**为什么不是串行 for-of？** 当 LLM 同时调 `knowledge_query("温度异常")` 和 `sensor_query({pointId:"T-101"})` 时，两个工具查询的是不同数据源，串行白白浪费等待时间。并发执行将这一步的延迟从 `sum(各工具耗时)` 降为 `max(各工具耗时)`。

**如果将来出现有依赖的工具链怎么办？** 当前 MVP 场景不存在这个需求。当引入 Plan-and-Execute 模式时，编排器会按依赖关系分组，组内并行、组间串行。

### 异常循环降级

达到 maxLoops 仍未得出最终回答时，**显式说明这是降级**，不静默继续：

```
// 不直接调 LLM 强制回答，先 yield 一个说明步骤：
yield {
  type: "thinking",
  status: "completed",
  content: "推理轮数已达上限（5轮），基于已有信息生成降级回答。如需更完整的分析，请尝试更具体地描述问题。"
}

// 强制回答 prompt 中说明当前处境，让 LLM 基于已有信息尽力回答
messages.push({
  role: "user",
  content: "你已经进行了多轮工具调用和推理。请基于目前已获取的全部信息，" +
           "用中文给出你当前能做出的最佳分析和建议。" +
           "如果某些方面信息不足无法判断，请明确说明局限性，不要编造。"
})

// 最终回答标注为降级：
yield {
  type: "answer",
  status: "degraded",  // 不是 "completed"
  content: answer + "\n\n---\n⚡ 以上回答为降级结果：推理轮数超过限制..."
}
```

**前端渲染差异**：`status: "degraded"` 渲染为橙色边框，区别于正常 `completed` 的绿色边框。

### 过程透出完整矩阵

| step.type | step.status | 含义 | 前端渲染 |
|-----------|-------------|------|---------|
| `thinking` | `running` | LLM 推理中 | 黄色脉冲动画 |
| `thinking` | `completed` | 推理完成 | 绿色"分析完成" |
| `tool_call` | `running` | 工具执行中 | 黄色脉冲 + 工具名 |
| `tool_result` | `completed` | 工具正常返回 | 绿色"xxx 完成" |
| `tool_result` | `error` | 工具执行失败 | 红色"xxx 失败" |
| `answer` | `completed` | 正常回答 | 绿色边框回答气泡 |
| `answer` | `degraded` | 降级回答（超轮数） | 橙色边框 + ⚡ 提示 |
| `answer` | `error` | 中断/异常 | 红色边框 + 错误信息 |

### 扩展点（注释预留）

**Plan-and-Execute 模式**（当任务步骤 >5）：
```
PlanGenerator: LLM 分析 → Plan{ steps[{ type, tool, args }] }
StepExecutor: 顺序执行，每步 yield 状态
失败 → RetryHandler: 指数退避 1s→2s→4s→8s，最多3次
重试耗尽 → SagaManager 逆序补偿
```

**Saga 补偿事务**：
有副作用步骤（task_create, alarm_acknowledge）注册 compensatingAction。
失败时逆序执行，回滚是尽力而为的。

**编排层重构**：
```
interface Orchestrator { execute(ctx): AsyncGenerator<AgentStep> }
class ReActOrchestrator implements Orchestrator   // 当前
class PlanExecuteOrchestrator implements Orchestrator  // 未来
```
根据复杂度评分选择编排器，调用方只依赖 Orchestrator 接口。

## 验收标准

- [x] ReAct 循环：Think → ToolCall → Observe → Answer
- [x] 中断机制：signal.aborted 检查点分布在每次 LLM 调用和工具执行前后
- [x] 工具并发：同轮多 tool_calls 通过 Promise.all 并发执行
- [x] 降级显式化：超轮数时 yield 说明步骤 + answer.status="degraded" + 橙色标记
- [x] 注释包含 Plan-and-Execute / Saga / Orchestrator 扩展方向
