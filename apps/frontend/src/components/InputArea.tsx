import { useChatStore } from "../stores/chat";
import type { FormEvent, KeyboardEvent } from "react";

export function InputArea() {
  const inputValue = useChatStore((s) => s.inputValue);
  const setInputValue = useChatStore((s) => s.setInputValue);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isStreaming = useChatStore((s) => s.isStreaming);

  const doSend = () => {
    const msg = inputValue.trim();
    if (!msg || isStreaming) return;
    sendMessage(msg);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    doSend();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  return (
    <div className="input-area">
      <form className="input-wrapper" onSubmit={onSubmit}>
        <textarea
          placeholder="输入您的问题，Enter 发送，Shift+Enter 换行"
          rows={1}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={isStreaming}
        />
        <button className="send-btn" type="submit" disabled={isStreaming}>
          {isStreaming ? "…" : "发送"}
        </button>
      </form>
    </div>
  );
}
