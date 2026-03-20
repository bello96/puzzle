/* ── 游戏阶段 ── */
export type GamePhase =
  | "waiting"   // 等待第二位玩家
  | "uploading" // 等待出题者上传图片
  | "ready"     // 图片已上传，等待打乱
  | "solving"   // 拼图进行中
  | "solved";   // 拼图完成

/* ── 玩家信息 ── */
export interface PlayerInfo {
  id: string;
  name: string;
  online: boolean;
}

/* ── 聊天消息 ── */
export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
  kind: "chat" | "system";
}

/* ── Client → Server ── */
export type ClientMessage =
  | { type: "join"; playerName: string; playerId?: string }
  | { type: "shuffle"; difficulty: number }
  | { type: "move"; fromIndex: number; toIndex: number }
  | { type: "chat"; text: string }
  | { type: "transfer" }
  | { type: "playAgain" }
  | { type: "leave" };

/* ── Server → Client ── */
export type ServerMessage =
  | {
      type: "roomState";
      players: PlayerInfo[];
      uploaderId: string | null;
      phase: GamePhase;
      pieces: number[];
      difficulty: number;
      imageReady: boolean;
      yourId: string;
      chatHistory: ChatMessage[];
      startTime: number | null;
      moveCount: number;
    }
  | { type: "playerJoined"; player: PlayerInfo }
  | { type: "playerLeft"; playerId: string }
  | { type: "imageUploaded" }
  | { type: "shuffled"; pieces: number[]; difficulty: number; startTime: number }
  | {
      type: "moved";
      fromIndex: number;
      toIndex: number;
      pieces: number[];
      moveCount: number;
      solved: boolean;
    }
  | { type: "solved"; solverName: string; time: number; moveCount: number }
  | { type: "phaseChange"; phase: GamePhase; uploaderId: string | null }
  | {
      type: "chat";
      id: string;
      playerId: string;
      playerName: string;
      text: string;
      timestamp: number;
    }
  | { type: "transferDone"; uploaderId: string }
  | { type: "playAgainStarted" }
  | { type: "error"; message: string }
  | { type: "roomClosed"; reason: string };
