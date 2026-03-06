# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Kortana** is an AI marketing agent platform — a full-stack monorepo where AI agents help founders articulate and promote their products. Agents write SEO blogs, tweet threads, investor pitches, and marketing campaigns using the **x402 HTTP 402 micropayment protocol** on the **Creditcoin EVM Testnet** (CTC).

## Commands

### Root (runs all workspaces)
```bash
npm run install:all     # Install all workspace dependencies
npm run dev             # Run backend + frontend concurrently
npm run dev:backend     # Backend only (port 4002)
npm run dev:frontend    # Frontend only (port 3000)
npm run dev:agent       # CLI agent
npm run test:client     # Agent test suite
```

### Backend (`cd backend`)
```bash
npm run dev     # tsx watch with hot reload
npm run build   # tsc compilation
npm start       # Run compiled dist
```

### Frontend (`cd frontend`)
```bash
npm run dev     # Next.js dev server
npm run build   # Production build
npm run lint    # ESLint
```

### Agent (`cd agent`)
```bash
npm start                   # Run CLI agent
npm run test:client         # Run test suite
npm run build               # tsc compilation
```

## Architecture

### Monorepo Structure
- `backend/` — Express.js server (port 4002), TypeScript
- `frontend/` — Next.js 16 + React 19 dashboard (port 3000)
- `agent/` — Standalone CLI agent (TypeScript)
- `contracts/` — Solidity smart contract (`AgentRegistry.sol`)

### Request Flow
1. User submits query via `AgentChat.tsx` (frontend)
2. `POST /api/agent/query` → Backend Manager Agent
3. Manager LLM (Groq primary, Gemini fallback) routes to the best marketing agent
4. Backend wraps worker calls with x402 payment middleware (HTTP 402 → CTC payment → 200)
5. Results stream back to frontend via SSE (`GET /api/agent/events`)
6. `EconomyGraph.tsx` visualizes payment topology via Canvas API in real-time

### Backend (`backend/src/index.ts`)
Single file containing:
- Express app + middleware setup
- Custom CTC x402 payment middleware (HTTP 402 challenge, CTC verification stub)
- Manager Agent orchestration logic with Groq/Gemini LLM integration
- 7 paid marketing agent endpoints (see table below)
- Free endpoints: `/api/tools`, `/api/registry`, `/api/payments`, `/api/stats`, `/api/agent/events` (SSE)
- `universal-adapter.ts` handles external partner agents (canva-connect, analytics-agent)

### Marketing Agents

| Agent | Endpoint | Price (CTC) | Description |
|-------|----------|-------------|-------------|
| SEO Blog Writer | POST /api/seo-blog | 0.005 CTC | Full SEO-optimized blog post |
| Twitter Thread Writer | POST /api/twitter-thread | 0.003 CTC | Numbered tweet thread |
| Tweet Updates Writer | POST /api/tweet-update | 0.001 CTC | Single punchy tweet |
| Infographics Maker | POST /api/infographic-prompt | 0.002 CTC | Infographic copy and layout |
| Marketing Campaign Maker | POST /api/marketing-campaign | 0.008 CTC | Multi-channel campaign brief |
| UGC AI Video Prompt Maker | POST /api/ugc-video-prompt | 0.004 CTC | UGC video script and creator brief |
| Pitch Maker | POST /api/pitch | 0.006 CTC | Investor pitch and product one-pager |

### Smart Contract (`contracts/AgentRegistry.sol`)
Solidity contract for Creditcoin EVM:
- Agent registration (name, endpoint, priceCTC, category)
- Job lifecycle: pending → complete/failed
- Basic reputation scoring in basis points (0–10,000): +50 success, -100 failure
- CTC escrow management

### Agent CLI (`agent/src/agent.ts`)
Autonomous CLI agent that:
- Discovers tools via registry introspection
- Plans tasks via LLM (Groq → Gemini fallback)
- Routes to marketing agents based on CTC price and reputation efficiency score
- Executes x402 CTC payments

### Frontend (`frontend/src/`)
- App Router pages: `/` (dashboard), `/agents`, `/tools`, `/docs`
- Key components: `AgentChat.tsx` (SSE streaming), `EconomyGraph.tsx` (Canvas topology), `ProtocolTrace.tsx` (raw 402 headers), `TransactionLog.tsx`
- Language context in `lib/i18n.ts` + `lib/LanguageContext.tsx`
- EVM wallet connect via `ConnectWalletButton.tsx` (MetaMask + Creditcoin testnet)

## Environment Variables

**Backend** (copy `backend/.env.example`):
- `PORT=4002`, `HOST=0.0.0.0`
- `NETWORK=creditcoin-testnet`, `CHAIN_ID=102031`
- `RPC_URL=https://rpc.cc3-testnet.creditcoin.network`
- `SERVER_ADDRESS` — EVM address receiving payments (0x... format)
- `TOKEN=CTC`
- `GROQ_API_KEY`, `GEMINI_API_KEY` (fallback)

**Agent** (copy `.env.example` in root):
- `AGENT_PRIVATE_KEY`, `AGENT_SERVER_URL=http://localhost:4002`
- `GROQ_API_KEY`, `GEMINI_API_KEY`, `NETWORK=creditcoin-testnet`

**Frontend**:
- `NEXT_PUBLIC_API_URL` — Backend URL (defaults to `https://kortana.onrender.com`)
- `NEXT_PUBLIC_SERVER_ADDRESS` — EVM address for WalletInfo display

## Creditcoin Testnet Config
- Chain ID: `102031`
- RPC: `https://rpc.cc3-testnet.creditcoin.network`
- Explorer: `https://creditcoin-testnet.blockscout.com`
- Native token: CTC
- Wallet: MetaMask (any EVM-compatible wallet)

## Key Patterns

- **x402 Protocol**: HTTP 402 payment-required gates all paid endpoints; the middleware intercepts, returns CTC payment challenge, then forwards to handler
- **LLM Fallback**: Groq (`llama-3.3-70b`) is primary; Gemini 2.0 Flash is fallback for all planning calls
- **Marketing Focus**: All agents are specialized for founder marketing needs — no A2A recursive hiring
- **External Agents**: `universal-adapter.ts` supports Canva Connect and Analytics Agent partner integrations
- **localStorage key**: `kortana_client_id` (was `synergi_client_id`)
