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

const phaseLabels: Record<GamePhase, string> = {
  waiting: "等待加入",
  uploading: "上传图片",
  ready: "准备打乱",
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

  function copyLink() {
    const url = `${window.location.origin}/room/${roomCode}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  return (
    <div className="bg-white border-b px-4 py-2 flex items-center gap-3 flex-wrap">
      {/* 房间号 */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-gray-500">房间</span>
        <span className="font-mono font-bold text-primary tracking-wider">
          {roomCode}
        </span>
        <button
          className="text-xs text-primary hover:underline ml-1"
          onClick={copyLink}
        >
          分享
        </button>
      </div>

      <div className="w-px h-5 bg-gray-200" />

      {/* 阶段 */}
      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-primary font-medium">
        {phaseLabels[phase]}
      </span>

      <div className="w-px h-5 bg-gray-200" />

      {/* 玩家列表 */}
      <div className="flex items-center gap-2 flex-1">
        {players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-1 text-sm px-2 py-0.5 rounded-full ${
              p.online ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                p.online ? "bg-green-500" : "bg-gray-300"
              }`}
            />
            <span>{p.name}</span>
            {p.id === uploaderId && (
              <span className="text-xs text-orange-500 ml-0.5">出题</span>
            )}
            {p.id !== uploaderId && phase !== "waiting" && (
              <span className="text-xs text-blue-500 ml-0.5">拼图</span>
            )}
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      {isUploader && players.length === 2 && phase !== "solving" && (
        <button
          className="text-xs px-2 py-1 rounded bg-orange-50 text-orange-600 hover:bg-orange-100"
          onClick={onTransfer}
        >
          换人出题
        </button>
      )}
      <button
        className="text-xs px-2 py-1 rounded bg-red-50 text-red-500 hover:bg-red-100"
        onClick={onLeave}
      >
        离开
      </button>
    </div>
  );
}
