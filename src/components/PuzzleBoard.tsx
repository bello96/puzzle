import { useEffect, useRef, useState } from "react";

interface Props {
  pieces: number[];
  difficulty: number;
  imageUrl: string;
  canInteract: boolean;
  onMove: (fromIndex: number, toIndex: number) => void;
}

export default function PuzzleBoard({
  pieces,
  difficulty,
  imageUrl,
  canInteract,
  onMove,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [swapping, setSwapping] = useState<{ from: number; to: number } | null>(
    null
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(500);

  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        const parent = containerRef.current.parentElement;
        if (parent) {
          const maxW = parent.clientWidth - 32;
          const maxH = window.innerHeight - 200;
          setBoardSize(Math.min(maxW, maxH, 600));
        }
      }
    }
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    setSelected(null);
    setSwapping(null);
  }, [pieces]);

  function handleClick(posIndex: number) {
    if (!canInteract) {
      return;
    }

    if (selected === null) {
      setSelected(posIndex);
    } else if (selected === posIndex) {
      setSelected(null);
    } else {
      setSwapping({ from: selected, to: posIndex });
      // 短暂动画后执行交换
      setTimeout(() => {
        onMove(selected, posIndex);
        setSwapping(null);
      }, 200);
      setSelected(null);
    }
  }

  const gap = difficulty > 4 ? 1 : 2;
  const cellSize = (boardSize - gap * (difficulty - 1)) / difficulty;

  function getPieceStyle(posIndex: number, pieceId: number): React.CSSProperties {
    const col = pieceId % difficulty;
    const row = Math.floor(pieceId / difficulty);
    const bgPosX = difficulty > 1 ? (col * 100) / (difficulty - 1) : 0;
    const bgPosY = difficulty > 1 ? (row * 100) / (difficulty - 1) : 0;

    const isCorrect = posIndex === pieceId;
    const isSelected = selected === posIndex;
    const isSwapFrom = swapping?.from === posIndex;
    const isSwapTo = swapping?.to === posIndex;

    return {
      width: cellSize,
      height: cellSize,
      backgroundImage: `url(${imageUrl})`,
      backgroundSize: `${difficulty * 100}% ${difficulty * 100}%`,
      backgroundPosition: `${bgPosX}% ${bgPosY}%`,
      borderRadius: 4,
      cursor: canInteract ? "pointer" : "default",
      outline: isSelected
        ? "3px solid #6366f1"
        : isCorrect
          ? "2px solid rgba(16,185,129,0.6)"
          : "1px solid rgba(0,0,0,0.08)",
      outlineOffset: isSelected ? -1 : 0,
      transform: isSwapFrom || isSwapTo ? "scale(0.92)" : "scale(1)",
      transition: "transform 0.2s, outline 0.15s",
      boxShadow: isSelected ? "0 0 12px rgba(99,102,241,0.4)" : "none",
    };
  }

  return (
    <div ref={containerRef} className="flex justify-center">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${difficulty}, ${cellSize}px)`,
          gap: `${gap}px`,
          padding: 4,
          background: "#e5e7eb",
          borderRadius: 8,
        }}
      >
        {pieces.map((pieceId, posIndex) => (
          <div
            key={posIndex}
            style={getPieceStyle(posIndex, pieceId)}
            onClick={() => handleClick(posIndex)}
          />
        ))}
      </div>
    </div>
  );
}
