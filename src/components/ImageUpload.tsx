import { useRef, useState } from "react";
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

/** 将图片裁剪为正方形并缩放到目标尺寸 */
function processImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      const target = Math.min(600, size);
      const canvas = document.createElement("canvas");
      canvas.width = target;
      canvas.height = target;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, target, target);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("转换失败"))),
        "image/jpeg",
        0.8
      );
    };
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = url;
  });
}

export default function ImageUpload({ roomCode, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const blobRef = useRef<Blob | null>(null);

  async function handleFile(file: File) {
    setError("");
    try {
      const blob = await processImage(file);
      blobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setPreview(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function upload() {
    if (!blobRef.current) {
      return;
    }
    setUploading(true);
    setError("");
    try {
      const res = await fetch(`${getHttpBase()}/api/rooms/${roomCode}/image`, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: blobRef.current,
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
        <div className="text-red-500 text-sm bg-red-50 px-3 py-1.5 rounded-lg">
          {error}
        </div>
      )}

      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="预览"
            className="w-64 h-64 object-cover rounded-xl shadow-md"
          />
          <button
            className="absolute top-2 right-2 bg-black/50 text-white w-6 h-6 rounded-full text-xs hover:bg-black/70"
            onClick={() => {
              setPreview(null);
              blobRef.current = null;
            }}
          >
            ×
          </button>
        </div>
      ) : (
        <div
          className="w-64 h-64 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-indigo-50/50 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <div className="text-4xl text-gray-300 mb-2">+</div>
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

      {!preview && (
        <button
          className="text-sm text-primary hover:underline"
          onClick={() => fileRef.current?.click()}
        >
          选择图片
        </button>
      )}

      {preview && (
        <button
          className="bg-primary text-white rounded-lg px-6 py-2 font-medium hover:bg-primary-dark disabled:opacity-50"
          disabled={uploading}
          onClick={upload}
        >
          {uploading ? "上传中..." : "确认上传"}
        </button>
      )}
    </div>
  );
}

export { DIFFICULTIES };
