# T1.2 类型定义

**状态**：✅ 已完成
**依赖**：无
**可并行**：是

## 产出文件

- `src/types.ts`

## 实现要点

### 类型分组设计

整个类型文件按功能域分为 7 组，每组用注释分隔：

| 分组       | 核心类型                                                                                          | 说明                                             |
| ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 消息与会话 | `Message`, `Session`, `MessageRole`                                                               | 会话和消息的数据模型                             |
| 工具系统   | `ToolDefinition`, `ToolResult`                                                                    | ToolDefinition 对齐 OpenAI function calling 格式 |
| 领域守卫   | `GuardResult`                                                                                     | passed/reason/guessedDomain 三字段               |
| Agent 步骤 | `AgentStep`, `StepType`, `StepStatus`                                                             | 过程透出的数据载体，前端据此渲染进度             |
| API        | `ChatRequest`, `ChatResponse`, `Source`, `SSEEvent`                                               | 请求/响应/SSE 事件类型                           |
| 校验       | `ValidationResult`                                                                                | safe/factual/confidence/warnings                 |
| 占位接口   | `SagaLogEntry`, `AsyncTask`, `CircuitBreakerState`, `TokenBucket`, `VectorStore`, `ModelStrategy` | 每个带 JSDoc 描述设计意图和触发条件              |

### 关键设计决策

- **ToolDefinition 对齐 OpenAI 格式**：`{ type: "function", function: { name, description, parameters } }`，无需转换即可传给 DeepSeek API
- **AgentStep 不存数据库**：作为过程透出的临时数据，仅存在于单次请求的生命周期中，不持久化
- **占位接口全带 @future 标记**：方便全局搜索找到所有待实现功能

### 占位接口的设计意图

每个占位接口的 JSDoc 回答三个问题：

1. 这个接口解决什么问题？（如 SagaLogEntry → 多步任务的补偿事务追踪）
2. 核心逻辑是什么？（如 CircuitBreakerState → 三态转换状态机）
3. 什么条件触发实现？（如 VectorStore → 文档量超过 100）

## 验收标准

- [x] 所有类型通过 TypeScript 编译检查
- [x] 占位接口 JSDoc 包含设计意图和启用条件
- [x] 无循环依赖
