'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { connectMetaMask, getConnectedAccount, addCreditcoinTestnet, isMetaMaskAvailable } from '../lib/userSession';

export default function ConnectWalletButton() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [account, setAccount] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    getConnectedAccount().then(setAccount);

    if (isMetaMaskAvailable()) {
      const handleAccountsChanged = (accounts: string[]) => {
        setAccount(accounts[0] || null);
      };
      (window as any).ethereum.on('accountsChanged', handleAccountsChanged);
      return () => {
        (window as any).ethereum.removeListener('accountsChanged', handleAccountsChanged);
      };
    }
  }, []);

  if (!mounted) return null;

  if (account) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{
          padding: '8px 12px',
          borderRadius: 0,
          background: 'rgba(110, 231, 183, 0.08)',
          border: '1px solid rgba(110, 231, 183, 0.3)',
          color: '#6EE7B7',
          fontSize: '0.85rem',
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
        }}>
          {account.slice(0, 6)}...{account.slice(-4)}
        </div>
        <button
          onClick={() => { setAccount(null); router.push('/'); }}
          style={{
            padding: '8px 12px',
            borderRadius: 0,
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#6B7280',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={async () => {
        await addCreditcoinTestnet();
        const acc = await connectMetaMask();
        setAccount(acc);
      }}
      style={{
        padding: '8px 16px',
        borderRadius: 0,
        background: '#6EE7B7',
        color: '#0A0A0A',
        border: '1px solid #6EE7B7',
        cursor: 'pointer',
        fontSize: '0.9rem',
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.filter = 'brightness(1.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.filter = 'brightness(1)';
      }}
    >
      Connect Wallet
    </button>
  );
}
