import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHttpBase, getWsBase } from "../api";
import expandCollapseIcon from "../assets/expand-collapse-icon.png";
import ChatPanel from "../components/ChatPanel";
import Confetti from "../components/Confetti";
import ImageUpload, { DIFFICULTIES } from "../components/ImageUpload";
import PlayerBar from "../components/PlayerBar";
import PuzzleBoard from "../components/PuzzleBoard";
import { useWebSocket } from "../hooks/useWebSocket";
import type {
  ChatMessage,
  GamePhase,
  PieceState,
  PlayerInfo,
  ServerMessage,
} from "../types/protocol";

interface Props {
  roomCode: string;
  nickname: string;
  playerId: string;
  onLeave: () => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Room({ roomCode, nickname, playerId, onLeave }: Props) {
  const [myId, setMyId] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [uploaderId, setUploaderId] = useState<string | null>(null);
  const [phase, setPhase] = useState<GamePhase>("waiting");
  const [pieceStates, setPieceStates] = useState<PieceState[]>([]);
  const [edges, setEdges] = useState<number[][][]>([]);
  const [imageReady, setImageReady] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [moveCount, setMoveCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState(4);
  const [solveResult, setSolveResult] = useState<{
    solverName: string;
    time: number;
    moveCount: number;
  } | null>(null);

  const playerIdRef = useRef(playerId);
  const confettiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── WebSocket ── */
  const wsUrl = useMemo(
    () => `${getWsBase()}/api/rooms/${roomCode}/ws`,
    [roomCode],
  );
  const { connected, send, addListener, leave } = useWebSocket(wsUrl);

  // 每次连接成功都发 join（首次加入或断线重连）
  useEffect(() => {
    if (connected) {
      send({
        type: "join",
        playerName: nickname,
        playerId: playerIdRef.current,
      });
    }
  }, [connected, nickname, send]);

  const fetchImage = useCallback(async () => {
    try {
      const res = await fetch(`${getHttpBase()}/api/rooms/${roomCode}/image`);
      if (res.ok) {
        const blob = await res.blob();
        setImageUrl((prev) => {
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          return URL.createObjectURL(blob);
        });
      }
    } catch {
      /* ignore */
    }
  }, [roomCode]);

  useEffect(() => {
    if (!startTime || phase !== "solving") {
      return;
    }
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 200);
    return () => clearInterval(timer);
  }, [startTime, phase]);

  function addSystemMsg(text: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: genId(),
        playerId: "",
        playerName: "",
        text,
        timestamp: Date.now(),
        kind: "system",
      },
    ]);
  }

  useEffect(() => {
    const unsub = addListener((msg: ServerMessage) => {
      switch (msg.type) {
        case "roomState":
          setMyId(msg.yourId);
          setPlayers(msg.players);
          setUploaderId(msg.uploaderId);
          setPhase(msg.phase);
          setPieceStates(msg.pieceStates);
          setEdges(msg.edges);
          setSelectedDifficulty(msg.difficulty);
          setImageReady(msg.imageReady);
          setStartTime(msg.startTime);
          setMoveCount(msg.moveCount);
          setMessages(msg.chatHistory);
          if (msg.imageReady) {
            fetchImage();
          }
          break;
        case "playerJoined":
          setPlayers((p) => {
            if (p.find((x) => x.id === msg.player.id)) {
              return p.map((x) =>
                x.id === msg.player.id ? { ...x, online: true } : x,
              );
            }
            return [...p, msg.player];
          });
          addSystemMsg(`${msg.player.name} 加入了房间`);
          break;
        case "playerLeft":
          setPlayers((p) => p.filter((x) => x.id !== msg.playerId));
          break;
        case "imageUploaded":
          setImageReady(true);
          fetchImage();
          addSystemMsg("图片已上传，准备打乱拼图");
          break;
        case "shuffled":
          setPieceStates(msg.pieceStates);
          setEdges(msg.edges);
          setSelectedDifficulty(msg.difficulty);
          setStartTime(msg.startTime > 0 ? msg.startTime : null);
          setMoveCount(0);
          setPhase("ready");
          setSolveResult(null);
          setShowConfetti(false);
          break;
        case "pieceMoved":
          setPieceStates((prev) =>
            prev.map((p) =>
              p.id === msg.pieceId
                ? { ...p, x: msg.x, y: msg.y, placed: msg.placed }
                : p,
            ),
          );
          setMoveCount(msg.moveCount);
          break;
        case "solved":
          setPhase("solved");
          setSolveResult({
            solverName: msg.solverName,
            time: msg.time,
            moveCount: msg.moveCount,
          });
          setShowConfetti(true);
          addSystemMsg(
            `${msg.solverName} 完成拼图！用时 ${fmt(msg.time)}，${msg.moveCount} 步`,
          );
          confettiTimerRef.current = setTimeout(() => setShowConfetti(false), 5000);
          break;
        case "phaseChange":
          setPhase(msg.phase);
          setUploaderId(msg.uploaderId);
          // confirmStart → solving 时开始计时
          if (msg.phase === "solving") {
            setStartTime(Date.now());
            setElapsed(0);
          }
          break;
        case "chat":
          setMessages((prev) => [
            ...prev,
            {
              id: msg.id,
              playerId: msg.playerId,
              playerName: msg.playerName,
              text: msg.text,
              timestamp: msg.timestamp,
              kind: "chat",
            },
          ]);
          break;
        case "transferDone":
          setUploaderId(msg.uploaderId);
          addSystemMsg("出图者已更换");
          break;
        case "playAgainStarted":
          setPhase("uploading");
          setPieceStates([]);
          setEdges([]);
          setImageReady(false);
          setImageUrl(null);
          setStartTime(null);
          setMoveCount(0);
          setSolveResult(null);
          setShowConfetti(false);
          addSystemMsg("新一局开始，等待上传图片");
          break;
        case "error":
          addSystemMsg(`错误：${msg.message}`);
          // 房间已满或不存在 → 返回首页
          if (msg.message === "房间已满" || msg.message === "房间已关闭") {
            setTimeout(onLeave, 1500);
          }
          break;
        case "roomClosed":
          addSystemMsg(`房间已关闭：${msg.reason}`);
          setTimeout(onLeave, 1500);
          break;
      }
    });
    return unsub;
  }, [addListener, fetchImage]);

  useEffect(() => {
    function handlePageHide() {
      navigator.sendBeacon(
        `${getHttpBase()}/api/rooms/${roomCode}/quickleave`,
        playerIdRef.current,
      );
    }
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [roomCode]);

  /* ── 组件卸载清理 ── */
  useEffect(() => {
    return () => {
      if (confettiTimerRef.current) {
        clearTimeout(confettiTimerRef.current);
      }
    };
  }, []);

  const isUploader = myId === uploaderId;
  const isSolver = myId !== null && myId !== uploaderId && uploaderId !== null;

  /* ── 聊天面板展开/收起 ── */
  const [chatOpen, setChatOpen] = useState(() => window.innerWidth >= 900);
  useEffect(() => {
    function onResize() {
      if (window.innerWidth < 900) {
        setChatOpen(false);
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function handleMovePiece(pieceId: number, x: number, y: number) {
    send({ type: "movePiece", pieceId, x, y });
  }
  function handleLeave() {
    leave();
    onLeave();
  }

  /* ── 渲染 ── */
  return (
    <div
      className={`flex flex-col h-screen bg-gray-50 gap-3 pl-3 pt-3 pb-3 pr-3`}
    >
      <Confetti show={showConfetti} />

      <PlayerBar
        roomCode={roomCode}
        players={players}
        uploaderId={uploaderId}
        myId={myId}
        phase={phase}
        onTransfer={() => send({ type: "transfer" })}
        onLeave={handleLeave}
      />

      <div className="flex flex-1 gap-3 min-h-0 relative">
        {/* 左侧：主区域 */}
        <div className="flex flex-col flex-1 gap-3 min-h-0">
          {/* 等待 / 上传 / 准备 阶段 */}
          {(phase === "waiting" || phase === "uploading") && (
            <div className="flex-1 flex items-center justify-center bg-white rounded-xl shadow-sm">
              {phase === "waiting" && (
                <div className="text-center">
                  <div className="text-5xl mb-4 animate-bounce">🧩</div>
                  <div className="text-gray-500 font-medium mb-1">
                    等待另一位玩家加入
                  </div>
                  <div className="text-sm text-gray-400">
                    分享房间号{" "}
                    <span className="font-mono font-bold text-indigo-600">
                      {roomCode}
                    </span>{" "}
                    给好友
                  </div>
                </div>
              )}

              {phase === "uploading" && isUploader && !imageReady && (
                <div className="text-center">
                  <div className="text-gray-700 font-medium mb-4">
                    选择一张图片作为拼图
                  </div>
                  <ImageUpload roomCode={roomCode} onUploaded={() => {}} />
                </div>
              )}

              {phase === "uploading" && !isUploader && (
                <div className="text-center">
                  <div className="text-4xl mb-3">⏳</div>
                  <div className="text-gray-500">等待出图者上传图片...</div>
                </div>
              )}
            </div>
          )}

          {/* ready / solving / solved 阶段：拼图界面 */}
          {(phase === "ready" || phase === "solving" || phase === "solved") &&
            imageUrl &&
            pieceStates.length > 0 &&
            edges.length > 0 && (
              <>
                {/* 工具栏（固定高度） */}
                <div className="flex items-center gap-3 px-3 h-11 bg-white rounded-xl shadow-sm flex-shrink-0">
                  {/* 计时 + 步数（solving/solved 才显示） */}
                  {phase !== "ready" && (
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-500">
                        用时{" "}
                        <span className="font-mono font-bold text-indigo-600">
                          {phase === "solved" && solveResult
                            ? fmt(solveResult.time)
                            : fmt(elapsed)}
                        </span>
                      </span>
                      <div className="w-px h-5 bg-gray-200" />
                      <span className="text-gray-500">
                        步数{" "}
                        <span className="font-mono font-bold text-indigo-600">
                          {moveCount}
                        </span>
                      </span>
                    </div>
                  )}

                  <span className="text-xs text-gray-400">
                    {selectedDifficulty}×{selectedDifficulty}
                  </span>

                  <div className="flex-1" />

                  {/* ready 阶段：出图者选难度 + 确认 + 重新上传 */}
                  {phase === "ready" && isUploader && (
                    <div className="flex items-center gap-2">
                      <select
                        className="px-2 py-1 text-sm border border-gray-300 rounded-lg outline-none"
                        value={selectedDifficulty}
                        onChange={(e) => {
                          const d = Number(e.target.value);
                          setSelectedDifficulty(d);
                          send({ type: "shuffle", difficulty: d });
                        }}
                      >
                        {DIFFICULTIES.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="px-3 py-1.5 text-sm rounded-lg transition bg-gray-100 text-gray-600 hover:bg-gray-200"
                        onClick={() =>
                          send({
                            type: "shuffle",
                            difficulty: selectedDifficulty,
                          })
                        }
                      >
                        重新打乱
                      </button>
                      <button
                        className="px-3 py-1.5 text-sm rounded-lg transition bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
                        onClick={() => send({ type: "confirmStart" })}
                      >
                        确认开始
                      </button>
                      <button
                        className="px-3 py-1.5 text-sm rounded-lg transition bg-gray-100 text-gray-600 hover:bg-gray-200"
                        onClick={() => send({ type: "playAgain" })}
                      >
                        换图
                      </button>
                    </div>
                  )}

                  {/* ready 阶段：拼图者等待 */}
                  {phase === "ready" && !isUploader && (
                    <span className="text-sm text-gray-400">
                      等待出图者确认开始...
                    </span>
                  )}

                  {/* solving：拼图者参考图 + 放弃 */}
                  {isSolver && phase === "solving" && (
                    <div className="flex items-center gap-2">
                      <RefToggle imageUrl={imageUrl} />
                      <button
                        className="px-3 py-1.5 text-sm rounded-lg transition bg-red-50 text-red-600 hover:bg-red-100"
                        onClick={() => send({ type: "giveUp" })}
                      >
                        放弃
                      </button>
                    </div>
                  )}

                  {/* solved：提示 + 出图者操作 */}
                  {phase === "solved" && solveResult && (
                    <span className="text-sm text-green-600 font-medium">
                      🎉 {solveResult.solverName} 完成！用时{" "}
                      {fmt(solveResult.time)}，{solveResult.moveCount} 步
                    </span>
                  )}
                  {phase === "solved" && solveResult && isUploader && (
                    <div className="flex items-center gap-2">
                      <button
                        className="px-3 py-1.5 text-sm rounded-lg transition bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                        onClick={() => send({ type: "playAgain" })}
                      >
                        再来一局
                      </button>
                    </div>
                  )}
                </div>

                {/* 拼图面板 */}
                <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden min-h-0 relative">
                  <PuzzleBoard
                    pieceStates={pieceStates}
                    difficulty={selectedDifficulty}
                    edges={edges}
                    imageUrl={imageUrl}
                    canInteract={isSolver && phase === "solving"}
                    onMovePiece={handleMovePiece}
                  />
                  {/* ready 阶段蒙层：双方都不可拖拽 */}
                  {phase === "ready" && (
                    <div className="absolute inset-0 bg-white/20 z-20 rounded-xl" />
                  )}
                  {/* solving 出图者蒙层 */}
                  {isUploader && phase === "solving" && (
                    <div className="absolute inset-0 bg-white/30 flex items-center justify-center z-20 rounded-xl">
                      <span className="text-gray-400 text-sm bg-white/80 px-4 py-2 rounded-lg shadow-sm">
                        对方正在努力拼图...
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
        </div>

        {/* 右侧：聊天面板（可收起） */}
        <div
          className="relative min-h-0 flex-shrink-0 transition-all duration-300 ease-in-out overflow-visible"
          style={{ width: chatOpen ? 320 : 0 }}
        >
          {chatOpen && (
            <div className="w-[320px] h-full relative">
              <ChatPanel
                messages={messages}
                myId={myId}
                onSend={(text) => send({ type: "chat", text })}
              />
              {/* 收起按钮：聊天右上角 */}
              <button
                className="absolute top-2 right-3 z-20 w-6 h-6 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 transition"
                onClick={() => setChatOpen(false)}
                title="收起聊天"
              >
                <img
                  src={expandCollapseIcon}
                  alt=""
                  className="w-3.5 h-3.5 opacity-50"
                />
              </button>
            </div>
          )}
        </div>

        {/* 收起状态：半圆按钮吸附右边缘 */}
        {!chatOpen && (
          <button
            className="fixed z-30 flex items-center justify-center bg-white hover:bg-gray-50 transition"
            style={{
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              width: 20,
              height: 25,
              borderRadius: "16px 0 0 16px",
              boxShadow: "-1px 0 6px rgba(0,0,0,0.08)",
            }}
            onClick={() => setChatOpen(true)}
            title="展开聊天"
          >
            <img
              src={expandCollapseIcon}
              alt=""
              className="w-3 h-3 opacity-40"
              style={{ transform: "scaleX(-1)" }}
            />
          </button>
        )}
      </div>
    </div>
  );
}

function RefToggle({ imageUrl }: { imageUrl: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="px-2.5 py-1 text-xs rounded-lg transition bg-gray-100 text-gray-600 hover:bg-gray-200"
        onClick={() => setOpen(true)}
      >
        参考图
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative bg-white rounded-2xl p-3 shadow-xl max-w-[80vh] max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={imageUrl}
              alt="参考图"
              className="rounded-xl max-w-full max-h-[75vh] object-contain"
            />
            <button
              className="absolute -top-2 -right-2 w-8 h-8 flex items-center justify-center bg-gray-800 text-white rounded-full text-sm shadow-md hover:bg-gray-700"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
