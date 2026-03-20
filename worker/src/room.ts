import { DurableObject } from "cloudflare:workers";

/* ── 类型定义 ── */
type GamePhase = "waiting" | "uploading" | "ready" | "solving" | "solved";

interface PlayerInfo {
  id: string;
  name: string;
  online: boolean;
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
const IMAGE_CHUNK_SIZE = 100_000; // 100KB per chunk

/* ── PuzzleRoom Durable Object ── */
export class PuzzleRoom extends DurableObject {
  /* ── 状态 ── */
  private loaded = false;
  private roomCode = "";
  private created = 0;
  private closed = false;
  private phase: GamePhase = "waiting";
  private uploaderId: string | null = null;
  private difficulty = 4;
  private pieces: number[] = [];
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
      "roomCode",
      "created",
      "closed",
      "phase",
      "uploaderId",
      "difficulty",
      "pieces",
      "startTime",
      "moveCount",
      "imageReady",
      "imageChunks",
      "imageType",
      "chatHistory",
      "lastActivityAt",
    ]);

    this.roomCode = (data.get("roomCode") as string) || "";
    this.created = (data.get("created") as number) || 0;
    this.closed = (data.get("closed") as boolean) || false;
    this.phase = (data.get("phase") as GamePhase) || "waiting";
    this.uploaderId = (data.get("uploaderId") as string) || null;
    this.difficulty = (data.get("difficulty") as number) || 4;
    this.pieces = (data.get("pieces") as number[]) || [];
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

    // 初始化
    if (url.pathname === "/init" && request.method === "POST") {
      const { roomCode } = (await request.json()) as { roomCode: string };
      this.roomCode = roomCode;
      this.created = Date.now();
      this.lastActivityAt = Date.now();
      await this.save({
        roomCode,
        created: this.created,
        lastActivityAt: this.lastActivityAt,
        phase: "waiting",
        closed: false,
      });
      return new Response("ok");
    }

    // 上传图片
    if (url.pathname === "/image" && request.method === "POST") {
      if (this.closed) {
        return new Response("Room closed", { status: 410 });
      }
      const data = await request.arrayBuffer();
      const contentType =
        request.headers.get("Content-Type") || "image/jpeg";
      await this.storeImage(new Uint8Array(data), contentType);
      this.imageReady = true;
      this.phase = "ready";
      await this.save({ imageReady: true, phase: "ready" });
      this.broadcast({ type: "imageUploaded" });
      this.broadcast({
        type: "phaseChange",
        phase: "ready",
        uploaderId: this.uploaderId,
      });
      return new Response("ok");
    }

    // 获取图片
    if (url.pathname === "/image" && request.method === "GET") {
      const img = await this.loadImage();
      if (!img) {
        return new Response("No image", { status: 404 });
      }
      return new Response(img.data, {
        headers: { "Content-Type": img.type },
      });
    }

    // quickleave
    if (url.pathname === "/quickleave" && request.method === "POST") {
      const playerId = await request.text();
      const dp = this.disconnectedPlayers.get(playerId);
      if (dp) {
        dp.quickLeave = true;
      }
      return new Response("ok");
    }

    // 房间信息
    if (url.pathname === "/info" && request.method === "GET") {
      return Response.json({
        roomCode: this.roomCode,
        phase: this.phase,
        playerCount: this.getWebSockets().length,
        closed: this.closed,
      });
    }

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = [pair[0], pair[1]];
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not Found", { status: 404 });
  }

  /* ── 图片存储（分块） ── */
  private async storeImage(data: Uint8Array, type: string) {
    // 清除旧图片
    if (this.imageChunks > 0) {
      const keys: string[] = [];
      for (let i = 0; i < this.imageChunks; i++) {
        keys.push(`img_${i}`);
      }
      await this.ctx.storage.delete(keys);
    }

    const totalChunks = Math.ceil(data.byteLength / IMAGE_CHUNK_SIZE);
    const puts: Record<string, unknown> = {
      imageType: type,
      imageChunks: totalChunks,
    };
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

    const type = msg.type as string;

    if (type === "join") {
      await this.onJoin(ws, msg);
      return;
    }

    // 其他消息需要已认证
    const att = this.getAttachment(ws);
    if (!att) {
      this.sendTo(ws, { type: "error", message: "未加入房间" });
      return;
    }

    this.lastActivityAt = Date.now();
    await this.save({ lastActivityAt: this.lastActivityAt });

    switch (type) {
      case "shuffle":
        await this.onShuffle(att, msg.difficulty as number);
        break;
      case "move":
        await this.onMove(
          att,
          msg.fromIndex as number,
          msg.toIndex as number
        );
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

    // 尝试重连
    if (requestedId) {
      // 检查是否是断线重连
      if (this.disconnectedPlayers.has(requestedId)) {
        this.disconnectedPlayers.delete(requestedId);
        this.setAttachment(ws, { playerId: requestedId, playerName });
        // 通知其他人该玩家重新上线
        this.broadcastExcept(ws, {
          type: "playerJoined",
          player: { id: requestedId, name: playerName, online: true },
        });
        this.sendRoomState(ws, requestedId);
        this.scheduleAlarm();
        return;
      }

      // 检查是否抢占现有连接
      const existing = this.findWsByPlayerId(requestedId);
      if (existing) {
        // 关闭旧连接，用新连接
        try {
          existing.close(1000, "Replaced");
        } catch {
          // 忽略
        }
        this.setAttachment(ws, { playerId: requestedId, playerName });
        this.sendRoomState(ws, requestedId);
        return;
      }
    }

    // 新玩家加入
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length >= MAX_PLAYERS) {
      this.sendTo(ws, { type: "error", message: "房间已满" });
      ws.close(1000, "Room full");
      return;
    }

    const playerId = requestedId || generateId();
    this.setAttachment(ws, { playerId, playerName });

    // 第一个玩家自动成为出题者
    if (!this.uploaderId) {
      this.uploaderId = playerId;
      await this.save({ uploaderId: playerId });
    }

    // 第二个玩家加入 → 进入上传阶段
    const allPlayers = this.getActivePlayers();
    if (allPlayers.length === 2 && this.phase === "waiting") {
      this.phase = "uploading";
      await this.save({ phase: "uploading" });
    }

    // 通知其他人
    this.broadcastExcept(ws, {
      type: "playerJoined",
      player: { id: playerId, name: playerName, online: true },
    });

    // 发送完整状态
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
    const shuffled = fisherYatesShuffle(total);

    this.difficulty = d;
    this.pieces = shuffled;
    this.startTime = Date.now();
    this.moveCount = 0;
    this.phase = "solving";

    await this.save({
      difficulty: d,
      pieces: shuffled,
      startTime: this.startTime,
      moveCount: 0,
      phase: "solving",
    });

    this.broadcast({
      type: "shuffled",
      pieces: shuffled,
      difficulty: d,
      startTime: this.startTime,
    });
  }

  private async onMove(att: WsAttachment, from: number, to: number) {
    if (this.phase !== "solving") {
      return;
    }
    // 只有拼图者（非出题者）可以操作
    if (att.playerId === this.uploaderId) {
      return;
    }
    if (from < 0 || from >= this.pieces.length || to < 0 || to >= this.pieces.length) {
      return;
    }
    if (from === to) {
      return;
    }

    // 交换
    const tmp = this.pieces[from]!;
    this.pieces[from] = this.pieces[to]!;
    this.pieces[to] = tmp;
    this.moveCount++;

    // 检查是否完成
    const solved = this.pieces.every((v, i) => v === i);

    await this.save({ pieces: this.pieces, moveCount: this.moveCount });

    this.broadcast({
      type: "moved",
      fromIndex: from,
      toIndex: to,
      pieces: [...this.pieces],
      moveCount: this.moveCount,
      solved,
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
      id: generateId(),
      playerId: att.playerId,
      playerName: att.playerName,
      text,
      timestamp: Date.now(),
      kind: "chat",
    };
    this.chatHistory.push(chatMsg);
    if (this.chatHistory.length > MAX_CHAT_HISTORY) {
      this.chatHistory = this.chatHistory.slice(-MAX_CHAT_HISTORY);
    }
    await this.save({ chatHistory: this.chatHistory });
    this.broadcast({
      type: "chat",
      id: chatMsg.id,
      playerId: att.playerId,
      playerName: att.playerName,
      text,
      timestamp: chatMsg.timestamp,
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

    // 清除旧图片
    if (this.imageChunks > 0) {
      const keys: string[] = [];
      for (let i = 0; i < this.imageChunks; i++) {
        keys.push(`img_${i}`);
      }
      await this.ctx.storage.delete(keys);
    }

    this.phase = "uploading";
    this.pieces = [];
    this.imageReady = false;
    this.imageChunks = 0;
    this.startTime = null;
    this.moveCount = 0;

    await this.save({
      phase: "uploading",
      pieces: [],
      imageReady: false,
      imageChunks: 0,
      startTime: null,
      moveCount: 0,
    });

    this.broadcast({ type: "playAgainStarted" });
  }

  private async onLeave(ws: WebSocket, att: WsAttachment) {
    this.removePlayer(att.playerId);
    try {
      ws.close(1000, "Left");
    } catch {
      // 忽略
    }
    this.broadcast({ type: "playerLeft", playerId: att.playerId });
    await this.handlePlayerRemoved(att.playerId);
  }

  /* ── 断线处理 ── */
  private handleDisconnect(playerId: string, playerName: string) {
    this.disconnectedPlayers.set(playerId, {
      name: playerName,
      disconnectedAt: Date.now(),
      quickLeave: false,
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

    // 如果出题者离开，让另一个人当出题者
    if (removedId === this.uploaderId && remaining.length > 0) {
      this.uploaderId = remaining[0]!.id;
      await this.save({ uploaderId: this.uploaderId });
      this.broadcast({
        type: "transferDone",
        uploaderId: this.uploaderId,
      });
    }

    // 回到等待阶段
    if (remaining.length < 2 && this.phase !== "waiting") {
      this.phase = "waiting";
      await this.save({ phase: "waiting" });
      this.broadcast({
        type: "phaseChange",
        phase: "waiting",
        uploaderId: this.uploaderId,
      });
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

    // 处理断线玩家
    for (const [id, dp] of this.disconnectedPlayers) {
      const grace = dp.quickLeave ? QUICK_GRACE : GRACE_PERIOD;
      if (now - dp.disconnectedAt >= grace) {
        this.disconnectedPlayers.delete(id);
        this.broadcast({ type: "playerLeft", playerId: id });
        await this.handlePlayerRemoved(id);
      }
    }

    // 不活跃超时
    if (now - this.lastActivityAt >= INACTIVITY_TIMEOUT) {
      this.closed = true;
      await this.save({ closed: true });
      this.broadcast({ type: "roomClosed", reason: "长时间无操作，房间已关闭" });
      return;
    }

    // 如果还有断线玩家或有连接中的玩家，继续轮询
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
    // 加上断线但在宽限期的玩家
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
      pieces: [...this.pieces],
      difficulty: this.difficulty,
      imageReady: this.imageReady,
      yourId,
      chatHistory: this.chatHistory,
      startTime: this.startTime,
      moveCount: this.moveCount,
    });
  }

  private sendTo(ws: WebSocket, data: unknown) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // 忽略
    }
  }

  private broadcast(data: unknown) {
    const msg = JSON.stringify(data);
    for (const ws of this.getWebSockets()) {
      try {
        ws.send(msg);
      } catch {
        // 忽略
      }
    }
  }

  private broadcastExcept(exclude: WebSocket, data: unknown) {
    const msg = JSON.stringify(data);
    for (const ws of this.getWebSockets()) {
      if (ws !== exclude) {
        try {
          ws.send(msg);
        } catch {
          // 忽略
        }
      }
    }
  }
}

/* ── 工具函数 ── */
function generateId(): string {
  return (
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}

function fisherYatesShuffle(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  // Fisher-Yates 洗牌
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  // 确保不是原始顺序
  const isIdentity = arr.every((v, i) => v === i);
  if (isIdentity && n > 1) {
    // 交换前两个
    const tmp = arr[0]!;
    arr[0] = arr[1]!;
    arr[1] = tmp;
  }
  return arr;
}
