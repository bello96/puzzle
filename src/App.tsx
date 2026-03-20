import { useCallback, useEffect, useState } from "react";
import Home from "./pages/Home";
import Room from "./pages/Room";

export default function App() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");

  useEffect(() => {
    const m = window.location.pathname.match(/^\/room\/(\d{6})$/);
    if (m?.[1]) {
      const stored = sessionStorage.getItem("puzzle_nickname");
      if (stored) {
        setNickname(stored);
        setRoomCode(m[1]);
      } else {
        setPendingCode(m[1]);
      }
    }
  }, []);

  const handleEnterRoom = useCallback((code: string, name: string) => {
    sessionStorage.setItem("puzzle_nickname", name);
    setNickname(name);
    setRoomCode(code);
    window.history.replaceState(null, "", `/room/${code}`);
  }, []);

  const handleLeaveRoom = useCallback(() => {
    setRoomCode(null);
    window.history.replaceState(null, "", "/");
  }, []);

  /* URL 直接进入房间但还没有昵称 → 弹出昵称输入 */
  if (pendingCode) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 w-80 shadow-xl">
          <h3 className="text-lg font-bold mb-4">输入昵称加入房间</h3>
          <input
            className="w-full border rounded-lg px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-primary"
            placeholder="你的昵称"
            maxLength={12}
            value={nicknameInput}
            onChange={(e) => setNicknameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nicknameInput.trim()) {
                handleEnterRoom(pendingCode, nicknameInput.trim());
                setPendingCode(null);
              }
            }}
            autoFocus
          />
          <button
            className="w-full bg-primary text-white rounded-lg py-2 font-medium hover:bg-primary-dark disabled:opacity-50"
            disabled={!nicknameInput.trim()}
            onClick={() => {
              handleEnterRoom(pendingCode, nicknameInput.trim());
              setPendingCode(null);
            }}
          >
            加入
          </button>
        </div>
      </div>
    );
  }

  if (roomCode) {
    return (
      <Room
        roomCode={roomCode}
        nickname={nickname}
        onLeave={handleLeaveRoom}
      />
    );
  }

  return <Home onEnterRoom={handleEnterRoom} />;
}
