import type { AgentStep } from "../stores/types";

function stepLabel(step: AgentStep): string {
  switch (step.type) {
    case "thinking":
      return step.status === "completed"
        ? "分析完成"
        : step.content || "正在思考...";
    case "tool_call":
      return step.status === "completed"
        ? `已调用 ${step.name}`
        : step.content || `正在调用 ${step.name}...`;
    case "tool_result":
      if (step.status === "degraded") return `${step.name} 已降级`;
      if (step.status === "error") return `${step.name} 失败`;
      return `${step.name} 完成`;
    default:
      return step.content || "";
  }
}

function stepIcon(type: AgentStep["type"]): string {
  switch (type) {
    case "tool_call":
      return "🔧";
    case "tool_result":
      return "📋";
    default:
      return "🤔";
  }
}

interface Props {
  steps: AgentStep[];
  live?: boolean;
}

export function StepTracker({ steps, live }: Props) {
  const displaySteps = live
    ? steps
    : steps.filter((s) => s.type !== "thinking" || s.status === "completed");

  return (
    <div className="step-tracker">
      {displaySteps.map((step, i) => (
        <div
          key={`${step.type}-${step.name || "thinking"}-${i}`}
          className="step-item"
        >
          <span
            className={`step-dot ${step.status === "running" && live ? "running" : step.status || "completed"}`}
          />
          <span className="step-icon">{stepIcon(step.type)}</span>
          <span className="step-text">{stepLabel(step)}</span>
        </div>
      ))}
    </div>
  );
}
