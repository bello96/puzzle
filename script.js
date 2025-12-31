class PuzzleGame {
  constructor() {
    this.uploadInput = document.getElementById("upload");
    this.difficultySelect = document.getElementById("difficulty");
    this.startBtn = document.getElementById("start-btn");
    this.checkBtn = document.getElementById("check-btn");
    this.pieceContainer = document.getElementById("piece-container");
    this.boardContainer = document.getElementById("board-container");
    this.toast = document.getElementById("toast");

    this.image = null;
    this.pieces = [];
    this.rows = 3;
    this.cols = 3;
    this.pieceWidth = 0;
    this.pieceHeight = 0;

    // 难度配置
    this.difficulties = {
      easy: { rows: 3, cols: 3 },
      medium: { rows: 5, cols: 5 },
      hard: { rows: 8, cols: 8 },
      hell: { rows: 15, cols: 15 },
    };

    this.init();
  }

  init() {
    this.startBtn.addEventListener("click", () => this.startGame());
    this.checkBtn.addEventListener("click", () => this.checkCompletion());

    // 简单的拖拽处理 (全局)
    this.draggedPiece = null;
    this.dragStartPos = null; // 记录拖拽起始位置
    this.offsetX = 0;
    this.offsetY = 0;

    document.addEventListener("mousemove", (e) => this.onMouseMove(e));
    document.addEventListener("mouseup", (e) => this.onMouseUp(e));
  }

  showToast(message, duration = 3000) {
    this.toast.textContent = message;
    this.toast.classList.remove("hidden");

    if (this.toastTimeout) clearTimeout(this.toastTimeout);

    this.toastTimeout = setTimeout(() => {
      this.toast.classList.add("hidden");
    }, duration);
  }

  startGame() {
    const file = this.uploadInput.files[0];
    if (!file) {
      this.showToast("请先上传一张图片！");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this.image = new Image();
      this.image.onload = () => {
        this.setupGame();
        this.checkBtn.style.display = "inline-block";
      };
      this.image.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  setupGame() {
    // 清理旧游戏
    this.pieceContainer.innerHTML = "";
    this.boardContainer.innerHTML = "";
    this.pieces = [];

    // 获取难度
    const diff = this.difficulties[this.difficultySelect.value];
    this.rows = diff.rows;
    this.cols = diff.cols;

    // 计算尺寸
    // 限制最大显示尺寸，保持比例
    const maxBoardWidth = this.boardContainer.clientWidth - 40;
    const maxBoardHeight = this.boardContainer.clientHeight - 40;

    let boardWidth = this.image.width;
    let boardHeight = this.image.height;

    const scale = Math.min(
      maxBoardWidth / boardWidth,
      maxBoardHeight / boardHeight
    );
    boardWidth *= scale;
    boardHeight *= scale;

    this.pieceWidth = boardWidth / this.cols;
    this.pieceHeight = boardHeight / this.rows;

    // 创建外层容器 (用于定位)
    const boardWrapper = document.createElement("div");
    boardWrapper.style.width = `${boardWidth}px`;
    boardWrapper.style.height = `${boardHeight}px`;
    boardWrapper.style.position = "relative";
    boardWrapper.id = "board-wrapper";
    this.boardContainer.appendChild(boardWrapper);

    // 创建半透明背景层 (提示用)
    const bgLayer = document.createElement("div");
    bgLayer.style.width = "100%";
    bgLayer.style.height = "100%";
    bgLayer.style.backgroundImage = `url(${this.image.src})`;
    bgLayer.style.backgroundSize = "100% 100%";
    bgLayer.style.opacity = "0.25";
    bgLayer.style.position = "absolute";
    bgLayer.style.top = "0";
    bgLayer.style.left = "0";
    bgLayer.id = "bg-layer";
    boardWrapper.appendChild(bgLayer);

    // 创建不透明的拼块容器层 (已拼好的块放这里)
    const board = document.createElement("div");
    board.style.width = "100%";
    board.style.height = "100%";
    board.style.position = "absolute";
    board.style.top = "0";
    board.style.left = "0";
    board.id = "game-board";
    boardWrapper.appendChild(board);

    // 保存底板的绝对位置，用于吸附计算
    this.boardRect = boardWrapper.getBoundingClientRect();

    // 生成拼图形状数据
    const shapes = this.generateShapes();

    // 创建高亮网格层 (需要 shapes 数据)
    // 创建高亮网格层 (需要 shapes 数据，添加到 boardWrapper)
    this.createHighlightGrid(boardWrapper, shapes);

    // 创建拼图块
    this.createPieces(shapes, scale);
  }

  createHighlightGrid(board, shapes) {
    const container = document.createElement("div");
    container.className = "highlight-container";

    const tabSize = Math.min(this.pieceWidth, this.pieceHeight) * 0.25;
    this.highlightShapes = [];

    shapes.forEach((shape, index) => {
      const col = index % this.cols;
      const row = Math.floor(index / this.cols);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const width = this.pieceWidth + tabSize * 2;
      const height = this.pieceHeight + tabSize * 2;

      canvas.width = width;
      canvas.height = height;
      canvas.className = "highlight-shape";

      // 绘制路径（仅描边）
      ctx.save();
      ctx.translate(tabSize, tabSize);

      // 绘制黄色描边
      ctx.beginPath();
      this.drawPath(ctx, this.pieceWidth, this.pieceHeight, tabSize, shape);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255, 255, 0, 0.8)"; // 黄色高亮
      ctx.stroke();

      // 稍微填充一点黄色，增加可见度
      ctx.fillStyle = "rgba(255, 255, 0, 0.2)";
      ctx.fill();

      ctx.restore();

      // 定位
      const left = col * this.pieceWidth - tabSize;
      const top = row * this.pieceHeight - tabSize;

      canvas.style.left = `${left}px`;
      canvas.style.top = `${top}px`;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      container.appendChild(canvas);
      this.highlightShapes.push(canvas);
    });

    board.appendChild(container);
  }

  generateShapes() {
    const shapes = [];
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        let shape = {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        };

        // Top edge
        if (y === 0) shape.top = 0;
        else shape.top = -shapes[(y - 1) * this.cols + x].bottom;

        // Right edge
        if (x === this.cols - 1) shape.right = 0;
        else shape.right = Math.random() > 0.5 ? 1 : -1;

        // Bottom edge
        if (y === this.rows - 1) shape.bottom = 0;
        else shape.bottom = Math.random() > 0.5 ? 1 : -1;

        // Left edge
        if (x === 0) shape.left = 0;
        else shape.left = -shapes[y * this.cols + (x - 1)].right;

        shapes.push(shape);
      }
    }
    return shapes;
  }

  createPieces(shapes, scale) {
    const tabSize = Math.min(this.pieceWidth, this.pieceHeight) * 0.25; // 凸起的大小
    const margin = Math.ceil(tabSize) + 2; // 冗余像素，防止圆角缺失

    shapes.forEach((shape, index) => {
      const col = index % this.cols;
      const row = Math.floor(index / this.cols);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Canvas 大小需要包含凸起部分和冗余
      const width = this.pieceWidth + tabSize * 2 + margin * 2;
      const height = this.pieceHeight + tabSize * 2 + margin * 2;

      canvas.width = width;
      canvas.height = height;

      // 填充透明底色，防止边缘像素缺失
      ctx.clearRect(0, 0, width, height);

      // 绘制路径
      ctx.save();
      ctx.translate(tabSize + margin, tabSize + margin);

      this.drawPath(ctx, this.pieceWidth, this.pieceHeight, tabSize, shape);

      ctx.clip();

      // 采样区域扩大 margin，防止圆角缺失
      const srcX =
        (col * this.image.width) / this.cols - (tabSize + margin) / scale;
      const srcY =
        (row * this.image.height) / this.rows - (tabSize + margin) / scale;
      const srcW =
        this.image.width / this.cols + (tabSize * 2 + margin * 2) / scale;
      const srcH =
        this.image.height / this.rows + (tabSize * 2 + margin * 2) / scale;

      ctx.drawImage(
        this.image,
        srcX,
        srcY,
        srcW,
        srcH,
        -tabSize - margin,
        -tabSize - margin,
        width,
        height
      );

      // 描边
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.stroke();
      ctx.restore();

      // 创建 DOM 元素
      const div = document.createElement("div");
      div.className = "puzzle-piece";
      div.style.width = `${width}px`;
      div.style.height = `${height}px`;
      div.style.backgroundImage = `url(${canvas.toDataURL()})`;
      div.style.backgroundSize = "100% 100%";

      // 随机位置 (在左侧面板内)
      const maxLeft = this.pieceContainer.clientWidth - width;
      const maxTop = this.pieceContainer.clientHeight - height;
      div.style.left = `${Math.random() * maxLeft}px`;
      div.style.top = `${Math.random() * maxTop}px`;

      // 存储正确位置信息 (相对于 board)
      div.dataset.correctLeft = col * this.pieceWidth - tabSize - margin;
      div.dataset.correctTop = row * this.pieceHeight - tabSize - margin;
      div.dataset.id = index;
      div.dataset.tabSize = tabSize; // 存储 tabSize 方便后续计算

      // 绑定 canvas 引用到 div，用于像素命中检测
      div._canvasRef = canvas;
      div._canvasWidth = width;
      div._canvasHeight = height;

      // 绑定 mousedown 事件
      div.addEventListener("mousedown", (e) => this.onMouseDown(e, div));

      this.pieceContainer.appendChild(div);
      this.pieces.push(div);
    });
  }

  drawPath(ctx, w, h, tab, shape) {
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.5)";

    // Top: (0,0) -> (w,0)
    ctx.moveTo(0, 0);
    if (shape.top !== 0) {
      const dir = shape.top * -1;
      ctx.lineTo(w / 2 - tab, 0);
      ctx.bezierCurveTo(
        w / 2 - tab,
        tab * dir * 1.5,
        w / 2 + tab,
        tab * dir * 1.5,
        w / 2 + tab,
        0
      );
      ctx.lineTo(w, 0);
    } else {
      ctx.lineTo(w, 0);
    }

    // Right: (w,0) -> (w,h)
    if (shape.right !== 0) {
      const dir = shape.right;
      ctx.lineTo(w, h / 2 - tab);
      ctx.bezierCurveTo(
        w + tab * dir * 1.5,
        h / 2 - tab,
        w + tab * dir * 1.5,
        h / 2 + tab,
        w,
        h / 2 + tab
      );
      ctx.lineTo(w, h);
    } else {
      ctx.lineTo(w, h);
    }

    // Bottom: (w,h) -> (0,h)
    if (shape.bottom !== 0) {
      const dir = shape.bottom;
      ctx.lineTo(w / 2 + tab, h);
      ctx.bezierCurveTo(
        w / 2 + tab,
        h + tab * dir * 1.5,
        w / 2 - tab,
        h + tab * dir * 1.5,
        w / 2 - tab,
        h
      );
      ctx.lineTo(0, h);
    } else {
      ctx.lineTo(0, h);
    }

    // Left: (0,h) -> (0,0)
    if (shape.left !== 0) {
      const dir = shape.left * -1;
      ctx.lineTo(0, h / 2 + tab);
      ctx.bezierCurveTo(
        tab * dir * 1.5,
        h / 2 + tab,
        tab * dir * 1.5,
        h / 2 - tab,
        0,
        h / 2 - tab
      );
      ctx.lineTo(0, 0);
    } else {
      ctx.lineTo(0, 0);
    }

    ctx.closePath();
  }

  onMouseDown(e, piece) {
    if (piece.classList.contains("snapped")) return;

    e.preventDefault();
    e.stopPropagation();

    this.draggedPiece = piece;

    // 记录起始位置（相对于父容器）
    this.dragStartPos = {
      left: piece.style.left,
      top: piece.style.top,
      parent: piece.parentElement,
    };

    // 获取初始位置
    const rect = piece.getBoundingClientRect();
    this.offsetX = e.clientX - rect.left;
    this.offsetY = e.clientY - rect.top;

    // 提高 z-index
    this.maxZIndex = (this.maxZIndex || 100) + 1;
    piece.style.zIndex = this.maxZIndex;
  }

  onMouseMove(e) {
    if (!this.draggedPiece) return;

    e.preventDefault();

    const piece = this.draggedPiece;
    const parent = piece.parentElement;
    const parentRect = parent.getBoundingClientRect();

    // 计算相对于父容器的位置
    let newLeft = e.clientX - this.offsetX - parentRect.left;
    let newTop = e.clientY - this.offsetY - parentRect.top;

    piece.style.left = `${newLeft}px`;
    piece.style.top = `${newTop}px`;

    // 高亮检测
    this.updateHighlight(e.clientX, e.clientY);
  }

  updateHighlight(mouseX, mouseY) {
    if (!this.boardRect || !this.highlightShapes) return;

    const boardWrapper = document.getElementById("board-wrapper");
    if (!boardWrapper) return;
    this.boardRect = boardWrapper.getBoundingClientRect();

    // 检查鼠标是否在 board 范围内
    if (
      mouseX >= this.boardRect.left &&
      mouseX <= this.boardRect.right &&
      mouseY >= this.boardRect.top &&
      mouseY <= this.boardRect.bottom
    ) {
      const relativeX = mouseX - this.boardRect.left;
      const relativeY = mouseY - this.boardRect.top;

      const col = Math.floor(relativeX / this.pieceWidth);
      const row = Math.floor(relativeY / this.pieceHeight);
      const index = row * this.cols + col;

      // 移除所有高亮，添加当前高亮
      this.highlightShapes.forEach((shape, i) => {
        shape.classList.toggle("active", i === index);
      });
    } else {
      this.highlightShapes.forEach((shape) => shape.classList.remove("active"));
    }
  }

  onMouseUp(e) {
    if (!this.draggedPiece) return;

    const piece = this.draggedPiece;
    this.draggedPiece = null;

    // 移除所有高亮
    if (this.highlightShapes) {
      this.highlightShapes.forEach((shape) => shape.classList.remove("active"));
    }

    const currentRect = piece.getBoundingClientRect();
    const currentX = currentRect.left;
    const currentY = currentRect.top;

    // 检查是否能吸附到右侧拼图区
    let snapped = false;
    if (this.boardRect) {
      const boardWrapper = document.getElementById("board-wrapper");
      const board = document.getElementById("game-board");
      if (boardWrapper && board) {
        this.boardRect = boardWrapper.getBoundingClientRect();

        const targetX =
          this.boardRect.left + parseFloat(piece.dataset.correctLeft);
        const targetY =
          this.boardRect.top + parseFloat(piece.dataset.correctTop);

        const dist = Math.sqrt(
          Math.pow(targetX - currentX, 2) + Math.pow(targetY - currentY, 2)
        );

        const threshold = Math.min(this.pieceWidth, this.pieceHeight) / 2;

        if (dist < threshold) {
          // 吸附成功
          piece.style.position = "absolute";
          piece.style.left = parseFloat(piece.dataset.correctLeft) + "px";
          piece.style.top = parseFloat(piece.dataset.correctTop) + "px";
          piece.classList.add("snapped");
          board.appendChild(piece);
          snapped = true;
        }
      }
    }

    // 没吸附，放回左侧容器
    if (!snapped) {
      const containerRect = this.pieceContainer.getBoundingClientRect();

      let newLeft = currentX - containerRect.left;
      let newTop = currentY - containerRect.top;

      // 边界限制
      const pw = piece.offsetWidth;
      const ph = piece.offsetHeight;
      newLeft = Math.max(
        -pw * 0.5,
        Math.min(containerRect.width - pw * 0.5, newLeft)
      );
      newTop = Math.max(
        -ph * 0.5,
        Math.min(containerRect.height - ph * 0.5, newTop)
      );

      piece.style.position = "absolute";
      piece.style.left = newLeft + "px";
      piece.style.top = newTop + "px";
      this.pieceContainer.appendChild(piece);
    }
  }

  resetPiecePosition(piece) {
    // 简单的动画效果回到原位
    piece.style.transition = "all 0.3s ease-out";
    piece.style.position = "absolute"; // 确保是 absolute

    // 如果之前是在 pieceContainer 里，需要确保它还在那里
    if (this.dragStartPos.parent === this.pieceContainer) {
      this.pieceContainer.appendChild(piece);
      // 强制重绘以应用 transition
      requestAnimationFrame(() => {
        piece.style.left = this.dragStartPos.left;
        piece.style.top = this.dragStartPos.top;
      });
    } else {
      // 如果是从 board 拖出来的（虽然 snapped 后不能拖，但为了健壮性）
      // 或者其他情况
      piece.style.left = this.dragStartPos.left;
      piece.style.top = this.dragStartPos.top;
    }

    // 动画结束后清除 transition，以免影响下次拖拽
    setTimeout(() => {
      piece.style.transition = "";
    }, 300);
  }

  checkCompletion() {
    const snapped = document.querySelectorAll(".snapped");
    if (snapped.length === this.pieces.length) {
      this.celebrate();
    } else {
      const remaining = this.pieces.length - snapped.length;
      this.showToast(`还差 ${remaining} 块拼图未完成，加油！`);
    }
  }

  celebrate() {
    this.showToast("🎉 恭喜你！拼图完成！🎉", 6000);

    const random = (min, max) => Math.random() * (max - min) + min;

    // 第一波：大型中央爆炸
    confetti({
      particleCount: 150,
      spread: 100,
      origin: { x: 0.5, y: 0.5 },
      startVelocity: 45,
      ticks: 300,
      zIndex: 2000,
      colors: [
        "#ff0000",
        "#ff7700",
        "#ffff00",
        "#00ff00",
        "#0077ff",
        "#9900ff",
      ],
    });

    // 第二波：两侧烟花
    setTimeout(() => {
      confetti({
        particleCount: 80,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        startVelocity: 60,
        ticks: 200,
        zIndex: 2000,
        colors: ["#FFD700", "#FFA500", "#FF6347"],
      });
      confetti({
        particleCount: 80,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        startVelocity: 60,
        ticks: 200,
        zIndex: 2000,
        colors: ["#FFD700", "#FFA500", "#FF6347"],
      });
    }, 300);

    // 第三波：星星和圆形彩屑
    setTimeout(() => {
      confetti({
        particleCount: 50,
        spread: 360,
        origin: { x: 0.5, y: 0.3 },
        shapes: ["star"],
        scalar: 1.5,
        ticks: 250,
        zIndex: 2000,
        colors: ["#FFD700", "#FFFFFF", "#FF69B4"],
      });
      confetti({
        particleCount: 50,
        spread: 360,
        origin: { x: 0.5, y: 0.3 },
        shapes: ["circle"],
        scalar: 1.2,
        ticks: 250,
        zIndex: 2000,
        colors: ["#00CED1", "#7FFFD4", "#98FB98"],
      });
    }, 600);

    // 持续烟花效果
    const duration = 5000;
    const animationEnd = Date.now() + duration;
    const defaults = {
      startVelocity: 35,
      spread: 360,
      ticks: 100,
      zIndex: 2000,
    };

    const interval = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 30 * (timeLeft / duration);

      // 从多个位置发射
      confetti(
        Object.assign({}, defaults, {
          particleCount,
          origin: { x: random(0.1, 0.3), y: random(0.2, 0.5) },
          colors: ["#ff0000", "#ffa500", "#ffff00"],
        })
      );
      confetti(
        Object.assign({}, defaults, {
          particleCount,
          origin: { x: random(0.7, 0.9), y: random(0.2, 0.5) },
          colors: ["#00ff00", "#00ffff", "#0000ff"],
        })
      );
      confetti(
        Object.assign({}, defaults, {
          particleCount: particleCount / 2,
          origin: { x: 0.5, y: random(0.1, 0.4) },
          colors: ["#ff69b4", "#ff1493", "#9400d3"],
        })
      );
    }, 200);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  new PuzzleGame();
});
