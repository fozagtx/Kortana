'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getConnectedAccount } from './userSession';

export function useRequireWallet() {
  const router = useRouter();
  useEffect(() => {
    getConnectedAccount().then((acc) => {
      if (!acc) router.replace('/');
    });
  }, [router]);
}
