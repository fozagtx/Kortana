import axios from 'axios';

export interface AgentCard {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  protocol: 'x402-REST' | 'MCP-Connect';
  price: { amount: number; unit: string };
  reputation: number;
  category: string;
}

export const EXTERNAL_AGENTS: AgentCard[] = [
  {
    id: 'canva-connect',
    name: 'Canva Connect',
    description: 'Generates Canva design briefs and visual content specs for marketing campaigns',
    capabilities: ['design-brief', 'visual-content', 'brand-assets'],
    protocol: 'MCP-Connect',
    price: { amount: 0.01, unit: 'CTC' },
    reputation: 88,
    category: 'design'
  },
  {
    id: 'analytics-agent',
    name: 'Analytics Agent',
    description: 'SEO metrics, keyword research, and content performance analytics for founders',
    capabilities: ['seo-metrics', 'keyword-research', 'performance-analytics'],
    protocol: 'x402-REST',
    price: { amount: 0.008, unit: 'CTC' },
    reputation: 91,
    category: 'analytics'
  },
];

/**
 * Call an external partner agent via its protocol.
 */
export async function callExternalAgent(
  agentId: string,
  params: Record<string, any>
): Promise<{ result: any; cost: string; protocol: string }> {
  console.log(`[Adapter] Calling ${agentId} with params:`, JSON.stringify(params));
  const agent = EXTERNAL_AGENTS.find(a => a.id === agentId);
  if (!agent) throw new Error(`External agent not found: ${agentId}`);

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 400));

  // Generic stub result for partner agents
  const result = {
    agent: agent.name,
    protocol: agent.protocol,
    output: `[${agent.name}] Processed request: ${JSON.stringify(params)}`,
    timestamp: new Date().toISOString(),
  };

  return {
    result,
    cost: `${agent.price.amount} ${agent.price.unit}`,
    protocol: agent.protocol,
  };
}
