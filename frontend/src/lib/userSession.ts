// EVM wallet session utilities for Kortana (Creditcoin EVM Testnet)
// EVM wallet session utilities using MetaMask/EVM interface.

export const CREDITCOIN_TESTNET = {
  chainId: '0x18EEF', // 102031 in hex
  chainName: 'Creditcoin Testnet',
  nativeCurrency: { name: 'CTC', symbol: 'CTC', decimals: 18 },
  rpcUrls: ['https://rpc.cc3-testnet.creditcoin.network'],
  blockExplorerUrls: ['https://creditcoin-testnet.blockscout.com'],
};

export function isMetaMaskAvailable(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
}

export async function connectMetaMask(): Promise<string | null> {
  if (!isMetaMaskAvailable()) return null;
  try {
    const accounts = await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
    return accounts[0] || null;
  } catch {
    return null;
  }
}

export async function addCreditcoinTestnet(): Promise<void> {
  if (!isMetaMaskAvailable()) return;
  try {
    await (window as any).ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [CREDITCOIN_TESTNET],
    });
  } catch {
    // Already added or user rejected
  }
}

export async function getConnectedAccount(): Promise<string | null> {
  if (!isMetaMaskAvailable()) return null;
  try {
    const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
    return accounts[0] || null;
  } catch {
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  // MetaMask doesn't support programmatic disconnect — just clear local state
}
