export type Language = 'en';

export const translations = {
  en: {
    // Navbar
    dashboard: 'Dashboard',
    agents: 'Agents',
    tools: 'Tools',
    // AgentChat
    managerAgent: 'Manager Agent',
    placeholder: 'Describe your marketing goal...',
    thinking: 'Thinking...',
    // TransactionLog
    transactions: 'Transactions',
    total: 'total',
    a2a: 'A2A',
    emptyTransactions: 'No transactions yet. Send a query to get started.',
    depth: 'depth',
    flashSwap: 'Flash Swap',
    swapAmount: 'Swap amount',
    reason: 'Reason',
    viewExplorer: 'View on Explorer →',
    // ToolCatalog
    loadingAgents: 'Loading agents...',
    availableAgents: 'Available Agents',
    globalNetwork: 'Global Network',
    // Dashboard
    monitorTitle: 'PAYMENT',
    monitorLabel: 'MONITOR',
    // Agents page
    marketplaceTitle: 'Agent Marketplace',
    marketplaceSubtitle: 'Discover and hire specialized AI marketing agents. Pay per task with CTC micropayments on the Creditcoin network.',
    sortBy: 'Sort by',
    rep: 'Reputation',
    efficiency: 'Efficiency',
    price: 'Price',
    totalAgents: 'Total Agents',
    networkActive: 'Network Active',
    avgReputation: 'Avg Reputation',
    totalJobs: 'Total Jobs',
    online: 'ONLINE',
    offline: 'OFFLINE',
    jobsCompleted: 'Jobs completed',
    reliability: 'Reliability',
    hireAgent: 'Hire Agent',
    connectionError: 'Unable to connect to Agent Registry',
    // ProtocolTrace
    techTrace: 'TECH TRACE',
    hiringLog: 'HIRING LOG',
    emptyProtocol: 'No protocol traces yet. Submit a query to see the x402 payment flow.',
    emptyHiring: 'No hiring decisions yet. The manager agent will log selections here.',
  },
};

export type Translations = typeof translations.en;
