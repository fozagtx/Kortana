/**
 * Test Client — Manual verification that the Kortana backend endpoints work
 *
 * This script calls each paid marketing agent endpoint.
 * It sends a demo payment header so the backend accepts the request.
 *
 * Run: npx tsx agent/src/test-client.ts
 * Requires: backend running on AGENT_SERVER_URL
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });
dotenv.config();

const SERVER_URL = (process.env.AGENT_SERVER_URL || 'http://localhost:4002').replace(/\/$/, '');
const AGENT_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || 'demo';

// Simple axios client with demo payment header
const api = axios.create({
  baseURL: SERVER_URL,
  headers: {
    'x-payment-response': `demo_${AGENT_PRIVATE_KEY.slice(0, 8)}_${Date.now()}`,
    'Content-Type': 'application/json',
  },
});

console.log('');
console.log('================================================================');
console.log('  KORTANA TEST CLIENT — Marketing Agent Suite');
console.log('================================================================');
console.log(`  Server  : ${SERVER_URL}`);
console.log('================================================================');
console.log('');

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(label: string, fn: () => Promise<void>) {
    try {
      console.log(`[TEST] ${label}...`);
      await fn();
      console.log(`[PASS] ${label}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${label}: ${err.response?.data?.error || err.message}`);
      failed++;
    }
  }

  // Health check
  await test('GET /health', async () => {
    const res = await axios.get(`${SERVER_URL}/health`);
    if (res.data.status !== 'ok') throw new Error('Health check failed');
    console.log(`       Network: ${res.data.network} | Agents: ${res.data.agents}`);
  });

  // Tool discovery
  await test('GET /api/tools', async () => {
    const res = await axios.get(`${SERVER_URL}/api/tools`);
    if (!Array.isArray(res.data) || res.data.length === 0) throw new Error('No tools returned');
    console.log(`       Found ${res.data.length} marketing agents`);
    res.data.forEach((t: any) => console.log(`       - ${t.name} (${t.price.CTC} CTC)`));
  });

  // SEO Blog Writer
  await test('POST /api/seo-blog (0.005 CTC)', async () => {
    const res = await api.post('/api/seo-blog', { topic: 'Why founders need AI marketing tools in 2026' });
    if (!res.data.blogPost) throw new Error('No blogPost in response');
    console.log(`       Words: ${res.data.wordCount} | Payment: ${res.data.payment?.amount}`);
  });

  // Twitter Thread
  await test('POST /api/twitter-thread (0.003 CTC)', async () => {
    const res = await api.post('/api/twitter-thread', { topic: 'Building in public as a solo founder' });
    if (!res.data.thread) throw new Error('No thread in response');
    console.log(`       Tweets: ${res.data.tweetCount} | Payment: ${res.data.payment?.amount}`);
  });

  // Tweet Update
  await test('POST /api/tweet-update (0.001 CTC)', async () => {
    const res = await api.post('/api/tweet-update', { announcement: 'We just launched our AI marketing tool for founders' });
    if (!res.data.tweet) throw new Error('No tweet in response');
    console.log(`       Chars: ${res.data.charCount} | Payment: ${res.data.payment?.amount}`);
  });

  // Pitch Maker
  await test('POST /api/pitch (0.006 CTC)', async () => {
    const res = await api.post('/api/pitch', { product: 'Kortana - AI marketing team for founders', stage: 'pre-seed' });
    if (!res.data.pitch) throw new Error('No pitch in response');
    console.log(`       Payment: ${res.data.payment?.amount}`);
  });

  // Marketing Campaign
  await test('POST /api/marketing-campaign (0.008 CTC)', async () => {
    const res = await api.post('/api/marketing-campaign', { product: 'My SaaS product' });
    if (!res.data.campaign) throw new Error('No campaign in response');
    console.log(`       Payment: ${res.data.payment?.amount}`);
  });

  // Agent Query (Manager Agent)
  await test('POST /api/agent/query', async () => {
    const res = await axios.post(`${SERVER_URL}/api/agent/query`, {
      query: 'Write a tweet about our new AI product launch'
    });
    if (!res.data.finalAnswer) throw new Error('No finalAnswer in response');
    console.log(`       Cost: ${res.data.totalCost?.CTC} CTC | Agents: ${res.data.results?.length}`);
  });

  console.log('');
  console.log('================================================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  console.log('');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
