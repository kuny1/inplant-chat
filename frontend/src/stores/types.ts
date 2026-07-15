// 与后端 src/types.ts 对齐的前端类型

export type StepType = "thinking" | "tool_call" | "tool_result" | "answer";
export type StepStatus = "running" | "completed" | "error" | "degraded";

export interface AgentStep {
  type: StepType;
  name?: string;
  content?: string;
  status?: StepStatus;
}

export interface Source {
  title: string;
  section?: string;
  content: string;
  relevance: number;
}
