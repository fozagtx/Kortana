'use client';

import React, { useState, useRef, useMemo } from 'react';
import { PenTool, Twitter, FileImage, Megaphone, Video, TrendingUp, Rocket, Activity } from 'lucide-react';

// ─── Agent definitions ────────────────────────────────────────────────────────

const AGENTS = [
  { id: 'seo-blog',          name: 'SEO Blog Writer',   price: '0.005', icon: PenTool,    color: '#6EE7B7', label: 'CONTENT' },
  { id: 'twitter-thread',    name: 'Thread Writer',     price: '0.003', icon: Twitter,    color: '#60A5FA', label: 'SOCIAL' },
  { id: 'tweet-update',      name: 'Tweet Updates',     price: '0.001', icon: Activity,   color: '#A78BFA', label: 'SOCIAL' },
  { id: 'infographic',       name: 'Infographics',      price: '0.002', icon: FileImage,  color: '#FB923C', label: 'VISUAL' },
  { id: 'marketing-campaign',name: 'Campaigns',         price: '0.008', icon: Megaphone,  color: '#F472B6', label: 'STRATEGY' },
  { id: 'ugc-video',         name: 'UGC Video Prompts', price: '0.004', icon: Video,      color: '#34D399', label: 'VIDEO' },
  { id: 'pitch',             name: 'Pitch Maker',       price: '0.006', icon: TrendingUp, color: '#FBBF24', label: 'INVESTOR' },
];

// ─── Main activity chart ──────────────────────────────────────────────────────

const WEEK = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function ActivityChart({ onDeploy, connecting }: { onDeploy: () => void; connecting: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 320, H = 100;
  const PAD = { top: 12, bottom: 20, left: 4, right: 4 };

  const getX = (i: number) => PAD.left + (i / (WEEK.length - 1)) * (W - PAD.left - PAD.right);
  // static decorative wave — no real data
  const WAVE_Y = [72, 58, 64, 42, 52, 34, 28];
  const points = WEEK.map((_, i) => ({ x: getX(i), y: WAVE_Y[i] }));

  const linePath = points.reduce((acc, pt, i) => {
    if (i === 0) return `M${pt.x},${pt.y}`;
    const p = points[i - 1];
    const cpx = (p.x + pt.x) / 2;
    return `${acc} C${cpx},${p.y} ${cpx},${pt.y} ${pt.x},${pt.y}`;
  }, '');

  const areaPath = `${linePath} L${getX(WEEK.length - 1)},${H - PAD.bottom} L${getX(0)},${H - PAD.bottom} Z`;

  const scatterDots = useMemo(() => Array.from({ length: 20 }, (_, i) => ({
    x: 20 + (i % 5) * 60 + (Math.random() - 0.5) * 30,
    y: 8 + Math.floor(i / 5) * 16 + (Math.random() - 0.5) * 8,
    r: 1 + Math.random() * 1.5,
    o: 0.15 + Math.random() * 0.2,
  })), []);

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0, minD = Infinity;
    WEEK.forEach((_, i) => { const d = Math.abs(getX(i) - relX); if (d < minD) { minD = d; closest = i; } });
    setHovered(closest);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div className="mono" style={{ fontSize: '0.65rem', color: '#6B7280', letterSpacing: '0.1em', marginBottom: 6 }}>YOUR AI MARKETING TEAM</div>
          <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.04em', lineHeight: 1 }}>
            7 Agents Ready
          </div>
          <div className="mono" style={{ fontSize: '0.65rem', color: '#9CA3AF', marginTop: 6 }}>
            Connect wallet to deploy
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: '1px solid rgba(110,231,183,0.25)', background: 'rgba(110,231,183,0.06)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6EE7B7', animation: 'bentoPulse 1.5s infinite' }} />
          <span className="mono" style={{ fontSize: '0.6rem', color: '#6EE7B7', fontWeight: 700 }}>STANDBY</span>
        </div>
      </div>

      {/* Decorative chart */}
      <div style={{ flex: 1 }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', cursor: 'crosshair' }}
          onMouseMove={onMouseMove}
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id="bentoArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6EE7B7" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {WEEK.map((_, i) => (
            <line key={i} x1={getX(i)} y1={PAD.top} x2={getX(i)} y2={H - PAD.bottom}
              stroke="rgba(110,231,183,0.07)" strokeWidth="1" strokeDasharray="3 4"
              opacity={hovered === i ? 0.6 : 0.3} />
          ))}

          {scatterDots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#6EE7B7" opacity={d.o} />
          ))}

          <path d={areaPath} fill="url(#bentoArea)" />
          <path d={linePath} fill="none" stroke="#6EE7B7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />

          {hovered !== null && (
            <g>
              <circle cx={points[hovered].x} cy={points[hovered].y} r={7} fill="rgba(110,231,183,0.12)" />
              <circle cx={points[hovered].x} cy={points[hovered].y} r={3.5} fill="#0A0A0A" stroke="#6EE7B7" strokeWidth="2" />
            </g>
          )}

          {WEEK.map((d, i) => (
            <text key={i} x={getX(i)} y={H - 4} textAnchor="middle"
              style={{ fontSize: 8, fill: hovered === i ? '#6EE7B7' : '#374151', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
              {d}
            </text>
          ))}
        </svg>
      </div>

      {/* CTA */}
      <button
        onClick={onDeploy}
        disabled={connecting}
        style={{ width: '100%', padding: '11px', background: '#6EE7B7', color: '#0A0A0A', border: 'none', cursor: connecting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.06em', transition: 'all 0.2s', opacity: connecting ? 0.7 : 1, marginTop: 12 }}
        onMouseEnter={e => { if (!connecting) (e.currentTarget as HTMLElement).style.filter = 'brightness(1.1)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1)'; }}
      >
        <Rocket size={14} />
        {connecting ? 'CONNECTING...' : 'START AGENTS'}
      </button>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: typeof AGENTS[0] }) {
  const [hovered, setHovered] = useState(false);
  const Icon = agent.icon;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#161616' : '#111111',
        border: `1px solid ${hovered ? agent.color + '40' : 'rgba(255,255,255,0.06)'}`,
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 16,
        transition: 'all 0.2s ease',
        cursor: 'default',
        boxShadow: hovered ? `0 0 20px ${agent.color}0D` : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 32, height: 32, background: `${agent.color}14`, border: `1px solid ${agent.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={hovered ? agent.color : '#6B7280'} />
        </div>
        <span className="mono" style={{ fontSize: '0.55rem', color: hovered ? agent.color : '#4B5563', fontWeight: 700, letterSpacing: '0.08em', transition: 'color 0.2s' }}>
          {agent.label}
        </span>
      </div>

      <div>
        <div className="mono" style={{ fontSize: '0.72rem', fontWeight: 800, color: hovered ? '#FFFFFF' : '#9CA3AF', textTransform: 'uppercase', lineHeight: 1.3, transition: 'color 0.2s', marginBottom: 6 }}>
          {agent.name}
        </div>
        <div className="mono" style={{ fontSize: '0.65rem', color: '#4B5563', fontWeight: 700 }}>
          {agent.price} CTC / job
        </div>
      </div>
    </div>
  );
}

// ─── Bento Grid ───────────────────────────────────────────────────────────────

export default function AgentBento({ onDeploy, connecting }: { onDeploy: () => void; connecting: boolean }) {
  return (
    <div style={{ width: '100%', maxWidth: 760 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'auto auto auto',
        gap: 8,
      }}>
        {/* Hero chart card — spans 2 cols, 2 rows */}
        <div style={{
          gridColumn: 'span 2',
          gridRow: 'span 2',
          background: '#0D0D0D',
          border: '1px solid rgba(110,231,183,0.2)',
          padding: '24px',
          boxShadow: '0 0 40px rgba(110,231,183,0.05)',
        }}>
          <ActivityChart onDeploy={onDeploy} connecting={connecting} />
        </div>

        {/* Agents 0 and 1 go in right col */}
        <AgentCard agent={AGENTS[0]} />
        <AgentCard agent={AGENTS[1]} />

        {/* Row 2: 3 agent cards */}
        <AgentCard agent={AGENTS[2]} />
        <AgentCard agent={AGENTS[3]} />
        <AgentCard agent={AGENTS[4]} />

        {/* Row 3: last 2 agents + stat block */}
        <AgentCard agent={AGENTS[5]} />
        <AgentCard agent={AGENTS[6]} />

        {/* Final cell: chain info */}
        <div style={{ background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.04)', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div className="mono" style={{ fontSize: '0.6rem', color: '#4B5563', letterSpacing: '0.1em' }}>NETWORK</div>
          <div>
            <div className="mono" style={{ fontSize: '0.75rem', fontWeight: 800, color: '#6B7280' }}>CREDITCOIN</div>
            <div className="mono" style={{ fontSize: '0.65rem', color: '#374151', marginTop: 2 }}>CHAIN 102031</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#6EE7B7', animation: 'bentoPulse 2s infinite' }} />
            <span className="mono" style={{ fontSize: '0.6rem', color: '#6EE7B7', fontWeight: 700 }}>TESTNET LIVE</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes bentoPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
