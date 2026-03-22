import { useCallback, useEffect, useRef, useState } from "react";
import type { PieceState } from "../types/protocol";
import {
  type PieceEdges,
  deserializeEdges,
  renderBoardOutline,
  renderPieceCanvas,
} from "../utils/jigsaw";

interface Props {
  pieceStates: PieceState[];
  difficulty: number;
  edges: number[][][];
  imageUrl: string;
  canInteract: boolean;
  onMovePiece: (pieceId: number, x: number, y: number) => void;
}

interface RenderedPiece {
  dataUrl: string;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

const REF_SIZE = 600;
const PAD = 12;

export default function PuzzleBoard({
  pieceStates,
  difficulty,
  edges,
  imageUrl,
  canInteract,
  onMovePiece,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardCanvasRef = useRef<HTMLCanvasElement>(null);
  const [containerW, setContainerW] = useState(800);
  const [containerH, setContainerH] = useState(500);
  const [renderedPieces, setRenderedPieces] = useState<Map<number, RenderedPiece>>(new Map());
  const parsedEdgesRef = useRef<PieceEdges[][] | null>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);
  const [localStates, setLocalStates] = useState<PieceState[]>([]);
  const dragRef = useRef<{
    id: number;
    pointerId: number;
    startMouseX: number;
    startMouseY: number;
    startPieceX: number;
    startPieceY: number;
  } | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [renderKey, setRenderKey] = useState(0); // 每次重新渲染拼图块时递增
  const [wrongHint, setWrongHint] = useState<number | null>(null);

  /* ── 等比例布局：左右平分，自适应填满 ── */
  const availH = containerH - PAD * 2;
  const availW = containerW - PAD * 2;
  // 间距随容器宽度自适应（3%~5%），但有上下限
  const gap = Math.max(16, Math.min(availW * 0.04, 48));
  // 每个面板最大宽度 = (可用宽度 - 间距) / 2
  const maxPanel = (availW - gap) / 2;
  // 棋盘为正方形，受高度和面板宽度共同约束，无硬上限
  const boardSize = Math.max(120, Math.min(maxPanel, availH));
  // 居中定位
  const totalW = boardSize * 2 + gap;
  const startX = (containerW - totalW) / 2;
  const trayX = startX;
  const boardX = startX + boardSize + gap;
  const boardY = (containerH - boardSize) / 2;
  const scale = boardSize / REF_SIZE;

  // refs for document event handlers
  const boardSizeRef = useRef(boardSize);
  const trayMinXRef = useRef(-1.03);
  boardSizeRef.current = boardSize;
  // tray 在 board 坐标系中的范围：x from -(boardSize + gap) / boardSize to 0
  trayMinXRef.current = -(boardSize + gap) / boardSize - 0.02;

  /* ── 监听容器尺寸 ── */
  useEffect(() => {
    function update() {
      if (!containerRef.current) {
        return;
      }
      setContainerW(containerRef.current.clientWidth);
      setContainerH(containerRef.current.clientHeight);
    }
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current) {
      ro.observe(containerRef.current);
    }
    return () => ro.disconnect();
  }, []);

  /* ── 渲染拼图块图片 ── */
  useEffect(() => {
    if (!imageUrl || edges.length === 0) {
      return;
    }
    const parsed = deserializeEdges(edges);
    parsedEdgesRef.current = parsed;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageObjRef.current = img;
      const pieces = new Map<number, RenderedPiece>();
      for (let r = 0; r < difficulty; r++) {
        for (let c = 0; c < difficulty; c++) {
          const id = r * difficulty + c;
          try {
            const { canvas, offsetX, offsetY } = renderPieceCanvas(
              img, difficulty, r, c, parsed[r]![c]!, REF_SIZE,
            );
            pieces.set(id, {
              dataUrl: canvas.toDataURL("image/png"),
              width: canvas.width, height: canvas.height, offsetX, offsetY,
            });
          } catch { /* skip */ }
        }
      }
      setRenderedPieces(pieces);
      setRenderKey((k) => k + 1);
    };
    img.src = imageUrl;
  }, [imageUrl, edges, difficulty]);

  /* ── 渲染棋盘背景（renderKey 变化时重绘，确保与拼图块边缘一致） ── */
  useEffect(() => {
    if (!boardCanvasRef.current || !imageObjRef.current || !parsedEdgesRef.current || renderKey === 0) {
      return;
    }
    try {
      const canvas = boardCanvasRef.current;
      canvas.width = boardSize;
      canvas.height = boardSize;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, boardSize, boardSize);
      renderBoardOutline(ctx, imageObjRef.current, difficulty, parsedEdgesRef.current, boardSize);
    } catch { /* ignore */ }
  }, [boardSize, difficulty, renderKey]);

  /* ── 同步服务端状态 ── */
  useEffect(() => {
    setLocalStates((prev) => {
      const draggingId = dragRef.current?.id;
      return pieceStates.map((ps) => {
        if (ps.id === draggingId) {
          const local = prev.find((p) => p.id === ps.id);
          if (local) {
            return { ...ps, x: local.x, y: local.y };
          }
        }
        return { ...ps };
      });
    });
  }, [pieceStates]);

  // clamp
  function clampPos(x: number, y: number): [number, number] {
    const minX = trayMinXRef.current;
    return [
      Math.max(minX, Math.min(0.95, x)),
      Math.max(-0.05, Math.min(0.95, y)),
    ];
  }

  /* ── 全局 pointer 事件 ── */
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) {
        return;
      }
      const bs = boardSizeRef.current;
      const dx = e.clientX - drag.startMouseX;
      const dy = e.clientY - drag.startMouseY;
      const [nx, ny] = clampPos(drag.startPieceX + dx / bs, drag.startPieceY + dy / bs);
      const did = drag.id;
      setLocalStates((prev) =>
        prev.map((p) => p.id === did ? { ...p, x: nx, y: ny } : p),
      );
    }

    function onUp(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) {
        return;
      }
      const bs = boardSizeRef.current;
      const dx = e.clientX - drag.startMouseX;
      const dy = e.clientY - drag.startMouseY;
      const [fx, fy] = clampPos(drag.startPieceX + dx / bs, drag.startPieceY + dy / bs);
      const id = drag.id;

      const n = difficulty;
      const cx = (id % n) / n;
      const cy = Math.floor(id / n) / n;
      const onBoard = fx >= -0.05 && fx <= 1.05 && fy >= -0.05 && fy <= 1.05;
      const isCorrect = Math.abs(fx - cx) < 0.04 && Math.abs(fy - cy) < 0.04;

      if (onBoard && !isCorrect) {
        setWrongHint(id);
        setTimeout(() => setWrongHint((cur) => (cur === id ? null : cur)), 800);
      }

      onMovePiece(id, fx, fy);
      dragRef.current = null;
      setDragId(null);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [difficulty, onMovePiece]);

  /* ── 拖拽：按下 ── */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, pieceId: number) => {
      if (!canInteract) {
        return;
      }
      const piece = localStates.find((p) => p.id === pieceId);
      if (!piece || piece.placed) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* */ }
      dragRef.current = {
        id: pieceId, pointerId: e.pointerId,
        startMouseX: e.clientX, startMouseY: e.clientY,
        startPieceX: piece.x, startPieceY: piece.y,
      };
      setDragId(pieceId);
      setWrongHint(null);
    },
    [canInteract, localStates],
  );

  return (
    <div ref={containerRef} className="absolute inset-0">
      {/* 左侧：散落区（拼图槽） */}
      <div
        className="absolute"
        style={{
          left: trayX, top: boardY, width: boardSize, height: boardSize,
          borderRadius: 10, border: "2px dashed #e2e8f0",
          background: "rgba(248,250,252,0.6)",
        }}
      />

      {/* 右侧：棋盘（目标区域） */}
      <canvas
        ref={boardCanvasRef}
        style={{
          position: "absolute", left: boardX, top: boardY,
          width: boardSize, height: boardSize, borderRadius: 10,
          border: "2px dashed #c7d2fe", background: "rgba(238,242,255,0.4)",
        }}
      />

      {/* 拼图块 */}
      {localStates.map((piece) => {
        const rp = renderedPieces.get(piece.id);
        if (!rp) {
          return null;
        }
        // boardX 为坐标原点，piece.x < 0 在棋盘左侧（散落区）
        const pixelX = boardX + piece.x * boardSize + rp.offsetX * scale;
        const pixelY = boardY + piece.y * boardSize + rp.offsetY * scale;
        const isDragging = dragId === piece.id;
        const isWrong = wrongHint === piece.id;

        return (
          <img
            key={piece.id}
            src={rp.dataUrl}
            alt=""
            style={{
              position: "absolute",
              left: pixelX, top: pixelY,
              width: rp.width * scale, height: rp.height * scale,
              zIndex: isDragging ? 1000 : piece.placed ? 1 : 10,
              cursor: canInteract && !piece.placed
                ? isDragging ? "grabbing" : "grab" : "default",
              filter: piece.placed
                ? "drop-shadow(0 0 5px rgba(34,197,94,0.5))"
                : isWrong
                  ? "drop-shadow(0 0 6px rgba(239,68,68,0.6))"
                  : isDragging
                    ? "drop-shadow(0 4px 10px rgba(0,0,0,0.3))"
                    : "drop-shadow(0 2px 4px rgba(0,0,0,0.15))",
              transform: isDragging ? "scale(1.06)" : isWrong ? "scale(1.03)" : "scale(1)",
              transition: isDragging
                ? "transform 0.1s, filter 0.1s"
                : "left 0.15s ease, top 0.15s ease, transform 0.2s, filter 0.2s",
              pointerEvents: canInteract && !piece.placed ? "auto" : "none",
              userSelect: "none", touchAction: "none",
              opacity: piece.placed ? 0.95 : 1,
            }}
            onPointerDown={(e) => handlePointerDown(e, piece.id)}
            draggable={false}
          />
        );
      })}
    </div>
  );
}
