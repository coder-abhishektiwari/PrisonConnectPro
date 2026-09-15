import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { apiClient } from '@/services/api/client';
import type { Wallet, Transaction, Inmate, WalletRequest, ListParams } from '@/services/api/wardenApi';

export function TrustAccountPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [inmates, setInmates] = useState<Record<string, Inmate>>({});
  const [pricing, setPricing] = useState<{ audioRate: number; videoRate: number }>({ audioRate: 1, videoRate: 2.5 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string|null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [statement, setStatement] = useState<{wallet: Wallet, transactions: Transaction[]} | null>(null);
  const [stmtLoading, setStmtLoading] = useState(false);
  const [tab, setTab] = useState<'all'|'charge'|'recharge'|'refund'>('all');
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeDesc, setRechargeDesc] = useState('');
  const [recharging, setRecharging] = useState(false);
  const [rechargeError, setRechargeError] = useState('');
  const [rechargeSuccess, setRechargeSuccess] = useState('');
  const [requests, setRequests] = useState<WalletRequest[]>([]);
  const [reqLoading, setReqLoading] = useState(false);

  const load = useCallback(async()=>{
    try{
      setError(null);
      const params: ListParams = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, search: search || undefined };
      const [wResult, im, reqs, pricingData] = await Promise.all([
        wardenApi.getWallets(params).catch(() => ({ items: [] as Wallet[], total: 0 })),
        wardenApi.getInmates().catch(()=>[] as Inmate[]),
        wardenApi.getWalletRequests().catch(()=>[] as WalletRequest[]),
        apiClient.get('/pricing').then((r) => r.data?.data).catch(()=> null as any).then((d: any) => (Array.isArray(d) ? d[0] : d)),
      ]);
      setWallets((wResult as any).items ?? []);
      setTotal((wResult as any).total ?? 0);
      const map: Record<string, Inmate> = {};
      (im as Inmate[]).forEach(i=> map[i.inmateId]=i);
      setInmates(map);
      setRequests((reqs as WalletRequest[]) ?? []);
      if (pricingData) {
        setPricing({
          audioRate: Number((pricingData as any)?.audio?.ratePerMinute ?? 1),
          videoRate: Number((pricingData as any)?.video?.ratePerMinute ?? 2.5),
        });
      }
    } catch (e:any) {
      setError(e?.response?.data?.error?.message || e?.message || 'Failed to load wallets');
      setWallets([]);
      setTotal(0);
    } finally{ setLoading(false); }
  },[page, search]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{ setPage(1); },[search]);

  // Fetch statement when inmate clicked
  useEffect(()=>{
    if(!selectedId) { setStatement(null); return; }
    setStmtLoading(true);
    wardenApi.getWalletStatement(selectedId)
      .then(data=>{
        const w = wallets.find(x=>x.inmateId===selectedId) || data?.wallet;
        if(!w) { setStatement(null); return; }
        setStatement({ wallet: w, transactions: data?.transactions ?? [] } as any);
      })
      .catch(()=>{
        const w = wallets.find(x=>x.inmateId===selectedId);
        if(w) setStatement({ wallet: w, transactions: [] });
        else setStatement(null);
      })
      .finally(()=> setStmtLoading(false));
  },[selectedId, wallets]);

  const doRecharge = async () => {
    if (!selectedId) return;
    const amt = Number(rechargeAmount);
    if (!amt || amt <= 0) { setRechargeError('Enter valid amount'); return; }
    setRecharging(true); setRechargeError(''); setRechargeSuccess('');
    try {
      const res = await wardenApi.rechargeWallet(selectedId, amt, rechargeDesc || 'Manual recharge by warden (no gateway)');
      setRechargeSuccess(`₹${amt} credited`);
      setRechargeAmount(''); setRechargeDesc('');
      // refresh wallets and statement
      const [wResult] = await Promise.all([wardenApi.getWallets({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, search: search || undefined })]);
      setWallets((wResult as any).items ?? []);
      if (res?.wallet) setStatement(prev => prev ? { ...prev, wallet: res.wallet, transactions: [...(prev.transactions||[]), res.transaction].filter(Boolean) } : prev);
      else {
        const stmt = await wardenApi.getWalletStatement(selectedId);
        setStatement(stmt as any);
      }
    } catch (e:any) {
      setRechargeError(e?.response?.data?.error?.message || e?.message || 'Recharge failed');
    } finally { setRecharging(false); }
  };

  const approveRequest = async (reqId: string) => {
    setReqLoading(true);
    try {
      await wardenApi.approveWalletRequest(reqId);
      const [wResult, reqs] = await Promise.all([wardenApi.getWallets({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, search: search || undefined }), wardenApi.getWalletRequests()]);
      setWallets((wResult as any).items ?? []); setRequests(reqs ?? []);
      if (selectedId) {
        const stmt = await wardenApi.getWalletStatement(selectedId);
        setStatement(stmt as any);
      }
    } catch (e:any) {
      alert(e?.response?.data?.error?.message || e?.message || 'Approve failed');
    } finally { setReqLoading(false); }
  };

  const rejectRequest = async (reqId: string) => {
    setReqLoading(true);
    try {
      await wardenApi.rejectWalletRequest(reqId);
      const reqs = await wardenApi.getWalletRequests();
      setRequests(reqs ?? []);
    } catch (e:any) {
      alert(e?.response?.data?.error?.message || e?.message || 'Reject failed');
    } finally { setReqLoading(false); }
  };

  const createRequestFor = async (inmateId: string) => {
    const amtStr = prompt(`Enter amount inmate ${inmateId} requests:`);
    if (!amtStr) return;
    const amt = Number(amtStr);
    if (!amt || amt <= 0) { alert('Invalid amount'); return; }
    try {
      await wardenApi.createWalletRequest(inmateId, amt, 'Recharge request via warden');
      const reqs = await wardenApi.getWalletRequests();
      setRequests(reqs ?? []);
    } catch (e:any) { alert(e?.response?.data?.error?.message || e?.message); }
  };

  if(loading) return <Loading message="Loading trust accounts..." />;
  if(error) return <Card><div className="text-center py-12"><p className="text-error mb-4">{error}</p><button onClick={()=>{setLoading(true); load();}} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">Retry</button></div></Card>;

  const selectedWallet = selectedId ? wallets.find(w=>w.inmateId===selectedId) || statement?.wallet || null : null;
  const selectedInmate = selectedId ? inmates[selectedId] : null;
  const txns = statement?.transactions ?? [];
  const filteredTxns = txns.filter(t=>{
    const type = String(t.type||'').toLowerCase();
    if(tab==='charge') return type==='charge' || type==='debit';
    if(tab==='recharge') return type==='recharge' || type==='credit';
    if(tab==='refund') return type==='refund';
    return true;
  });
  const totalCharges = txns.filter(t=> ['charge','debit'].includes(String(t.type).toLowerCase())).reduce((a,t)=>a+Number(t.amount||0),0);
  const totalRecharges = txns.filter(t=> ['recharge','credit'].includes(String(t.type).toLowerCase())).reduce((a,t)=>a+Number(t.amount||0),0);
  const totalRefunds = txns.filter(t=> String(t.type).toLowerCase()==='refund').reduce((a,t)=>a+Number(t.amount||0),0);

  const totalBalance = wallets.reduce((a,w)=>a+Number(w.balance||0),0);
  const avgBalance = wallets.length ? Math.round(totalBalance / wallets.length) : 0;

  return (
    <div className="space-y-6">
      {/* Professional Header */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v3m12-3v3m-6-3h.01" /></svg>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Inmate Wallet</h1>
                <span className="px-2.5 py-1 bg-success/10 text-success border border-success/20 rounded-full text-xs font-bold">₹{totalBalance.toLocaleString('en-IN')} total</span>
              </div>
              <p className="text-sm text-neutral-600 mt-1">Trust accounts • {wallets.length} inmates • Avg ₹{avgBalance} • Click row for ledger & remaining @ live rates</p>
            </div>
          </div>
          <div className="hidden lg:flex gap-2">
            <div className="px-3 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold">Audio ₹{pricing.audioRate}/min</div>
            <div className="px-3 py-2 bg-primary-50 border border-primary-200 text-primary-700 rounded-xl text-xs font-bold">Video ₹{pricing.videoRate}/min</div>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-5 border-b border-neutral-200 bg-neutral-50/50">
          <h2 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wide text-neutral-700"><span className="w-2 h-2 bg-success rounded-full animate-pulse" />Wallets <span className="px-2.5 py-1 bg-neutral-900 text-white rounded-full text-xs font-bold">{wallets.length}</span> <span className="text-xs font-normal text-neutral-500 normal-case tracking-normal">Click row for statement</span></h2>
          <div className="flex gap-2">
            <div className="relative">
              <svg className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by inmate, name..." className="pl-9 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm shadow-sm w-64" />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b bg-neutral-50"><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Inmate</th><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Request</th><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Balance</th><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Remaining @ Live Rate</th><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider"></th></tr></thead>
            <tbody>
              {wallets.length===0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-sm text-neutral-500">{total===0 ? 'No trust accounts — backend returned empty. Add wallets via backend seed or inmates.' : `No wallets match "${search}"`}</td></tr>
              ) : wallets.map(w=>{
                // Always compute remaining from live pricing + balance so Call Configuration changes reflect instantly, even if backend cached remaining is stale
                const audioMin = Math.floor(w.balance / (pricing.audioRate || 1));
                const videoMin = Math.floor(w.balance / (pricing.videoRate || 2.5));
                const inmate = inmates[w.inmateId];
                return (
                <tr key={w.walletId} onClick={()=> setSelectedId(w.inmateId)} className={`border-b hover:bg-neutral-50 transition-colors cursor-pointer even:bg-neutral-50/30 ${selectedId===w.inmateId?'bg-primary-50 ring-1 ring-inset ring-primary-200':''}`}>
                  <td className="py-3 px-4 text-sm font-medium flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#E9EEF3] flex items-center justify-center shrink-0 border border-[#D1D7DB]" title="No photo">
                      <svg className="w-5 h-5 text-[#8696A0]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-mono font-medium">{w.inmateId}</p>
                      <p className="text-xs text-neutral-500">{inmate ? `${inmate.name}` : '—'} • {inmate?.facility || ''}</p>
                    </div>
                  </td>
                  <td className="py-3 px-4" onClick={e=>e.stopPropagation()}>
                    {(() => {
                      const pending = requests.find(r=> r.inmateId===w.inmateId && r.status==='pending');
                      if (pending) return (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-neutral-500">Bal ₹{w.balance} → Req ₹{pending.amount}</span>
                          <span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold text-amber-700 w-fit">₹{pending.amount} pending</span>
                          <div className="flex gap-1">
                            <button disabled={reqLoading} onClick={()=>approveRequest(pending.requestId)} className="px-2 py-1 bg-neutral-900 text-white rounded text-xs hover:bg-black disabled:opacity-50">Approve</button>
                            <button disabled={reqLoading} onClick={()=>rejectRequest(pending.requestId)} className="px-2 py-1 bg-white border border-neutral-200 rounded text-xs hover:bg-neutral-50 disabled:opacity-50">Reject</button>
                          </div>
                        </div>
                      );
                      return <span className="px-2 py-1 bg-neutral-50 border border-neutral-200 rounded-full text-xs text-neutral-500">No request</span>;
                    })()}
                  </td>
                  <td className="py-3 px-4"><span className="px-3 py-1 rounded-full text-xs font-bold border bg-neutral-100 text-neutral-900 border-neutral-200">₹{w.balance}</span></td>
                  <td className="py-3 px-4 text-sm">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{audioMin} min <span className="text-xs text-neutral-500 font-normal">Audio @ ₹{pricing.audioRate}/min</span></span>
                      <span className="font-medium">{videoMin} min <span className="text-xs text-neutral-500 font-normal">Video @ ₹{pricing.videoRate}/min</span></span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right"><span className="text-xs text-primary-600 font-medium">View →</span></td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-4 bg-neutral-50 border-t border-neutral-200">
            <span className="text-sm text-neutral-600">Showing <span className="font-semibold text-neutral-900">{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)}</span> of <span className="font-semibold text-neutral-900">{total}</span></span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(1)} className="px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-neutral-50 shadow-sm">«</button>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-neutral-50 shadow-sm">Prev</button>
              <span className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold shadow-sm">{page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
              <button disabled={page === Math.ceil(total / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-neutral-50 shadow-sm">Next</button>
              <button disabled={page === Math.ceil(total / PAGE_SIZE)} onClick={() => setPage(Math.ceil(total / PAGE_SIZE))} className="px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-neutral-50 shadow-sm">»</button>
            </div>
          </div>
        )}
      </Card>

      {createPortal(selectedId && (
        <div className="fixed inset-0 bg-black/60 z-[999]" onClick={()=> setSelectedId(null)}>
          <div className="absolute inset-y-0 right-0 w-full max-w-xl bg-white shadow-2xl flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-200 shrink-0">
              <div>
                <h2 className="text-xl font-bold">Inmate Statement</h2>
                <p className="text-sm text-neutral-500">{selectedId} {selectedInmate ? `• ${selectedInmate.name} • ${selectedInmate.facility}` : ''}</p>
              </div>
              <button onClick={()=> setSelectedId(null)} className="w-9 h-9 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center">✕</button>
            </div>

            {stmtLoading ? <div className="p-12 text-center"><Loading message="Loading statement..." /></div> : !selectedWallet ? <p className="p-6 text-sm text-neutral-500">No wallet found</p> : (
              <div className="p-6 space-y-6">
                {/* Wallet summary */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl"><p className="text-xs uppercase font-semibold text-neutral-500">Balance</p><p className="text-2xl font-extrabold text-neutral-900">₹{selectedWallet.balance}</p><p className="text-xs text-neutral-500">{selectedWallet.currency}</p></div>
                  <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl"><p className="text-xs uppercase font-semibold text-neutral-500">Total Debited</p><p className="text-2xl font-extrabold text-neutral-900">₹{selectedWallet.totalSpent}</p><p className="text-xs text-neutral-500">from ledger</p></div>
                  <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl"><p className="text-xs uppercase font-semibold text-neutral-500">Audio Remaining</p><p className="text-xl font-bold text-neutral-900">{Math.floor(selectedWallet.balance / (pricing.audioRate || 1))} min</p><p className="text-xs text-neutral-500">@ ₹{pricing.audioRate}/min</p></div>
                  <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl"><p className="text-xs uppercase font-semibold text-neutral-500">Video Remaining</p><p className="text-xl font-bold text-neutral-900">{Math.floor(selectedWallet.balance / (pricing.videoRate || 2.5))} min</p><p className="text-xs text-neutral-500">@ ₹{pricing.videoRate}/min</p></div>
                </div>

                {/* Manual Add Money (without gateway) */}
                <div className="p-4 border border-neutral-200 rounded-xl bg-neutral-50">
                  <p className="text-sm font-semibold text-neutral-900 mb-2">Add Money (Manual – No Gateway)</p>
                  <p className="text-xs text-neutral-500 mb-3">Warden cash deposit – directly credits jail account</p>
                  <div className="flex gap-2">
                    <input type="number" min="1" value={rechargeAmount} onChange={e=>setRechargeAmount(e.target.value)} placeholder="Amount ₹" className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                    <button onClick={doRecharge} disabled={recharging} className="px-5 py-2 bg-neutral-900 text-white rounded-lg text-sm font-semibold hover:bg-black disabled:opacity-50">{recharging?'Adding...':'+ Add Money'}</button>
                  </div>
                  <input value={rechargeDesc} onChange={e=>setRechargeDesc(e.target.value)} placeholder="Description (optional)" className="w-full mt-2 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900" />
                  {rechargeError && <p className="text-xs text-red-600 mt-2">{rechargeError}</p>}
                  {rechargeSuccess && <p className="text-xs text-green-700 mt-2">{rechargeSuccess}</p>}
                </div>

                {/* Tabs — clean segmented */}
                <div className="flex items-center justify-between">
                  <div className="flex gap-1 p-1 bg-neutral-100 rounded-2xl">
                    {(['all','charge','recharge','refund'] as const).map(t=> {
                      const label = t==='charge'?'Charges':t==='recharge'?'Recharges':t==='refund'?'Refunds':'All';
                      const count = t==='all' ? txns.length : txns.filter(x=> {
                        const ty=String(x.type).toLowerCase();
                        if(t==='charge') return ty==='charge'||ty==='debit';
                        if(t==='recharge') return ty==='recharge'||ty==='credit';
                        if(t==='refund') return ty==='refund';
                        return true;
                      }).length;
                      return (
                        <button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${tab===t?'bg-white shadow-sm border border-neutral-200 text-neutral-900':'text-neutral-500 hover:text-neutral-700'}`}>
                          {label} <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${tab===t?'bg-neutral-900 text-white':'bg-white border'}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-xs font-medium text-neutral-500 bg-white border px-3 py-1.5 rounded-full">{filteredTxns.length} txns</span>
                </div>

                {/* Transaction list — clean cards */}
                <div className="space-y-3">
                  {filteredTxns.length===0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-neutral-200 rounded-2xl bg-neutral-50/50">
                      <p className="text-sm font-medium text-neutral-600">No transactions</p>
                      <p className="text-xs text-neutral-400 mt-1">No {tab==='all'?'transactions':tab} found for this inmate</p>
                    </div>
                  ) : filteredTxns.map(tx=>{
                    const type = String(tx.type).toLowerCase();
                    const isCharge = type==='charge' || type==='debit';
                    const isRecharge = type==='recharge' || type==='credit';
                    const isRefund = type==='refund';
                    const date = new Date(tx.timestamp);
                    const dateStr = date.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
                    const timeStr = date.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
                    return (
                      <div key={tx.transactionId} className="group flex items-center gap-4 p-4 bg-white border border-neutral-200 rounded-2xl shadow-sm hover:shadow-md hover:border-neutral-300 transition-all">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-bold shadow-sm shrink-0 bg-neutral-100 border border-neutral-200 text-neutral-700">
                          <span className="text-lg leading-none">{isRefund?'↩':isRecharge?'+':'−'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-neutral-900 leading-tight truncate">{tx.description || tx.reason || tx.callId || type}</p>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide border bg-neutral-100 text-neutral-700 border-neutral-200">{type}</span>
                            {tx.status && <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-500 border">{tx.status}</span>}
                          </div>
                          <p className="text-xs text-neutral-500 mt-1 flex items-center gap-1.5">
                            <span>{dateStr}</span><span className="w-1 h-1 bg-neutral-300 rounded-full" /><span>{timeStr}</span>{tx.callId && <><span className="w-1 h-1 bg-neutral-300 rounded-full" /><span className="font-mono text-[11px] bg-neutral-50 px-1.5 py-0.5 rounded border">{tx.callId}</span></>}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-extrabold leading-none text-neutral-900">{isRefund || isRecharge ? '+' : '−'}₹{Number(tx.amount).toLocaleString('en-IN')}</p>
                          <p className="text-[11px] font-medium text-neutral-400 uppercase tracking-wide mt-1">{isCharge?'Debited':isRefund?'Refunded':'Credited'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-4 border-t">
                  <button onClick={()=> setSelectedId(null)} className="w-full py-3 bg-white border-2 rounded-xl font-medium hover:bg-neutral-50">Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
