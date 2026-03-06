'use client';

import React, { useState } from 'react';
import { Shield, Lock, Eye, EyeOff, Code } from 'lucide-react';
import { useI18n } from '@/lib/LanguageContext';

interface ProtocolTraceEntry {
  step: string;
  httpStatus: number;
  headers: Record<string, string>;
  requestHeaders?: Record<string, string>;
  requestBody?: any;
  timestamp: string | number;
  paymentPayload?: string;
}

interface HiringDecision {
  tool: string;
  selectedAgent: string;
  reason: string;
  valueScore: number;
  alternatives: { id: string; score: number }[];
  approved: boolean;
}

interface Props {
  traces: ProtocolTraceEntry[];
  hiringDecisions: HiringDecision[];
}

export default function ProtocolTrace({ traces, hiringDecisions }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'protocol' | 'hiring'>('protocol');
  const [showTechnical, setShowTechnical] = useState(false);

  return (
    <div className="glass-panel" style={{ height: '100%', padding: 14, display: 'flex', flexDirection: 'column' }}>
      {/* Header with tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { key: 'protocol', label: t.techTrace, count: traces.length },
            { key: 'hiring', label: t.hiringLog, count: hiringDecisions.length },
          ] as const).map(t_tab => (
            <button
              key={t_tab.key}
              onClick={() => setTab(t_tab.key)}
              style={{
                padding: '3px 10px', fontSize: '0.6rem', fontWeight: 700,
                borderRadius: 6, border: '1px solid',
                borderColor: tab === t_tab.key ? 'var(--accent-cyan)' : 'var(--border-subtle)',
                background: tab === t_tab.key ? 'rgba(6,182,212,0.1)' : 'transparent',
                color: tab === t_tab.key ? 'var(--accent-cyan)' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
                letterSpacing: '0.03em',
              }}
            >
              {t_tab.label} {t_tab.count > 0 && <span style={{ opacity: 0.6 }}>({t_tab.count})</span>}
            </button>
          ))}
        </div>

        {tab === 'protocol' && traces.length > 0 && (
          <button
            onClick={() => setShowTechnical(!showTechnical)}
            style={{
              padding: '2px 8px', fontSize: '0.55rem', fontWeight: 600,
              borderRadius: 4, border: '1px solid var(--border-subtle)',
              background: showTechnical ? 'var(--accent-primary)' : 'transparent',
              color: showTechnical ? '#fff' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 4,
              cursor: 'pointer', transition: 'all 0.1s'
            }}
          >
            {showTechnical ? <EyeOff size={10} /> : <Eye size={10} />}
            {showTechnical ? 'HIDE TECH' : 'SHOW TECH'}
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'protocol' ? (
          traces.length === 0 ? (
            <EmptyState text={t.emptyProtocol} />
          ) : (
            traces.map((trace, i) => <TraceCard key={i} trace={trace} index={i} showTechnical={showTechnical} />)
          )
        ) : (
          hiringDecisions.length === 0 ? (
            <EmptyState text={t.emptyHiring} />
          ) : (
            hiringDecisions.map((decision, i) => <HiringCard key={i} decision={decision} />)
          )
        )}
      </div>
    </div>
  );
}

function TraceCard({ trace, index, showTechnical }: { trace: ProtocolTraceEntry; index: number; showTechnical: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = trace.httpStatus === 402 ? '#f59e0b' : trace.httpStatus === 200 ? '#10b981' : '#ef4444';

  const formatTimestamp = (ts: string | number) => {
    try {
      const n = typeof ts === 'number' ? ts : Number(ts);
      // if it looks like seconds (< year 2100 in ms), convert to ms
      const ms = n > 0 && n < 1e12 ? n * 1000 : n;
      const d = new Date(isNaN(n) ? ts : ms);
      if (isNaN(d.getTime())) return '--:--';
      return d.toLocaleTimeString();
    } catch {
      return '--:--';
    }
  };

  return (
    <div
      style={{
        padding: '8px 10px', marginBottom: 4,
        background: '#111111',
        border: `1px solid rgba(255,255,255,0.06)`,
        cursor: 'pointer', transition: 'all 0.15s',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: '0.55rem', fontWeight: 700,
          color: statusColor,
          fontFamily: 'var(--font-mono)',
          background: `${statusColor}15`,
          padding: '1px 6px',
          boxShadow: trace.httpStatus === 402 ? `0 0 8px ${statusColor}40` : 'none',
          border: `1px solid ${statusColor}40`,
        }}>
          {trace.httpStatus}
        </span>
        <span style={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: 600, flex: 1 }}>
          {trace.step}
        </span>
        <span style={{ fontSize: '0.5rem', color: '#4B5563', fontFamily: 'var(--font-mono)' }}>
          {formatTimestamp(trace.timestamp)}
        </span>
        <span style={{ fontSize: '0.6rem', color: '#4B5563' }}>
          {expanded ? '▾' : '▸'}
        </span>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{
          marginTop: 8, padding: 8,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.04)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.55rem', color: '#9CA3AF',
          lineHeight: 1.6,
        }}>
          {showTechnical && trace.requestHeaders && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#6EE7B7', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Lock size={10} /> Request Headers:
              </div>
              {Object.entries(trace.requestHeaders).map(([k, v]) => (
                <div key={k}>
                  <span style={{ color: '#A78BFA' }}>{k}:</span>{' '}
                  <span style={{ color: '#9CA3AF' }}>{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ color: '#6EE7B7', fontWeight: 700, marginBottom: 4 }}>
            Response Headers:
          </div>
          {Object.entries(trace.headers || {}).map(([k, v]) => (
            <div key={k}>
              <span style={{ color: '#6EE7B7' }}>{k}:</span>{' '}
              <span style={{ color: '#9CA3AF' }}>{typeof v === 'string' ? v.slice(0, 120) : JSON.stringify(v).slice(0, 120)}</span>
            </div>
          ))}

          {trace.paymentPayload && (
            <>
              <div style={{ color: '#F59E0B', fontWeight: 700, marginTop: 8, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Shield size={10} /> x402 Payment Payload (EIP-712):
              </div>
              <pre style={{
                color: '#9CA3AF',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.55rem',
                overflowX: 'auto',
                padding: 8,
                background: '#0A0A0A',
                margin: 0,
                borderLeft: '2px solid #F59E0B'
              }}>
                {(() => {
                  try { return JSON.stringify(JSON.parse(trace.paymentPayload), null, 2); }
                  catch { return trace.paymentPayload; }
                })()}
              </pre>
            </>
          )}

          {showTechnical && trace.requestBody && (
            <div style={{ marginTop: 8 }}>
              <div style={{ color: '#A78BFA', fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Code size={10} /> Request Body:
              </div>
              <pre style={{
                color: '#9CA3AF',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.55rem',
                padding: 4,
                background: '#0A0A0A',
              }}>
                {JSON.stringify(trace.requestBody, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HiringCard({ decision }: { decision: HiringDecision }) {
  const approvedColor = '#6EE7B7';
  const rejectedColor = '#EF4444';
  const statusColor = decision.approved ? approvedColor : rejectedColor;

  return (
    <div style={{
      padding: '12px 14px', marginBottom: 4,
      background: '#111111',
      border: `1px solid ${decision.approved ? 'rgba(110,231,183,0.15)' : 'rgba(239,68,68,0.12)'}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="mono" style={{ fontSize: '0.65rem', fontWeight: 800, color: '#FFFFFF' }}>
            {decision.tool}
          </span>
          <span style={{
            fontSize: '0.5rem', fontWeight: 700, padding: '1px 6px',
            background: `${statusColor}14`,
            border: `1px solid ${statusColor}40`,
            color: statusColor,
            fontFamily: 'var(--font-mono)',
          }}>
            {decision.approved ? 'HIRED' : 'REJECTED'}
          </span>
        </div>
        <span className="mono" style={{ fontSize: '0.55rem', color: '#6EE7B7', fontWeight: 700 }}>
          score: {decision.valueScore?.toFixed(1)}
        </span>
      </div>

      <div style={{ fontSize: '0.6rem', color: '#9CA3AF', marginBottom: 6, lineHeight: 1.5 }}>
        <span style={{ color: '#6B7280' }}>→ </span>
        <strong style={{ color: '#FFFFFF' }}>{decision.selectedAgent}</strong>
        <span style={{ color: '#6B7280' }}> — </span>
        {decision.reason}
      </div>

      {decision.alternatives?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, fontSize: '0.5rem', color: '#4B5563', flexWrap: 'wrap' }}>
          <span className="mono">ALT:</span>
          {decision.alternatives.slice(0, 3).map((alt, i) => (
            <span key={i} className="mono" style={{ color: '#6B7280' }}>
              {alt.id}({alt.score?.toFixed(1)})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: 20, textAlign: 'center',
      color: 'var(--text-muted)', fontSize: '0.65rem',
      lineHeight: 1.5,
    }}>
      {text}
    </div>
  );
}
