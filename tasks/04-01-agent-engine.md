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

### 过程透出设计

每步通过 `yield AgentStep` 透出，前端据此渲染：

| step.type | 含义 | 前端渲染 |
|-----------|------|---------|
| `thinking` | LLM 正在推理 | 黄色脉冲动画 → 绿色"分析完成" |
| `tool_call` | 正在调用工具 | 黄色脉冲 + 工具名 → 绿色"已调用 xxx" |
| `tool_result` | 工具执行完成 | 绿色"xxx 完成" 或 红色"xxx 失败" |
| `answer` | 最终回答 | 替换步骤条为回答气泡 |

所有步骤共用同一个 key（type+name），后续更新只改 dot 颜色不重建 DOM——这是前端 `updateStep()` 的设计前提。

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
- [x] 工具执行过程通过 yield 透出
- [x] 达到 maxLoops 时强制生成回答
- [x] 注释包含 Plan-and-Execute / Saga / Orchestrator 扩展方向
