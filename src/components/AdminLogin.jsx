import React, { useState } from 'react';
import { ShieldCheck, Wallet, AlertCircle } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL;

export default function AdminLogin({ onLoginSuccess }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const connectAndSign = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Prompt connection for wallets that require it (TronLink)
      if (window.tronLink && typeof window.tronLink.request === 'function') {
        await window.tronLink.request({ method: 'tron_requestAccounts' });
      }

      // 2. Validate that ANY TRON provider is injected and unlocked (Trust Wallet, OKX, etc.)
      const provider = window.tronWeb;

      if (!provider) {
        throw new Error('No TRON wallet detected. Please install TronLink, Trust Wallet, or a compatible extension.');
      }
      if (!provider.ready) {
        throw new Error('Your wallet is locked or disconnected. Please open the extension and unlock it.');
      }

      // 3. Extract the active address from the generic provider
      const clientAddress = provider.defaultAddress.base58;
      if (!clientAddress) {
        throw new Error('Could not retrieve active wallet address. Ensure your wallet is connected.');
      }

      // 4. Fetch challenge nonce
      const nonceRes = await fetch(`${API_URL}/auth/nonce`);
      if (!nonceRes.ok) throw new Error('Failed to fetch authentication nonce.');
      const { message } = await nonceRes.json();

      // 5. Sign nonce using the active wallet provider
      const signature = await provider.trx.signMessageV2(message);

      // 6. Authenticate with backend
      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ signature, address: clientAddress }),
      });

      const data = await loginRes.json();
      if (!loginRes.ok) throw new Error(data.error || 'Authentication failed');

      onLoginSuccess(clientAddress);
    } catch (err) {
      setError(err.message || 'Failed to connect to wallet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl text-center">
        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-emerald-400">
          <ShieldCheck className="w-8 h-8" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Admin Cryptographic Login</h1>
        <p className="text-slate-400 text-sm mb-8">
          Sign the authentication challenge using your authorized Master Wallet. No password required.
        </p>

        {error && (
          <div className="flex items-center gap-2 text-red-400 bg-red-950/40 border border-red-800 text-xs p-3 rounded-xl mb-6 text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={connectAndSign}
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3.5 px-4 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Wallet className="w-5 h-5" />
          {loading ? 'Awaiting Signature in Wallet...' : 'Connect & Sign In'}
        </button>
      </div>
    </div>
  );
}