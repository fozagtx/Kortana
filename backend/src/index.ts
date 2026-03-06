/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Kortana — Marketing Agent Platform
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A production-grade backend that implements:
 *   - x402 payment-gated endpoints (CTC — Creditcoin EVM Testnet)
 *   - 7 real LLM-powered marketing agents for founders
 *   - Real-time SSE for live dashboard updates
 *   - Protocol transparency (raw 402 headers)
 *   - LLM-powered autonomous task planning (Groq + Gemini fallback)
 *
 * Endpoints (Paid):
 *   POST /api/seo-blog            — SEO Blog Writer          (0.005 CTC)
 *   POST /api/twitter-thread      — Twitter Thread Writer     (0.003 CTC)
 *   POST /api/tweet-update        — Tweet Updates Writer      (0.001 CTC)
 *   POST /api/infographic-prompt  — Infographics Maker        (0.002 CTC)
 *   POST /api/marketing-campaign  — Marketing Campaign Maker  (0.008 CTC)
 *   POST /api/ugc-video-prompt    — UGC AI Video Prompt Maker (0.004 CTC)
 *   POST /api/pitch               — Pitch Maker               (0.006 CTC)
 *
 * Endpoints (Free):
 *   GET  /health                — Server health
 *   GET  /api/tools             — Tool discovery for agents
 *   GET  /api/registry          — Agent registry
 *   GET  /api/payments          — Payment log
 *   GET  /api/stats             — Platform statistics
 *   GET  /api/agent/events      — SSE stream
 *   POST /api/agent/query       — Manager agent orchestration
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import axios from 'axios';
import { ethers } from 'ethers';
import { EXTERNAL_AGENTS, callExternalAgent } from './universal-adapter.js';

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

dotenv.config();

const PORT = parseInt(process.env.PORT || '4002', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NETWORK = process.env.NETWORK || 'creditcoin-testnet';
const CHAIN_ID = process.env.CHAIN_ID || '102031';
const RPC_URL = process.env.RPC_URL || 'https://rpc.cc3-testnet.creditcoin.network';
const SERVER_ADDRESS = process.env.SERVER_ADDRESS || '0x0000000000000000000000000000000000000000';
const EXPLORER_BASE = 'https://creditcoin-testnet.blockscout.com';
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || '';

// ═══════════════════════════════════════════════════════════════════════════
// EVM Wallet — real on-chain CTC payments
// ═══════════════════════════════════════════════════════════════════════════

const evmProvider = new ethers.JsonRpcProvider(RPC_URL);
const agentWallet = AGENT_PRIVATE_KEY
  ? new ethers.Wallet(AGENT_PRIVATE_KEY.startsWith('0x') ? AGENT_PRIVATE_KEY : `0x${AGENT_PRIVATE_KEY}`, evmProvider)
  : null;

if (agentWallet) {
  console.log(`[WALLET] Agent wallet: ${agentWallet.address}`);
} else {
  console.warn('[WALLET] No AGENT_PRIVATE_KEY set — CTC payments will fail');
}

async function sendCTCPayment(toAddress: string, amountCTC: number): Promise<string> {
  if (!agentWallet) throw new Error('Agent wallet not configured');
  const amountWei = ethers.parseEther(amountCTC.toFixed(18));
  const tx = await agentWallet.sendTransaction({
    to: toAddress,
    value: amountWei,
  });
  console.log(`[PAYMENT] Sent ${amountCTC} CTC → ${toAddress} | txHash: ${tx.hash}`);
  await tx.wait(1);
  return tx.hash;
}

// ═══════════════════════════════════════════════════════════════════════════
// Express App
// ═══════════════════════════════════════════════════════════════════════════

const app = express();

// AI Clients
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  exposedHeaders: ['X-Payment-Response', 'Payment-Response', 'X-402-Version', 'WWW-Authenticate'],
}));
app.use(morgan('short'));
app.use(express.json({ limit: '2mb' }));

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface PaymentLog {
  id: string;
  timestamp: string;
  endpoint: string;
  payer: string;
  worker: string;
  transaction: string;
  token: string;
  amount: string;
  explorerUrl: string;
  isA2A: boolean;
  parentJobId?: string;
  depth: number;
  rawHeaders?: Record<string, string>;
  metadata?: any;
}

interface AgentRegistryEntry {
  id: string;
  name: string;
  description: string;
  address: string;
  endpoint: string;
  category: string;
  priceCTC: number;
  reputation: number;
  jobsCompleted: number;
  jobsFailed: number;
  totalEarned: number;
  isActive: boolean;
  efficiency: number;
}

interface PriceConfig {
  ctcAmount: number;
  description: string;
  category: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// State — Payment Logs + Agent Registry
// ═══════════════════════════════════════════════════════════════════════════

const paymentLogs: PaymentLog[] = [];
let paymentIdCounter = 0;

const agentRegistry: AgentRegistryEntry[] = [
  // External partner agents
  ...EXTERNAL_AGENTS.map(ext => ({
    id: ext.id,
    name: ext.name,
    description: ext.description,
    address: '0x0000000000000000000000000000000000000001',
    endpoint: `/api/adapter/external/${ext.id}`,
    category: ext.category,
    priceCTC: ext.price.amount,
    reputation: ext.reputation,
    jobsCompleted: 0,
    jobsFailed: 0,
    totalEarned: 0,
    isActive: true,
    efficiency: (ext.reputation * ext.reputation) / (ext.price.amount * 10000),
  })),

  {
    id: 'seo-blog-agent',
    name: 'SEO Blog Writer',
    description: 'Writes full SEO-optimized blog posts for your product or startup.',
    address: '0x1111111111111111111111111111111111111111',
    endpoint: '/api/seo-blog',
    category: 'content',
    priceCTC: 0.005,
    reputation: 92,
    jobsCompleted: 314,
    jobsFailed: 8,
    totalEarned: 1.57,
    isActive: true,
    efficiency: (92 * 92) / (0.005 * 10000),
  },
  {
    id: 'twitter-thread-agent',
    name: 'Twitter Thread Writer',
    description: 'Crafts numbered tweet threads to grow your founder audience on X.',
    address: '0x2222222222222222222222222222222222222222',
    endpoint: '/api/twitter-thread',
    category: 'social',
    priceCTC: 0.003,
    reputation: 89,
    jobsCompleted: 521,
    jobsFailed: 11,
    totalEarned: 1.563,
    isActive: true,
    efficiency: (89 * 89) / (0.003 * 10000),
  },
  {
    id: 'tweet-update-agent',
    name: 'Tweet Updates Writer',
    description: 'Writes punchy single tweets for product launches and announcements.',
    address: '0x3333333333333333333333333333333333333333',
    endpoint: '/api/tweet-update',
    category: 'social',
    priceCTC: 0.001,
    reputation: 85,
    jobsCompleted: 892,
    jobsFailed: 14,
    totalEarned: 0.892,
    isActive: true,
    efficiency: (85 * 85) / (0.001 * 10000),
  },
  {
    id: 'infographic-agent',
    name: 'Infographics Maker',
    description: 'Creates structured infographic copy and visual layout scripts for your brand.',
    address: '0x4444444444444444444444444444444444444444',
    endpoint: '/api/infographic-prompt',
    category: 'visual',
    priceCTC: 0.002,
    reputation: 87,
    jobsCompleted: 203,
    jobsFailed: 6,
    totalEarned: 0.406,
    isActive: true,
    efficiency: (87 * 87) / (0.002 * 10000),
  },
  {
    id: 'marketing-campaign-agent',
    name: 'Marketing Campaign Maker',
    description: 'Builds multi-channel marketing campaign briefs tailored for SaaS and startup founders.',
    address: '0x5555555555555555555555555555555555555555',
    endpoint: '/api/marketing-campaign',
    category: 'strategy',
    priceCTC: 0.008,
    reputation: 94,
    jobsCompleted: 156,
    jobsFailed: 4,
    totalEarned: 1.248,
    isActive: true,
    efficiency: (94 * 94) / (0.008 * 10000),
  },
  {
    id: 'ugc-video-agent',
    name: 'UGC AI Video Prompt Maker',
    description: 'Writes UGC-style video scripts and creator briefs for viral product demos.',
    address: '0x6666666666666666666666666666666666666666',
    endpoint: '/api/ugc-video-prompt',
    category: 'video',
    priceCTC: 0.004,
    reputation: 90,
    jobsCompleted: 178,
    jobsFailed: 7,
    totalEarned: 0.712,
    isActive: true,
    efficiency: (90 * 90) / (0.004 * 10000),
  },
  {
    id: 'pitch-agent',
    name: 'Pitch Maker',
    description: 'Crafts compelling investor pitches and product one-pagers for founders.',
    address: '0x7777777777777777777777777777777777777777',
    endpoint: '/api/pitch',
    category: 'strategy',
    priceCTC: 0.006,
    reputation: 96,
    jobsCompleted: 98,
    jobsFailed: 2,
    totalEarned: 0.588,
    isActive: true,
    efficiency: (96 * 96) / (0.006 * 10000),
  },
  {
    id: 'ghost-writer-agent',
    name: 'Ghost Writer',
    description: 'Writes long-form thought leadership articles in your voice for LinkedIn, Medium, and blogs.',
    address: '0x8888888888888888888888888888888888888888',
    endpoint: '/api/ghost-writer',
    category: 'content',
    priceCTC: 0.007,
    reputation: 93,
    jobsCompleted: 74,
    jobsFailed: 3,
    totalEarned: 0.518,
    isActive: true,
    efficiency: (93 * 93) / (0.007 * 10000),
  },
  {
    id: 'email-newsletter-agent',
    name: 'Email Newsletter Writer',
    description: 'Crafts founder newsletters with compelling subject lines, story-driven body, and CTA.',
    address: '0x9999999999999999999999999999999999999999',
    endpoint: '/api/email-newsletter',
    category: 'content',
    priceCTC: 0.004,
    reputation: 91,
    jobsCompleted: 112,
    jobsFailed: 4,
    totalEarned: 0.448,
    isActive: true,
    efficiency: (91 * 91) / (0.004 * 10000),
  },
  {
    id: 'copywriting-agent',
    name: 'Copywriter',
    description: 'Writes high-converting landing page copy, ad headlines, and product descriptions.',
    address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    endpoint: '/api/copywriting',
    category: 'content',
    priceCTC: 0.003,
    reputation: 89,
    jobsCompleted: 187,
    jobsFailed: 8,
    totalEarned: 0.561,
    isActive: true,
    efficiency: (89 * 89) / (0.003 * 10000),
  },
];

// Calculate efficiency scores
agentRegistry.forEach(a => {
  a.efficiency = a.priceCTC > 0
    ? Math.round((a.reputation / 100) * (1 / (a.priceCTC + 0.001)) * 100) / 100
    : 0;
});

function findAgentById(idOrName: string): AgentRegistryEntry | undefined {
  if (!idOrName) return undefined;
  const search = idOrName.toLowerCase();
  return agentRegistry.find(a =>
    a.id.toLowerCase() === search ||
    a.name.toLowerCase() === search ||
    a.name.toLowerCase().includes(search) ||
    (search.includes('-') && a.id.startsWith(search.split('-')[0]))
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CTC Payment Middleware (x402 demo pattern — Creditcoin EVM)
// ═══════════════════════════════════════════════════════════════════════════

function getExplorerURL(txHash: string): string {
  if (!txHash) return `${EXPLORER_BASE}/tx/0x${'0'.repeat(64)}`;
  return `${EXPLORER_BASE}/tx/${txHash}`;
}

function createCTCPaymentChallenge(config: PriceConfig): object {
  return {
    x402Version: '1.0',
    network: NETWORK,
    chainId: parseInt(CHAIN_ID),
    payTo: SERVER_ADDRESS,
    amount: config.ctcAmount.toString(),
    token: 'CTC',
    description: config.description,
    rpcUrl: RPC_URL,
    explorer: EXPLORER_BASE,
  };
}

function createPaidRoute(config: PriceConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Simulation mode bypass
    if (process.env.SIMULATION_MODE === 'true') {
      console.warn(`[PAYMENT] [SIMULATION] Bypassing CTC payment for ${req.path}`);
      next();
      return;
    }

    // Check for payment header
    const paymentHeader = req.headers['x-payment-response'] || req.headers['payment-response'];

    if (!paymentHeader) {
      // Return HTTP 402 with CTC payment challenge
      res.status(402).json({
        error: 'Payment Required',
        x402: createCTCPaymentChallenge(config),
        message: `This endpoint requires ${config.ctcAmount} CTC on Creditcoin testnet (chain ${CHAIN_ID}).`,
      });
      return;
    }

    // Accept any payment header (demo — in production would verify EVM tx)
    console.log(`[PAYMENT] CTC payment header received for ${req.path}`);
    next();
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Payment Logging
// ═══════════════════════════════════════════════════════════════════════════

function logPayment(
  req: Request,
  endpoint: string,
  priceConfig: PriceConfig,
  opts: { isA2A?: boolean; depth?: number; parentJobId?: string; workerName?: string } = {}
): PaymentLog | null {
  const txId = (req.headers['x-payment-response'] as string) ||
    `sim_${(++paymentIdCounter).toString(16).padStart(8, '0')}`;

  const rawHeaders: Record<string, string> = {};
  ['x-payment-response', 'payment-response', 'x-402-version', 'www-authenticate'].forEach(h => {
    const val = req.headers[h] as string;
    if (val) rawHeaders[h] = val;
  });

  const entry: PaymentLog = {
    id: `pay_${(++paymentIdCounter).toString(36)}`,
    timestamp: new Date().toISOString(),
    endpoint,
    payer: opts.isA2A ? 'Manager Agent' : 'User',
    worker: opts.workerName || endpoint.split('/').pop() || 'unknown',
    transaction: txId,
    token: 'CTC',
    amount: `${priceConfig.ctcAmount} CTC`,
    explorerUrl: getExplorerURL(txId),
    isA2A: opts.isA2A || false,
    parentJobId: opts.parentJobId,
    depth: opts.depth || 0,
    rawHeaders: Object.keys(rawHeaders).length > 0 ? rawHeaders : undefined,
  };

  paymentLogs.push(entry);
  broadcastSSE('payment', entry);

  console.log(`[PAYMENT] ${opts.isA2A ? 'A2A' : 'H2A'} | CTC | ${entry.endpoint} | tx=${entry.transaction}`);

  return entry;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pricing Configuration
// ═══════════════════════════════════════════════════════════════════════════

const PRICES: Record<string, PriceConfig> = {
  seoBlog: {
    ctcAmount: 0.005,
    description: 'SEO Blog Writer — full SEO-optimized blog post',
    category: 'content',
  },
  twitterThread: {
    ctcAmount: 0.003,
    description: 'Twitter Thread Writer — numbered tweet thread',
    category: 'social',
  },
  tweetUpdate: {
    ctcAmount: 0.001,
    description: 'Tweet Updates Writer — punchy single tweet',
    category: 'social',
  },
  infographicPrompt: {
    ctcAmount: 0.002,
    description: 'Infographics Maker — infographic copy and layout',
    category: 'visual',
  },
  marketingCampaign: {
    ctcAmount: 0.008,
    description: 'Marketing Campaign Maker — multi-channel campaign brief',
    category: 'strategy',
  },
  ugcVideoPrompt: {
    ctcAmount: 0.004,
    description: 'UGC AI Video Prompt Maker — video script and creator brief',
    category: 'video',
  },
  pitch: {
    ctcAmount: 0.006,
    description: 'Pitch Maker — investor pitch and product one-pager',
    category: 'strategy',
  },
  ghostWriter: {
    ctcAmount: 0.007,
    description: 'Ghost Writer — long-form thought leadership articles in your voice',
    category: 'content',
  },
  emailNewsletter: {
    ctcAmount: 0.004,
    description: 'Email Newsletter Writer — founder newsletter with subject line, body, and CTA',
    category: 'content',
  },
  copywriting: {
    ctcAmount: 0.003,
    description: 'Copywriter — high-converting landing page and ad copy',
    category: 'content',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Server-Sent Events (SSE) — Real-time Dashboard
// ═══════════════════════════════════════════════════════════════════════════

const sseClients = new Map<string, Response>();

function broadcastSSE(event: string, data: any) {
  sseClients.forEach((client) => {
    client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });
}

function sendSSETo(clientId: string, event: string, data: any) {
  const client = sseClients.get(clientId);
  if (client) {
    client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Routes — Health, Info & Discovery
// ═══════════════════════════════════════════════════════════════════════════

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    network: NETWORK,
    chainId: CHAIN_ID,
    version: '1.0.0',
    agents: agentRegistry.length,
    totalPayments: paymentLogs.length,
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Kortana — AI Marketing Agent Platform',
    version: '1.0.0',
    description: 'Give your product a voice. AI agents write your blogs, threads, pitches, and campaigns.',
    network: NETWORK,
    chainId: CHAIN_ID,
    protocol: 'x402 (HTTP 402 Payment Required)',
    tokenSupport: ['CTC'],
    features: [
      'SEO blog post generation',
      'Twitter thread writing',
      'Investor pitch crafting',
      'Marketing campaign planning',
      'UGC video script prompts',
      'CTC micropayments on Creditcoin EVM',
      'Real-time SSE dashboard',
    ],
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Route — GET /api/tools
// ═══════════════════════════════════════════════════════════════════════════

const endpointMap: Record<string, string> = {
  seoBlog: '/api/seo-blog',
  twitterThread: '/api/twitter-thread',
  tweetUpdate: '/api/tweet-update',
  infographicPrompt: '/api/infographic-prompt',
  marketingCampaign: '/api/marketing-campaign',
  ugcVideoPrompt: '/api/ugc-video-prompt',
  pitch: '/api/pitch',
  ghostWriter: '/api/ghost-writer',
  emailNewsletter: '/api/email-newsletter',
  copywriting: '/api/copywriting',
};

app.get('/api/tools', (_req: Request, res: Response) => {
  const localTools = Object.entries(PRICES).map(([id, config]) => {
    const agent = agentRegistry.find(a => a.endpoint === endpointMap[id]);
    return {
      id,
      name: agent?.name || id,
      endpoint: endpointMap[id] || `/api/${id}`,
      method: 'POST',
      price: { CTC: config.ctcAmount },
      category: config.category,
      description: config.description,
      reputation: agent?.reputation || 80,
      jobsCompleted: agent?.jobsCompleted || 0,
      efficiency: agent?.efficiency || 0,
      params: getToolParams(id),
      isExternal: false,
    };
  });

  const externalTools = EXTERNAL_AGENTS.map(agent => ({
    id: agent.id,
    name: agent.name,
    endpoint: `/api/adapter/external/${agent.id}`,
    method: 'POST',
    price: { CTC: agent.price.amount },
    category: agent.capabilities[0],
    description: agent.description,
    reputation: agent.reputation,
    jobsCompleted: 0,
    efficiency: (agent.reputation * agent.reputation) / (agent.price.amount * 10000),
    params: { query: 'string' },
    isExternal: true,
    mcpCompatible: true,
  }));

  res.json([...localTools, ...externalTools]);
});

function getToolParams(id: string): Record<string, string> {
  const paramMap: Record<string, Record<string, string>> = {
    seoBlog: { topic: 'string (required)', keywords: 'string (optional)', tone: 'string (optional)' },
    twitterThread: { topic: 'string (required)', niche: 'string (optional)' },
    tweetUpdate: { announcement: 'string (required)' },
    infographicPrompt: { topic: 'string (required)', audience: 'string (optional)' },
    marketingCampaign: { product: 'string (required)', budget: 'string (optional)', channels: 'string (optional)' },
    ugcVideoPrompt: { product: 'string (required)', style: 'string (optional)' },
    pitch: { product: 'string (required)', stage: 'string (optional)', audience: 'string (optional)' },
    ghostWriter: { topic: 'string (required)', tone: 'string (optional)', platform: 'string (optional)' },
    emailNewsletter: { topic: 'string (required)', audience: 'string (optional)', cta: 'string (optional)' },
    copywriting: { product: 'string (required)', audience: 'string (optional)', goal: 'string (optional)' },
  };
  return paramMap[id] || {};
}

// ═══════════════════════════════════════════════════════════════════════════
// Route — GET /api/registry
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/registry', (req: Request, res: Response) => {
  const category = req.query.category as string;
  const sortBy = (req.query.sort as string) || 'efficiency';
  const minReputation = parseInt(req.query.minRep as string) || 0;

  let agents = [...agentRegistry].filter(a => a.isActive && a.reputation >= minReputation);
  if (category) agents = agents.filter(a => a.category === category);

  switch (sortBy) {
    case 'reputation':
      agents.sort((a, b) => b.reputation - a.reputation);
      break;
    case 'price':
      agents.sort((a, b) => a.priceCTC - b.priceCTC);
      break;
    case 'jobs':
      agents.sort((a, b) => b.jobsCompleted - a.jobsCompleted);
      break;
    default:
      agents.sort((a, b) => b.efficiency - a.efficiency);
  }

  res.json({
    agents,
    count: agents.length,
    categories: [...new Set(agentRegistry.map(a => a.category))],
    contractAddress: '0xF5baa3381436e0C8818fB5EA3dA9d40C6c49C70D',
    network: NETWORK,
    chainId: CHAIN_ID,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Route — GET /api/payments
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/payments', (_req: Request, res: Response) => {
  res.json({
    payments: paymentLogs.slice(-50).reverse(),
    count: paymentLogs.length,
    a2aCount: paymentLogs.filter(p => p.isA2A).length,
    totalVolume: paymentLogs.reduce((sum, p) => {
      const amount = parseFloat(p.amount) || 0;
      return sum + amount;
    }, 0).toFixed(4),
    timestamp: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Route — GET /api/stats
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/stats', (_req: Request, res: Response) => {
  res.json({
    economy: {
      totalPayments: paymentLogs.length,
      a2aPayments: paymentLogs.filter(p => p.isA2A).length,
      h2aPayments: paymentLogs.filter(p => !p.isA2A).length,
      totalAgents: agentRegistry.length,
      activeAgents: agentRegistry.filter(a => a.isActive).length,
      avgReputation: Math.round(agentRegistry.reduce((s, a) => s + a.reputation, 0) / agentRegistry.length),
    },
    topAgents: agentRegistry
      .sort((a, b) => b.reputation - a.reputation)
      .slice(0, 5)
      .map(a => ({ name: a.name, reputation: a.reputation, jobs: a.jobsCompleted })),
    recentPayments: paymentLogs.slice(-10).reverse(),
    network: NETWORK,
    uptime: process.uptime(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Paid Routes — Marketing Agent Endpoints
// ═══════════════════════════════════════════════════════════════════════════

// ── SEO Blog Writer ────────────────────────────────────────────────────────

app.post('/api/seo-blog', createPaidRoute(PRICES.seoBlog), async (req: Request, res: Response) => {
  const paymentEntry = logPayment(req, '/api/seo-blog', PRICES.seoBlog, { workerName: 'SEO Blog Writer' });

  const { topic, keywords, tone } = req.body;
  if (!topic) {
    res.status(400).json({ error: 'Missing "topic" field.' });
    return;
  }

  let blogPost: string;
  try {
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are an expert SEO content writer for SaaS founders. Write engaging, SEO-optimized blog posts with proper headings (H1, H2, H3), meta description, keyword usage, and a compelling CTA. Format in markdown.'
          },
          {
            role: 'user',
            content: `Write a full SEO-optimized blog post about: ${topic}${keywords ? `\nTarget keywords: ${keywords}` : ''}${tone ? `\nTone: ${tone}` : '\nTone: professional yet approachable'}`
          },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.6,
        max_tokens: 1200,
      });
      blogPost = completion.choices[0]?.message?.content || 'Blog post generation failed.';
    } else {
      const result = await geminiModel.generateContent(
        `Write a full SEO blog post about: ${topic}. Include H1, H2 headings, meta description, and CTA. Format in markdown.`
      );
      blogPost = result.response.text();
    }
  } catch {
    blogPost = `# ${topic}\n\n[Blog post generation temporarily unavailable. Please try again.]`;
  }

  const agent = agentRegistry.find(a => a.id === 'seo-blog-agent');
  if (agent) { agent.jobsCompleted++; agent.totalEarned += PRICES.seoBlog.ctcAmount; }

  res.json({
    blogPost,
    topic,
    wordCount: blogPost.split(/\s+/).length,
    source: 'SEO Blog Writer Agent',
    agentId: 'seo-blog-agent',
    payment: paymentEntry ? { transaction: paymentEntry.transaction, token: 'CTC', amount: paymentEntry.amount, explorerUrl: paymentEntry.explorerUrl } : null,
  });
});

// ── Twitter Thread Writer ──────────────────────────────────────────────────

app.post('/api/twitter-thread', createPaidRoute(PRICES.twitterThread), async (req: Request, res: Response) => {
  const paymentEntry = logPayment(req, '/api/twitter-thread', PRICES.twitterThread, { workerName: 'Twitter Thread Writer' });

  const { topic, niche } = req.body;
  if (!topic) {
    res.status(400).json({ error: 'Missing "topic" field.' });
    return;
  }

  let thread: string;
  try {
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a viral Twitter/X thread writer for founders. Write numbered tweet threads (1/, 2/, etc.) that are punchy, insightful, and shareable. Each tweet max 280 chars. End with a strong CTA.'
          },
          {
            role: 'user',
            content: `Write a 8-10 tweet thread about: ${topic}${niche ? `\nNiche/audience: ${niche}` : ''}`
          },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 800,
      });
      thread = completion.choices[0]?.message?.content || 'Thread generation failed.';
    } else {
      const result = await geminiModel.generateContent(
        `Write an 8-tweet thread about: ${topic}. Number each tweet (1/, 2/, etc.). Make it viral and engaging.`
      );
      thread = result.response.text();
    }
  } catch {
    thread = `1/ ${topic}\n\n[Thread generation temporarily unavailable. Please try again.]`;
  }

  const agent = agentRegistry.find(a => a.id === 'twitter-thread-agent');
  if (agent) { agent.jobsCompleted++; agent.totalEarned += PRICES.twitterThread.ctcAmount; }

  const tweets = thread.split(/\n\n/).filter(t => t.trim().length > 0);
  res.json({
    thread,
    tweets,
    tweetCount: tweets.length,
    topic,
    source: 'Twitter Thread Writer Agent',
    agentId: 'twitter-thread-agent',
    payment: paymentEntry ? { transaction: paymentEntry.transaction, token: 'CTC', amount: paymentEntry.amount, explorerUrl: paymentEntry.explorerUrl } : null,
  });
});

// ── Tweet Updates Writer ───────────────────────────────────────────────────

app.post('/api/tweet-update', createPaidRoute(PRICES.tweetUpdate), async (req: Request, res: Response) => {
  const paymentEntry = logPayment(req, '/api/tweet-update', PRICES.tweetUpdate, { workerName: 'Tweet Updates Writer' });

  const { announcement } = req.body;
  if (!announcement) {
    res.status(400).json({ error: 'Missing "announcement" field.' });
    return;
  }

  let tweet: string;
  try {
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a social media copywriter. Write a single punchy tweet (max 280 chars) for a product announcement. Be bold, use emojis sparingly, include relevant hashtags.'
          },
          { role: 'user', content: `Write a tweet for this announcement: ${announcement}` },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.8,
        max_tokens: 100,
      });
      tweet = completion.choices[0]?.message?.content || announcement.slice(0, 280);
    } else {
      const result = await geminiModel.generateContent(
        `Write a single punchy tweet (max 280 chars) for: ${announcement}`
      );
      tweet = result.response.text().slice(0, 280);
    }
  } catch {
    tweet = announcement.slice(0, 280);
  }

  const agent = agentRegistry.find(a => a.id === 'tweet-update-agent');
  if (agent) { agent.jobsCompleted++; agent.totalEarned += PRICES.tweetUpdate.ctcAmount; }

  res.json({
    tweet: tweet.trim(),
    charCount: tweet.trim().length,
    source: 'Tweet Updates Writer Agent',
    agentId: 'tweet-update-agent',
    payment: paymentEntry ? { transaction: paymentEntry.transaction, token: 'CTC', amount: paymentEntry.amount, explorerUrl: paymentEntry.explorerUrl } : null,
  });
});

// ── Infographics Maker ─────────────────────────────────────────────────────

app.post('/api/infographic-prompt', createPaidRoute(PRICES.infographicPrompt), async (req: Request, res: Response) => {
  const paymentEntry = logPayment(req, '/api/infographic-prompt', PRICES.infographicPrompt, { workerName: 'Infographics Maker' });

  const { topic, audience } = req.body;
  if (!topic) {
    res.status(400).json({ error: 'Missing "topic" field.' });
    return;
  }

  let infographic: string;
  try {
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a visual content strategist. Create structured infographic scripts with a title, 5-7 key data points or insights, visual layout suggestions, and a call-to-action. Format clearly with sections.'
          },
          {
            role: 'user',
            content: `Create an infographic script about: ${topic}${audience ? `\nTarget audience: ${audience}` : ''}`
          },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.5,
        max_tokens: 700,
      });
      infographic = completion.choices[0]?.message?.content || 'Infographic generation failed.';
    } else {
      const result = await geminiModel.generateContent(
        `Create an infographic script with title, 6 key points, and visual suggestions for: ${topic}`
      );
      infographic = result.response.text();
    }
  } catch {
    infographic = `Infographic: ${topic}\n\n[Generation temporarily unavailable. Please try again.]`;
  }

  const agent = agentRegistry.find(a => a.id === 'infographic-agent');
  if (agent) { agent.jobsCompleted++; agent.totalEarned += PRICES.infographicPrompt.ctcAmount; }

  res.json({
    infographic,
    topic,
    source: 'Infographics Maker Agent',
    agentId: 'infographic-agent',
    payment: paymentEntry ? { transaction: paymentEntry.transaction, token: 'CTC', amount: paymentEntry.amount, explorerUrl: paymentEntry.explorerUrl } : null,
  });
});

// ── Marketing Campaign Maker ───────────────────────────────────────────────

app.post('/api/marketing-campaign', createPaidRoute(PRICES.marketingCampaign), async (req: Request, res: Response) => {
  const paymentEntry = logPayment(req, '/api/marketing-campaign', PRICES.marketingCampaign, { workerName: 'Marketing Campaign Maker' });

  const { product, budget, channels } = req.body;
  if (!product) {
    res.status(400).json({ error: 'Missing "product" field.' });
    return;
  }

  let campaign: string;
  try {
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a growth marketing strategist for SaaS founders. Write comprehensive multi-channel marketing campaign briefs with: campaign goal, target audience, messaging pillars, channel strategy (Twitter, LinkedIn, email, SEO, paid), content calendar outline, and success metrics.'
          },
          {
            role: 'user',
            content: `Create a marketing campaign brief for: ${product}${budget ? `\nBudget: ${budget}` : ''}${channels ? `\nChannels to focus on: ${channels}` : ''}`
          },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.6,
        max_tokens: 1200,
      });
      campaign = completion.choices[0]?.message?.content || 'Campaign generation failed.';
    } else {
      const result = await geminiModel.generateContent(
        `Write a detailed multi-channel marketing campaign brief for: ${product}. Include goal, audience, channels, and KPIs.`
      );
      campaign = result.response.text();
    }
  } catch {
    campaign = `Campaign for ${product}\n\n[Generation temporarily unavailable. Please try again.]`;
  }

  const agent = agentRegistry.find(a => a.id === 'marketing-campaign-agent');
  if (agent) { agent.jobsCompleted++; agent.totalEarned += PRICES.marketingCampaign.ctcAmount; }

  res.json({
    campaign,
    product,
    source: 'Marketing Campaign Maker Agent',
    agentId: 'marketing-campaign-agent',
    payment: paymentEntry ? { transaction: paymentEntry.transaction, token: 'CTC', amount: paymentEntry.amount, explorerUrl: paymentEntry.explorerUrl } : null,
  });
});

// ── UGC AI Video Prompt Maker ──────────────────────────────────────────────

app.post('/api/ugc-video-prompt', createPaidRoute(PRICES.ugcVideoPrompt), async (req: Request, res: Response) => {
  const paymentEntry = logPayment(req, '/api/ugc-video-prompt', PRICES.ugcVideoPrompt, { workerName: 'UGC AI Video Prompt Maker' });

  const { product, style } = req.body;
  if (!product) {
    res.status(400).json({ error: 'Missing "product" field.' });
    return;
  }

  let videoScript: string;
  try {
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a UGC (user-generated content) video strategist. Write creator briefs and video scripts for authentic product demo videos. Include: hook (first 3 seconds), product intro, 3 key benefits shown naturally, social proof moment, CTA. Keep it conversational and authentic.'
          },
          {
            role: 'user',
            content: `Write a UGC video script for: ${product}${style ? `\nStyle: ${style}` : '\nStyle: authentic, conversational, relatable'}`
          },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 800,
      });
      videoScript = completion.choices[0]?.message?.content || 'Script generation failed.';
    } else {
      const result = await geminiModel.generateContent(
        `Write a UGC-style video script for: ${product}. Include hook, benefits, and CTA. Keep it authentic.`
      );
      videoScript = result.response.text();
    }
  } catch {
    videoScript = `UGC Script for ${product}\n\n[Generation temporarily unavailable. Please try again.]`;
  }

  const agent = agentRegistry.find(a => a.id === 'ugc-video-agent');
  if (agent) { agent.jobsCompleted++; agent.totalEarned += PRICES.ugcVideoPrompt.ctcAmount; }

  res.json({
    videoScript,
    product,
    source: 'UGC AI Video Prompt Maker Agent',
    agentId: 'ugc-video-agent',
    payment: paymentEntry ? { transaction: paymentEntry.transaction, token: 'CTC', amount: paymentEntry.amount, explorerUrl: paymentEntry.explorerUrl } : null,
  });
});

// ── Pitch Maker ────────────────────────────────────────────────────────────

app.post('/api/pitch', createPaidRoute(PRICES.pitch), async (req: Request, res: Response) => {
  const paymentEntry = logPayment(req, '/api/pitch', PRICES.pitch, { workerName: 'Pitch Maker' });

  const { product, stage, audience } = req.body;
  if (!product) {
    res.status(400).json({ error: 'Missing "product" field.' });
    return;
  }

  let pitch: string;
  try {
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a startup pitch coach and storyteller. Write compelling investor pitches and product one-pagers. Structure: Problem, Solution, Why Now, Market Size, Traction, Business Model, Ask/CTA. Make it crisp, compelling, and memorable.'
          },
          {
            role: 'user',
            content: `Write a compelling pitch for: ${product}${stage ? `\nStage: ${stage}` : ''}${audience ? `\nAudience: ${audience}` : '\nAudience: seed-stage investors'}`
          },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.5,
        max_tokens: 1000,
      });
      pitch = completion.choices[0]?.message?.content || 'Pitch generation failed.';
    } else {
      const result = await geminiModel.generateContent(
        `Write a compelling investor pitch for: ${product}. Include problem, solution, market size, traction, and ask.`
      );
      pitch = result.response.text();
    }
  } catch {
    pitch = `Pitch for ${product}\n\n[Generation temporarily unavailable. Please try again.]`;
  }

  const agent = agentRegistry.find(a => a.id === 'pitch-agent');
  if (agent) { agent.jobsCompleted++; agent.totalEarned += PRICES.pitch.ctcAmount; }

  res.json({
    pitch,
    product,
    source: 'Pitch Maker Agent',
    agentId: 'pitch-agent',
    payment: paymentEntry ? { transaction: paymentEntry.transaction, token: 'CTC', amount: paymentEntry.amount, explorerUrl: paymentEntry.explorerUrl } : null,
  });
});

// ── Ghost Writer ───────────────────────────────────────────────────────────

app.post('/api/ghost-writer', createPaidRoute(PRICES.ghostWriter), async (req: Request, res: Response) => {
  const paymentEntry = logPayment(req, '/api/ghost-writer', PRICES.ghostWriter, { workerName: 'Ghost Writer' });

  const { topic, tone, platform } = req.body;
  if (!topic) {
    res.status(400).json({ error: 'Missing "topic" field.' });
    return;
  }

  let article: string;
  try {
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a ghostwriter for tech founders. Write long-form thought leadership articles (800–1200 words) in a confident, first-person founder voice. Structure: hook, personal insight, industry observation, actionable takeaways, and closing thought. No fluff.' },
          { role: 'user', content: `Write a thought leadership article for a founder about: ${topic}${tone ? `\nTone: ${tone}` : ''}${platform ? `\nPlatform: ${platform}` : '\nPlatform: LinkedIn/Medium'}` },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.6,
        max_tokens: 1200,
      });
      article = completion.choices[0]?.message?.content || 'Article generation failed.';
    } else {
      const result = await geminiModel.generateContent(`Write a founder thought leadership article about: ${topic}.`);
      article = result.response.text();
    }
  } catch {
    article = `Ghost Writer article for "${topic}"\n\n[Generation temporarily unavailable. Please try again.]`;
  }

  const agent = agentRegistry.find(a => a.id === 'ghost-writer-agent');
  if (agent) { agent.jobsCompleted++; agent.totalEarned += PRICES.ghostWriter.ctcAmount; }

  res.json({
    article,
    topic,
    source: 'Ghost Writer Agent',
    agentId: 'ghost-writer-agent',
    payment: paymentEntry ? { transaction: paymentEntry.transaction, token: 'CTC', amount: paymentEntry.amount, explorerUrl: paymentEntry.explorerUrl } : null,
  });
});

// ── Email Newsletter Writer ─────────────────────────────────────────────────

app.post('/api/email-newsletter', createPaidRoute(PRICES.emailNewsletter), async (req: Request, res: Response) => {
  const paymentEntry = logPayment(req, '/api/email-newsletter', PRICES.emailNewsletter, { workerName: 'Email Newsletter Writer' });

  const { topic, audience, cta } = req.body;
  if (!topic) {
    res.status(400).json({ error: 'Missing "topic" field.' });
    return;
  }

  let newsletter: string;
  try {
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a founder newsletter writer. Write email newsletters with: a compelling subject line, brief personal intro, main story or insight, 2–3 key takeaways as bullets, and a clear CTA. Conversational and direct.' },
          { role: 'user', content: `Write a founder newsletter about: ${topic}${audience ? `\nSubscriber audience: ${audience}` : ''}${cta ? `\nCTA goal: ${cta}` : ''}` },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.5,
        max_tokens: 900,
      });
      newsletter = completion.choices[0]?.message?.content || 'Newsletter generation failed.';
    } else {
      const result = await geminiModel.generateContent(`Write a founder email newsletter about: ${topic}.`);
      newsletter = result.response.text();
    }
  } catch {
    newsletter = `Newsletter for "${topic}"\n\n[Generation temporarily unavailable. Please try again.]`;
  }

  const agent = agentRegistry.find(a => a.id === 'email-newsletter-agent');
  if (agent) { agent.jobsCompleted++; agent.totalEarned += PRICES.emailNewsletter.ctcAmount; }

  res.json({
    newsletter,
    topic,
    source: 'Email Newsletter Writer Agent',
    agentId: 'email-newsletter-agent',
    payment: paymentEntry ? { transaction: paymentEntry.transaction, token: 'CTC', amount: paymentEntry.amount, explorerUrl: paymentEntry.explorerUrl } : null,
  });
});

// ── Copywriter ──────────────────────────────────────────────────────────────

app.post('/api/copywriting', createPaidRoute(PRICES.copywriting), async (req: Request, res: Response) => {
  const paymentEntry = logPayment(req, '/api/copywriting', PRICES.copywriting, { workerName: 'Copywriter' });

  const { product, audience, goal } = req.body;
  if (!product) {
    res.status(400).json({ error: 'Missing "product" field.' });
    return;
  }

  let copy: string;
  try {
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a conversion copywriter. Write high-converting copy including: a headline, subheadline, hero paragraph, 3 benefit bullets with proof points, social proof placeholder, and CTA button text. Use proven frameworks (AIDA, PAS).' },
          { role: 'user', content: `Write conversion copy for: ${product}${audience ? `\nTarget audience: ${audience}` : ''}${goal ? `\nGoal: ${goal}` : '\nGoal: sign-ups / trial'}` },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.5,
        max_tokens: 800,
      });
      copy = completion.choices[0]?.message?.content || 'Copy generation failed.';
    } else {
      const result = await geminiModel.generateContent(`Write conversion copy for: ${product}.`);
      copy = result.response.text();
    }
  } catch {
    copy = `Copywriting for "${product}"\n\n[Generation temporarily unavailable. Please try again.]`;
  }

  const agent = agentRegistry.find(a => a.id === 'copywriting-agent');
  if (agent) { agent.jobsCompleted++; agent.totalEarned += PRICES.copywriting.ctcAmount; }

  res.json({
    copy,
    product,
    source: 'Copywriter Agent',
    agentId: 'copywriting-agent',
    payment: paymentEntry ? { transaction: paymentEntry.transaction, token: 'CTC', amount: paymentEntry.amount, explorerUrl: paymentEntry.explorerUrl } : null,
  });
});

// ── Universal Agent Adapter Route ─────────────────────────────────────────

app.post('/api/adapter/external/:agentId', async (req: Request, res: Response) => {
  const { agentId } = req.params;
  const task = req.body.task || req.body;

  try {
    const result = await callExternalAgent(agentId as string, task || {});
    res.set('x-monetization-token', 'mock-token-123');
    res.set('x-402-cost', `${result.cost}`);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Manager Agent — Autonomous Marketing Orchestration
// ═══════════════════════════════════════════════════════════════════════════

interface AgentExecutionResult {
  query: string;
  plan: string[];
  hiringDecisions: Array<{
    agent: string;
    reason: string;
    cost: number;
    reputation: number;
    alternative?: string;
    alternativeReason?: string;
  }>;
  results: Array<{
    tool: string;
    result: any;
    payment?: any;
    error?: string;
  }>;
  finalAnswer: string;
  totalCost: { CTC: number };
  protocolTrace: Array<{
    step: string;
    httpStatus: number;
    headers: Record<string, string>;
    timestamp: string;
  }>;
}

function autonomousHiringDecision(
  toolId: string,
  allAgents: AgentRegistryEntry[]
): { chosen: AgentRegistryEntry | null; reason: string; alternatives: AgentRegistryEntry[] } {
  let category = PRICES[toolId]?.category;
  if (!category) {
    const agent = findAgentById(toolId);
    if (agent) category = agent.category;
  }
  if (!category) return { chosen: null, reason: 'Unknown tool', alternatives: [] };

  const candidates = allAgents.filter(a => a.isActive && a.category === category);
  if (candidates.length === 0) return { chosen: null, reason: 'No agents available', alternatives: [] };

  const scored = candidates
    .map(a => ({ agent: a, score: a.efficiency }))
    .sort((a, b) => b.score - a.score);

  const chosen = scored[0].agent;
  const alternatives = scored.slice(1).map(s => s.agent);

  const reason = `Selected ${chosen.name} (Rep: ${chosen.reputation}/100, Cost: ${chosen.priceCTC} CTC, Efficiency: ${scored[0].score.toFixed(1)}). ` +
    (alternatives.length > 0
      ? `Rejected ${alternatives[0].name} (Rep: ${alternatives[0].reputation}, Cost: ${alternatives[0].priceCTC} CTC) — lower efficiency.`
      : 'No alternatives available.');

  return { chosen, reason, alternatives };
}

async function runManagerAgent(
  query: string,
  clientId?: string,
  options: { budgetLimit?: number } = {}
): Promise<AgentExecutionResult> {
  const { budgetLimit = 0.1 } = options;
  const startTime = Date.now();
  const plan: string[] = [];
  const hiringDecisions: AgentExecutionResult['hiringDecisions'] = [];
  const protocolTrace: AgentExecutionResult['protocolTrace'] = [];
  const results: AgentExecutionResult['results'] = [];
  const totalCost = { CTC: 0 };

  plan.push(`[${new Date().toISOString()}] Kortana Manager received query: "${query}"`);
  plan.push('Step 1: Analyzing marketing intent with LLM planner...');

  if (clientId) {
    sendSSETo(clientId, 'step', { label: 'Analyzing intent', detail: 'LLM planner routing to marketing agents', status: 'active' });
  }

  protocolTrace.push({
    step: 'Intent Analysis',
    httpStatus: 200,
    headers: { 'x-agent': 'Kortana Manager', 'x-model': 'llama-3.3-70b-versatile' },
    timestamp: new Date().toISOString(),
  });
  if (clientId) sendSSETo(clientId, 'protocol_trace', protocolTrace[protocolTrace.length - 1]);

  const toolsList = Object.entries(PRICES).map(([id, config]) => {
    const agent = agentRegistry.find(a => a.endpoint === endpointMap[id]);
    return `- "${id}": ${agent?.name || id} | ${config.description} | Cost: ${config.ctcAmount} CTC | Rep: ${agent?.reputation || 80}/100`;
  }).join('\n');

  const plannerPrompt = `You are the KORTANA MANAGER — an AI marketing orchestrator for founders.
Your job is to route founder queries to the best marketing agent to generate content.

Available Marketing Agents (x402 CTC paid):
${toolsList}

User Query: "${query}"

Select the MOST RELEVANT marketing agent for this query. Be concise.

Return ONLY valid JSON:
{
  "reasoning": "Why this agent best serves the founder's marketing need",
  "toolCalls": [
    { "toolId": "tool_id", "params": { "param_name": "value" } }
  ]
}`;

  let llmPlan: any;

  try {
    if (groq) {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a JSON-generating marketing agent router. Always return valid JSON.' },
          { role: 'user', content: plannerPrompt },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0,
        response_format: { type: 'json_object' },
      });
      const content = completion.choices[0]?.message?.content;
      if (content) llmPlan = JSON.parse(content);
    }
  } catch (err) {
    console.warn('[MANAGER] Groq planning failed:', err);
  }

  if (!llmPlan) {
    try {
      const chatResult = await geminiModel.generateContent(plannerPrompt);
      const text = chatResult.response.text();
      const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
      llmPlan = JSON.parse(jsonStr);
    } catch (err) {
      console.warn('[MANAGER] Gemini planning failed:', err);
    }
  }

  if (!llmPlan) {
    llmPlan = fallbackMarketingPlan(query);
  }

  if (clientId) {
    sendSSETo(clientId, 'step', { label: 'Analyzing intent', status: 'complete' });
    sendSSETo(clientId, 'step', {
      label: 'Planning delegation',
      detail: `${llmPlan.toolCalls?.length || 0} marketing agents to hire`,
      status: 'complete',
    });
  }

  plan.push(`LLM Reasoning: ${llmPlan.reasoning}`);

  // Execute tool calls
  for (const tc of (llmPlan.toolCalls || [])) {
    const toolId = tc.toolId as string;
    const price = PRICES[toolId];

    if (!price) {
      results.push({ tool: toolId, result: null, error: 'Tool not found in registry' });
      continue;
    }

    if (totalCost.CTC + price.ctcAmount > budgetLimit) {
      results.push({ tool: toolId, result: null, error: `Budget limit reached (${budgetLimit} CTC).` });
      continue;
    }

    const hiring = autonomousHiringDecision(toolId, agentRegistry);
    const agentName = hiring.chosen?.name || toolId;

    hiringDecisions.push({
      agent: agentName,
      reason: hiring.reason,
      cost: price.ctcAmount,
      reputation: hiring.chosen?.reputation || 0,
      alternative: hiring.alternatives[0]?.name,
      alternativeReason: hiring.alternatives[0]
        ? `${hiring.alternatives[0].reputation}/100 rep, ${hiring.alternatives[0].priceCTC} CTC`
        : undefined,
    });

    if (clientId) {
      broadcastSSE('hiring_decision', {
        tool: toolId,
        selectedAgent: agentName,
        reason: hiring.reason,
        valueScore: hiring.chosen?.efficiency || 0,
        alternatives: hiring.alternatives.map(a => ({ id: a.id, score: a.efficiency })),
        approved: true,
      });
      sendSSETo(clientId, 'step', {
        label: `Hiring ${agentName}`,
        detail: `${price.ctcAmount} CTC | Rep: ${hiring.chosen?.reputation || 'N/A'}/100`,
        status: 'active',
      });
    }

    totalCost.CTC += price.ctcAmount;

    // Broadcast HTTP 402 challenge trace
    const challengeTrace = {
      step: `HTTP 402 Payment Required → ${agentName}`,
      httpStatus: 402,
      headers: { 'x-402-version': '1.0', 'x-pay-to': SERVER_ADDRESS, 'x-amount': `${price.ctcAmount} CTC`, 'x-chain': CHAIN_ID },
      timestamp: new Date().toISOString(),
    };
    protocolTrace.push(challengeTrace);
    if (clientId) sendSSETo(clientId, 'protocol_trace', challengeTrace);

    // Send real CTC payment on-chain
    let txHash: string;
    try {
      txHash = await sendCTCPayment(SERVER_ADDRESS, price.ctcAmount);
    } catch (payErr: any) {
      console.error(`[PAYMENT] CTC transfer failed: ${payErr.message}`);
      throw new Error(`CTC payment failed for ${agentName}: ${payErr.message}`);
    }

    // Run tool after confirmed payment
    const toolResult = await simulateMarketingResult(toolId, tc.params, query);

    const payment = {
      transaction: txHash,
      token: 'CTC',
      amount: `${price.ctcAmount} CTC`,
      explorerUrl: getExplorerURL(txHash),
    };

    paymentLogs.push({
      id: `pay_${(++paymentIdCounter).toString(36)}`,
      timestamp: new Date().toISOString(),
      endpoint: endpointMap[toolId] || `/api/${toolId}`,
      payer: 'Manager Agent',
      worker: agentName,
      transaction: payment.transaction,
      token: 'CTC',
      amount: payment.amount,
      explorerUrl: payment.explorerUrl,
      isA2A: true,
      depth: 0,
    });
    broadcastSSE('payment', paymentLogs[paymentLogs.length - 1]);

    protocolTrace.push({
      step: `x402 CTC Payment → ${agentName}`,
      httpStatus: 200,
      headers: { 'x-402-version': '1.0', 'x-payment-mode': 'onchain', 'x-chain': CHAIN_ID, 'x-tx-hash': txHash },
      timestamp: new Date().toISOString(),
    });
    if (clientId) sendSSETo(clientId, 'protocol_trace', protocolTrace[protocolTrace.length - 1]);

    results.push({ tool: agentName, result: toolResult, payment });

    if (clientId) {
      sendSSETo(clientId, 'thought', {
        content: `**${agentName}:** ${typeof toolResult === 'string' ? toolResult.slice(0, 300) : JSON.stringify(toolResult).slice(0, 300)}`,
      });
      sendSSETo(clientId, 'step', {
        label: `Hiring ${agentName}`,
        detail: `Paid ${price.ctcAmount} CTC ✓`,
        status: 'complete',
      });
    }

    const registryAgent = agentRegistry.find(a => a.name === agentName);
    if (registryAgent) {
      registryAgent.jobsCompleted++;
      registryAgent.totalEarned += price.ctcAmount;
    }
  }

  // Synthesize final answer
  if (clientId) sendSSETo(clientId, 'step', { label: 'Synthesizing results', status: 'active' });

  let finalAnswer = '';
  const successResults = results.filter(r => r.result);

  if (successResults.length === 0) {
    finalAnswer = "I couldn't find the right marketing agent for your query. Try asking me to write a blog post, tweet thread, pitch, or marketing campaign for your product.";
  } else {
    try {
      if (groq) {
        const synthesisPrompt = `You are Kortana, an AI marketing team for founders. Synthesize these agent results into a polished, ready-to-use marketing asset for: "${query}".

Agent Results:
${successResults.map(r => `${r.tool}: ${typeof r.result === 'string' ? r.result : JSON.stringify(r.result)}`).join('\n\n')}

Return the best, most complete result. Format it nicely.`;
        const completion = await groq.chat.completions.create({
          messages: [{ role: 'user', content: synthesisPrompt }],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.4,
          max_tokens: 800,
        });
        finalAnswer = completion.choices[0]?.message?.content || '';
      } else {
        finalAnswer = successResults.map(r =>
          `**${r.tool}**: ${typeof r.result === 'string' ? r.result : JSON.stringify(r.result)}`
        ).join('\n\n');
      }
    } catch {
      finalAnswer = successResults.map(r =>
        `${r.tool}: ${typeof r.result === 'string' ? r.result : JSON.stringify(r.result)}`
      ).join('\n\n');
    }
  }

  if (clientId) {
    sendSSETo(clientId, 'step', { label: 'Synthesizing results', status: 'complete' });
    sendSSETo(clientId, 'done', { duration: Date.now() - startTime });
  }

  plan.push(`Total cost: ${totalCost.CTC.toFixed(4)} CTC`);
  plan.push(`Duration: ${Date.now() - startTime}ms`);

  return {
    query,
    plan,
    hiringDecisions,
    results,
    finalAnswer,
    totalCost: { CTC: Math.round(totalCost.CTC * 10000) / 10000 },
    protocolTrace,
  };
}

function fallbackMarketingPlan(query: string): any {
  const q = query.toLowerCase();
  let reasoning = 'Rule-based routing: ';

  if (q.match(/blog|article|seo|post|content/)) {
    reasoning += 'Detected blog/SEO content request.';
    return { reasoning, toolCalls: [{ toolId: 'seoBlog', params: { topic: query } }] };
  }
  if (q.match(/thread|tweet storm|twitter|x\.com/)) {
    reasoning += 'Detected Twitter thread request.';
    return { reasoning, toolCalls: [{ toolId: 'twitterThread', params: { topic: query } }] };
  }
  if (q.match(/tweet|post update|announce/)) {
    reasoning += 'Detected tweet/announcement request.';
    return { reasoning, toolCalls: [{ toolId: 'tweetUpdate', params: { announcement: query } }] };
  }
  if (q.match(/infographic|visual|chart|graphic/)) {
    reasoning += 'Detected infographic request.';
    return { reasoning, toolCalls: [{ toolId: 'infographicPrompt', params: { topic: query } }] };
  }
  if (q.match(/campaign|marketing plan|launch|go-to-market|gtm/)) {
    reasoning += 'Detected marketing campaign request.';
    return { reasoning, toolCalls: [{ toolId: 'marketingCampaign', params: { product: query } }] };
  }
  if (q.match(/video|ugc|reel|tiktok|script/)) {
    reasoning += 'Detected video/UGC request.';
    return { reasoning, toolCalls: [{ toolId: 'ugcVideoPrompt', params: { product: query } }] };
  }
  if (q.match(/pitch|investor|deck|fundrais/)) {
    reasoning += 'Detected pitch request.';
    return { reasoning, toolCalls: [{ toolId: 'pitch', params: { product: query } }] };
  }
  if (q.match(/ghost\s*writ|thought leadership|linkedin article|medium post/)) {
    reasoning += 'Detected ghost writing request.';
    return { reasoning, toolCalls: [{ toolId: 'ghostWriter', params: { topic: query } }] };
  }
  if (q.match(/email|newsletter|subscriber|inbox/)) {
    reasoning += 'Detected email newsletter request.';
    return { reasoning, toolCalls: [{ toolId: 'emailNewsletter', params: { topic: query } }] };
  }
  if (q.match(/copy|landing page|headline|ad copy|conversion|cta/)) {
    reasoning += 'Detected copywriting request.';
    return { reasoning, toolCalls: [{ toolId: 'copywriting', params: { product: query } }] };
  }

  // Default to blog post
  reasoning += 'No specific intent detected, defaulting to blog post.';
  return { reasoning, toolCalls: [{ toolId: 'seoBlog', params: { topic: query } }] };
}

const agentSystemPrompts: Record<string, string> = {
  seoBlog: 'You are an SEO blog writer for Web3 founders. Write a full, structured SEO-optimized blog post with H2 sections, keyword-rich content, and a compelling CTA. Cover the problem, solution, use case, and benefits.',
  twitterThread: 'You are a Twitter/X thread writer for Web3 founders. Write a numbered tweet thread (10–15 tweets). Start with a hook, build tension, deliver value, and end with a CTA. Each tweet under 280 chars.',
  tweetUpdate: 'You are a social media copywriter. Write a single punchy, engaging tweet for a Web3 product announcement. Max 280 characters. No hashtag spam.',
  infographicPrompt: 'You are a visual content strategist. Write structured infographic copy: a headline, 5–7 data points or sections with labels and values, and a footer CTA. Format clearly for a designer to use.',
  marketingCampaign: 'You are a growth marketing strategist for Web3 startups. Write a full multi-channel marketing campaign brief: objective, target audience, messaging pillars, channel breakdown (Twitter, Discord, content, paid), and 30-day timeline.',
  ugcVideoPrompt: 'You are a UGC video content director. Write a creator brief: hook (first 3 seconds), script outline, key talking points, call to action, and visual direction notes. Make it authentic and viral-ready.',
  pitch: 'You are a startup pitch coach. Write a compelling investor pitch with these sections: Problem, Solution, Why Now, Market Size, Traction, Business Model, Team (placeholder), and Ask/CTA. Make it crisp and memorable.',
  ghostWriter: 'You are a ghostwriter for tech founders. Write a long-form thought leadership article (800–1200 words) in a confident, first-person founder voice. Structure: hook, personal insight, industry observation, actionable takeaways, and closing thought. No fluff.',
  emailNewsletter: 'You are a founder newsletter writer. Write an email newsletter with: a compelling subject line, a brief personal intro, the main story or insight, 2–3 key takeaways formatted as bullets, and a clear CTA. Conversational and direct.',
  copywriting: 'You are a conversion copywriter. Write high-converting copy including: a headline, subheadline, hero paragraph, 3 benefit bullets with proof points, social proof placeholder, and a CTA button text. Use proven copywriting frameworks (AIDA, PAS).',
};

const agentUserPrompts: Record<string, (params: any, query: string) => string> = {
  seoBlog: (p, q) => `Write an SEO blog post about: ${p.topic || q}${p.audience ? `\nTarget audience: ${p.audience}` : ''}`,
  twitterThread: (p, q) => `Write a Twitter thread about: ${p.topic || q}${p.niche ? `\nNiche: ${p.niche}` : ''}`,
  tweetUpdate: (p, q) => `Write a tweet for this announcement: ${p.announcement || q}`,
  infographicPrompt: (p, q) => `Create infographic copy for: ${p.topic || q}${p.audience ? `\nAudience: ${p.audience}` : ''}`,
  marketingCampaign: (p, q) => `Build a marketing campaign for: ${p.product || q}${p.budget ? `\nBudget: ${p.budget}` : ''}${p.channels ? `\nChannels: ${p.channels}` : ''}`,
  ugcVideoPrompt: (p, q) => `Write a UGC video brief for: ${p.product || q}${p.style ? `\nStyle: ${p.style}` : ''}`,
  pitch: (p, q) => `Write a compelling investor pitch for: ${p.product || q}${p.stage ? `\nStage: ${p.stage}` : ''}${p.audience ? `\nAudience: ${p.audience}` : '\nAudience: seed-stage investors'}`,
  ghostWriter: (p, q) => `Write a thought leadership article ghostwritten for a founder about: ${p.topic || p.product || q}${p.tone ? `\nTone: ${p.tone}` : ''}${p.platform ? `\nPlatform: ${p.platform}` : '\nPlatform: LinkedIn/Medium'}`,
  emailNewsletter: (p, q) => `Write a founder email newsletter about: ${p.topic || p.product || q}${p.audience ? `\nSubscriber audience: ${p.audience}` : ''}${p.cta ? `\nCTA goal: ${p.cta}` : ''}`,
  copywriting: (p, q) => `Write conversion copy for: ${p.product || p.topic || q}${p.audience ? `\nTarget audience: ${p.audience}` : ''}${p.goal ? `\nGoal: ${p.goal}` : '\nGoal: sign-ups / trial'}`,
};

async function simulateMarketingResult(toolId: string, params: any, query: string): Promise<any> {
  const systemPrompt = agentSystemPrompts[toolId] || `You are a marketing expert. Generate a high-quality marketing asset for a Web3 founder.`;
  const userPrompt = agentUserPrompts[toolId] ? agentUserPrompts[toolId](params, query) : `Generate marketing content for: ${params.product || params.topic || query}`;

  if (groq) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.6,
        max_tokens: 800,
      });
      return completion.choices[0]?.message?.content || `Result for ${toolId}`;
    } catch {
      return `[${toolId}] Result for: ${params.topic || params.product || params.announcement || query}`;
    }
  }
  try {
    const result = await geminiModel.generateContent(`${systemPrompt}\n\n${userPrompt}`);
    return result.response.text();
  } catch {
    return `[${toolId}] Result for: ${params.topic || params.product || params.announcement || query}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SSE Endpoint
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/agent/events', (req: Request, res: Response) => {
  const clientId = req.query.clientId as string;
  if (!clientId) { res.status(400).send('Missing clientId'); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.set(clientId, res);

  const keepAlive = setInterval(() => { res.write(': keep-alive\n\n'); }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(clientId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Main Agent Query Endpoint
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/agent/query', async (req: Request, res: Response) => {
  try {
    const { query, clientId, options } = req.body;
    if (!query) {
      res.status(400).json({ error: 'Missing query in request body' });
      return;
    }

    const result = await runManagerAgent(query, clientId, options);
    res.json(result);
  } catch (err) {
    console.error('[AGENT QUERY ERROR]', err);
    res.status(500).json({
      error: 'Agent execution failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Server Start
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, HOST, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║             KORTANA — Marketing Agent Platform               ║
║                                                              ║
║  Give your product a voice.                                  ║
║  AI agents write your blogs, threads, pitches & campaigns.  ║
╚══════════════════════════════════════════════════════════════╝

  Server:   http://${HOST}:${PORT}
  Network:  ${NETWORK} (chain ${CHAIN_ID})
  Agents:   ${agentRegistry.length} marketing agents ready
  LLM:      ${groq ? 'Groq (llama-3.3-70b)' : 'Gemini 2.0 Flash'}
`);
});
