# Yield Desk

一个 `Vite + React + TypeScript + Express` 项目，用本地 server 聚合各交易所官方 `earn` API，再把结果统一展示到一个列表页。

## 架构

- 前端：`src/`
- 服务端：`server/`
- 前端只请求本地接口：`/api/earn`
- 服务端后台定时同步各交易所官方接口
- 用户请求默认只读本地快照，不在每次请求时现抓所有源

## 当前接入情况

- `Bybit`
  官方 `GET /v5/earn/product`，公开可读
- `Gate`
  官方 `GET /earn/uni/currencies`、`GET /earn/uni/rate`、`GET /earn/fixed-term/product`、`GET /earn/staking/coins`，公开可读
- `Binance`
  官方 `Simple Earn` 私有接口，已写签名适配，需要 API Key
- `Bitget`
  官方 `Savings` 私有接口，已写签名适配，需要 API Key / Secret / Passphrase
- `OKX`
  官方 `On-chain Earn` 私有接口，已写签名适配，需要 API Key / Secret / Passphrase
- `MEXC / HTX / OSL`
  公开官方文档里没有找到能直接列 `earn` 产品的接口，当前标记为未接入

## 本地开发

```bash
npm install
npm run dev
```

启动后会同时跑：

- 前端：`http://localhost:5173`
- 服务端：`http://localhost:3001`

Vite 已经把 `/api` 代理到本地 server。

## 同步方式

服务端现在采用：

- 定时同步
- 本地 JSON 快照
- 前端读取快照

默认配置：

- 同步间隔：`5 分钟`
- 快照路径：`runtime/earn-feed.json`

可以通过环境变量修改：

```bash
FEED_SYNC_INTERVAL_MS=300000
FEED_SNAPSHOT_PATH=runtime/earn-feed.json
```

## 环境变量

复制一份：

```bash
cp .env.example .env
```

按需填写私有接口凭证：

```bash
FEED_SYNC_INTERVAL_MS=300000
FEED_SNAPSHOT_PATH=runtime/earn-feed.json

BINANCE_API_KEY=
BINANCE_API_SECRET=

BITGET_API_KEY=
BITGET_API_SECRET=
BITGET_PASSPHRASE=

OKX_API_KEY=
OKX_API_SECRET=
OKX_PASSPHRASE=
```

没填也可以启动，只是对应交易所会在页面里显示为“缺少凭证”。

## 构建

```bash
npm run build
```

这会同时产出：

- 前端静态文件：`dist/`
- 服务端构建：`server-dist/`

## 运行生产服务

```bash
npm run start
```

## 主要文件

- `server/index.ts`: Express 入口
- `server/feed.ts`: 聚合各交易所结果
- `server/feed-store.ts`: 定时同步和本地快照管理
- `server/exchanges/*.ts`: 各交易所适配器
- `src/App.tsx`: 列表页和筛选交互
- `src/lib/campaigns.ts`: 前端请求本地 `/api/earn`
