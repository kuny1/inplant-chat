import { useEffect } from "react";
import { useChatStore } from "../stores/chat";

export function Sidebar() {
  const sessions = useChatStore((s) => s.sessions);
  const currentId = useChatStore((s) => s.currentSessionId);
  const clearSession = useChatStore((s) => s.clearSession);
  const loadSession = useChatStore((s) => s.loadSession);
  const fetchSessions = useChatStore((s) => s.fetchSessions);

  useEffect(() => {
    fetchSessions();
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="logo">⚙️</span> InPlant Chat
      </div>
      <button className="new-chat-btn" onClick={clearSession}>
        + 新建会话
      </button>
      <div className="session-list">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`session-item${s.id === currentId ? " active" : ""}`}
            onClick={() => loadSession(s.id)}
          >
            {s.title}
          </div>
        ))}
      </div>
    </aside>
  );
}
