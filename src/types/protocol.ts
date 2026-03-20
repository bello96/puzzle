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

/* ── 拼图块状态 ── */
export interface PieceState {
  id: number;
  x: number;      // 归一化坐标 (0-1 = 拼图区域内)
  y: number;
  placed: boolean; // 是否已吸附到正确位置
}

/* ── Client → Server ── */
export type ClientMessage =
  | { type: "join"; playerName: string; playerId?: string }
  | { type: "shuffle"; difficulty: number }
  | { type: "movePiece"; pieceId: number; x: number; y: number }
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
      pieceStates: PieceState[];
      edges: number[][][];
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
  | {
      type: "shuffled";
      pieceStates: PieceState[];
      edges: number[][][];
      difficulty: number;
      startTime: number;
    }
  | {
      type: "pieceMoved";
      pieceId: number;
      x: number;
      y: number;
      placed: boolean;
      moveCount: number;
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
