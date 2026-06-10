const API_BASE = import.meta.env.VITE_API_BASE as string | undefined;

export function getHttpBase(): string {
  if (API_BASE) {
    return API_BASE;
  }
  return window.location.origin;
}

export function getWsBase(): string {
  const http = getHttpBase();
  return http.replace(/^http/, "ws");
}

export interface RoomInfo {
  roomCode: string;
  phase: string;
  playerCount: number;
  closed: boolean;
}

export async function fetchRoomInfo(code: string): Promise<RoomInfo | null> {
  try {
    const res = await fetch(`${getHttpBase()}/api/rooms/${code}`);
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as RoomInfo;
  } catch {
    return null;
  }
}

/**
 * 校验房间是否可加入；可加入返回 null，否则返回中文错误。
 */
export async function checkJoinable(code: string): Promise<string | null> {
  const info = await fetchRoomInfo(code);
  if (!info || !info.roomCode || info.closed) {
    return "房间不存在或已关闭";
  }
  if (info.playerCount >= 2) {
    return "房间已满，无法加入";
  }
  return null;
}

export async function createRoom(): Promise<string> {
  const res = await fetch(`${getHttpBase()}/api/rooms`, { method: "POST" });
  if (!res.ok) {
    throw new Error("创建房间失败");
  }
  const data = (await res.json()) as { roomCode: string };
  return data.roomCode;
}
