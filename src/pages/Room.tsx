import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHttpBase, getWsBase } from "../api";
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
  onLeave: () => void;
}

function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Room({ roomCode, nickname, onLeave }: Props) {
  /* ── 游戏状态 ── */
  const [myId, setMyId] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [uploaderId, setUploaderId] = useState<string | null>(null);
  const [phase, setPhase] = useState<GamePhase>("waiting");
  const [pieceStates, setPieceStates] = useState<PieceState[]>([]);
  const [edges, setEdges] = useState<number[][][]>([]);
  const [difficulty, setDifficulty] = useState(4);
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

  const playerIdRef = useRef(
    sessionStorage.getItem(`puzzle_pid_${roomCode}`) || genId(),
  );

  useEffect(() => {
    sessionStorage.setItem(`puzzle_pid_${roomCode}`, playerIdRef.current);
  }, [roomCode]);

  /* ── WebSocket ── */
  const wsUrl = useMemo(
    () => `${getWsBase()}/api/rooms/${roomCode}/ws`,
    [roomCode],
  );
  const { connected, send, addListener, leave } = useWebSocket(wsUrl);

  const joinedRef = useRef(false);
  useEffect(() => {
    if (connected && !joinedRef.current) {
      joinedRef.current = true;
      send({
        type: "join",
        playerName: nickname,
        playerId: playerIdRef.current,
      });
    }
  }, [connected, nickname, send]);

  /* ── 获取图片 ── */
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
      // 忽略
    }
  }, [roomCode]);

  /* ── 计时器 ── */
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

  /* ── 消息处理 ── */
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
          setDifficulty(msg.difficulty);
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
          setDifficulty(msg.difficulty);
          setSelectedDifficulty(msg.difficulty);
          setStartTime(msg.startTime);
          setMoveCount(0);
          setPhase("solving");
          setSolveResult(null);
          setShowConfetti(false);
          addSystemMsg(
            `拼图已打乱 (${msg.difficulty}×${msg.difficulty})，开始拼图！`,
          );
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
            `${msg.solverName} 完成了拼图！用时 ${formatTime(msg.time)}，${msg.moveCount} 步`,
          );
          setTimeout(() => setShowConfetti(false), 5000);
          break;

        case "phaseChange":
          setPhase(msg.phase);
          setUploaderId(msg.uploaderId);
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
          addSystemMsg("出题者已更换");
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
          break;

        case "roomClosed":
          addSystemMsg(`房间已关闭：${msg.reason}`);
          break;
      }
    });
    return unsub;
  }, [addListener, fetchImage]);

  /* ── beacon 快速离开 ── */
  useEffect(() => {
    function handlePageHide() {
      const url = `${getHttpBase()}/api/rooms/${roomCode}/quickleave`;
      navigator.sendBeacon(url, playerIdRef.current);
    }
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [roomCode]);

  /* ── 操作 ── */
  const isUploader = myId === uploaderId;
  const isSolver = myId !== null && myId !== uploaderId && uploaderId !== null;

  function handleShuffle() {
    send({ type: "shuffle", difficulty: selectedDifficulty });
  }

  function handleMovePiece(pieceId: number, x: number, y: number) {
    send({ type: "movePiece", pieceId, x, y });
  }

  function handleChat(text: string) {
    send({ type: "chat", text });
  }

  function handleTransfer() {
    send({ type: "transfer" });
  }

  function handleLeave() {
    leave();
    onLeave();
  }

  function handlePlayAgain() {
    send({ type: "playAgain" });
  }

  /* ── 渲染 ── */
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <Confetti show={showConfetti} />

      <PlayerBar
        roomCode={roomCode}
        players={players}
        uploaderId={uploaderId}
        myId={myId}
        phase={phase}
        onTransfer={handleTransfer}
        onLeave={handleLeave}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：主区域 */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
          {/* 等待阶段 */}
          {phase === "waiting" && (
            <div className="text-center">
              <div className="text-6xl mb-4">🧩</div>
              <div className="text-lg text-gray-500 mb-2">
                等待另一位玩家加入
              </div>
              <div className="text-sm text-gray-400">
                分享房间号{" "}
                <span className="font-mono font-bold text-primary">
                  {roomCode}
                </span>{" "}
                给好友
              </div>
            </div>
          )}

          {/* 上传阶段 - 出题者 */}
          {phase === "uploading" && isUploader && !imageReady && (
            <div className="text-center">
              <div className="text-lg font-medium mb-4 text-gray-700">
                选择一张图片作为拼图
              </div>
              <ImageUpload roomCode={roomCode} onUploaded={() => {}} />
            </div>
          )}

          {/* 上传阶段 - 拼图者 */}
          {phase === "uploading" && !isUploader && (
            <div className="text-center">
              <div className="text-5xl mb-4">⏳</div>
              <div className="text-lg text-gray-500">
                等待出题者上传图片...
              </div>
            </div>
          )}

          {/* 准备阶段 - 出题者 */}
          {phase === "ready" && isUploader && imageUrl && (
            <div className="flex flex-col items-center gap-4">
              <div className="text-lg font-medium text-gray-700">
                图片已上传，选择难度并打乱
              </div>
              <img
                src={imageUrl}
                alt="拼图原图"
                className="w-64 h-64 object-cover rounded-xl shadow-md"
              />
              <div className="flex gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.value}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedDifficulty === d.value
                        ? "bg-primary text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                    onClick={() => setSelectedDifficulty(d.value)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <button
                className="bg-primary text-white rounded-lg px-8 py-2.5 font-medium hover:bg-primary-dark text-lg"
                onClick={handleShuffle}
              >
                随机打乱
              </button>
            </div>
          )}

          {/* 准备阶段 - 拼图者 */}
          {phase === "ready" && !isUploader && (
            <div className="text-center">
              <div className="text-5xl mb-4">🎯</div>
              <div className="text-lg text-gray-500">
                图片已上传，等待出题者打乱拼图...
              </div>
            </div>
          )}

          {/* 拼图 / 完成 阶段 */}
          {(phase === "solving" || phase === "solved") &&
            imageUrl &&
            pieceStates.length > 0 &&
            edges.length > 0 && (
              <div className="flex flex-col items-center gap-2 w-full h-full overflow-visible">
                {/* 状态栏 */}
                <div className="flex items-center gap-4 text-sm text-gray-600 flex-shrink-0">
                  <span>
                    用时：
                    <span className="font-mono font-bold text-primary">
                      {phase === "solved" && solveResult
                        ? formatTime(solveResult.time)
                        : formatTime(elapsed)}
                    </span>
                  </span>
                  <span>
                    步数：
                    <span className="font-mono font-bold text-primary">
                      {moveCount}
                    </span>
                  </span>
                  <span className="text-xs text-gray-400">
                    {difficulty}×{difficulty}
                  </span>
                </div>

                {/* 拼图面板 */}
                <PuzzleBoard
                  pieceStates={pieceStates}
                  difficulty={difficulty}
                  edges={edges}
                  imageUrl={imageUrl}
                  canInteract={isSolver && phase === "solving"}
                  onMovePiece={handleMovePiece}
                />

                {/* 参考图（拼图者可展开） */}
                {isSolver && phase === "solving" && (
                  <ReferenceImage imageUrl={imageUrl} />
                )}

                {/* 完成后操作 */}
                {phase === "solved" && solveResult && (
                  <div className="text-center mt-2 flex-shrink-0">
                    <div className="text-xl font-bold text-primary mb-1">
                      拼图完成！
                    </div>
                    <div className="text-gray-500 text-sm mb-3">
                      {solveResult.solverName} 用时{" "}
                      {formatTime(solveResult.time)}，共{" "}
                      {solveResult.moveCount} 步
                    </div>
                    {isUploader && (
                      <div className="flex gap-2 justify-center">
                        <button
                          className="bg-primary text-white rounded-lg px-6 py-2 font-medium hover:bg-primary-dark"
                          onClick={handlePlayAgain}
                        >
                          再来一局
                        </button>
                        <button
                          className="bg-orange-50 text-orange-600 rounded-lg px-6 py-2 font-medium hover:bg-orange-100"
                          onClick={() => {
                            handleTransfer();
                            setTimeout(handlePlayAgain, 300);
                          }}
                        >
                          换人出题
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 出题者可重新打乱 */}
                {isUploader && phase === "solving" && (
                  <div className="flex items-center gap-2 mt-1 flex-shrink-0">
                    <select
                      className="border rounded-lg px-2 py-1 text-sm"
                      value={selectedDifficulty}
                      onChange={(e) =>
                        setSelectedDifficulty(Number(e.target.value))
                      }
                    >
                      {DIFFICULTIES.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="text-sm px-3 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                      onClick={handleShuffle}
                    >
                      重新打乱
                    </button>
                  </div>
                )}
              </div>
            )}
        </div>

        {/* 右侧：聊天 */}
        <div className="w-72 flex-shrink-0">
          <ChatPanel messages={messages} onSend={handleChat} />
        </div>
      </div>
    </div>
  );
}

/* ── 参考图组件 ── */
function ReferenceImage({ imageUrl }: { imageUrl: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center flex-shrink-0">
      <button
        className="text-xs text-gray-400 hover:text-primary"
        onClick={() => setOpen(!open)}
      >
        {open ? "收起参考图" : "查看参考图"}
      </button>
      {open && (
        <img
          src={imageUrl}
          alt="参考图"
          className="w-32 h-32 object-cover rounded-lg shadow-sm mt-1 border"
        />
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
