// ============================================================
// 消息与会话
// ============================================================

/** 消息角色 */
export type MessageRole = "user" | "assistant" | "system" | "tool";

/** 工具调用（LLM function calling 格式） */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** 消息 */
export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string; // tool 角色消息关联的 tool_call id
  metadata?: Record<string, unknown>;
}

/** 会话 */
export interface Session {
  id: string;
  userId?: string;
  title: string;
  messages: Message[];
  contextSummary?: string; // 压缩后的历史摘要
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// 工具系统
// ============================================================

/** 工具定义（OpenAI function calling 格式） */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

/** 工具执行结果 */
export interface ToolResult {
  toolCallId: string;
  name: string;
  content: string;
  error?: string;
}

// ============================================================
// 领域守卫
// ============================================================

/** 领域守卫结果 */
export interface GuardResult {
  passed: boolean;
  reason?: string;
  guessedDomain?: string; // 拒答时推测的用户领域
}

// ============================================================
// Agent 步骤（过程透出）
// ============================================================

export type StepType = "thinking" | "tool_call" | "tool_result" | "answer";
export type StepStatus = "running" | "completed" | "error";

export interface AgentStep {
  type: StepType;
  name?: string;
  content?: string;
  status?: StepStatus;
}

// ============================================================
// API 请求/响应
// ============================================================

/** 问答请求 */
export interface ChatRequest {
  sessionId?: string;
  message: string;
  stream?: boolean;
}

/** 来源引用 */
export interface Source {
  title: string;
  section?: string;
  content: string;
  relevance: number;
}

/** 问答响应 */
export interface ChatResponse {
  sessionId: string;
  content: string;
  sources: Source[];
  confidence: number;
  modelUsed: string;
  tokensUsed: { input: number; output: number };
  steps: AgentStep[];
}

/** SSE 事件 */
export interface SSEEvent {
  event: "step" | "content" | "done";
  data: AgentStep | { delta: string } | ChatResponse;
}

// ============================================================
// 校验
// ============================================================

export interface ValidationResult {
  safe: boolean;
  factual: boolean;
  confidence: number;
  warnings: string[];
}

// ============================================================
// 占位接口 — MVP 不实现但预留，体现设计意图
// ============================================================

/**
 * Saga 事务日志
 * 用于记录多步任务中每一步的执行和补偿状态。
 * 未来配合 SagaManager 实现分布式补偿事务。
 *
 * @future 当引入有副作用工具（task_create, alarm_acknowledge）时启用
 */
export interface SagaLogEntry {
  id: string;
  sessionId: string;
  planId: string;
  stepIndex: number;
  stepName: string;
  action: "execute" | "compensate" | "retry";
  status: "pending" | "completed" | "failed";
  detail: Record<string, unknown>;
  createdAt: Date;
}

/**
 * 异步任务
 * 长耗时操作（复杂数据分析、批量操作）通过此接口管理生命周期。
 * 前端通过 GET /api/tasks/:taskId 轮询获取结果。
 *
 * @future 当出现执行时间 > 30s 的操作时启用
 */
export interface AsyncTask {
  id: string;
  sessionId: string;
  type: string;
  status: "pending" | "running" | "completed" | "failed";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * 熔断器状态
 * 每个外部 API 独立实例。
 *
 * 状态转换：
 * CLOSED —(连续失败≥阈值)→ OPEN —(等待恢复超时)→ HALF_OPEN
 * HALF_OPEN —(探测成功)→ CLOSED
 * HALF_OPEN —(探测失败)→ OPEN
 *
 * @future 当外部 API 出现过不稳定时启用
 */
export interface CircuitBreakerState {
  state: "CLOSED" | "OPEN" | "HALF_OPEN";
  failures: number;
  lastFailureTime: number;
  recoveryTimeout: number;
}

/**
 * 令牌桶
 * 三级限流：全局(500/min) → 用户(容量100,恢复10/min) → LLM Token 级
 *
 * @future 多用户并发场景时启用
 */
export interface TokenBucket {
  capacity: number;
  tokens: number;
  refillRate: number;
  lastRefill: number;
}

/**
 * 向量存储接口
 * 当前：内存暴力搜索 O(n)，适合 n < 1000
 * 未来：pgvector ivfflat 索引，适合 n > 1000
 *
 * @future 文档量超过 100 或需要跨会话检索时迁移
 */
export interface VectorStore {
  add(
    id: string,
    embedding: number[],
    metadata: Record<string, unknown>
  ): Promise<void>;
  search(
    embedding: number[],
    topK: number
  ): Promise<
    Array<{ id: string; score: number; metadata: Record<string, unknown> }>
  >;
}

/**
 * 模型策略接口
 * ComplexityScorer 评分后选择策略。
 *
 * SimpleStrategy(0-30分): 低温度，无工具
 * ComplexStrategy(31-60): RAG + 有限工具
 * FullOrchestration(61-100): 全工具 + Plan-and-Execute
 *
 * @future 日请求量 > 1000，需要成本优化时启用
 */
export interface ModelStrategy {
  selectModel(complexityScore: number): {
    model: string;
    temperature: number;
    maxTokens: number;
    tools?: string[];
  };
}
