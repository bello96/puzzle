import { DurableObject } from "cloudflare:workers";

/* ── 类型定义 ── */
type GamePhase = "waiting" | "uploading" | "ready" | "solving" | "solved";

interface PlayerInfo {
  id: string;
  name: string;
  online: boolean;
}

interface PieceState {
  id: number;
  x: number;
  y: number;
  placed: boolean;
}

interface ChatMsg {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
  kind: "chat" | "system";
}

interface DisconnectedPlayer {
  name: string;
  disconnectedAt: number;
  quickLeave: boolean;
}

interface WsAttachment {
  playerId: string;
  playerName: string;
}

/* ── 常量 ── */
const MAX_PLAYERS = 2;
const GRACE_PERIOD = 30_000;
const QUICK_GRACE = 5_000;
const INACTIVITY_TIMEOUT = 10 * 60_000;
const MAX_CHAT_HISTORY = 200;
const IMAGE_CHUNK_SIZE = 100_000;
const SNAP_THRESHOLD = 0.06; // 拼图吸附阈值（归一化坐标）

/* ── PuzzleRoom Durable Object ── */
export class PuzzleRoom extends DurableObject {
  private loaded = false;
  private roomCode = "";
  private created = 0;
  private closed = false;
  private phase: GamePhase = "waiting";
  private uploaderId: string | null = null;
  private difficulty = 4;
  private pieceStates: PieceState[] = [];
  private edges: number[][][] = [];
  private startTime: number | null = null;
  private moveCount = 0;
  private imageReady = false;
  private imageChunks = 0;
  private imageType = "image/jpeg";
  private chatHistory: ChatMsg[] = [];
  private lastActivityAt = 0;
  private disconnectedPlayers = new Map<string, DisconnectedPlayer>();

  /* ── 持久化 ── */
  private async ensureLoaded() {
    if (this.loaded) {
      return;
    }
    this.loaded = true;

    const s = this.ctx.storage;
    const data = await s.get([
      "roomCode", "created", "closed", "phase", "uploaderId",
      "difficulty", "pieceStates", "edges", "startTime", "moveCount",
      "imageReady", "imageChunks", "imageType", "chatHistory", "lastActivityAt",
    ]);

    this.roomCode = (data.get("roomCode") as string) || "";
    this.created = (data.get("created") as number) || 0;
    this.closed = (data.get("closed") as boolean) || false;
    this.phase = (data.get("phase") as GamePhase) || "waiting";
    this.uploaderId = (data.get("uploaderId") as string) || null;
    this.difficulty = (data.get("difficulty") as number) || 4;
    this.pieceStates = (data.get("pieceStates") as PieceState[]) || [];
    this.edges = (data.get("edges") as number[][][]) || [];
    this.startTime = (data.get("startTime") as number) || null;
    this.moveCount = (data.get("moveCount") as number) || 0;
    this.imageReady = (data.get("imageReady") as boolean) || false;
    this.imageChunks = (data.get("imageChunks") as number) || 0;
    this.imageType = (data.get("imageType") as string) || "image/jpeg";
    this.chatHistory = (data.get("chatHistory") as ChatMsg[]) || [];
    this.lastActivityAt = (data.get("lastActivityAt") as number) || Date.now();
  }

  private async save(fields: Record<string, unknown>) {
    await this.ctx.storage.put(fields);
  }

  /* ── HTTP 入口 ── */
  async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    const url = new URL(request.url);

    if (url.pathname === "/init" && request.method === "POST") {
      const { roomCode } = (await request.json()) as { roomCode: string };
      this.roomCode = roomCode;
      this.created = Date.now();
      this.lastActivityAt = Date.now();
      await this.save({
        roomCode, created: this.created,
        lastActivityAt: this.lastActivityAt,
        phase: "waiting", closed: false,
      });
      return new Response("ok");
    }

    if (url.pathname === "/image" && request.method === "POST") {
      if (this.closed) {
        return new Response("Room closed", { status: 410 });
      }
      const data = await request.arrayBuffer();
      const contentType = request.headers.get("Content-Type") || "image/jpeg";
      await this.storeImage(new Uint8Array(data), contentType);
      this.imageReady = true;
      this.phase = "ready";
      await this.save({ imageReady: true, phase: "ready" });
      this.broadcast({ type: "imageUploaded" });
      this.broadcast({ type: "phaseChange", phase: "ready", uploaderId: this.uploaderId });
      return new Response("ok");
    }

    if (url.pathname === "/image" && request.method === "GET") {
      const img = await this.loadImage();
      if (!img) {
        return new Response("No image", { status: 404 });
      }
      return new Response(img.data, { headers: { "Content-Type": img.type } });
    }

    if (url.pathname === "/quickleave" && request.method === "POST") {
      const playerId = await request.text();
      const dp = this.disconnectedPlayers.get(playerId);
      if (dp) {
        dp.quickLeave = true;
      }
      return new Response("ok");
    }

    if (url.pathname === "/info" && request.method === "GET") {
      return Response.json({
        roomCode: this.roomCode, phase: this.phase,
        playerCount: this.getWebSockets().length, closed: this.closed,
      });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response("Not Found", { status: 404 });
  }

  /* ── 图片存储 ── */
  private async storeImage(data: Uint8Array, type: string) {
    if (this.imageChunks > 0) {
      const keys: string[] = [];
      for (let i = 0; i < this.imageChunks; i++) {
        keys.push(`img_${i}`);
      }
      await this.ctx.storage.delete(keys);
    }
    const totalChunks = Math.ceil(data.byteLength / IMAGE_CHUNK_SIZE);
    const puts: Record<string, unknown> = { imageType: type, imageChunks: totalChunks };
    for (let i = 0; i < totalChunks; i++) {
      const start = i * IMAGE_CHUNK_SIZE;
      const end = Math.min(start + IMAGE_CHUNK_SIZE, data.byteLength);
      puts[`img_${i}`] = data.slice(start, end);
    }
    await this.ctx.storage.put(puts);
    this.imageChunks = totalChunks;
    this.imageType = type;
  }

  private async loadImage(): Promise<{ data: Uint8Array; type: string } | null> {
    if (this.imageChunks === 0) {
      return null;
    }
    const keys: string[] = [];
    for (let i = 0; i < this.imageChunks; i++) {
      keys.push(`img_${i}`);
    }
    const chunks = await this.ctx.storage.get<Uint8Array>(keys);
    let totalSize = 0;
    const parts: Uint8Array[] = [];
    for (let i = 0; i < this.imageChunks; i++) {
      const chunk = chunks.get(`img_${i}`);
      if (chunk) {
        parts.push(chunk);
        totalSize += chunk.byteLength;
      }
    }
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.byteLength;
    }
    return { data: result, type: this.imageType };
  }

  /* ── WebSocket 生命周期 ── */
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    await this.ensureLoaded();
    if (typeof raw !== "string") {
      return;
    }

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "join") {
      await this.onJoin(ws, msg);
      return;
    }

    const att = this.getAttachment(ws);
    if (!att) {
      this.sendTo(ws, { type: "error", message: "未加入房间" });
      return;
    }

    this.lastActivityAt = Date.now();
    await this.save({ lastActivityAt: this.lastActivityAt });

    switch (msg.type as string) {
      case "shuffle":
        await this.onShuffle(att, msg.difficulty as number);
        break;
      case "movePiece":
        await this.onMovePiece(att, msg.pieceId as number, msg.x as number, msg.y as number);
        break;
      case "chat":
        await this.onChat(att, msg.text as string);
        break;
      case "transfer":
        await this.onTransfer(att);
        break;
      case "playAgain":
        await this.onPlayAgain(att);
        break;
      case "leave":
        await this.onLeave(ws, att);
        break;
    }
  }

  async webSocketClose(ws: WebSocket) {
    await this.ensureLoaded();
    const att = this.getAttachment(ws);
    if (att) {
      this.handleDisconnect(att.playerId, att.playerName);
    }
  }

  async webSocketError(ws: WebSocket) {
    await this.ensureLoaded();
    const att = this.getAttachment(ws);
    if (att) {
      this.handleDisconnect(att.playerId, att.playerName);
    }
  }

  /* ── 消息处理 ── */
  private async onJoin(ws: WebSocket, msg: Record<string, unknown>) {
    if (this.closed) {
      this.sendTo(ws, { type: "roomClosed", reason: "房间已关闭" });
      ws.close(1000, "Room closed");
      return;
    }

    const playerName = (msg.playerName as string) || "匿名";
    const requestedId = msg.playerId as string | undefined;

    if (requestedId) {
      if (this.disconnectedPlayers.has(requestedId)) {
        this.disconnectedPlayers.delete(requestedId);
        this.setAttachment(ws, { playerId: requestedId, playerName });
        this.broadcastExcept(ws, {
          type: "playerJoined",
          player: { id: requestedId, name: playerName, online: true },
        });
        this.sendRoomState(ws, requestedId);
        this.scheduleAlarm();
        return;
      }

      const existing = this.findWsByPlayerId(requestedId);
      if (existing) {
        try { existing.close(1000, "Replaced"); } catch { /* ignore */ }
        this.setAttachment(ws, { playerId: requestedId, playerName });
        this.sendRoomState(ws, requestedId);
        return;
      }
    }

    const activePlayers = this.getActivePlayers();
    if (activePlayers.length >= MAX_PLAYERS) {
      this.sendTo(ws, { type: "error", message: "房间已满" });
      ws.close(1000, "Room full");
      return;
    }

    const playerId = requestedId || generateId();
    this.setAttachment(ws, { playerId, playerName });

    if (!this.uploaderId) {
      this.uploaderId = playerId;
      await this.save({ uploaderId: playerId });
    }

    const allPlayers = this.getActivePlayers();
    if (allPlayers.length === 2 && this.phase === "waiting") {
      this.phase = "uploading";
      await this.save({ phase: "uploading" });
    }

    this.broadcastExcept(ws, {
      type: "playerJoined",
      player: { id: playerId, name: playerName, online: true },
    });

    this.sendRoomState(ws, playerId);
    this.scheduleAlarm();
  }

  private async onShuffle(att: WsAttachment, difficulty: number) {
    if (att.playerId !== this.uploaderId) {
      return;
    }
    if (this.phase !== "ready" && this.phase !== "solving") {
      return;
    }

    const d = Math.max(3, Math.min(6, Math.floor(difficulty)));
    const total = d * d;

    // 生成拼图边缘数据
    const edges = generateEdges(d);

    // 生成散落位置（堆叠在棋盘区域内，模拟倒出拼图的效果）
    const pieceStates: PieceState[] = [];
    for (let i = 0; i < total; i++) {
      pieceStates.push({
        id: i,
        x: 0.1 + Math.random() * 0.6,
        y: 0.1 + Math.random() * 0.6,
        placed: false,
      });
    }

    this.difficulty = d;
    this.pieceStates = pieceStates;
    this.edges = edges;
    this.startTime = Date.now();
    this.moveCount = 0;
    this.phase = "solving";

    await this.save({
      difficulty: d, pieceStates, edges,
      startTime: this.startTime, moveCount: 0, phase: "solving",
    });

    this.broadcast({
      type: "shuffled",
      pieceStates,
      edges,
      difficulty: d,
      startTime: this.startTime,
    });
  }

  private async onMovePiece(att: WsAttachment, pieceId: number, x: number, y: number) {
    if (this.phase !== "solving") {
      return;
    }
    if (att.playerId === this.uploaderId) {
      return;
    }

    const piece = this.pieceStates.find((p) => p.id === pieceId);
    if (!piece || piece.placed) {
      return;
    }

    // 检查吸附
    const n = this.difficulty;
    const correctX = (pieceId % n) / n;
    const correctY = Math.floor(pieceId / n) / n;
    const snapped =
      Math.abs(x - correctX) < SNAP_THRESHOLD &&
      Math.abs(y - correctY) < SNAP_THRESHOLD;

    piece.x = snapped ? correctX : x;
    piece.y = snapped ? correctY : y;
    piece.placed = snapped;
    this.moveCount++;

    // 检查是否完成
    const solved = this.pieceStates.every((p) => p.placed);

    await this.save({ pieceStates: this.pieceStates, moveCount: this.moveCount });

    this.broadcast({
      type: "pieceMoved",
      pieceId,
      x: piece.x,
      y: piece.y,
      placed: piece.placed,
      moveCount: this.moveCount,
    });

    if (solved) {
      this.phase = "solved";
      const elapsed = this.startTime
        ? Math.floor((Date.now() - this.startTime) / 1000)
        : 0;
      await this.save({ phase: "solved" });
      this.broadcast({
        type: "solved",
        solverName: att.playerName,
        time: elapsed,
        moveCount: this.moveCount,
      });
    }
  }

  private async onChat(att: WsAttachment, text: string) {
    if (!text || text.length > 500) {
      return;
    }
    const chatMsg: ChatMsg = {
      id: generateId(), playerId: att.playerId, playerName: att.playerName,
      text, timestamp: Date.now(), kind: "chat",
    };
    this.chatHistory.push(chatMsg);
    if (this.chatHistory.length > MAX_CHAT_HISTORY) {
      this.chatHistory = this.chatHistory.slice(-MAX_CHAT_HISTORY);
    }
    await this.save({ chatHistory: this.chatHistory });
    this.broadcast({
      type: "chat", id: chatMsg.id, playerId: att.playerId,
      playerName: att.playerName, text, timestamp: chatMsg.timestamp,
    });
  }

  private async onTransfer(att: WsAttachment) {
    if (att.playerId !== this.uploaderId) {
      return;
    }
    const players = this.getActivePlayers();
    const other = players.find((p) => p.id !== att.playerId);
    if (!other) {
      return;
    }
    this.uploaderId = other.id;
    await this.save({ uploaderId: other.id });
    this.broadcast({ type: "transferDone", uploaderId: other.id });
  }

  private async onPlayAgain(att: WsAttachment) {
    if (att.playerId !== this.uploaderId) {
      return;
    }

    if (this.imageChunks > 0) {
      const keys: string[] = [];
      for (let i = 0; i < this.imageChunks; i++) {
        keys.push(`img_${i}`);
      }
      await this.ctx.storage.delete(keys);
    }

    this.phase = "uploading";
    this.pieceStates = [];
    this.edges = [];
    this.imageReady = false;
    this.imageChunks = 0;
    this.startTime = null;
    this.moveCount = 0;

    await this.save({
      phase: "uploading", pieceStates: [], edges: [],
      imageReady: false, imageChunks: 0, startTime: null, moveCount: 0,
    });

    this.broadcast({ type: "playAgainStarted" });
  }

  private async onLeave(ws: WebSocket, att: WsAttachment) {
    this.removePlayer(att.playerId);
    try { ws.close(1000, "Left"); } catch { /* ignore */ }
    this.broadcast({ type: "playerLeft", playerId: att.playerId });
    await this.handlePlayerRemoved(att.playerId);
  }

  /* ── 断线处理 ── */
  private handleDisconnect(playerId: string, playerName: string) {
    this.disconnectedPlayers.set(playerId, {
      name: playerName, disconnectedAt: Date.now(), quickLeave: false,
    });
    this.scheduleAlarm();
  }

  private async handlePlayerRemoved(removedId: string) {
    this.disconnectedPlayers.delete(removedId);
    const remaining = this.getActivePlayers();

    if (remaining.length === 0) {
      this.closed = true;
      await this.save({ closed: true });
      return;
    }

    if (removedId === this.uploaderId && remaining.length > 0) {
      this.uploaderId = remaining[0]!.id;
      await this.save({ uploaderId: this.uploaderId });
      this.broadcast({ type: "transferDone", uploaderId: this.uploaderId });
    }

    if (remaining.length < 2 && this.phase !== "waiting") {
      this.phase = "waiting";
      await this.save({ phase: "waiting" });
      this.broadcast({ type: "phaseChange", phase: "waiting", uploaderId: this.uploaderId });
    }
  }

  /* ── 定时器 ── */
  private scheduleAlarm() {
    this.ctx.storage.setAlarm(Date.now() + 5000);
  }

  async alarm() {
    await this.ensureLoaded();
    if (this.closed) {
      return;
    }
    const now = Date.now();

    for (const [id, dp] of this.disconnectedPlayers) {
      const grace = dp.quickLeave ? QUICK_GRACE : GRACE_PERIOD;
      if (now - dp.disconnectedAt >= grace) {
        this.disconnectedPlayers.delete(id);
        this.broadcast({ type: "playerLeft", playerId: id });
        await this.handlePlayerRemoved(id);
      }
    }

    if (now - this.lastActivityAt >= INACTIVITY_TIMEOUT) {
      this.closed = true;
      await this.save({ closed: true });
      this.broadcast({ type: "roomClosed", reason: "长时间无操作，房间已关闭" });
      return;
    }

    if (this.disconnectedPlayers.size > 0 || this.getWebSockets().length > 0) {
      this.scheduleAlarm();
    }
  }

  /* ── 工具方法 ── */
  private getWebSockets(): WebSocket[] {
    return this.ctx.getWebSockets();
  }

  private getAttachment(ws: WebSocket): WsAttachment | null {
    try {
      return ws.deserializeAttachment() as WsAttachment | null;
    } catch {
      return null;
    }
  }

  private setAttachment(ws: WebSocket, att: WsAttachment) {
    ws.serializeAttachment(att);
  }

  private getActivePlayers(): PlayerInfo[] {
    const players: PlayerInfo[] = [];
    const seen = new Set<string>();
    for (const ws of this.getWebSockets()) {
      const att = this.getAttachment(ws);
      if (att && !seen.has(att.playerId)) {
        seen.add(att.playerId);
        players.push({ id: att.playerId, name: att.playerName, online: true });
      }
    }
    for (const [id, dp] of this.disconnectedPlayers) {
      if (!seen.has(id)) {
        players.push({ id, name: dp.name, online: false });
      }
    }
    return players;
  }

  private findWsByPlayerId(playerId: string): WebSocket | null {
    for (const ws of this.getWebSockets()) {
      const att = this.getAttachment(ws);
      if (att?.playerId === playerId) {
        return ws;
      }
    }
    return null;
  }

  private removePlayer(playerId: string) {
    for (const ws of this.getWebSockets()) {
      const att = this.getAttachment(ws);
      if (att?.playerId === playerId) {
        this.setAttachment(ws, null as unknown as WsAttachment);
      }
    }
  }

  private sendRoomState(ws: WebSocket, yourId: string) {
    this.sendTo(ws, {
      type: "roomState",
      players: this.getActivePlayers(),
      uploaderId: this.uploaderId,
      phase: this.phase,
      pieceStates: [...this.pieceStates],
      edges: this.edges,
      difficulty: this.difficulty,
      imageReady: this.imageReady,
      yourId,
      chatHistory: this.chatHistory,
      startTime: this.startTime,
      moveCount: this.moveCount,
    });
  }

  private sendTo(ws: WebSocket, data: unknown) {
    try { ws.send(JSON.stringify(data)); } catch { /* ignore */ }
  }

  private broadcast(data: unknown) {
    const msg = JSON.stringify(data);
    for (const ws of this.getWebSockets()) {
      try { ws.send(msg); } catch { /* ignore */ }
    }
  }

  private broadcastExcept(exclude: WebSocket, data: unknown) {
    const msg = JSON.stringify(data);
    for (const ws of this.getWebSockets()) {
      if (ws !== exclude) {
        try { ws.send(msg); } catch { /* ignore */ }
      }
    }
  }
}

/* ── 工具函数 ── */
function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * 生成 NxN 拼图的边缘数据
 * 返回 edges[r][c] = [top, right, bottom, left]
 * 0=平(边缘), 1=凸, -1=凹
 */
function generateEdges(n: number): number[][][] {
  // 水平连接: hConn[r][c] = (r,c) 右边与 (r,c+1) 左边的关系
  const hConn: number[][] = [];
  for (let r = 0; r < n; r++) {
    hConn[r] = [];
    for (let c = 0; c < n - 1; c++) {
      hConn[r]![c] = Math.random() > 0.5 ? 1 : -1;
    }
  }

  // 垂直连接: vConn[r][c] = (r,c) 下边与 (r+1,c) 上边的关系
  const vConn: number[][] = [];
  for (let r = 0; r < n - 1; r++) {
    vConn[r] = [];
    for (let c = 0; c < n; c++) {
      vConn[r]![c] = Math.random() > 0.5 ? 1 : -1;
    }
  }

  const edges: number[][][] = [];
  for (let r = 0; r < n; r++) {
    edges[r] = [];
    for (let c = 0; c < n; c++) {
      const top = r === 0 ? 0 : -(vConn[r - 1]![c]!);
      const right = c === n - 1 ? 0 : hConn[r]![c]!;
      const bottom = r === n - 1 ? 0 : vConn[r]![c]!;
      const left = c === 0 ? 0 : -(hConn[r]![c - 1]!);
      edges[r]![c] = [top, right, bottom, left];
    }
  }

  return edges;
}
