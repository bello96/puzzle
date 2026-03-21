import { useState } from "react";
import type { GamePhase, PlayerInfo } from "../types/protocol";

interface Props {
  roomCode: string;
  players: PlayerInfo[];
  uploaderId: string | null;
  myId: string | null;
  phase: GamePhase;
  onTransfer: () => void;
  onLeave: () => void;
}

const phaseStyle: Record<GamePhase, string> = {
  waiting: "bg-yellow-100 text-yellow-700",
  uploading: "bg-blue-100 text-blue-700",
  ready: "bg-indigo-100 text-indigo-700",
  solving: "bg-green-100 text-green-700",
  solved: "bg-purple-100 text-purple-700",
};

const phaseLabel: Record<GamePhase, string> = {
  waiting: "等待加入",
  uploading: "上传图片中...",
  ready: "准备打乱中...",
  solving: "拼图中",
  solved: "已完成",
};

export default function PlayerBar({
  roomCode,
  players,
  uploaderId,
  myId,
  phase,
  onTransfer,
  onLeave,
}: Props) {
  const isUploader = myId === uploaderId;
  const [copied, setCopied] = useState(false);

  function copyLink() {
    const url = `${window.location.origin}/${roomCode}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm">
      {/* 房间信息 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">房间</span>
          <span className="font-mono text-lg font-bold text-indigo-600 tracking-wider">
            {roomCode}
          </span>
          {players.length < 2 && (
            <button
              className={`px-2 py-0.5 text-xs rounded-md transition ${
                copied
                  ? "bg-green-100 text-green-700"
                  : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
              }`}
              onClick={copyLink}
            >
              {copied ? "已复制" : "分享"}
            </button>
          )}
        </div>

        <div className="w-px h-6 bg-gray-200" />

        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${phaseStyle[phase]}`}
        >
          {phaseLabel[phase]}
        </span>
      </div>

      {/* 玩家列表 */}
      <div className="flex items-center gap-2">
        {players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
              p.id === uploaderId
                ? "bg-indigo-50 text-indigo-700"
                : "bg-gray-50 text-gray-700"
            } ${p.id === myId ? "font-semibold" : ""} ${!p.online ? "opacity-50" : ""}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                p.online ? "bg-green-500" : "bg-gray-300"
              }`}
            />
            <span>
              {p.name}
              {p.id === myId && (
                <span className="text-[10px] opacity-50 ml-0.5">(我)</span>
              )}
            </span>
            {/* <span className="text-[10px] opacity-60">
              {p.id === uploaderId ? "出图" : "拼图"}
            </span> */}
          </div>
        ))}
      </div>

      {/* 操作 */}
      <div className="flex items-center gap-2">
        {isUploader && players.length === 2 && phase !== "solving" && (
          <button
            className="px-3 py-1.5 text-sm rounded-lg transition bg-amber-50 text-amber-700 hover:bg-amber-100"
            onClick={onTransfer}
          >
            换人出图
          </button>
        )}
        <button
          className="px-3 py-1.5 text-sm rounded-lg transition bg-gray-100 text-gray-600 hover:bg-gray-200"
          onClick={onLeave}
        >
          离开
        </button>
      </div>
    </div>
  );
}
