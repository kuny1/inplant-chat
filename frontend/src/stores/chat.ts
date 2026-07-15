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

// ---- SSE 步骤（流式过程中实时更新的临时状态） ----

export interface PendingStep {
  key: string; // "thinking" | "tool_call:name" | "tool_result:name"
  type: AgentStep["type"];
  name?: string;
  status: AgentStep["status"];
  content?: string;
}

// ---- Store ----

interface ChatState {
  // 会话
  sessions: UISession[];
  currentSessionId: string | null;

  // 消息
  messages: UIMessage[];

  // 流式状态
  isStreaming: boolean;
  pendingSteps: PendingStep[]; // 当前正在执行的步骤（替换旧的 stepTracker）
  streamingContent: string; // 当前正在接收的回答文本

  // 输入
  inputValue: string;

  // Actions
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

      if (step.type === "answer") return; // content 事件处理回答

      // key 只用 name，tool_call 和 tool_result 共享同一条目
      // tool_call(running) → tool_result(completed/degraded/error) 自然覆盖
      const key = step.name || "thinking";

      set((s) => {
        const idx = s.pendingSteps.findIndex((p) => p.key === key);
        const ps: PendingStep = {
          key,
          type: step.type,
          name: step.name,
          status: step.status || "running",
          content: step.content,
        };
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
      finalContent = delta;
      set({ streamingContent: delta });
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
        steps: get().pendingSteps.map((p) => ({
          type: p.type,
          name: p.name,
          status: p.status,
          content: p.content,
        } as AgentStep)),
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
          ? [
              {
                id: data.sessionId,
                title: message.slice(0, 30) + (message.length > 30 ? "..." : ""),
              },
              ...s.sessions,
            ]
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
    set({
      currentSessionId: null,
      messages: [],
      pendingSteps: [],
      streamingContent: "",
    }),

  loadSession: async (id) => {
    if (get().isStreaming) return;
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) return;
      const session = await res.json();
      set({
        currentSessionId: id,
        messages: session.messages?.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          steps: m.metadata?.steps,
        })) || [],
      });
    } catch {
      // ignore
    }
  },
}));
