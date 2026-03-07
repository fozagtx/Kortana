'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import WalletInfo from './WalletInfo';
import ConnectWalletButton from './ConnectWalletButton';
import { useI18n } from '@/lib/LanguageContext';

export default function Navbar() {
  const { t } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const isLanding = pathname === '/';

  const navItems = [
    { name: t.dashboard, path: '/dashboard' },
    { name: t.agents, path: '/agents' },
    { name: t.tools, path: '/tools' },
  ];

  const isActive = (path: string) => pathname === path || (path !== '/dashboard' && pathname.startsWith(path));

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 0',
      borderBottom: '1px solid rgba(110, 231, 183, 0.15)',
      marginBottom: 32,
      position: 'sticky',
      top: 0,
      backgroundColor: 'rgba(10, 10, 10, 0.95)',
      zIndex: 100,
      backdropFilter: 'blur(12px)',
    }}>
      {!isLanding && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="mono" style={{
            fontWeight: 800,
            fontSize: '1.5rem',
            color: '#FFFFFF',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Image src="/kort.jpeg" alt="Kortana" width={32} height={32} style={{ borderRadius: 6, objectFit: 'cover' }} />
            KORTANA
            <span style={{
              color: '#6EE7B7',
              fontSize: '0.65rem',
              fontWeight: 600,
              padding: '2px 8px',
              backgroundColor: 'rgba(110, 231, 183, 0.08)',
              border: '1px solid rgba(110, 231, 183, 0.25)',
              borderRadius: 4,
            }}>
              v1.0
            </span>
          </div>
        </div>
      )}

      {/* Desktop Navigation */}
      <nav style={{
        display: isLanding ? 'none' : 'flex',
        alignItems: 'center',
        gap: 24,
      }}
      className="desktop-nav"
      >
        <div style={{ display: 'flex', gap: 4 }}>
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.path}
              className="mono"
              style={{
                fontSize: '0.85rem',
                fontWeight: 600,
                color: isActive(item.path) ? '#FFFFFF' : '#9CA3AF',
                textDecoration: 'none',
                padding: '8px 14px',
                borderRadius: 8,
                transition: 'all 0.2s ease',
                position: 'relative',
                backgroundColor: isActive(item.path) ? 'rgba(110, 231, 183, 0.08)' : 'transparent',
                border: isActive(item.path) ? '1px solid rgba(110, 231, 183, 0.2)' : '1px solid transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.color = '#FFFFFF';
                  e.currentTarget.style.backgroundColor = 'rgba(110, 231, 183, 0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive(item.path)) {
                  e.currentTarget.style.color = '#9CA3AF';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {item.name}
            </Link>
          ))}
        </div>
        <WalletInfo />
        <div style={{ width: 1, height: 24, background: 'rgba(255, 255, 255, 0.1)', margin: '0 8px' }}></div>
        <ConnectWalletButton />
      </nav>

      {/* Mobile Hamburger */}
      <button
        className="mobile-menu-btn"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        style={{
          display: isLanding ? 'none' : 'none',
          flexDirection: 'column',
          gap: 5,
          padding: 10,
          background: 'transparent',
          border: '1px solid rgba(110, 231, 183, 0.2)',
          borderRadius: 8,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{
          width: 22,
          height: 2,
          backgroundColor: '#9CA3AF',
          borderRadius: 2,
          transition: 'all 0.3s ease',
          transform: mobileMenuOpen ? 'rotate(45deg) translateY(7px)' : 'none',
        }} />
        <div style={{
          width: 22,
          height: 2,
          backgroundColor: '#9CA3AF',
          borderRadius: 2,
          transition: 'all 0.3s ease',
          opacity: mobileMenuOpen ? 0 : 1,
        }} />
        <div style={{
          width: 22,
          height: 2,
          backgroundColor: '#9CA3AF',
          borderRadius: 2,
          transition: 'all 0.3s ease',
          transform: mobileMenuOpen ? 'rotate(-45deg) translateY(-7px)' : 'none',
        }} />
      </button>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="mobile-menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            backgroundColor: 'rgba(10, 10, 10, 0.98)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(110, 231, 183, 0.15)',
            borderTop: 'none',
            padding: 20,
            display: 'none',
            flexDirection: 'column',
            gap: 8,
            animation: 'fadeInUp 0.3s ease',
          }}
        >
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.path}
              className="mono"
              onClick={() => setMobileMenuOpen(false)}
              style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: isActive(item.path) ? '#FFFFFF' : '#9CA3AF',
                textDecoration: 'none',
                padding: '12px 16px',
                borderRadius: 8,
                backgroundColor: isActive(item.path) ? 'rgba(110, 231, 183, 0.08)' : 'transparent',
                border: isActive(item.path) ? '1px solid rgba(110, 231, 183, 0.2)' : '1px solid transparent',
                transition: 'all 0.2s ease',
              }}
            >
              {item.name}
            </Link>
          ))}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <WalletInfo />
          </div>
        </div>
      )}

      <style jsx>{`
        @media (max-width: 768px) {
          .desktop-nav {
            display: none !important;
          }
          .mobile-menu-btn {
            display: flex !important;
          }
          .mobile-menu {
            display: flex !important;
          }
        }
      `}</style>
    </header>
  );
}
