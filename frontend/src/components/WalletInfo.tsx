'use client';

import React, { useState, useEffect } from 'react';

const SERVER_ADDRESS = process.env.NEXT_PUBLIC_SERVER_ADDRESS || '';
const RPC_URL = 'https://rpc.cc3-testnet.creditcoin.network';

export default function WalletInfo() {
  const shortAddr = (addr: string) => addr ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : '---';
  const [balance, setBalance] = useState<string | null>(null);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!SERVER_ADDRESS || SERVER_ADDRESS === '0x0000000000000000000000000000000000000000') {
        setBalance('---');
        return;
      }
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_getBalance',
            params: [SERVER_ADDRESS, 'latest'],
            id: 1,
          }),
          signal: controller.signal,
        });
        clearTimeout(id);

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const balanceWei = BigInt(data.result || '0x0');
        const balanceCTC = Number(balanceWei) / 1e18;
        setBalance(balanceCTC.toFixed(2));
      } catch {
        setBalance('---');
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* Network badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '4px 10px', borderRadius: 0,
        background: 'rgba(110, 231, 183, 0.05)',
        border: '1px solid rgba(110, 231, 183, 0.2)',
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#6EE7B7',
          boxShadow: '0 0 6px rgba(110, 231, 183, 0.6)',
        }} />
        <span style={{ fontSize: '0.6rem', color: '#6EE7B7', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
          CTC TESTNET
        </span>
      </div>

      {/* Server Address */}
      {SERVER_ADDRESS && (
        <div style={{
          padding: '4px 10px', borderRadius: 8,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginBottom: 1 }}>Server</div>
          <div style={{
            fontSize: '0.62rem', color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
          }}>
            {shortAddr(SERVER_ADDRESS)}
            <span style={{ marginLeft: 6, color: 'var(--accent-primary)', fontWeight: 700 }}>
              {balance ? `${balance} CTC` : '...'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
