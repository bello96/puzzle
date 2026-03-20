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

/** 以固定尺寸渲染，CSS 缩放显示 */
const REF_SIZE = 600;

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
  const [boardSize, setBoardSize] = useState(400);
  const [renderedPieces, setRenderedPieces] = useState<Map<number, RenderedPiece>>(
    new Map(),
  );
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
  const [piecesReady, setPiecesReady] = useState(false);

  /* ── 自适应拼图区大小 ── */
  useEffect(() => {
    function update() {
      if (!containerRef.current) {
        return;
      }
      const h = containerRef.current.clientHeight - 30;
      const w = containerRef.current.clientWidth * 0.42;
      setBoardSize(Math.max(200, Math.min(h, w, 520)));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  /* ── 渲染拼图块图片（固定 REF_SIZE，一次性） ── */
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
          const { canvas, offsetX, offsetY } = renderPieceCanvas(
            img,
            difficulty,
            r,
            c,
            parsed[r]![c]!,
            REF_SIZE,
          );
          pieces.set(id, {
            dataUrl: canvas.toDataURL("image/png"),
            width: canvas.width,
            height: canvas.height,
            offsetX,
            offsetY,
          });
        }
      }

      setRenderedPieces(pieces);
      setPiecesReady(true);
    };
    img.src = imageUrl;
  }, [imageUrl, edges, difficulty]);

  /* ── 渲染拼图区域背景轮廓 ── */
  useEffect(() => {
    if (
      !boardCanvasRef.current ||
      !imageObjRef.current ||
      !parsedEdgesRef.current ||
      !piecesReady
    ) {
      return;
    }
    const canvas = boardCanvasRef.current;
    canvas.width = boardSize;
    canvas.height = boardSize;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, boardSize, boardSize);
    renderBoardOutline(
      ctx,
      imageObjRef.current,
      difficulty,
      parsedEdgesRef.current,
      boardSize,
    );
  }, [boardSize, difficulty, piecesReady]);

  /* ── 同步服务端状态到本地（跳过正在拖拽的块） ── */
  useEffect(() => {
    setLocalStates(
      pieceStates.map((ps) => {
        if (dragRef.current?.id === ps.id) {
          return ps; // 拖拽中的块保持本地位置
        }
        return ps;
      }),
    );
  }, [pieceStates]);

  /* ── 缩放因子 ── */
  const scale = boardSize / REF_SIZE;
  const BOARD_X = 15;
  const BOARD_Y = 15;

  /* ── 拖拽：按下 ── */
  function handlePointerDown(e: React.PointerEvent, pieceId: number) {
    if (!canInteract) {
      return;
    }
    const piece = localStates.find((p) => p.id === pieceId);
    if (!piece || piece.placed) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      id: pieceId,
      pointerId: e.pointerId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPieceX: piece.x,
      startPieceY: piece.y,
    };
    setDragId(pieceId);
  }

  /* ── 拖拽：移动 ── */
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) {
        return;
      }
      const dx = e.clientX - dragRef.current.startMouseX;
      const dy = e.clientY - dragRef.current.startMouseY;
      const newX = dragRef.current.startPieceX + dx / boardSize;
      const newY = dragRef.current.startPieceY + dy / boardSize;

      setLocalStates((prev) =>
        prev.map((p) =>
          p.id === dragRef.current!.id ? { ...p, x: newX, y: newY } : p,
        ),
      );
    },
    [boardSize],
  );

  /* ── 拖拽：松开 ── */
  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) {
        return;
      }
      const dx = e.clientX - dragRef.current.startMouseX;
      const dy = e.clientY - dragRef.current.startMouseY;
      const finalX = dragRef.current.startPieceX + dx / boardSize;
      const finalY = dragRef.current.startPieceY + dy / boardSize;

      onMovePiece(dragRef.current.id, finalX, finalY);
      dragRef.current = null;
      setDragId(null);
    },
    [boardSize, onMovePiece],
  );

  return (
    <div
      ref={containerRef}
      className="relative flex-1"
      style={{ minHeight: boardSize + 30, overflow: "visible" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* 拼图区域背景（模糊轮廓） */}
      <canvas
        ref={boardCanvasRef}
        style={{
          position: "absolute",
          left: BOARD_X,
          top: BOARD_Y,
          width: boardSize,
          height: boardSize,
          borderRadius: 8,
          border: "2px dashed rgba(99, 102, 241, 0.25)",
          background: "rgba(248, 250, 252, 0.8)",
        }}
      />

      {/* 拼图块 */}
      {localStates.map((piece) => {
        const rp = renderedPieces.get(piece.id);
        if (!rp) {
          return null;
        }

        const pixelX = BOARD_X + piece.x * boardSize + rp.offsetX * scale;
        const pixelY = BOARD_Y + piece.y * boardSize + rp.offsetY * scale;
        const isDragging = dragId === piece.id;

        return (
          <img
            key={piece.id}
            src={rp.dataUrl}
            alt=""
            style={{
              position: "absolute",
              left: pixelX,
              top: pixelY,
              width: rp.width * scale,
              height: rp.height * scale,
              zIndex: isDragging ? 1000 : piece.placed ? 1 : 10,
              cursor: canInteract && !piece.placed
                ? isDragging
                  ? "grabbing"
                  : "grab"
                : "default",
              filter: piece.placed
                ? "drop-shadow(0 0 4px rgba(16, 185, 129, 0.6))"
                : isDragging
                  ? "drop-shadow(0 4px 10px rgba(0,0,0,0.35))"
                  : "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
              transform: isDragging ? "scale(1.06)" : "scale(1)",
              transition: isDragging
                ? "transform 0.1s, filter 0.1s"
                : "left 0.15s ease, top 0.15s ease, transform 0.15s, filter 0.15s",
              pointerEvents: canInteract && !piece.placed ? "auto" : "none",
              userSelect: "none",
              touchAction: "none",
            }}
            onPointerDown={(e) => handlePointerDown(e, piece.id)}
            draggable={false}
          />
        );
      })}
    </div>
  );
}
