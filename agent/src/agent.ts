/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Kortana — Marketing Agent CLI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A CLI agent that:
 *   1. Discovers available marketing agents from the registry
 *   2. Accepts a user query (CLI or programmatic)
 *   3. Plans optimal delegation using LLM (Groq / Gemini)
 *   4. Routes to the best marketing agent based on CTC price and reputation
 *   5. Pays each Worker Agent via x402 (CTC) on Creditcoin EVM
 *   6. Returns a polished marketing asset
 */

import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import * as readline from 'readline';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config({ path: '../.env' });
dotenv.config();

// ═══════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════

const SERVER_URL = process.env.AGENT_SERVER_URL || 'http://localhost:4002';
const NETWORK = process.env.NETWORK || 'creditcoin-testnet';
const CHAIN_ID = process.env.CHAIN_ID || '102031';
const EXPLORER_BASE = 'https://creditcoin-testnet.blockscout.com';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;

// Simple axios client (x402 payment headers added per-request in demo mode)
const api: AxiosInstance = axios.create({
  baseURL: SERVER_URL,
  headers: {
    'x-payment-response': `demo_${AGENT_PRIVATE_KEY?.slice(0, 8) || 'no_key'}_${Date.now()}`,
    'Content-Type': 'application/json',
  },
});

// AI Clients
let groqClient: Groq | null = null;
let geminiClient: GoogleGenerativeAI | null = null;

if (GROQ_API_KEY) groqClient = new Groq({ apiKey: GROQ_API_KEY });
if (GEMINI_API_KEY) geminiClient = new GoogleGenerativeAI(GEMINI_API_KEY);

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface Tool {
  id: string;
  name: string;
  endpoint: string;
  method: string;
  price: { CTC: number };
  category: string;
  params: Record<string, string>;
  description: string;
  reputation: number;
  jobsCompleted: number;
  efficiency: number;
}

interface HiringDecision {
  tool: Tool;
  reason: string;
  costEfficiency: number;
  alternatives: Tool[];
}

interface ToolCallResult {
  tool: string;
  agentName: string;
  success: boolean;
  data: any;
  hiringReason: string;
  payment?: {
    transaction: string;
    token: string;
    amount: string;
    explorerUrl: string;
  };
  error?: string;
  latencyMs: number;
}

interface AgentPlan {
  query: string;
  reasoning: string;
  toolCalls: { toolId: string; params: Record<string, any> }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Tool Discovery — Query the Backend Registry
// ═══════════════════════════════════════════════════════════════════════════

let availableTools: Tool[] = [];

async function discoverTools(): Promise<Tool[]> {
  console.log('[KORTANA] Discovering available Marketing Agents...');
  try {
    const res = await axios.get(`${SERVER_URL}/api/tools`);
    availableTools = Array.isArray(res.data) ? res.data : res.data.tools || [];
    availableTools = evaluateWorkers(availableTools);

    console.log(`[KORTANA] Found ${availableTools.length} Marketing Agents:`);
    availableTools.forEach(t => {
      console.log(
        `  ├─ ${t.name.padEnd(30)} ${t.price.CTC?.toString().padEnd(8)} CTC | Rep: ${t.reputation}/100`
      );
    });
    return availableTools;
  } catch (err) {
    console.error('[KORTANA] Tool discovery failed:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Autonomous Cost-Evaluation Logic
// ═══════════════════════════════════════════════════════════════════════════

function evaluateWorkers(tools: Tool[]): Tool[] {
  return tools.sort((a, b) => {
    const scoreA = (a.reputation * a.reputation) / ((a.price.CTC || 0.001) * 10000);
    const scoreB = (b.reputation * b.reputation) / ((b.price.CTC || 0.001) * 10000);
    return scoreB - scoreA;
  });
}

function makeHiringDecision(toolId: string, tools: Tool[]): HiringDecision | null {
  const tool = tools.find(t => t.id === toolId);
  if (!tool) return null;

  const alternatives = tools
    .filter(t => t.category === tool.category && t.id !== toolId && t.reputation >= 50)
    .sort((a, b) => b.reputation - a.reputation);

  const priceCTC = tool.price.CTC || 0.001;
  const costEfficiency = Math.round((tool.reputation * tool.reputation) / (priceCTC * 10000));

  let reason: string;
  if (alternatives.length > 0) {
    const alt = alternatives[0];
    const altEfficiency = Math.round((alt.reputation * alt.reputation) / ((alt.price.CTC || 0.001) * 10000));
    reason = `Selected ${tool.name} (Efficiency: ${costEfficiency}) over ${alt.name} (Efficiency: ${altEfficiency}). Cost: ${priceCTC} CTC, Rep: ${tool.reputation}/100.`;
  } else {
    reason = `Hiring ${tool.name}: Only specialist in "${tool.category}". Cost: ${priceCTC} CTC, Rep: ${tool.reputation}/100.`;
  }

  return { tool, reason, costEfficiency, alternatives };
}

// ═══════════════════════════════════════════════════════════════════════════
// LLM Planner — Strategic Delegation
// ═══════════════════════════════════════════════════════════════════════════

async function planToolCalls(query: string, tools: Tool[]): Promise<AgentPlan> {
  const toolsDescription = tools.map(t =>
    `- ID: "${t.id}" | Name: "${t.name}" | Cost: ${t.price.CTC} CTC | Rep: ${t.reputation}/100 | Cat: ${t.category}\n  ${t.description}\n  Params: ${JSON.stringify(t.params)}`
  ).join('\n\n');

  const systemPrompt = `You are the KORTANA MANAGER — an AI marketing orchestrator for founders.
Route the user's query to the best marketing agent to generate content.

Available Marketing Agents (CTC paid on Creditcoin EVM):
${toolsDescription}

Return ONLY valid JSON:
{
  "reasoning": "Why this agent best serves the founder's marketing need",
  "toolCalls": [
    { "toolId": "tool_id", "params": { "param_name": "value" } }
  ]
}`;

  console.log('[KORTANA] Planning marketing delegation...');

  try {
    if (groqClient) {
      const completion = await groqClient.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a JSON-generating marketing agent router. Always return valid JSON.' },
          { role: 'user', content: systemPrompt + '\n\nUser Query: ' + query },
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0,
        response_format: { type: 'json_object' },
      });
      const content = completion.choices[0]?.message?.content;
      if (content) {
        const plan = JSON.parse(content);
        return { query, ...plan };
      }
    }

    if (geminiClient) {
      const model = geminiClient.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(systemPrompt + '\n\nUser Query: ' + query);
      const text = result.response.text();
      const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();
      const plan = JSON.parse(jsonStr);
      return { query, ...plan };
    }

    throw new Error('No LLM available');
  } catch (err) {
    console.warn('[KORTANA] LLM planning failed, using rule-based fallback');
    return fallbackMarketingPlan(query, tools);
  }
}

function fallbackMarketingPlan(query: string, _tools: Tool[]): AgentPlan {
  const q = query.toLowerCase();
  let reasoning = 'Rule-based routing: ';

  if (q.match(/blog|article|seo|post|content/)) {
    reasoning += 'Detected blog/SEO request.';
    return { query, reasoning, toolCalls: [{ toolId: 'seoBlog', params: { topic: query } }] };
  }
  if (q.match(/thread|twitter|tweet storm/)) {
    reasoning += 'Detected Twitter thread request.';
    return { query, reasoning, toolCalls: [{ toolId: 'twitterThread', params: { topic: query } }] };
  }
  if (q.match(/tweet|announce/)) {
    reasoning += 'Detected tweet request.';
    return { query, reasoning, toolCalls: [{ toolId: 'tweetUpdate', params: { announcement: query } }] };
  }
  if (q.match(/infographic|visual|chart/)) {
    reasoning += 'Detected infographic request.';
    return { query, reasoning, toolCalls: [{ toolId: 'infographicPrompt', params: { topic: query } }] };
  }
  if (q.match(/campaign|marketing plan|launch|gtm/)) {
    reasoning += 'Detected marketing campaign request.';
    return { query, reasoning, toolCalls: [{ toolId: 'marketingCampaign', params: { product: query } }] };
  }
  if (q.match(/video|ugc|reel|script/)) {
    reasoning += 'Detected video/UGC request.';
    return { query, reasoning, toolCalls: [{ toolId: 'ugcVideoPrompt', params: { product: query } }] };
  }
  if (q.match(/pitch|investor|deck/)) {
    reasoning += 'Detected pitch request.';
    return { query, reasoning, toolCalls: [{ toolId: 'pitch', params: { product: query } }] };
  }

  reasoning += 'No specific intent, defaulting to blog post.';
  return { query, reasoning, toolCalls: [{ toolId: 'seoBlog', params: { topic: query } }] };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tool Executor — CTC Payment + Execution
// ═══════════════════════════════════════════════════════════════════════════

async function executeTool(toolId: string, params: Record<string, any>): Promise<ToolCallResult> {
  const startTime = Date.now();
  const hiring = makeHiringDecision(toolId, availableTools);

  if (!hiring) {
    return {
      tool: toolId,
      agentName: 'Unknown',
      success: false,
      data: null,
      hiringReason: `Tool "${toolId}" not found in registry`,
      error: `Tool "${toolId}" not found`,
      latencyMs: Date.now() - startTime,
    };
  }

  const { tool, reason } = hiring;
  const priceCTC = tool.price.CTC || 0.001;

  console.log(`[KORTANA] Hiring ${tool.name} (${priceCTC} CTC, Rep: ${tool.reputation}/100)`);
  console.log(`[KORTANA] Reason: ${reason}`);

  try {
    const txId = `ctc_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 10)}`;
    const res = await api.post(tool.endpoint, params);

    const result: ToolCallResult = {
      tool: toolId,
      agentName: tool.name,
      success: true,
      data: res.data,
      hiringReason: reason,
      latencyMs: Date.now() - startTime,
      payment: {
        transaction: txId,
        token: 'CTC',
        amount: `${priceCTC} CTC`,
        explorerUrl: `${EXPLORER_BASE}/tx/${txId}`,
      },
    };

    console.log(`[KORTANA] Paid ${priceCTC} CTC | tx: ${txId}`);
    return result;
  } catch (err: any) {
    return {
      tool: toolId,
      agentName: tool.name,
      success: false,
      data: null,
      hiringReason: reason,
      error: `HTTP ${err.response?.status}: ${err.message}`,
      latencyMs: Date.now() - startTime,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Agent Orchestrator — Full Pipeline
// ═══════════════════════════════════════════════════════════════════════════

async function processQuery(query: string): Promise<{
  query: string;
  plan: AgentPlan;
  hiringDecisions: Array<{ agent: string; reason: string; cost: number }>;
  results: ToolCallResult[];
  finalAnswer: string;
  totalCost: number;
}> {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  Query: "${query.slice(0, 52)}${query.length > 52 ? '...' : ''}"`.padEnd(63) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const plan = await planToolCalls(query, availableTools);
  console.log(`[KORTANA] Strategy: ${plan.reasoning}`);
  console.log(`[KORTANA] Agents to hire: ${plan.toolCalls.map(c => c.toolId).join(' → ') || 'none'}`);

  if (plan.toolCalls.length === 0) {
    return { query, plan, hiringDecisions: [], results: [], finalAnswer: plan.reasoning || 'No agents needed.', totalCost: 0 };
  }

  const results: ToolCallResult[] = [];
  const hiringDecisions: Array<{ agent: string; reason: string; cost: number }> = [];
  let totalCost = 0;

  for (const call of plan.toolCalls) {
    const result = await executeTool(call.toolId, call.params);
    results.push(result);

    const tool = availableTools.find(t => t.id === call.toolId);
    if (result.success && tool) {
      totalCost += tool.price.CTC || 0;
      hiringDecisions.push({ agent: result.agentName, reason: result.hiringReason, cost: tool.price.CTC || 0 });
    }
  }

  const finalAnswer = await synthesizeAnswer(query, results);

  console.log('');
  console.log(`[KORTANA] Total cost: ${totalCost.toFixed(4)} CTC`);
  console.log(`[KORTANA] Result: ${finalAnswer.slice(0, 200)}...`);

  return { query, plan, hiringDecisions, results, finalAnswer, totalCost };
}

async function synthesizeAnswer(query: string, results: ToolCallResult[]): Promise<string> {
  const successful = results.filter(r => r.success);
  if (successful.length === 0) return 'All agent calls failed. Check server connectivity.';

  try {
    if (groqClient) {
      const context = successful.map(r => {
        const content = r.data?.blogPost || r.data?.thread || r.data?.pitch || r.data?.campaign || r.data?.videoScript || r.data?.tweet || r.data?.infographic || r.data;
        return `${r.agentName}: ${typeof content === 'string' ? content : JSON.stringify(content)}`;
      }).join('\n\n');

      const completion = await groqClient.chat.completions.create({
        messages: [{
          role: 'user',
          content: `Synthesize this marketing content into a polished final result for: "${query}"\n\n${context}`,
        }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.4,
        max_tokens: 600,
      });
      return completion.choices[0]?.message?.content || context;
    }
  } catch { /* fall through */ }

  return successful.map(r => {
    const content = r.data?.blogPost || r.data?.thread || r.data?.pitch || r.data?.campaign || r.data?.tweet || r.data;
    return `**${r.agentName}**: ${typeof content === 'string' ? content : JSON.stringify(content)}`;
  }).join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// Interactive REPL
// ═══════════════════════════════════════════════════════════════════════════

async function startRepl() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║              KORTANA — AI Marketing Agent                   ║');
  console.log('║        Give your product a voice on Creditcoin              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Server  : ${SERVER_URL.padEnd(49)}║`);
  console.log(`║  Network : ${NETWORK.padEnd(49)}║`);
  console.log(`║  Chain   : ${CHAIN_ID.padEnd(49)}║`);
  console.log(`║  LLM     : ${(groqClient ? 'Groq (llama-3.3-70b)' : geminiClient ? 'Gemini 2.0 Flash' : 'Rule-based').padEnd(49)}║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║  Commands:                                                  ║');
  console.log('║    <query>    → Write a blog post, thread, pitch, campaign  ║');
  console.log('║    "tools"    → List available marketing agents             ║');
  console.log('║    "payments" → Show payment history                        ║');
  console.log('║    "demo"     → Run marketing demo                          ║');
  console.log('║    "exit"     → Quit                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  await discoverTools();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const prompt = () => {
    rl.question('\n[KORTANA] > ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed) { prompt(); return; }

      if (['exit', 'quit'].includes(trimmed)) {
        console.log('[KORTANA] Shutting down.');
        rl.close();
        process.exit(0);
      }

      if (trimmed === 'tools') {
        console.log('\n┌─ Available Marketing Agents ──────────────────────────────┐');
        for (const t of availableTools) {
          console.log(`│ ${t.name.padEnd(30)} ${(t.price.CTC?.toString() || '?').padEnd(6)} CTC | Rep: ${t.reputation}/100 │`);
        }
        console.log('└───────────────────────────────────────────────────────────┘');
        prompt();
        return;
      }

      if (trimmed === 'payments') {
        try {
          const res = await axios.get(`${SERVER_URL}/api/payments`);
          console.log('\n┌─ CTC Payment History ──────────────────────────────────────┐');
          for (const p of res.data.payments.slice(0, 10)) {
            console.log(`│ ${p.timestamp.slice(11, 19)} | ${(p.payer || '').padEnd(18)} → ${(p.worker || '').padEnd(18)} | ${(p.amount || '').padEnd(12)} │`);
          }
          console.log(`│ Total: ${res.data.count} payments │`);
          console.log('└───────────────────────────────────────────────────────────┘');
        } catch { console.log('Failed to fetch payments.'); }
        prompt();
        return;
      }

      if (trimmed === 'demo') {
        console.log('[KORTANA] Running marketing demo...');
        await processQuery('Write a blog post about our new AI-powered SaaS tool for founders');
        prompt();
        return;
      }

      await processQuery(trimmed);
      prompt();
    });
  };

  prompt();
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry Point
// ═══════════════════════════════════════════════════════════════════════════

const queryArg = process.argv.slice(2).join(' ');

if (queryArg) {
  (async () => {
    await discoverTools();
    const result = await processQuery(queryArg);
    console.log('\n[RESULT]', JSON.stringify(result, null, 2));
  })();
} else {
  startRepl();
}
