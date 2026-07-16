import { Streamdown } from "streamdown";
import { useChatStore } from "../stores/chat";
import type { UIMessage } from "../stores/chat";
import { StepTracker } from "./StepTracker";

function UserBubble({ msg }: { msg: UIMessage }) {
  return <div className="msg user">{msg.content}</div>;
}

function AssistantBubble({ msg }: { msg: UIMessage }) {
  return (
    <div>
      {msg.steps && msg.steps.length > 0 && <StepTracker steps={msg.steps} />}
      <div
        className={`msg assistant${msg.isDegraded ? " degraded" : ""}`}
      >
        <Streamdown>{msg.content}</Streamdown>
      </div>
      {msg.sources && msg.sources.length > 0 && (
        <div className="sources">
          <div className="source-title">📚 参考来源</div>
          {msg.sources.map((s, i) => (
            <div key={i} className="source-item">
              • {s.title}
              {s.section ? ` - ${s.section}` : ""}{" "}
              <span className="source-score">
                ({Math.round(s.relevance * 100)}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="domain-hint">
      当前版本仅支持「聚合反应釜」相关问题的智能问答
      <br />
      可以询问设备结构、操作规范、故障诊断、传感器数据等
    </div>
  );
}

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const pendingSteps = useChatStore((s) => s.pendingSteps);
  const streamingContent = useChatStore((s) => s.streamingContent);

  return (
    <div className="messages">
      <div className="messages-inner">
        {messages.length === 0 && !isStreaming && <EmptyHint />}

        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserBubble key={msg.id} msg={msg} />
          ) : (
            <AssistantBubble key={msg.id} msg={msg} />
          )
        )}

        {/* 流式内容放最后 → 在 inner 最底部 → column-reverse 后固定在视觉底部 */}
        {isStreaming && pendingSteps.length > 0 && (
          <StepTracker steps={pendingSteps} live />
        )}

        {isStreaming && streamingContent && (
          <div className="msg assistant streaming">
            <Streamdown>{streamingContent}</Streamdown>
          </div>
        )}
      </div>
    </div>
  );
}
