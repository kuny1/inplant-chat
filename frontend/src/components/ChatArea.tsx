import { useChatStore } from "../stores/chat";
import { MessageList } from "./MessageList";
import { InputArea } from "./InputArea";

export function ChatArea() {
  const firstMsg = useChatStore((s) => s.messages[0]);
  const title = firstMsg
    ? firstMsg.content.slice(0, 30) + (firstMsg.content.length > 30 ? "..." : "")
    : "聚合反应釜智能助手";

  return (
    <div className="main">
      <div className="chat-header">{title}</div>
      <MessageList />
      <InputArea />
    </div>
  );
}
