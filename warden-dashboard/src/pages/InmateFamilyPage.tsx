import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Card } from '@/components/Card';
import { Skeleton, SkeletonRows, SkeletonList, SkeletonText } from '@/components/Skeleton';
import { wardenApi, cacheKeys } from '@/services/api/wardenApi';
import { apiClient } from '@/services/api/client';
import { useCachedResource } from '@/hooks/useCachedResource';
import { usePageHeader } from '@/context/PageHeaderContext';
import { FilterDropdown } from '@/components/FilterDropdown';
import type { ColumnFilter } from '@/components/FilterDropdown';
import type { Inmate, ListParams, PaginatedResponse, Wallet, Transaction, WalletRequest } from '@/services/api/wardenApi';

export function InmateFamilyPage() {
  const navigate = useNavigate();
  const [searchPrisoner, setSearchPrisoner] = useState('');
  const [filterGender, setFilterGender] = useState<ColumnFilter>({ value: 'all', open: false });
  const [filterSecurity, setFilterSecurity] = useState<ColumnFilter>({ value: 'all', open: false });
  const [filterCell, setFilterCell] = useState<ColumnFilter>({ value: 'all', open: false });
  const [filterBlock, setFilterBlock] = useState<ColumnFilter>({ value: 'all', open: false });
  const [filterKiosk, setFilterKiosk] = useState<ColumnFilter>({ value: 'all', open: false });
  const [prisonerPage, setPrisonerPage] = useState(1);

  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'charge' | 'recharge'>('all');
  const [reqLoading, setReqLoading] = useState(false);

  const params = useMemo<ListParams>(() => ({ limit: 100, offset: 0, search: searchPrisoner || undefined }), [searchPrisoner]);

  const { data, isLoading, error, refresh } = useCachedResource<PaginatedResponse<Inmate>>(
    cacheKeys.inmates(params),
    () => wardenApi.getInmates(params),
    { ttl: 60_000 },
  );

  const inmates = useMemo(() => {
    const items = [...(data?.items ?? [])];
    // Sort: active first, then inactive at bottom
    items.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      return 0;
    });
    return items;
  }, [data]);
  const prisonerTotal = data?.total ?? inmates.length;

  const walletsParams = useMemo<ListParams>(() => ({ limit: 1000, offset: 0 }), []);
  const { data: walletsData, isLoading: walletsLoading, refresh: refreshWallets } = useCachedResource<PaginatedResponse<Wallet>>(
    cacheKeys.wallets(walletsParams),
    () => wardenApi.getWallets(walletsParams),
    { ttl: 60_000 },
  );
  const walletsByInmate = useMemo(() => {
    const map: Record<string, Wallet> = {};
    (walletsData?.items ?? []).forEach((w) => { map[w.inmateId] = w; });
    return map;
  }, [walletsData]);

  const { data: pricingData } = useCachedResource<unknown>(
    cacheKeys.pricing(),
    () => apiClient.get('/pricing').then((r) => r.data?.data).then((d: any) => (Array.isArray(d) ? d[0] : d)),
    { ttl: 60_000 },
  );
  const pricing = useMemo(() => ({
    audioRate: Number((pricingData as any)?.audio?.ratePerMinute ?? 1),
    videoRate: Number((pricingData as any)?.video?.ratePerMinute ?? 2.5),
  }), [pricingData]);

  const { data: requestsData, isLoading: requestsLoading, refresh: refreshRequests } = useCachedResource<WalletRequest[]>(
    cacheKeys.walletRequests(),
    () => wardenApi.getWalletRequests(),
    { ttl: 30_000 },
  );
  const requests = requestsData ?? [];

  const { data: statement, refresh: refreshStatement } = useCachedResource<{ wallet: Wallet; transactions: Transaction[] }>(
    selectedWalletId ? cacheKeys.walletStatement(selectedWalletId) : null,
    () => wardenApi.getWalletStatement(selectedWalletId as string),
    { ttl: 30_000 },
  );
  const statementForSelected = statement && (!statement.wallet || statement.wallet.inmateId === selectedWalletId) ? statement : null;

  const { data: walletData, refresh: refreshWallet } = useCachedResource<Wallet>(
    selectedWalletId ? cacheKeys.wallet(selectedWalletId) : null,
    () => wardenApi.getWallet(selectedWalletId as string),
    { ttl: 60_000 },
  );
  const walletForSelected = walletData && walletData.inmateId === selectedWalletId ? walletData : null;

  useEffect(() => { setPrisonerPage(1); }, [filterGender.value, filterSecurity.value, filterCell.value, filterBlock.value, filterKiosk.value]);

  const toggleInmate = async (inmateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await wardenApi.toggleInmate(inmateId);
      await refresh();
    } catch { }
  };

  const openWallet = (inmateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTab('all');
    setSelectedWalletId(inmateId);
  };

  const approveRequest = async (reqId: string) => {
    setReqLoading(true);
    try {
      await wardenApi.approveWalletRequest(reqId);
      await Promise.all([refreshWallets(), refreshRequests(), refreshStatement(), refreshWallet(), refresh()]);
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || e?.message || 'Approve failed');
    } finally { setReqLoading(false); }
  };

  const rejectRequest = async (reqId: string) => {
    setReqLoading(true);
    try {
      await wardenApi.rejectWalletRequest(reqId);
      await refreshRequests();
    } catch (e: any) {
      alert(e?.response?.data?.error?.message || e?.message || 'Reject failed');
    } finally { setReqLoading(false); }
  };


  const headerIcon = useMemo(() => <span className="material-icons text-primary-600 text-xl">family_restroom</span>, []);

  const genderOptions = useMemo(() => {
    const vals = [...new Set(inmates.map(i => i.gender).filter(Boolean))];
    return vals.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
  }, [inmates]);

  const securityOptions = useMemo(() => {
    const vals = [...new Set(inmates.map(i => i.securityLevel).filter(Boolean))];
    return vals.map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
  }, [inmates]);

  const cellOptions = useMemo(() => {
    const map = new Map<string, string>();
    inmates.forEach(i => { if (i.cellId && i.cellName) map.set(i.cellId, i.cellName); });
    return [...map.entries()].map(([id, name]) => ({ value: id, label: name }));
  }, [inmates]);

  const blockOptions = useMemo(() => {
    const map = new Map<string, string>();
    inmates.forEach(i => { if (i.blockId && i.blockName) map.set(i.blockId, i.blockName); });
    return [...map.entries()].map(([id, name]) => ({ value: id, label: name }));
  }, [inmates]);

  const kioskOptions = useMemo(() => {
    const map = new Map<string, string>();
    inmates.forEach(i => { if (i.assignedKioskId) map.set(i.assignedKioskId, i.kioskName || i.assignedKioskId); });
    return [...map.entries()].map(([id, name]) => ({ value: id, label: name }));
  }, [inmates]);

  usePageHeader({
    title: 'Inmates & Family',
    subtitle: isLoading && prisonerTotal === 0 ? 'Loading inmates…' : `${prisonerTotal} inmates`,
    icon: headerIcon,
    actions: useMemo(() => (
      <button onClick={() => navigate('/inmates-family/new')} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 shadow-sm">+ Add Inmate</button>
    ), []),
  });

  const filteredInmates = inmates.filter(i => {
    if (filterGender.value !== 'all' && i.gender !== filterGender.value) return false;
    if (filterSecurity.value !== 'all' && i.securityLevel !== filterSecurity.value) return false;
    if (filterCell.value !== 'all' && i.cellId !== filterCell.value) return false;
    if (filterBlock.value !== 'all' && i.blockId !== filterBlock.value) return false;
    if (filterKiosk.value !== 'all' && i.assignedKioskId !== filterKiosk.value) return false;
    return true;
  });
  const prisonerTotalPages = Math.max(1, Math.ceil(filteredInmates.length / 20));
  const pageInmates = filteredInmates.slice((prisonerPage - 1) * 20, prisonerPage * 20);

  const selectedWallet = selectedWalletId
    ? walletsByInmate[selectedWalletId] || statementForSelected?.wallet || walletForSelected || null
    : null;
  const selectedInmate = selectedWalletId ? inmates.find(x => x.inmateId === selectedWalletId) || null : null;
  const pendingForSelected = selectedWalletId ? requests.find(r => r.inmateId === selectedWalletId && r.status === 'pending') || null : null;
  const txns = statementForSelected?.transactions ?? [];
  const filteredTxns = txns.filter(t => {
    const type = String(t.type || '').toLowerCase();
    if (tab === 'charge') return type === 'charge' || type === 'debit';
    if (tab === 'recharge') return type === 'recharge' || type === 'credit';
    return true;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-5 border-b border-neutral-200 bg-neutral-50/50">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-700 flex items-center gap-2"><span className="w-2 h-2 bg-primary-600 rounded-full animate-pulse" />All Inmates <span className="px-2 py-1 bg-white border border-neutral-200 rounded-full text-xs font-bold text-neutral-900">{isLoading && prisonerTotal === 0 ? <SkeletonText /> : filteredInmates.length}</span></h2>
          <div className="relative">
            <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-lg">search</span>
            <input value={searchPrisoner} onChange={e => { setSearchPrisoner(e.target.value); setPrisonerPage(1); }} placeholder="Search by ID or name..." className="pl-9 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm shadow-sm w-64" />
          </div>
        </div>
        <div className="overflow-auto max-h-[calc(100vh-280px)]">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-neutral-50">
                <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Inmate</th>
                <th className="text-center py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Inmate Number</th>
                <th className="text-center py-3 px-4"><FilterDropdown label="Gender" options={genderOptions} filter={filterGender} setFilter={setFilterGender} /></th>
                <th className="text-center py-3 px-4"><FilterDropdown label="Security" options={securityOptions} filter={filterSecurity} setFilter={setFilterSecurity} /></th>
                <th className="text-center py-3 px-4"><FilterDropdown label="Cell" options={cellOptions} filter={filterCell} setFilter={setFilterCell} /></th>
                <th className="text-center py-3 px-4"><FilterDropdown label="Block" options={blockOptions} filter={filterBlock} setFilter={setFilterBlock} /></th>
                <th className="text-center py-3 px-4"><FilterDropdown label="Kiosk" options={kioskOptions} filter={filterKiosk} setFilter={setFilterKiosk} /></th>
                <th className="text-center py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Wallet</th>
                <th className="text-center py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && pageInmates.length === 0 ? (
                <SkeletonRows rows={8} cols={9} />
              ) : error && pageInmates.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center"><p className="text-error mb-4">{error}</p><button onClick={() => refresh()} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">Retry</button></td></tr>
              ) : pageInmates.length === 0 ? (
                <tr><td colSpan={9} className="py-16 text-center"><div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-3"><span className="material-icons text-neutral-400 text-2xl">person_off</span></div><p className="text-sm font-semibold text-neutral-900">No Inmates</p><p className="text-xs text-neutral-500">{prisonerTotal === 0 ? 'No inmates registered' : searchPrisoner ? `No match for "${searchPrisoner}"` : 'No inmates match current filters'}</p></td></tr>
              ) : pageInmates.map(i => {
                const disabled = i.status !== 'active';
                return (
                  <tr key={i.inmateId} onClick={() => navigate(`/inmates-family/${i.inmateId}`)} className={`border-b hover:bg-neutral-50 cursor-pointer transition-colors even:bg-neutral-50/30 ${disabled ? 'opacity-50' : ''}`}>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center shrink-0">
                          <span className="material-icons text-[#8696A0] text-lg">person</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{i.name}</p>
                          <p className="text-xs text-neutral-500 font-mono truncate">{i.inmateId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center text-sm text-neutral-600">{i.prisonerNumber || '—'}</td>
                    <td className="py-2.5 px-3 text-center text-sm text-neutral-600">{i.gender || '—'}</td>
                    <td className="py-2.5 px-3 text-center text-sm text-neutral-600">{i.securityLevel || '—'}</td>
                    <td className="py-2.5 px-3 text-center text-sm text-neutral-600">{i.cellName || '—'}</td>
                    <td className="py-2.5 px-3 text-center text-sm text-neutral-600">{i.blockName || '—'}</td>
                    <td className="py-2.5 px-3 text-center text-sm">
                      <span className={`text-sm  ${i.assignedKioskId ? 'text-neutral-600 ' : ' text-neutral-300 '}`}>{i.assignedKioskId || 'Unassigned'}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                      {(() => {
                        const w = walletsByInmate[i.inmateId];
                        if (walletsLoading && !w) return <SkeletonText />;
                        if (!w) return <span className="text-xs text-neutral-400">—</span>;
                        const isLowBalance = w.balance < (pricing.audioRate || 1) * 5;
                        const pending = requests.find(r => r.inmateId === i.inmateId && r.status === 'pending');
                        return (
                          <button
                            onClick={e => openWallet(i.inmateId, e)}
                            title="View wallet details & transactions"
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold font-mono tracking-wide border transition-all hover:shadow-sm ${
                              isLowBalance
                                ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            }`}
                          >
                            <span className="material-icons" style={{ fontSize: '14px' }}>account_balance_wallet</span>
                            ₹{Number(w.balance).toLocaleString('en-IN')}
                            {isLowBalance && <span className="text-[9px] font-semibold uppercase">low</span>}
                            {pending && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" title="Pending recharge request" />}
                          </button>
                        );
                      })()}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={e => toggleInmate(i.inmateId, e)}
                        className={`transition center hover:opacity-80 ${i.status === 'active' ? 'text-success' : 'text-neutral-400'}`}
                        title={i.status === 'active' ? 'Deactivate' : 'Activate'}
                      >
                        <span className="material-icons" style={{ fontSize: '42px' }}>{i.status === 'active' ? 'toggle_on' : 'toggle_off'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {prisonerTotalPages > 1 && <div className="flex items-center justify-between mt-4 px-5 pb-4"><span className="text-xs text-neutral-500">Showing {(prisonerPage - 1) * 20 + 1}-{Math.min(prisonerPage * 20, filteredInmates.length)} of {filteredInmates.length}</span><div className="flex items-center gap-1"><button disabled={prisonerPage === 1} onClick={() => setPrisonerPage(1)} className="px-2.5 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">«</button><button disabled={prisonerPage === 1} onClick={() => setPrisonerPage(p => p - 1)} className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">Prev</button><span className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-medium">{prisonerPage} / {prisonerTotalPages}</span><button disabled={prisonerPage === prisonerTotalPages} onClick={() => setPrisonerPage(p => p + 1)} className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">Next</button><button disabled={prisonerPage === prisonerTotalPages} onClick={() => setPrisonerPage(prisonerTotalPages)} className="px-2.5 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">»</button></div></div>}
      </Card>

      {/* Wallet Statement Drawer */}
      {createPortal(selectedWalletId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[999]" onClick={() => setSelectedWalletId(null)}>
          <div className="absolute inset-y-0 right-0 w-full max-w-xl bg-white border-l border-slate-200 shadow-2xl flex flex-col text-slate-800" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span className="material-icons text-emerald-600 text-lg">account_balance_wallet</span> Wallet Details
                </h2>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedWalletId} {selectedInmate ? `• ${selectedInmate.name}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedWalletId(null)} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors">✕</button>
              </div>
            </div>

            {!statementForSelected ? (
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-24" />
                  <Skeleton className="h-24" />
                </div>
                <Skeleton className="h-8 w-full" />
                <SkeletonList rows={5} />
              </div>
            ) : !selectedWallet ? <p className="p-6 text-sm text-slate-500">No wallet found</p> : (
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
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Audio Call Time</p>
                    <p className="text-lg font-extrabold text-slate-800 mt-1 font-mono">{Math.floor(selectedWallet.balance / (pricing.audioRate || 1))}<span className="text-xs font-normal text-slate-400"> min</span></p>
                  </div>
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                    <p className="text-[11px] uppercase tracking-wider font-bold text-slate-500">Video Call Time</p>
                    <p className="text-lg font-extrabold text-slate-800 mt-1 font-mono">{Math.floor(selectedWallet.balance / (pricing.videoRate || 2.5))}<span className="text-xs font-normal text-slate-400"> min</span></p>
                  </div>
                </div>

                {/* Pending Recharge Request */}
                {pendingForSelected && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider font-bold text-amber-800">Pending Recharge Request</p>
                        <p className="text-lg font-extrabold text-amber-700 mt-1 font-mono">₹{pendingForSelected.amount}</p>
                        {pendingForSelected.reason && <p className="text-xs text-amber-700/80 mt-0.5">{pendingForSelected.reason}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button disabled={reqLoading} onClick={() => approveRequest(pendingForSelected.requestId)} className="w-9 h-9 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-all shadow-sm" title="Approve"><span className="material-icons text-base">check</span></button>
                        <button disabled={reqLoading} onClick={() => rejectRequest(pendingForSelected.requestId)} className="w-9 h-9 flex items-center justify-center bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded-lg text-sm disabled:opacity-50 transition-all" title="Reject"><span className="material-icons text-base">close</span></button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabs */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex gap-1.5">
                    {(['all', 'charge', 'recharge'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all ${tab === t ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">{filteredTxns.length} txns</span>
                </div>

                {/* Txn List */}
                <div className="space-y-2.5">
                  {filteredTxns.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl">
                      <p className="text-xs text-slate-400">No transactions recorded</p>
                    </div>
                  ) : filteredTxns.map(tx => {
                    const type = String(tx.type).toLowerCase();
                    const isRecharge = type === 'recharge' || type === 'credit';
                    const date = new Date(tx.timestamp);

                    return (
                      <div key={tx.transactionId} className="flex items-center justify-between p-3.5 bg-slate-50/60 border border-slate-200/80 rounded-xl hover:bg-slate-50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${isRecharge ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>
                            {isRecharge ? '+' : '−'}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{tx.description || tx.reason || type}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{date.toLocaleDateString('en-IN')} • {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
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
    </div>
  );
}
