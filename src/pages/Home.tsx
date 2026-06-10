import { useState } from "react";
import { checkJoinable, createRoom } from "../api";

interface Props {
  onEnterRoom: (code: string, nickname: string) => void;
  urlError?: string;
}

export default function Home({ onEnterRoom, urlError }: Props) {
  const [nickname, setNickname] = useState(() => {
    try {
      const raw = sessionStorage.getItem("puzzle_session");
      if (raw) {
        return (JSON.parse(raw) as { nickname?: string }).nickname || "";
      }
    } catch {
      /* ignore */
    }
    return "";
  });
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tip, setTip] = useState("");
  const [showJoin, setShowJoin] = useState(false);

  function clearTip() {
    setTip("");
  }

  async function handleCreate() {
    setTip("");
    setError("");
    if (!nickname.trim()) {
      setTip("请输入昵称");
      return;
    }
    setLoading(true);
    try {
      const code = await createRoom();
      onEnterRoom(code, nickname.trim());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    setTip("");
    setError("");
    if (!nickname.trim()) {
      setTip("请输入昵称");
      return;
    }
    if (!joinCode) {
      setTip("请输入房间号");
      return;
    }
    if (joinCode.length !== 6) {
      setTip("房间号为6位数字");
      return;
    }
    setLoading(true);
    const err = await checkJoinable(joinCode);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    onEnterRoom(joinCode, nickname.trim());
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-[#eff2ff]">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-4xl">🧩</span>
          <h1 className="text-4xl font-bold text-indigo-600">拼图对战</h1>
        </div>
        <p className="text-gray-500 text-center mb-8">上传图片出图，好友来拼</p>

        {error && (
          <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}
        {urlError && !error && (
          <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg mb-4 text-sm">
            {urlError}
          </div>
        )}
        {tip && <div className="text-red-500 text-sm mb-4">{tip}</div>}

        <label className="block text-sm font-medium text-gray-700 mb-1">
          昵称
        </label>
        <input
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition mb-6"
          placeholder="输入你的昵称"
          maxLength={12}
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            clearTip();
          }}
        />

        {!showJoin ? (
          <>
            <button
              className="w-full py-3 px-4 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition mb-4"
              onClick={handleCreate}
              disabled={loading}
            >
              {loading ? "请稍候..." : "创建房间"}
            </button>
            <button
              className="w-full py-3 px-4 bg-white text-indigo-600 font-semibold rounded-lg border-2 border-indigo-600 hover:bg-indigo-50 transition"
              onClick={() => {
                setShowJoin(true);
                setError("");
                setTip("");
              }}
            >
              加入房间
            </button>
          </>
        ) : (
          <>
            <input
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-center text-xl tracking-[0.3em] mb-4"
              placeholder="输入6位房间号"
              maxLength={6}
              value={joinCode}
              onChange={(e) => {
                setJoinCode(e.target.value.replace(/\D/g, ""));
                clearTip();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  joinRoom();
                }
              }}
            />
            <button
              className="w-full py-3 px-4 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition mb-4"
              onClick={joinRoom}
              disabled={loading}
            >
              {loading ? "请稍候..." : "加入房间"}
            </button>
            <button
              className="w-full text-gray-500 text-sm hover:text-indigo-600 transition"
              onClick={() => {
                setShowJoin(false);
                setJoinCode("");
                setError("");
                setTip("");
              }}
            >
              返回
            </button>
          </>
        )}
      </div>
    </div>
  );
}
