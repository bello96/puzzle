import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types/protocol";

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
}

export default function ChatPanel({ messages, onSend }: Props) {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text) {
      return;
    }
    onSend(text);
    setInput("");
  }

  return (
    <div className="flex flex-col h-full bg-white border-l">
      <div className="px-3 py-2 border-b text-sm font-medium text-gray-600">
        聊天
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {messages.map((m) => (
          <div key={m.id}>
            {m.kind === "system" ? (
              <div className="text-xs text-gray-400 text-center py-0.5">
                {m.text}
              </div>
            ) : (
              <div className="text-sm">
                <span className="font-medium text-primary mr-1">
                  {m.playerName}
                </span>
                <span className="text-gray-700">{m.text}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t p-2 flex gap-2">
        <input
          className="flex-1 border rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          placeholder="发消息..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSend();
            }
          }}
        />
        <button
          className="bg-primary text-white text-sm rounded-lg px-3 py-1.5 hover:bg-primary-dark disabled:opacity-50"
          disabled={!input.trim()}
          onClick={handleSend}
        >
          发送
        </button>
      </div>
    </div>
  );
}
