'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { connectMetaMask, getConnectedAccount, addCreditcoinTestnet } from '@/lib/userSession';
import AgentBento from '@/components/AgentBento';

export default function LandingPage() {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    getConnectedAccount().then((acc) => {
      if (acc) router.replace('/dashboard');
    });
  }, [router]);

  const handleDeploy = async () => {
    setConnecting(true);
    try {
      await addCreditcoinTestnet();
      const acc = await connectMetaMask();
      if (acc) router.push('/dashboard');
    } catch {
      // user rejected or no metamask
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', position: 'relative', overflow: 'hidden' }}>

      {/* Background grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(110,231,183,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(110,231,183,0.03) 1px, transparent 1px)', backgroundSize: '48px 48px', pointerEvents: 'none' }} />

      {/* Glow */}
      <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)', width: 700, height: 400, background: 'radial-gradient(ellipse, rgba(110,231,183,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Wordmark */}
        <div className="mono" style={{ fontSize: '1.6rem', fontWeight: 900, color: '#FFFFFF', letterSpacing: '-0.04em', marginBottom: 20 }}>
          KORTANA
        </div>

        {/* Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', border: '1px solid rgba(110,231,183,0.3)', background: 'rgba(110,231,183,0.06)', marginBottom: 28 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6EE7B7', animation: 'ldPulse 2s infinite' }} />
          <span className="mono" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6EE7B7', letterSpacing: '0.1em' }}>FOR ONCHAIN FOUNDERS</span>
        </div>

        {/* Headline */}
        <h1 className="mono" style={{ fontSize: 'clamp(2.4rem, 6vw, 4.5rem)', fontWeight: 900, lineHeight: 0.92, letterSpacing: '-0.04em', color: '#FFFFFF', marginBottom: 20 }}>
          Multi-agent<br />
          <span style={{ color: '#6EE7B7' }}>marketing</span> engine
        </h1>

        {/* Sub */}
        <p style={{ fontSize: '1rem', color: '#9CA3AF', lineHeight: 1.65, maxWidth: 480, margin: '0 auto 40px', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
          AI agents working in parallel to scale your onchain brand — blogs, threads, pitches, and campaigns, all paid with CTC.
        </p>

        {/* Connect Wallet CTA */}
        <button
          onClick={handleDeploy}
          disabled={connecting}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '13px 28px', background: '#6EE7B7', color: '#0A0A0A', border: 'none', cursor: connecting ? 'wait' : 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.05em', marginBottom: 32, transition: 'all 0.2s', opacity: connecting ? 0.7 : 1 }}
          onMouseEnter={e => { if (!connecting) { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.1)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; } }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
        >
          {connecting ? 'CONNECTING...' : 'CONNECT WALLET'}
        </button>

        {/* Bento Grid */}
        <AgentBento onDeploy={handleDeploy} connecting={connecting} />

        {/* Hint */}
        <p className="mono" style={{ fontSize: '0.7rem', color: '#374151', letterSpacing: '0.05em', marginTop: 20 }}>
          CONNECT METAMASK · CREDITCOIN TESTNET · CHAIN 102031
        </p>
      </div>

      <style jsx>{`
        @keyframes ldPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
