# Kortana — Frontend

Next.js 16 + React 19 dashboard for the Kortana AI marketing agent platform.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — wallet connect entry point |
| `/dashboard` | Main app — agent chat, economy graph, transaction log |
| `/agents` | Agent roster with status and pricing |
| `/tools` | Tool catalog from live `/api/tools` registry |

## Key Components

```mermaid
flowchart LR
    LP[Landing Page\npage.tsx] -->|wallet connect| DB[Dashboard\ndashboard/page.tsx]

    DB --> AC[AgentChat\nSSE consumer]
    DB --> EG[EconomyGraph\nCanvas topology]
    DB --> PT[ProtocolTrace\nx402 headers + hiring logs]
    DB --> TL[TransactionLog\nCTC payment history]

    AC -->|POST /api/agent/query| BE[(Backend\n:4002)]
    BE -->|SSE /api/agent/events| AC
```

## Dev

```bash
cd frontend
npm run dev     # Next.js dev server on port 3000
npm run build   # Production build
npm run lint    # ESLint
```

## Environment

```bash
NEXT_PUBLIC_API_URL=http://localhost:4002          # Backend URL
NEXT_PUBLIC_SERVER_ADDRESS=0x...                   # CTC receiving address (display only)
```

Defaults to `https://kortana.onrender.com` if `NEXT_PUBLIC_API_URL` is not set.
