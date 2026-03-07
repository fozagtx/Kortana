'use client';

import React, { useState } from 'react';
import EconomyGraph from '@/components/EconomyGraph';
import AgentChat from '@/components/AgentChat';
import TransactionLog from '@/components/TransactionLog';
import ToolCatalog from '@/components/ToolCatalog';
import ProtocolTrace from '@/components/ProtocolTrace';
import { useI18n } from '@/lib/LanguageContext';
import { useRequireWallet } from '@/lib/useRequireWallet';

const API = (process.env.NEXT_PUBLIC_API_URL || 'https://kortana-3p1o.onrender.com').replace(/\/$/, '');

export default function Home() {
  useRequireWallet();
  const { language, t } = useI18n();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [protocolData, setProtocolData] = useState<any[]>([]);
  const [hiringDecisions, setHiringDecisions] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _api = API; // retained for future use

  const handleNewPayments = () => setRefreshTrigger(prev => prev + 1);

  const handleProtocolTrace = (log: any) => {
    if (log.type === 'hiring_decision' || log.type === 'a2a-hire') {
      const decisionLog = log.type === 'a2a-hire' ? {
        tool: 'Agent Delegation',
        selectedAgent: log.worker,
        reason: log.reason || `Hire by ${log.hirer}`,
        valueScore: 100,
        alternatives: [],
        approved: true
      } : log;

      setHiringDecisions(prev => [...prev, decisionLog]);
      setRefreshTrigger(prev => prev + 1);
    } else {
      setProtocolData(prev => [...prev, log]);
    }
  };

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* ── Economy Graph ── */}
      <div style={{ marginBottom: 48 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            <span className="text-glow">{t.monitorTitle}</span> {t.monitorLabel}
          </h2>
          <span className="badge badge-stx">60FPS REALTIME</span>
        </div>
        <div style={{ borderRadius: 0, padding: 4, background: '#111111', border: '1px solid rgba(110, 231, 183, 0.15)' }}>
          <EconomyGraph refreshTrigger={refreshTrigger} />
        </div>
      </div>

      {/* ── Main Grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)',
        gap: 32,
      }}>
        {/* Left: Agent Chat */}
        <div className="glass-panel" style={{ height: 800, padding: 32, display: 'flex', flexDirection: 'column', border: 'var(--border-strong)' }}>
          <AgentChat
            onNewPayments={handleNewPayments}
            onProtocolTrace={handleProtocolTrace}
          />
        </div>

        {/* Right: Transaction Log + Protocol Trace */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, height: 800 }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <TransactionLog refreshTrigger={refreshTrigger} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <ProtocolTrace traces={protocolData} hiringDecisions={hiringDecisions} />
          </div>
        </div>
      </div>

      {/* ── Tool Catalog ── */}
      <div style={{ marginTop: 64 }}>
        <ToolCatalog />
      </div>
    </div>
  );
}
