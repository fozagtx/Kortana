/**
 * Generate Wallet — Create an EVM keypair for the Kortana agent
 *
 * Run: npx tsx agent/src/generate-wallet.ts
 * Copy the output into your .env as AGENT_PRIVATE_KEY
 *
 * Note: Uses ethers.js to generate a standard EVM wallet compatible with Creditcoin testnet.
 */

import { ethers } from 'ethers';

const wallet = ethers.Wallet.createRandom();

console.log('');
console.log('================================================================');
console.log('  NEW CREDITCOIN EVM WALLET (testnet)');
console.log('================================================================');
console.log(`  Address    : ${wallet.address}`);
console.log(`  Public Key : ${wallet.publicKey}`);
console.log(`  Private Key: ${wallet.privateKey.slice(2)}`); // Remove 0x prefix
console.log('================================================================');
console.log('');
console.log('  Add to your .env:');
console.log(`  AGENT_PRIVATE_KEY=${wallet.privateKey.slice(2)}`);
console.log(`  SERVER_ADDRESS=${wallet.address}`);
console.log('');
console.log('  Creditcoin Testnet Config:');
console.log('  Chain ID  : 102031');
console.log('  RPC       : https://rpc.cc3-testnet.creditcoin.network');
console.log('  Explorer  : https://creditcoin-testnet.blockscout.com');
console.log('');
