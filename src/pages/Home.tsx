import { useState } from "react";
import { getHttpBase } from "../api";

interface Props {
  onEnterRoom: (code: string, nickname: string) => void;
}

export default function Home({ onEnterRoom }: Props) {
  const [nickname, setNickname] = useState(
    () => sessionStorage.getItem("puzzle_nickname") || ""
  );
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const valid = nickname.trim().length > 0;

  async function createRoom() {
    if (!valid) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${getHttpBase()}/api/rooms`, { method: "POST" });
      if (!res.ok) {
        throw new Error("创建房间失败");
      }
      const data = (await res.json()) as { roomCode: string };
      onEnterRoom(data.roomCode, nickname.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function joinRoom() {
    if (!valid || joinCode.length !== 6) {
      return;
    }
    onEnterRoom(joinCode, nickname.trim());
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-2 text-primary">
          拼图对战
        </h1>
        <p className="text-gray-500 text-center text-sm mb-6">
          上传图片，好友来拼
        </p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700 mb-1">
          昵称
        </label>
        <input
          className="w-full border rounded-lg px-3 py-2 mb-4 outline-none focus:ring-2 focus:ring-primary"
          placeholder="输入你的昵称"
          maxLength={12}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />

        <button
          className="w-full bg-primary text-white rounded-lg py-2.5 font-medium hover:bg-primary-dark disabled:opacity-50 mb-3"
          disabled={!valid || loading}
          onClick={createRoom}
        >
          {loading ? "创建中..." : "创建房间"}
        </button>

        <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
          <div className="flex-1 h-px bg-gray-200" />
          或加入房间
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary text-center tracking-widest"
            placeholder="房间号"
            maxLength={6}
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                joinRoom();
              }
            }}
          />
          <button
            className="bg-primary text-white rounded-lg px-5 py-2 font-medium hover:bg-primary-dark disabled:opacity-50"
            disabled={!valid || joinCode.length !== 6}
            onClick={joinRoom}
          >
            加入
          </button>
        </div>
      </div>
    </div>
  );
}
