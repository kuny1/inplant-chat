import { create } from "zustand";
import type { AgentStep, Source } from "./types";

// ---- 消息模型 ----

export interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  steps?: AgentStep[];
  sources?: Source[];
  isDegraded?: boolean;
}

export interface UISession {
  id: string;
  title: string;
}

// ---- 流式步骤 ----

export interface PendingStep {
  key: string;
  type: AgentStep["type"];
  name?: string;
  status: AgentStep["status"];
  content?: string;
}

// ---- key 生成规则 ----
// tool 系列（call/retry/result）→ key = name（同工具共享条目，状态自然流转）
// 无 name 的 step（thinking/generating/calling 等）→ key = type
// content 和废弃的 answer → null（不进入 pendingSteps）

function stepKey(step: AgentStep): string | null {
  if (step.type === "content" || (step.type as string) === "answer") return null;

  const toolTypes = new Set(["tool_call", "tool_retry", "tool_result"]);
  if (toolTypes.has(step.type) && step.name) return step.name;

  return step.type;
}

// ---- Store ----

interface ChatState {
  sessions: UISession[];
  currentSessionId: string | null;
  messages: UIMessage[];
  isStreaming: boolean;
  pendingSteps: PendingStep[];
  streamingContent: string;
  inputValue: string;

  setInputValue: (v: string) => void;
  sendMessage: (message: string) => Promise<void>;
  clearSession: () => void;
  loadSession: (id: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],
  isStreaming: false,
  pendingSteps: [],
  streamingContent: "",
  inputValue: "",

  setInputValue: (v) => set({ inputValue: v }),

  sendMessage: async (message) => {
    if (get().isStreaming) return;

    const userMsg: UIMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };

    set((s) => ({
      messages: [...s.messages, userMsg],
      isStreaming: true,
      pendingSteps: [],
      streamingContent: "",
      inputValue: "",
    }));

    const sessionId = get().currentSessionId;
    const url = `/api/chat?message=${encodeURIComponent(message)}${sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ""}`;
    const es = new EventSource(url);
    let finalContent = "";

    es.addEventListener("step", (e: MessageEvent) => {
      const step: AgentStep = JSON.parse(e.data);
      const key = stepKey(step);
      if (!key) return; // content/answer 类型不进入 pendingSteps

      set((s) => {
        const idx = s.pendingSteps.findIndex((p) => p.key === key);
        const ps: PendingStep = { key, type: step.type, name: step.name, status: step.status || "running", content: step.content };
        if (idx >= 0) {
          const updated = [...s.pendingSteps];
          updated[idx] = ps;
          return { pendingSteps: updated };
        }
        return { pendingSteps: [...s.pendingSteps, ps] };
      });
    });

    es.addEventListener("content", (e: MessageEvent) => {
      const { delta } = JSON.parse(e.data) as { delta: string };
      finalContent += delta;
      set((s) => ({ streamingContent: s.streamingContent + delta }));
    });

    es.addEventListener("done", (e: MessageEvent) => {
      es.close();
      const data = JSON.parse(e.data) as {
        sessionId: string;
        confidence: number;
        sources?: Source[];
      };

      const assistantMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: finalContent,
        steps: get().pendingSteps.map((p) => ({ type: p.type, name: p.name, status: p.status, content: p.content } as AgentStep)),
        sources: data.sources,
        isDegraded: data.confidence < 0.5,
      };

      const isNewSession = !get().currentSessionId;
      set((s) => ({
        messages: [...s.messages, assistantMsg],
        isStreaming: false,
        pendingSteps: [],
        streamingContent: "",
        currentSessionId: data.sessionId || s.currentSessionId,
        sessions: isNewSession
          ? [{ id: data.sessionId, title: message.slice(0, 30) + (message.length > 30 ? "..." : "") }, ...s.sessions]
          : s.sessions,
      }));
    });

    es.addEventListener("error", () => {
      es.close();
      const errorMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "请求失败，请检查服务是否正常运行。",
      };
      set((s) => ({
        messages: [...s.messages, errorMsg],
        isStreaming: false,
        pendingSteps: [],
        streamingContent: "",
      }));
    });
  },

  clearSession: () =>
    set({ currentSessionId: null, messages: [], pendingSteps: [], streamingContent: "" }),

  loadSession: async (id) => {
    if (get().isStreaming) return;
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) return;
      const session = await res.json();
      set({
        currentSessionId: id,
        messages: session.messages?.map((m: any) => ({ id: m.id, role: m.role, content: m.content, steps: m.metadata?.steps })) || [],
      });
    } catch { /* ignore */ }
  },
}));
