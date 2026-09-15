import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { apiClient } from '@/services/api/client';
import { usePageHeader } from '@/context/PageHeaderContext';
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
  const [rechargeTarget, setRechargeTarget] = useState<string|null>(null);

  const load = useCallback(async()=>{
    try{
      setError(null);
      const params: ListParams = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, search: search || undefined };
      const [wResult, imResult, reqs, pricingData] = await Promise.all([
        wardenApi.getWallets(params).catch(() => ({ items: [] as Wallet[], total: 0 })),
        wardenApi.getInmates({ limit: 1000, offset: 0 }).catch(()=>({ items: [] as Inmate[], total: 0 })),
        wardenApi.getWalletRequests().catch(()=>[] as WalletRequest[]),
        apiClient.get('/pricing').then((r) => r.data?.data).catch(()=> null as any).then((d: any) => (Array.isArray(d) ? d[0] : d)),
      ]);
      setWallets((wResult as any).items ?? []);
      setTotal((wResult as any).total ?? 0);
      const map: Record<string, Inmate> = {};
      ((imResult as any).items ?? []).forEach((i: Inmate)=> map[i.inmateId]=i);
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
    const targetId = rechargeTarget || selectedId;
    if (!targetId) return;
    const amt = Number(rechargeAmount);
    if (!amt || amt <= 0) { setRechargeError('Enter valid amount'); return; }
    setRecharging(true); setRechargeError(''); setRechargeSuccess('');
    try {
      const res = await wardenApi.rechargeWallet(targetId, amt, rechargeDesc || 'Manual recharge by warden');
      setRechargeSuccess(`₹${amt} credited`);
      setRechargeAmount(''); setRechargeDesc('');
      const [wResult] = await Promise.all([wardenApi.getWallets({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, search: search || undefined })]);
      setWallets((wResult as any).items ?? []);
      if (selectedId === targetId) {
        if (res?.wallet) setStatement(prev => prev ? { ...prev, wallet: res.wallet, transactions: [...(prev.transactions||[]), res.transaction].filter(Boolean) } : prev);
        else {
          const stmt = await wardenApi.getWalletStatement(targetId);
          setStatement(stmt as any);
        }
      }
      setTimeout(() => { setRechargeTarget(null); setRechargeSuccess(''); setRechargeAmount(''); setRechargeDesc(''); }, 1200);
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

  const totalBalance = wallets.reduce((a,w)=>a+Number(w.balance||0),0);
  const avgBalance = wallets.length ? Math.round(totalBalance / wallets.length) : 0;

  const headerIcon = useMemo(() => <span className="material-icons text-emerald-600 text-xl">account_balance_wallet</span>, []);

  usePageHeader({
    title: 'Inmate Wallet',
    subtitle: `₹${totalBalance.toLocaleString('en-IN')} total • ${wallets.length} inmates • Avg ₹${avgBalance}`,
    icon: headerIcon,
    actions: useMemo(() => (
      <div className="flex gap-2">
        <div className="px-3.5 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold shadow-sm">
          Audio <span className="font-bold text-emerald-950">₹{pricing.audioRate}/min</span>
        </div>
        <div className="px-3.5 py-1.5 bg-cyan-50 border border-cyan-200 text-cyan-800 rounded-xl text-xs font-semibold shadow-sm">
          Video <span className="font-bold text-cyan-950">₹{pricing.videoRate}/min</span>
        </div>
      </div>
    ), [pricing.audioRate, pricing.videoRate]),
  });

  if(loading) return <Loading message="Loading trust accounts..." />;
  if(error) return <Card className="bg-white border-slate-200 shadow-sm"><div className="text-center py-12"><p className="text-rose-600 mb-4">{error}</p><button onClick={()=>{setLoading(true); load();}} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-emerald-600/20">Retry</button></div></Card>;

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

  return (
    <div className="space-y-6 text-slate-800">
      <Card className="overflow-hidden border border-slate-200 bg-white shadow-xl rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-md shadow-emerald-500/50" />
            <h2 className="font-bold text-sm tracking-wider uppercase text-slate-700 flex items-center gap-2">
              Wallets 
              <span className="px-2.5 py-0.5 bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-full text-xs font-bold">
                {wallets.length}
              </span>
            </h2>
            <span className="text-xs text-slate-400 hidden sm:inline">Click row for statement</span>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input 
                value={search} 
                onChange={e=>setSearch(e.target.value)} 
                placeholder="Search inmate, ID..." 
                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 text-sm text-slate-800 placeholder-slate-400 w-64 transition-all shadow-sm" 
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-slate-500">
                <th className="py-3.5 px-5 text-xs font-semibold uppercase tracking-wider">Inmate</th>
                <th className="text-right py-3.5 px-5 text-xs font-semibold uppercase tracking-wider">Wallet Balance</th>
                <th className="text-center py-3.5 px-5 text-xs font-semibold uppercase tracking-wider">Remaining Call Time</th>
                <th className="py-3.5 px-5 text-xs font-semibold uppercase tracking-wider">Recharge Requests</th>
                <th className="text-center py-3.5 px-5 text-xs font-semibold uppercase tracking-wider w-28">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wallets.length===0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-sm text-slate-400">
                    {total===0 ? 'No trust accounts found' : `No wallets match "${search}"`}
                  </td>
                </tr>
              ) : wallets.map(w=>{
                const audioMin = Math.floor(w.balance / (pricing.audioRate || 1));
                const videoMin = Math.floor(w.balance / (pricing.videoRate || 2.5));
                const inmate = inmates[w.inmateId];
                const isLowBalance = w.balance < (pricing.audioRate || 1) * 5;
                const pending = requests.find(r=> r.inmateId===w.inmateId && r.status==='pending');
                const isSelected = selectedId === w.inmateId;

                return (
                  <tr 
                    key={w.walletId} 
                    onClick={()=> setSelectedId(w.inmateId)} 
                    className={`transition-all duration-150 cursor-pointer ${
                      isSelected ? 'bg-emerald-50/80 border-l-4 border-l-emerald-600' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3.5 px-5 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-600">
                          <span className="material-icons text-base">person</span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-slate-900 font-semibold">{inmate?.name || '—'}</p>
                          <p className="text-xs text-slate-500 truncate font-mono">{w.inmateId || '-'} • {inmate?.facility || '-'}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-5 text-right" onClick={e=>e.stopPropagation()}>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold font-mono tracking-wide shadow-sm ${
                          isLowBalance 
                            ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          ₹{Number(w.balance).toLocaleString('en-IN')}
                        </span>
                        {isLowBalance && <span className="text-[10px] text-rose-600 font-medium">Low Balance</span>}
                      </div>
                    </td>

                    <td className="py-3.5 px-5">
                      <div className="flex items-center justify-center gap-4">
                        <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                          <span className="material-icons text-base text-emerald-600">headset_mic</span>
                          <span className={`text-xs font-bold ${audioMin < 5 ? 'text-rose-600' : 'text-slate-700'}`}>{audioMin}<span className="text-[10px] font-normal text-slate-400">m</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                          <span className="material-icons text-base text-cyan-600">videocam</span>
                          <span className={`text-xs font-bold ${videoMin < 3 ? 'text-rose-600' : 'text-slate-700'}`}>{videoMin}<span className="text-[10px] font-normal text-slate-400">m</span></span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-5" onClick={e=>e.stopPropagation()}>
                      {pending ? (
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs font-bold text-amber-800">₹{pending.amount}</span>
                          <button disabled={reqLoading} onClick={()=>approveRequest(pending.requestId)} className="w-7 h-7 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-all shadow-sm" title="Approve"><span className="material-icons text-sm">check</span></button>
                          <button disabled={reqLoading} onClick={()=>rejectRequest(pending.requestId)} className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 rounded-lg text-xs disabled:opacity-50 transition-all" title="Reject"><span className="material-icons text-sm">close</span></button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-5 text-center" onClick={e=>e.stopPropagation()}>
                      <button onClick={()=>setRechargeTarget(w.inmateId)} className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold transition-all shadow-sm">
                        <span className="material-icons text-xs">add</span>Recharge
                      </button>
                    </td>
                  </tr>
                );})}
            </tbody>
          </table>
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-t border-slate-200 text-xs">
            <span className="text-slate-500">Showing <span className="font-semibold text-slate-800">{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)}</span> of <span className="font-semibold text-slate-800">{total}</span></span>
            <div className="flex gap-1.5">
              <button disabled={page === 1} onClick={() => setPage(1)} className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg disabled:opacity-40 shadow-sm">«</button>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg disabled:opacity-40 shadow-sm">Prev</button>
              <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded-lg shadow-sm">{page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
              <button disabled={page === Math.ceil(total / PAGE_SIZE)} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg disabled:opacity-40 shadow-sm">Next</button>
              <button disabled={page === Math.ceil(total / PAGE_SIZE)} onClick={() => setPage(Math.ceil(total / PAGE_SIZE))} className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg disabled:opacity-40 shadow-sm">»</button>
            </div>
          </div>
        )}
      </Card>

      {/* Drawer Statement */}
      {createPortal(selectedId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[999]" onClick={()=> setSelectedId(null)}>
          <div className="absolute inset-y-0 right-0 w-full max-w-xl bg-white border-l border-slate-200 shadow-2xl flex flex-col text-slate-800" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span className="material-icons text-emerald-600 text-lg">receipt_long</span> Statement
                </h2>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedId} {selectedInmate ? `• ${selectedInmate.name}` : ''}</p>
              </div>
              <button onClick={()=> setSelectedId(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors">✕</button>
            </div>

            {stmtLoading ? <div className="p-12 text-center"><Loading message="Loading statement..." /></div> : !selectedWallet ? <p className="p-6 text-sm text-slate-500">No wallet found</p> : (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-800">Balance</p>
                    <p className="text-2xl font-extrabold text-emerald-600 mt-1 font-mono">₹{selectedWallet.balance}</p>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Total Spent</p>
                    <p className="text-2xl font-extrabold text-slate-800 mt-1 font-mono">₹{selectedWallet.totalSpent}</p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex gap-1.5">
                    {(['all','charge','recharge','refund'] as const).map(t=> (
                      <button 
                        key={t} 
                        onClick={()=>setTab(t)} 
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${
                          tab===t ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{filteredTxns.length} txns</span>
                </div>

                {/* Txn List */}
                <div className="space-y-2.5">
                  {filteredTxns.length===0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl">
                      <p className="text-xs text-slate-400">No transactions recorded</p>
                    </div>
                  ) : filteredTxns.map(tx=>{
                    const type = String(tx.type).toLowerCase();
                    const isCharge = type==='charge' || type==='debit';
                    const isRecharge = type==='recharge' || type==='credit';
                    const date = new Date(tx.timestamp);

                    return (
                      <div key={tx.transactionId} className="flex items-center justify-between p-3.5 bg-slate-50/60 border border-slate-200/80 rounded-xl hover:bg-slate-50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                            isRecharge ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-rose-100 text-rose-700 border border-rose-200'
                          }`}>
                            {isRecharge ? '+' : '−'}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{tx.description || tx.reason || type}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{date.toLocaleDateString('en-IN')} • {date.toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'})}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-bold font-mono ${isRecharge ? 'text-emerald-600' : 'text-slate-800'}`}>
                            {isRecharge ? '+' : '−'}₹{Number(tx.amount).toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      ), document.body)}

      {/* Recharge Modal */}
      {createPortal(rechargeTarget && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[999] flex items-center justify-center p-4" onClick={()=>{setRechargeTarget(null);setRechargeError('');setRechargeSuccess('');setRechargeAmount('');setRechargeDesc('');}}>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md text-slate-800" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900">Recharge Balance</h3>
                <p className="text-xs text-slate-500 font-mono">{rechargeTarget}</p>
              </div>
              <button onClick={()=>{setRechargeTarget(null);setRechargeError('');setRechargeSuccess('');setRechargeAmount('');setRechargeDesc('');}} className="text-slate-400 hover:text-slate-700"><span className="material-icons text-lg">close</span></button>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Preset Amounts</p>
                <div className="grid grid-cols-4 gap-2">
                  {[100, 200, 500, 1000].map(amt => (
                    <button key={amt} onClick={()=>setRechargeAmount(String(amt))} className={`py-2 rounded-xl text-xs font-bold border font-mono transition-all ${rechargeAmount===String(amt) ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}>
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Amount</p>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                  <input type="number" min="1" value={rechargeAmount} onChange={e=>setRechargeAmount(e.target.value)} placeholder="0" className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-lg font-bold font-mono text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Description</p>
                <input value={rechargeDesc} onChange={e=>setRechargeDesc(e.target.value)} placeholder="Note..." className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500" />
              </div>

              {rechargeError && <p className="text-xs text-rose-600 font-medium">{rechargeError}</p>}
              {rechargeSuccess && <p className="text-xs text-emerald-600 font-medium">{rechargeSuccess}</p>}
            </div>

            <div className="flex gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button onClick={()=>{setRechargeTarget(null);setRechargeError('');setRechargeSuccess('');setRechargeAmount('');setRechargeDesc('');}} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all">Cancel</button>
              <button onClick={doRecharge} disabled={recharging || !rechargeAmount} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 disabled:opacity-40">
                {recharging ? 'Processing...' : `Confirm ₹${rechargeAmount || 0}`}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}