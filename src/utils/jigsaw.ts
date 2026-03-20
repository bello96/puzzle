/**
 * 拼图形状生成与渲染工具
 * 生成经典锯齿形拼图块（凸凹连接）
 */

export type EdgeDir = -1 | 0 | 1; // -1=凹, 0=平(边缘), 1=凸

export interface PieceEdges {
  top: EdgeDir;
  right: EdgeDir;
  bottom: EdgeDir;
  left: EdgeDir;
}

/** 凸出部分占边长的比例（用于计算包围盒） */
export const TAB_RATIO = 0.20;

/**
 * 在 canvas 上绘制一条拼图边。
 * 从 (x0,y0) 画到 (x1,y1)，dir 控制凸凹。
 * 路径遵循顺时针方向，"外侧"为行进方向左侧。
 */
export function drawJigsawEdge(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dir: EdgeDir,
) {
  if (dir === 0) {
    ctx.lineTo(x1, y1);
    return;
  }

  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);

  // 沿边方向的单位向量
  const ux = dx / len;
  const uy = dy / len;
  // 顺时针路径的外法线（行进方向左侧）
  const nx = uy;
  const ny = -ux;

  const t = dir; // 1=凸(外), -1=凹(内)

  // 辅助函数：沿边 p(0-1) 处偏移法线方向 h 的点
  const px = (p: number, h: number) => x0 + ux * len * p + nx * len * h * t;
  const py = (p: number, h: number) => y0 + uy * len * p + ny * len * h * t;

  // ── 颈部入口 ──
  ctx.lineTo(px(0.38, 0), py(0.38, 0));
  ctx.bezierCurveTo(
    px(0.40, 0),
    py(0.40, 0),
    px(0.45, 0.01),
    py(0.45, 0.01),
    px(0.45, 0.08),
    py(0.45, 0.08),
  );

  // ── 凸块头部左弧 ──
  ctx.bezierCurveTo(
    px(0.45, 0.14),
    py(0.45, 0.14),
    px(0.38, TAB_RATIO),
    py(0.38, TAB_RATIO),
    px(0.50, TAB_RATIO),
    py(0.50, TAB_RATIO),
  );

  // ── 凸块头部右弧 ──
  ctx.bezierCurveTo(
    px(0.62, TAB_RATIO),
    py(0.62, TAB_RATIO),
    px(0.55, 0.14),
    py(0.55, 0.14),
    px(0.55, 0.08),
    py(0.55, 0.08),
  );

  // ── 颈部出口 ──
  ctx.bezierCurveTo(
    px(0.55, 0.01),
    py(0.55, 0.01),
    px(0.60, 0),
    py(0.60, 0),
    px(0.62, 0),
    py(0.62, 0),
  );

  ctx.lineTo(x1, y1);
}

/**
 * 绘制一块拼图的完整路径（顺时针）
 * 坐标在原图空间中
 */
export function drawPiecePath(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  pieceW: number,
  pieceH: number,
  edges: PieceEdges,
) {
  const x = col * pieceW;
  const y = row * pieceH;

  ctx.beginPath();
  ctx.moveTo(x, y);
  // 上边：左→右
  drawJigsawEdge(ctx, x, y, x + pieceW, y, edges.top);
  // 右边：上→下
  drawJigsawEdge(ctx, x + pieceW, y, x + pieceW, y + pieceH, edges.right);
  // 下边：右→左
  drawJigsawEdge(ctx, x + pieceW, y + pieceH, x, y + pieceH, edges.bottom);
  // 左边：下→上
  drawJigsawEdge(ctx, x, y + pieceH, x, y, edges.left);
  ctx.closePath();
}

/**
 * 渲染单块拼图的 canvas
 * 返回 canvas 以及相对于基础矩形左上角的偏移
 */
export function renderPieceCanvas(
  image: HTMLImageElement,
  n: number,
  row: number,
  col: number,
  edges: PieceEdges,
  boardSize: number,
): { canvas: HTMLCanvasElement; offsetX: number; offsetY: number } {
  const pieceSize = boardSize / n;
  const tabSize = pieceSize * TAB_RATIO;

  // 凸出方向需要额外空间
  const extTop = edges.top === 1 ? tabSize : 0;
  const extRight = edges.right === 1 ? tabSize : 0;
  const extBottom = edges.bottom === 1 ? tabSize : 0;
  const extLeft = edges.left === 1 ? tabSize : 0;

  const canvasW = Math.ceil(pieceSize + extLeft + extRight);
  const canvasH = Math.ceil(pieceSize + extTop + extBottom);

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d")!;

  // 平移坐标：让拼图路径（原图空间）映射到 canvas
  ctx.save();
  ctx.translate(extLeft - col * pieceSize, extTop - row * pieceSize);

  // 裁切路径
  drawPiecePath(ctx, col, row, pieceSize, pieceSize, edges);
  ctx.clip();

  // 绘制原图（缩放到 boardSize）
  ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, boardSize, boardSize);
  ctx.restore();

  // 描边
  ctx.save();
  ctx.translate(extLeft - col * pieceSize, extTop - row * pieceSize);
  drawPiecePath(ctx, col, row, pieceSize, pieceSize, edges);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  return {
    canvas,
    offsetX: -extLeft,
    offsetY: -extTop,
  };
}

/**
 * 渲染拼图区域的背景轮廓（模糊底图+拼图网格线）
 */
export function renderBoardOutline(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  n: number,
  allEdges: PieceEdges[][],
  boardSize: number,
) {
  const pieceSize = boardSize / n;

  // 模糊底图
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.filter = "blur(3px)";
  ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, boardSize, boardSize);
  ctx.restore();

  // 拼图轮廓线
  ctx.save();
  ctx.strokeStyle = "rgba(99, 102, 241, 0.3)";
  ctx.lineWidth = 1.5;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      drawPiecePath(ctx, c, r, pieceSize, pieceSize, allEdges[r]![c]!);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * 将服务端 edges 数据 (number[][][]) 反序列化为 PieceEdges[][]
 */
export function deserializeEdges(data: number[][][]): PieceEdges[][] {
  return data.map((row) =>
    row.map(([top, right, bottom, left]) => ({
      top: top as EdgeDir,
      right: right as EdgeDir,
      bottom: bottom as EdgeDir,
      left: left as EdgeDir,
    })),
  );
}
