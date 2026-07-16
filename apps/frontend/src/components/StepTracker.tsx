import { useState, useEffect } from "react";
import type { AgentStep } from "../stores/types";

// ---- step label / icon (unchanged) ----

function stepLabel(step: AgentStep): string {
  const done = step.status !== "running";
  switch (step.type) {
    case "guarding":          return done ? "校验完成" : step.content || "正在校验输入...";
    case "memory_loading":    return done ? step.content || "上下文加载完成" : "正在加载历史上下文...";
    case "intent_recognition": return done ? step.content || "意图识别完成" : "正在理解问题意图...";
    case "thinking":          return done ? "推理完成" : "正在分析问题...";
    case "planning":          return done ? "计划生成完成" : "正在生成执行计划...";
    case "calling":           return done ? step.content || "准备就绪" : "准备调用工具...";
    case "tool_call":         return done ? `已调用 ${step.name}` : step.content || `正在调用 ${step.name}...`;
    case "tool_retry":        return step.content || `正在重试 ${step.name}...`;
    case "tool_result":
      if (step.status === "degraded") return `${step.name} 降级`;
      if (step.status === "error") return `${step.name} 失败`;
      return `${step.name} 完成`;
    case "generating":
      if (step.status === "error") return "生成中断";
      return done ? "生成完成" : "正在生成回答...";
    case "validating":        return done ? "校验完成" : "正在校验回答...";
    case "done":              return "完成";
    case "error":             return step.content || "发生错误";
    case "degraded":          return step.content || "降级完成";
    default:                  return step.content || "";
  }
}

function stepIcon(type: AgentStep["type"]): string {
  switch (type) {
    case "guarding":          return "🛡️";
    case "memory_loading":    return "📂";
    case "intent_recognition": return "🎯";
    case "thinking":          return "🤔";
    case "planning":          return "📋";
    case "calling":           return "📞";
    case "tool_call":         return "🔧";
    case "tool_retry":        return "🔄";
    case "tool_result":       return "📋";
    case "generating":        return "✍️";
    case "validating":        return "✅";
    case "done":              return "🏁";
    case "error":             return "❌";
    case "degraded":          return "⚠️";
    default:                  return "•";
  }
}

function isExpandable(step: AgentStep): boolean {
  return (step.status === "degraded" || step.status === "error") && !!step.content;
}

// ---- index helper ----

/** 在全局可见列表中的实际序号 */
function globalIndex(all: AgentStep[], item: AgentStep): number {
  // 找到 type+name 首次出现位置
  return all.findIndex((s) => s.type === item.type && s.name === item.name) + 1;
}

// ----

const COLLAPSE_THRESHOLD = 3;

interface Props {
  steps: AgentStep[];
  live?: boolean;
}

export function StepTracker({ steps, live }: Props) {
  const visible = steps.filter((s) => s.type !== "content");
  const displaySteps = live
    ? visible
    : visible.filter((s) => s.status !== "running" || s.type === "tool_retry");

  const hasRunning = displaySteps.some((s) => s.status === "running");
  const canCollapse = displaySteps.length > COLLAPSE_THRESHOLD;
  // 有任务在跑 → 强制展开；全部完成 → 默认收起
  const [collapsed, setCollapsed] = useState(!hasRunning);

  // 当新的 running 步骤出现时自动展开
  useEffect(() => {
    if (hasRunning) setCollapsed(false);
  }, [hasRunning]);

  const renderedSteps =
    canCollapse && collapsed ? displaySteps.slice(-2) : displaySteps;

  return (
    <div className={`step-tracker-wrapper${collapsed && canCollapse ? " collapsed" : ""}`}>
      {/* 标题栏 */}
      <div className="step-header">
        <span className="step-header-title">
          <span className={`step-header-indicator${hasRunning ? " live" : ""}`} />
          运行监视
        </span>
        <span className="step-header-count">{displaySteps.length} 步</span>
      </div>

      {/* 步骤列表 — 管线轨道 */}
      <div className="step-tracker">
        <div className="step-rail" />

        {renderedSteps.map((step, i) => {
          const idx = globalIndex(displaySteps, step);
          const isRunning = step.status === "running" && live;
          const isLast = i === renderedSteps.length - 1;

          return (
            <div
              key={`${step.type}-${step.name || ""}-${i}`}
              className={`step-item${isRunning ? " running" : ""}${isExpandable(step) ? " expandable" : ""}`}
              title={isExpandable(step) ? step.content : undefined}
            >
              <span className="step-index">
                {String(idx).padStart(2, "0")}
              </span>
              <span
                className={`step-dot ${isRunning ? "running" : step.status || "completed"}`}
              />
              <span className="step-icon">{stepIcon(step.type)}</span>
              <span className="step-text">{stepLabel(step)}</span>
            </div>
          );
        })}
      </div>

      {/* toggle */}
      {canCollapse && (
        <div className="step-toggle" onClick={() => setCollapsed(!collapsed)}>
          <span className="step-toggle-arrow">{collapsed ? "▼" : "▲"}</span>
          {collapsed ? "展开全部步骤" : "收起"}
        </div>
      )}
    </div>
  );
}
