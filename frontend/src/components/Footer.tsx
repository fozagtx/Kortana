'use client';

import React from 'react';
import { Github } from 'lucide-react';

export default function Footer() {
  return (
    <footer style={{
      marginTop: 80,
      borderTop: '1px solid rgba(110, 231, 183, 0.1)',
      background: '#0A0A0A',
      padding: '32px 0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 16,
    }}>
      <div>
        <span className="mono" style={{ fontWeight: 900, fontSize: '1rem', color: '#FFFFFF', letterSpacing: '-0.03em' }}>KORTANA</span>
        <span className="mono" style={{ fontSize: '0.75rem', color: '#6B7280', marginLeft: 12 }}>AI marketing agents for onchain founders</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { icon: Github, href: 'https://github.com/fozagtx/kortana', label: 'GitHub' },
          ].map(({ icon: Icon, href, label }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" title={label}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.08)', color: '#6B7280', textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#6EE7B7'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(110,231,183,0.3)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#6B7280'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              <Icon size={16} />
            </a>
          ))}
        </div>
        <span className="mono" style={{ fontSize: '0.7rem', color: '#4B5563' }}>&copy; 2026 KORTANA</span>
      </div>
    </footer>
  );
}
