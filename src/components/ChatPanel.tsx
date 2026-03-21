import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types/protocol";

interface Props {
  messages: ChatMessage[];
  myId: string | null;
  onSend: (text: string) => void;
}

export default function ChatPanel({ messages, myId, onSend }: Props) {
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
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-100">
        <h3 className="font-semibold text-gray-700">聊天</h3>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0"
      >
        {messages.map((m) => (
          <div key={m.id}>
            {m.kind === "system" ? (
              <div className="text-center text-xs text-gray-400 py-1">
                {m.text}
              </div>
            ) : (
              <div className="text-sm">
                <span className="font-medium text-indigo-600">
                  {m.playerName}
                </span>
                {m.playerId === myId && <span className="text-gray-400 text-[11px] ml-0.5">(我)</span>}
                <span className="text-gray-400 mx-1">:</span>
                <span className="text-gray-700">{m.text}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="px-3 py-2 border-t border-gray-100 flex gap-2">
        <input
          className="flex-1 px-3 py-2 text-sm border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-400 focus:border-transparent outline-none transition-colors"
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
          className="px-4 py-2 text-sm text-white rounded-lg transition shrink-0 bg-gray-600 hover:bg-gray-700 disabled:opacity-50"
          disabled={!input.trim()}
          onClick={handleSend}
        >
          发送
        </button>
      </div>
    </div>
  );
}
