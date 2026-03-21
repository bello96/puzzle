import { useCallback, useEffect, useRef, useState } from "react";
import { getHttpBase } from "../api";

interface Props {
  roomCode: string;
  onUploaded: () => void;
}

const DIFFICULTIES = [
  { value: 3, label: "3×3 简单" },
  { value: 4, label: "4×4 普通" },
  { value: 5, label: "5×5 困难" },
  { value: 6, label: "6×6 地狱" },
];

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_OUTPUT = 600;

export default function ImageUpload({ roomCode, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  // 裁切状态
  const [rawImg, setRawImg] = useState<{
    url: string;
    el: HTMLImageElement;
    w: number;
    h: number;
  } | null>(null);
  // 裁切框（原图像素坐标）
  const [crop, setCrop] = useState({ x: 0, y: 0, size: 0 });

  function handleFile(file: File) {
    setError("");
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `图片不能超过 2MB（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`,
      );
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const shortSide = Math.min(img.width, img.height);
      // 默认最大正方形居中
      setCrop({
        x: Math.floor((img.width - shortSide) / 2),
        y: Math.floor((img.height - shortSide) / 2),
        size: shortSide,
      });
      setRawImg({ url, el: img, w: img.width, h: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError("图片加载失败");
    };
    img.src = url;
  }

  function reset() {
    if (rawImg) {
      URL.revokeObjectURL(rawImg.url);
    }
    setRawImg(null);
    setCrop({ x: 0, y: 0, size: 0 });
  }

  async function upload() {
    if (!rawImg) {
      return;
    }
    setUploading(true);
    setError("");
    try {
      const target = Math.min(MAX_OUTPUT, crop.size);
      const canvas = document.createElement("canvas");
      canvas.width = target;
      canvas.height = target;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(
        rawImg.el,
        crop.x,
        crop.y,
        crop.size,
        crop.size,
        0,
        0,
        target,
        target,
      );
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("转换失败"))),
          "image/jpeg",
          0.85,
        );
      });
      const res = await fetch(`${getHttpBase()}/api/rooms/${roomCode}/image`, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: blob,
      });
      if (!res.ok) {
        throw new Error("上传失败");
      }
      onUploaded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {rawImg ? (
        <>
          <div className="text-sm text-gray-500 mb-1">
            拖动选择拼图区域，拖角缩放
          </div>
          <CropView
            imgUrl={rawImg.url}
            imgW={rawImg.w}
            imgH={rawImg.h}
            crop={crop}
            onCropChange={setCrop}
          />
          <div className="flex gap-3">
            <button
              className="py-2.5 px-6 bg-indigo-500 text-white font-semibold rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
              disabled={uploading}
              onClick={upload}
            >
              {uploading ? "上传中..." : "确认"}
            </button>
            <button
              className="py-2.5 px-6 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
              onClick={reset}
            >
              重选
            </button>
          </div>
        </>
      ) : (
        <div
          className="w-56 h-56 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition"
          onClick={() => fileRef.current?.click()}
        >
          <div className="text-3xl text-gray-300 mb-2">📷</div>
          <div className="text-sm text-gray-400">点击选择图片</div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleFile(file);
          }
          e.target.value = "";
        }}
      />
    </div>
  );
}

export { DIFFICULTIES };

/* ── 裁切视图组件 ── */

interface CropViewProps {
  imgUrl: string;
  imgW: number;
  imgH: number;
  crop: { x: number; y: number; size: number };
  onCropChange: (c: { x: number; y: number; size: number }) => void;
}

const DISPLAY_MAX = 360;

function CropView({ imgUrl, imgW, imgH, crop, onCropChange }: CropViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 缩放到显示尺寸
  const scale = Math.min(DISPLAY_MAX / imgW, DISPLAY_MAX / imgH, 1);
  const dw = Math.round(imgW * scale);
  const dh = Math.round(imgH * scale);

  // 裁切框显示坐标
  const cx = crop.x * scale;
  const cy = crop.y * scale;
  const cs = crop.size * scale;

  const dragRef = useRef<{
    type: "move" | "resize";
    startX: number;
    startY: number;
    origCrop: { x: number; y: number; size: number };
  } | null>(null);

  const clampCrop = useCallback(
    (x: number, y: number, size: number) => {
      const s = Math.max(30 / scale, Math.min(size, imgW, imgH));
      const nx = Math.max(0, Math.min(x, imgW - s));
      const ny = Math.max(0, Math.min(y, imgH - s));
      return { x: Math.round(nx), y: Math.round(ny), size: Math.round(s) };
    },
    [imgW, imgH, scale],
  );

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) {
        return;
      }
      const dx = (e.clientX - d.startX) / scale;
      const dy = (e.clientY - d.startY) / scale;

      if (d.type === "move") {
        onCropChange(
          clampCrop(d.origCrop.x + dx, d.origCrop.y + dy, d.origCrop.size),
        );
      } else {
        // resize: 从右下角拖拽，取 dx/dy 中较大的变化量
        const delta = Math.max(dx, dy);
        const newSize = d.origCrop.size + delta;
        onCropChange(clampCrop(d.origCrop.x, d.origCrop.y, newSize));
      }
    }
    function onUp() {
      dragRef.current = null;
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [scale, clampCrop, onCropChange]);

  function startDrag(e: React.PointerEvent, type: "move" | "resize") {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      origCrop: { ...crop },
    };
  }

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{ width: dw, height: dh }}
    >
      {/* 原图 */}
      <img
        src={imgUrl}
        alt=""
        draggable={false}
        style={{ width: dw, height: dh, display: "block" }}
      />

      {/* 暗色遮罩（裁切框外） */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "rgba(0,0,0,0.45)",
          clipPath: `polygon(
            0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
            ${cx}px ${cy}px,
            ${cx}px ${cy + cs}px,
            ${cx + cs}px ${cy + cs}px,
            ${cx + cs}px ${cy}px,
            ${cx}px ${cy}px
          )`,
        }}
      />

      {/* 裁切框 */}
      <div
        className="absolute cursor-move"
        style={{
          left: cx,
          top: cy,
          width: cs,
          height: cs,
          border: "2px solid white",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
        }}
        onPointerDown={(e) => startDrag(e, "move")}
      >
        {/* 网格线 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
            backgroundSize: `${cs / 3}px ${cs / 3}px`,
          }}
        />

        {/* 四角拖拽手柄 */}
        {(["nw", "ne", "sw", "se"] as const).map((corner) => {
          const isRight = corner.includes("e");
          const isBottom = corner.includes("s");
          return (
            <div
              key={corner}
              className="absolute bg-white"
              style={{
                width: 12,
                height: 12,
                left: isRight ? "auto" : -2,
                right: isRight ? -2 : "auto",
                top: isBottom ? "auto" : -2,
                bottom: isBottom ? -2 : "auto",
                cursor:
                  corner === "se" || corner === "nw"
                    ? "nwse-resize"
                    : "nesw-resize",
                borderRadius: 2,
                boxShadow: "0 0 3px rgba(0,0,0,0.4)",
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // 只有右下角真正 resize，其他角视觉上有但统一用右下角逻辑
                dragRef.current = {
                  type: "resize",
                  startX: e.clientX,
                  startY: e.clientY,
                  origCrop: { ...crop },
                };
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
