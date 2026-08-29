const EXPLORER_BASE = import.meta.env.VITE_TRON_NETWORK === 'testnet'
  ? 'https://nile.tronscan.org'
  : 'https://tronscan.org';

export function explorerTxUrl(txId) {
  return `${EXPLORER_BASE}/#/transaction/${txId}`;
}

export function explorerAddressUrl(address) {
  return `${EXPLORER_BASE}/#/address/${address}`;
}