# 🧩 拼图对战

一个双人在线拼图对战游戏。一位玩家上传图片出题，另一位玩家将打乱的拼图块拖拽还原。

**在线体验**: [puzzle.dengjiabei.cn](https://puzzle.dengjiabei.cn)

## 功能特性

- **双人对战** — 房间制，一人出题一人拼图，实时同步
- **不规则拼图** — 经典锯齿形拼图块（凸凹连接），贝塞尔曲线生成
- **拖拽交互** — 鼠标/触摸拖拽拼图块，正确位置自动吸附，错误位置红色提示
- **难度选择** — 3×3 / 4×4 / 5×5 / 6×6 四档难度
- **图片裁切** — 上传后可自由裁切选择拼图区域，支持拖拽移动和缩放
- **实时聊天** — 内置聊天面板，可展开收起
- **断线重连** — WebSocket 心跳保活 + 自动重连，刷新页面恢复游戏状态
- **响应式布局** — 大屏小屏等比例适配，拼图槽与棋盘始终等宽

## 技术架构

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 样式方案 | Twind (Tailwind CSS-in-JS) |
| 构建工具 | Vite 6 |
| 后端运行时 | Cloudflare Workers |
| 状态管理 | Cloudflare Durable Objects |
| 实时通信 | WebSocket (Hibernatable) |
| 前端部署 | Cloudflare Pages |
| 后端部署 | Cloudflare Workers |
| CI/CD | GitHub Actions |

## 项目结构

```
puzzle/
├── src/                          # 前端源码
│   ├── main.tsx                  # 入口，Twind 配置
│   ├── App.tsx                   # 路由，房间会话管理
│   ├── api.ts                    # API/WebSocket 地址管理
│   ├── pages/
│   │   ├── Home.tsx              # 首页（创建/加入房间）
│   │   └── Room.tsx              # 游戏房间主页面
│   ├── components/
│   │   ├── PuzzleBoard.tsx       # 拼图面板（拖拽交互）
│   │   ├── ImageUpload.tsx       # 图片上传 + 裁切
│   │   ├── PlayerBar.tsx         # 顶部玩家状态栏
│   │   ├── ChatPanel.tsx         # 聊天面板
│   │   └── Confetti.tsx          # 完成庆祝动画
│   ├── hooks/
│   │   └── useWebSocket.ts       # WebSocket 连接管理（心跳/重连）
│   ├── utils/
│   │   └── jigsaw.ts             # 拼图形状生成与渲染
│   └── types/
│       └── protocol.ts           # 前后端通信协议类型
├── worker/                       # 后端源码
│   ├── src/
│   │   ├── index.ts              # Worker 入口，HTTP 路由
│   │   └── room.ts               # PuzzleRoom Durable Object
│   ├── wrangler.toml             # Worker 部署配置
│   └── package.json
├── .github/workflows/            # CI/CD
│   ├── deploy-pages.yml          # 前端自动部署
│   └── deploy-worker.yml         # 后端自动部署
└── package.json
```

## 游戏流程

1. **创建房间** — 玩家 A 输入昵称，创建房间，分享房间号给好友
2. **加入房间** — 玩家 B 输入房间号或打开分享链接加入
3. **上传图片** — 出题者上传图片，支持裁切选择拼图区域
4. **预览确认** — 出题者选择难度，预览打乱效果，点击确认开始
5. **拼图对战** — 拼图者从左侧散落区拖拽拼图块到右侧棋盘，正确位置自动吸附
6. **完成/放弃** — 拼图完成后展示用时和步数；拼图者可随时放弃
7. **再来一局** — 出题者可重新上传图片或换人出题

## 本地开发

### 前端

```bash
npm install --legacy-peer-deps
npm run dev
```

前端默认连接线上 Worker（`.env.development` 配置）。

### 后端

```bash
cd worker
npm install
npm run dev          # 本地开发（需要 wrangler 支持）
npm run deploy       # 部署到 Cloudflare
```

### 构建

```bash
npm run build        # 前端构建到 dist/
```

## 部署

推送到 `master` 分支后 GitHub Actions 自动部署：

- 前端变更 → Cloudflare Pages
- `worker/` 目录变更 → Cloudflare Workers

### 手动部署

```bash
# 前端
npm run build
cd worker && npx wrangler pages deploy ../dist --project-name=puzzle

# 后端
cd worker && npx wrangler deploy
```

## 通信协议

### Client → Server

| 消息类型 | 说明 |
|----------|------|
| `join` | 加入房间（含昵称和 playerId） |
| `confirmStart` | 出题者确认开始拼图 |
| `shuffle` | 重新打乱（指定难度） |
| `movePiece` | 移动拼图块（含坐标） |
| `giveUp` | 拼图者放弃 |
| `chat` | 发送聊天消息 |
| `transfer` | 转让出题者角色 |
| `playAgain` | 再来一局 |
| `leave` | 离开房间 |
| `ping` | 心跳保活 |

### Server → Client

| 消息类型 | 说明 |
|----------|------|
| `roomState` | 完整房间状态（加入/重连时） |
| `playerJoined` | 玩家加入 |
| `playerLeft` | 玩家离开 |
| `imageUploaded` | 图片上传完成 |
| `shuffled` | 拼图已打乱（含碎片位置和边缘数据） |
| `pieceMoved` | 拼图块移动结果（含吸附判定） |
| `solved` | 拼图完成 |
| `phaseChange` | 游戏阶段变化 |
| `chat` | 聊天消息 |
| `roomClosed` | 房间关闭 |
| `error` | 错误信息 |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_BASE` | API 基础地址 | `https://puzzle.dengjiabei.cn` |

## Cloudflare 配置

- **Pages 项目**: `puzzle`
- **Worker 名称**: `puzzle-worker`
- **自定义域名**: `puzzle.dengjiabei.cn`
- **Durable Object**: `PuzzleRoom`（SQLite 存储）

### GitHub Secrets

| Secret | 说明 |
|--------|------|
| `CF_API_TOKEN` | Cloudflare API Token |
| `CF_ACCOUNT_ID` | Cloudflare Account ID |
