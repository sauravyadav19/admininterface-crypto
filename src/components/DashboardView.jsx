import React, { useState, useEffect } from 'react';
import { Check, X, RefreshCw, PlusCircle, ExternalLink, ArrowUpRight, ArrowDownLeft, Users } from 'lucide-react';
import { explorerTxUrl, explorerAddressUrl } from '../utils/explorer';

const API_URL = import.meta.env.VITE_API_URL;
const USDT_CONTRACT = import.meta.env.VITE_USDT_CONTRACT;
const CUSTOMER_APP_URL = import.meta.env.VITE_CUSTOMER_APP_URL;

export default function DashboardView({ adminAddress, onLogout }) {
  const [payments, setPayments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [newAmount, setNewAmount] = useState('');
  const [newPayerName, setNewPayerName] = useState('');
  const [newPayerEmail, setNewPayerEmail] = useState('');
  const [createError, setCreateError] = useState('');
  const [activeTab, setActiveTab] = useState('incoming');
  const [loading, setLoading] = useState(false);
  const [settlingIds, setSettlingIds] = useState(new Set());
  const [createdLink, setCreatedLink] = useState(null);
  const [users, setUsers] = useState([]);
  const [balanceEdits, setBalanceEdits] = useState({});
  const [savingUserId, setSavingUserId] = useState(null);
  const [publicBalance, setPublicBalance] = useState('');
  const [savingPublicBalance, setSavingPublicBalance] = useState(false);
  const [publicBalanceMsg, setPublicBalanceMsg] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const resPay = await fetch(API_URL + '/admin/payments', { credentials: 'include' });
      const resReq = await fetch(API_URL + '/admin/requests', { credentials: 'include' });
      const resUsers = await fetch(API_URL + '/admin/users', { credentials: 'include' });
      const resSettings = await fetch(API_URL + '/admin/settings/public-balance', { credentials: 'include' });
      const settingsData = await resSettings.json();
      setPublicBalance(String(settingsData.publicAdminBalance ?? 0));
      const payData = await resPay.json();
      const reqData = await resReq.json();
      const usersData = await resUsers.json();
      setPayments(payData || []);
      setRequests(reqData || []);
      setUsers(usersData || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const withSettleGuard = async (id, fn) => {
    if (settlingIds.has(id)) return;
    setSettlingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    try {
      await fn();
    } finally {
      setSettlingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleSavePublicBalance = async () => {
  const value = parseFloat(publicBalance);
  if (isNaN(value) || value < 0) {
    setPublicBalanceMsg('Enter a valid non-negative number.');
    return;
  }
  setSavingPublicBalance(true);
  setPublicBalanceMsg('');
  try {
    const res = await fetch(API_URL + '/admin/settings/public-balance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ publicAdminBalance: value }),
    });
    const data = await res.json();
    if (!res.ok) {
      setPublicBalanceMsg(data.error || 'Failed to update.');
      return;
    }
    setPublicBalanceMsg('Saved — now live on the public site.');
  } catch (err) {
    setPublicBalanceMsg('Failed to update.');
  } finally {
    setSavingPublicBalance(false);
  }
};

  const handleApprovePayout = (request) => withSettleGuard(request._id, async () => {
    if (!window.tronWeb || !window.tronWeb.ready) {
      alert('Unlock your TRON wallet extension to execute this transaction.');
      return;
    }

    try {
      const contract = await window.tronWeb.contract().at(USDT_CONTRACT);
      const amountInSun = Math.round(request.amount * 1e6);
      const txId = await contract.transfer(request.destinationAddress, amountInSun).send();

      const settleRes = await fetch(API_URL + '/admin/requests/' + request._id + '/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ txId: txId, status: 'APPROVED' }),
      });

      if (!settleRes.ok) {
        const data = await settleRes.json().catch(() => ({}));
        alert('Payout was sent on-chain (TxID: ' + txId + ') but recording it failed: ' + (data.error || settleRes.status) + '. Record this manually.');
        return;
      }

      alert('Payout sent! TxID: ' + txId);
      fetchData();
    } catch (err) {
      console.error(err);
      alert('Payout rejected or failed: ' + (err.message || err));
    }
  });

  const handleSaveBalance = async (userId) => {
  const raw = balanceEdits[userId];
  const value = parseFloat(raw);
  if (isNaN(value) || value < 0) {
    alert('Enter a valid non-negative number.');
    return;
  }

  setSavingUserId(userId);
  try {
    const res = await fetch(API_URL + '/admin/users/' + userId + '/balance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ walletBalance: value }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to update balance');
      return;
    }
    fetchData();
  } catch (err) {
    console.error(err);
    alert('Failed to update balance.');
  } finally {
    setSavingUserId(null);
  }
};

  const handleRejectPayout = (id) => withSettleGuard(id, async () => {
    if (!confirm('Reject this request?')) return;
    await fetch(API_URL + '/admin/requests/' + id + '/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'REJECTED' }),
    });
    fetchData();
  });

  const handleGenerateInvoice = async (e) => {
    e.preventDefault();
    setCreateError('');

    if (!newPayerName.trim()) {
      setCreateError('Please enter the customer\'s name.');
      return;
    }
    if (!newPayerEmail.trim()) {
      setCreateError('Please enter the customer\'s email.');
      return;
    }

    const res = await fetch(API_URL + '/payments/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: parseFloat(newAmount),
        payerName: newPayerName.trim(),
        payerEmail: newPayerEmail.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setCreateError(data.error || 'Failed to create invoice');
      return;
    }
    setCreatedLink(CUSTOMER_APP_URL + '/?invoice=' + data.id);
    setNewAmount('');
    setNewPayerName('');
    setNewPayerEmail('');
  };

  const getStatusClass = (status) => {
    if (status === 'PAID') return 'bg-emerald-950 text-emerald-400 border border-emerald-800';
    if (status === 'EXPIRED') return 'bg-slate-800 text-slate-400 border border-slate-700';
    return 'bg-amber-950 text-amber-400 border border-amber-800';
  };

  const getRequestStatusClass = (status) => {
    if (status === 'APPROVED') return 'bg-emerald-950 text-emerald-400';
    if (status === 'REJECTED') return 'bg-red-950 text-red-400';
    return 'bg-amber-950 text-amber-400';
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-white">USDT Gateway Admin</h1>
          <p className="text-xs font-mono text-slate-400 truncate max-w-xs">{adminAddress}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchData} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition" title="Refresh">
            <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          </button>
          <button onClick={onLogout} className="text-xs font-semibold text-red-400 bg-red-950/40 border border-red-800/60 px-3 py-2 rounded-lg hover:bg-red-900/50 transition">
            Disconnect
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('incoming')}
            className={'px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ' + (activeTab === 'incoming' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white')}
          >
            <ArrowDownLeft className="w-4 h-4" /> Received Payments ({payments.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={'px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ' + (activeTab === 'requests' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white')}
          >
            <ArrowUpRight className="w-4 h-4" /> Payout Requests ({requests.filter((r) => r.status === 'PENDING').length})
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={'px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ' + (activeTab === 'create' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white')}
          >
            <PlusCircle className="w-4 h-4" /> Create Payment Link
          </button>
          <button
              onClick={() => setActiveTab('users')}
              className={'px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ' + (activeTab === 'users' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white')}>
              <Users className="w-4 h-4" /> Users ({users.length})
          </button>
        </div>

        {activeTab === 'incoming' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-4">Invoice ID</th>
                  <th className="p-4">Name</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">From</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Verify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono text-xs">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-6 text-center text-slate-500 font-sans">No incoming payments recorded yet.</td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-800/30">
                      <td className="p-4 text-slate-400 truncate max-w-[100px]">{p._id}</td>
                      <td className="p-4 font-sans truncate max-w-[120px]">{p.payerName || 'N/A'}</td>
                      <td className="p-4 font-sans truncate max-w-[160px]">
                        {p.payerEmail ? (
                          <a href={'mailto:' + p.payerEmail} className="text-blue-400 hover:text-blue-300 underline">
                            {p.payerEmail}
                          </a>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td className="p-4 font-bold text-emerald-400">{p.expectedAmount} USDT</td>
                      <td className="p-4 truncate max-w-[140px]">
                        {p.fromAddress ? (
                          <a href={explorerAddressUrl(p.fromAddress)} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                            {p.fromAddress}
                          </a>
                        ) : (
                          <span className="text-slate-600">N/A</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={'px-2 py-1 rounded text-[10px] font-bold ' + getStatusClass(p.status)}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-4 text-slate-500 font-sans">{new Date(p.createdAt).toLocaleString()}</td>
                      <td className="p-4">
                        {p.incomingTxId ? (
                          <a
                            href={explorerTxUrl(p.incomingTxId)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 underline font-sans"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-600 font-sans">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

      {activeTab === 'users' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="p-4">Name</th>
                <th className="p-4">Email</th>
                <th className="p-4">Phone</th>
                <th className="p-4">Wallet Balance</th>
                <th className="p-4">Signed Up</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-xs">
              {users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-6 text-center text-slate-500">No users signed up yet.</td>
                </tr>
              ) : (
                users.map((u) => {
                  const editValue = balanceEdits[u.id] !== undefined ? balanceEdits[u.id] : String(u.walletBalance);
                  const isSaving = savingUserId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-800/30">
                      <td className="p-4 font-sans truncate max-w-[140px]">{u.name}</td>
                      <td className="p-4 font-mono truncate max-w-[180px]">
                        <a href={'mailto:' + u.email} className="text-blue-400 hover:text-blue-300 underline">
                          {u.email}
                        </a>
                      </td>
                      <td className="p-4 font-mono">{u.phone}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 font-sans">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editValue}
                            onChange={(e) =>
                              setBalanceEdits((prev) => ({ ...prev, [u.id]: e.target.value }))
                            }
                            className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-emerald-400 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </td>
                      <td className="p-4 text-slate-500 font-sans">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleSaveBalance(u.id)}
                          disabled={isSaving}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-50 font-sans"
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}   

      {activeTab === 'create' && (
  <div className="max-w-md mx-auto space-y-6">
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      <h3 className="text-lg font-bold text-white mb-1">Public Site Balance</h3>
      <p className="text-xs text-slate-500 mb-4">
        This number is shown publicly on the homepage to every visitor.
      </p>
      <div className="flex items-center gap-2">
        <span className="text-slate-500 font-mono">$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={publicBalance}
          onChange={(e) => setPublicBalance(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-emerald-400 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          onClick={handleSavePublicBalance}
          disabled={savingPublicBalance}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50"
        >
          {savingPublicBalance ? 'Saving...' : 'Update'}
        </button>
      </div>
      {publicBalanceMsg && (
        <p className={'text-xs mt-2 ' + (publicBalanceMsg.startsWith('Saved') ? 'text-emerald-400' : 'text-red-400')}>
          {publicBalanceMsg}
        </p>
      )}
    </div>
  </div>
)}     

        {activeTab === 'requests' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Email</th>
                  <th className="p-4">Destination Wallet</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Verify</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-xs">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-6 text-center text-slate-500">No payout requests pending.</td>
                  </tr>
                ) : (
                  requests.map((r) => {
                    const isSettling = settlingIds.has(r._id);
                    return (
                      <tr key={r._id} className="hover:bg-slate-800/30">
                        <td className="p-4 font-sans truncate max-w-[120px]">{r.requesterName || 'N/A'}</td>
                        <td className="p-4 font-sans truncate max-w-[160px]">
                          {r.requesterEmail ? (
                            <a href={'mailto:' + r.requesterEmail} className="text-blue-400 hover:text-blue-300 underline">
                              {r.requesterEmail}
                            </a>
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td className="p-4 font-mono truncate max-w-[200px]">
                          <a href={explorerAddressUrl(r.destinationAddress)} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                            {r.destinationAddress}
                          </a>
                        </td>
                        <td className="p-4 font-mono font-bold text-blue-400">{r.amount} USDT</td>
                        <td className="p-4">
                          <span className={'px-2 py-1 rounded text-[10px] font-bold ' + getRequestStatusClass(r.status)}>
                            {r.status}
                          </span>
                        </td>
                        <td className="p-4 font-mono">
                          {r.txId ? (
                            <a
                              href={explorerTxUrl(r.txId)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 underline font-sans"
                            >
                              View <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-600 font-sans">N/A</span>
                          )}
                        </td>
                        <td className="p-4 text-right space-x-2">
                          {r.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleApprovePayout(r)}
                                disabled={isSettling}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" /> {isSettling ? 'Processing...' : 'Sign and Pay'}
                              </button>
                              <button
                                onClick={() => handleRejectPayout(r._id)}
                                disabled={isSettling}
                                className="bg-red-950 hover:bg-red-900 text-red-400 border border-red-800 px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition disabled:opacity-50"
                              >
                                <X className="w-3.5 h-3.5" /> Reject
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'create' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md mx-auto shadow-xl">
            <h3 className="text-lg font-bold text-white mb-4">Generate Customer Payment Link</h3>
            <form onSubmit={handleGenerateInvoice} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Customer Name</label>
                <input
                  type="text"
                  placeholder="Jane Doe"
                  value={newPayerName}
                  onChange={(e) => setNewPayerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Customer Email</label>
                <input
                  type="email"
                  placeholder="jane@example.com"
                  value={newPayerEmail}
                  onChange={(e) => setNewPayerEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Invoice Amount (USDT)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  placeholder="100.00"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono focus:ring-2 focus:ring-purple-500 outline-none"
                  required
                />
              </div>

              {createError && <p className="text-red-400 text-sm bg-red-950/50 border border-red-800 p-3 rounded-lg">{createError}</p>}

              <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition">
                Create Link
              </button>
            </form>

            {createdLink && (
              <div className="mt-6 p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <span className="text-xs text-slate-400 block font-medium">Customer Payment URL:</span>
                <div className="flex items-center gap-2">
                  <input type="text" readOnly value={createdLink} className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-mono text-purple-300 outline-none" />
                  <a href={createdLink} target="_blank" rel="noreferrer" className="p-2 bg-purple-950 border border-purple-800 text-purple-300 rounded-lg hover:bg-purple-900">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}