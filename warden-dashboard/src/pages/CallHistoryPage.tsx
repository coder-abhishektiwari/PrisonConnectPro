import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import type { CallHistoryItem, Recording, Inmate } from '@/services/api/wardenApi';

/**
 * Call History Page - Complete history of all inmate calls.
 */
export function CallHistoryPage() {
  const { inmateId } = useParams<{ inmateId: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [recordings, setRecordings] = useState<Record<string, Recording>>({});
  const [inmates, setInmates] = useState<Record<string, Inmate>>({});
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [kioskFilter, setKioskFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CallHistoryItem | null>(null);
  const [sortField, setSortField] = useState<'date'|'duration'>('date');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [viewMode, setViewMode] = useState<'table'|'timeline'>('table');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pageSize = 5;

  const loadCalls = useCallback(async () => {
    try {
      setLoadError(null);
      const [callHistory, recs, inmateList] = await Promise.all([wardenApi.getCallHistory(), wardenApi.getRecordings(), wardenApi.getInmates().catch(()=>[] as Inmate[])]);
      setCalls(callHistory ?? []);
      const map: Record<string, Recording> = {};
      (recs ?? []).forEach((r) => { map[r.callId] = r; });
      setRecordings(map);
      const imap: Record<string, Inmate> = {};
      (inmateList ?? []).forEach(i=> imap[i.inmateId]=i);
      setInmates(imap);
      if ((callHistory ?? []).length===0) {
        console.info('[CallHistory] backend returned empty — no dummy fallback');
      }
    } catch (error:any) {
      setLoadError(error?.response?.data?.error?.message || error?.message || 'Failed to load call history');
      setCalls([]);
      setRecordings({});
      setInmates({});
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalls();
  }, [loadCalls, inmateId]);

  if (isLoading) {
    return <Loading message="Loading call history..." />;
  }

  if (loadError) {
    return (
      <Card>
        <div className="text-center py-12">
          <p className="text-error mb-4">{loadError}</p>
          <button
            onClick={() => { setIsLoading(true); loadCalls(); }}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  const formatDuration = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.floor((minutes % 1) * 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateString: string) => {
    if(!dateString) return '—';
    const d = new Date(dateString);
    if(isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const kiosks = Array.from(new Set(calls.filter(Boolean).map(c=>c.kioskId).filter(Boolean)));
  const avgDuration = calls.length ? (calls.filter(Boolean).reduce((a,c)=>a+(c.durationMinutes||0),0)/calls.length).toFixed(1) : '0';
  const withRec = Object.keys(recordings).length;

  const filtered = calls.filter(c => {
    if(!c || !c.startTime) return false;
    const s = search.toLowerCase();
    const matchSearch = !s || (c.callId||'').toLowerCase().includes(s) || (c.inmateId||'').toLowerCase().includes(s) || (c.contactId||'').toLowerCase().includes(s) || (c.kioskId||'').toLowerCase().includes(s);
    const matchStatus = statusFilter==='all' || c.status===statusFilter;
    const matchType = typeFilter==='all' || c.type===typeFilter;
    const matchKiosk = kioskFilter==='all' || c.kioskId===kioskFilter;
    const d = new Date(c.startTime).toISOString().slice(0,10);
    const matchFrom = !dateFrom || d >= dateFrom;
    const matchTo = !dateTo || d <= dateTo;
    return matchSearch && matchStatus && matchType && matchKiosk && matchFrom && matchTo;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page-1)*pageSize, page*pageSize);
  const toggleSort = (f: 'date'|'duration') => {
    if(sortField===f) setSortDir(d=> d==='asc'?'desc':'asc'); else {setSortField(f); setSortDir('desc');}
  };

  // No dummy transcripts — data comes strictly from database server via wardenApi.getCallHistory() / getRecordings()
  const quality = (c: CallHistoryItem) => c.status==='failed' ? 'bg-error' : c.durationMinutes>10 ? 'bg-success' : c.durationMinutes>5 ? 'bg-amber-500' : 'bg-neutral-400';
  const retentionLeft = (r: Recording) => {
    const days = r.retentionDays || 30;
    const elapsed = Math.floor((Date.now() - new Date(r.startTime).getTime())/86400000);
    const left = Math.max(0, days - elapsed);
    return {left, pct: Math.max(0, Math.min(100, (left/days)*100))};
  };

  const exportCSV = () => {
    const rows = [['Call ID','Date','Inmate','Contact','Kiosk','Type','Duration','Status','Recording']];
    filtered.forEach(c => {
      const rec = recordings[c.callId];
      rows.push([c.callId, formatDate(c.startTime), c.inmateId, c.contactId, c.kioskId, c.type, formatDuration(c.durationMinutes), c.status, rec?.url || rec?.status || 'No recording']);
    });
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='call-logs.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const toggleBulk = (id: string) => {
    setSelectedIds(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const exportSelected = () => {
    const toExport = filtered.filter(c=> selectedIds.has(c.callId));
    const rows = [['Call ID','Date','Inmate','Contact','Kiosk','Type','Duration','Status']];
    (toExport.length?toExport:filtered).forEach(c=> rows.push([c.callId, formatDate(c.startTime), c.inmateId, c.contactId, c.kioskId, c.type, formatDuration(c.durationMinutes), c.status]));
    const csv = rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download= selectedIds.size? 'call-logs-selected.csv':'call-logs.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Professional Header */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Call Logs</h1>
                <span className="px-2.5 py-1 bg-neutral-900 text-white rounded-full text-xs font-bold">{filtered.length} / {calls.length}</span>
                {selectedIds.size>0 && <span className="px-2.5 py-1 bg-primary-600 text-white rounded-full text-xs font-bold">{selectedIds.size} selected</span>}
              </div>
              <p className="text-sm text-neutral-600 mt-1">Completed & failed calls • {withRec} with recordings • Avg {avgDuration} min • Force-disconnected calls appear here instantly</p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex bg-neutral-100 p-1 rounded-xl border border-neutral-200">
              <button onClick={()=>setViewMode('table')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${viewMode==='table'?'bg-white shadow-sm border border-neutral-200 text-neutral-900':'text-neutral-600 hover:text-neutral-900'}`}>Table</button>
              <button onClick={()=>setViewMode('timeline')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${viewMode==='timeline'?'bg-white shadow-sm border border-neutral-200 text-neutral-900':'text-neutral-600 hover:text-neutral-900'}`}>Timeline</button>
            </div>
            <button onClick={exportCSV} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-success text-white rounded-xl text-sm font-bold hover:bg-success-700 shadow-sm"> <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> Export</button>
            {selectedIds.size>0 && <button onClick={exportSelected} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 shadow-sm">Export {selectedIds.size}</button>}
          </div>
        </div>
      </div>

      {/* Professional Filters */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <div className="md:col-span-2 relative">
            <svg className="w-5 h-5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input value={search} onChange={e=>{setSearch(e.target.value); setPage(1)}} placeholder="Search Call ID / Inmate / Contact / Kiosk" className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm" />
          </div>
          <select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value); setPage(1)}} className="px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500"><option value="all">All Status</option><option value="completed">Completed</option><option value="failed">Failed</option></select>
          <select value={typeFilter} onChange={e=>{setTypeFilter(e.target.value); setPage(1)}} className="px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500"><option value="all">All Types</option><option value="video">Video</option><option value="audio">Audio</option></select>
          <select value={kioskFilter} onChange={e=>{setKioskFilter(e.target.value); setPage(1)}} className="px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500"><option value="all">All Kiosks</option>{kiosks.map(k=><option key={k} value={k}>{k}</option>)}</select>
          <div className="flex gap-2 md:col-span-2">
            <div className="flex-1"><label className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">From</label><input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value); setPage(1)}} className="w-full px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500" /></div>
            <div className="flex-1"><label className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">To</label><input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value); setPage(1)}} className="w-full px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500" /></div>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </div>
            <p className="text-neutral-900 font-semibold">No call logs found</p>
            <p className="text-sm text-neutral-500 mt-1">Try adjusting filters or date range</p>
          </div>
        ) : viewMode==='timeline' ? (
          <div className="space-y-3 p-2">
            {paged.map(call=>{
              const rec=recordings[call.callId];
              return (
                <div key={call.callId} onClick={()=>setSelected(call)} className="flex gap-4 p-5 bg-white border border-neutral-200 rounded-2xl hover:shadow-md hover:border-neutral-300 cursor-pointer transition-all">
                  <div className="flex flex-col items-center">
                    <div className={`w-3.5 h-3.5 rounded-full ${quality(call)} shadow-sm`} />
                    <div className="w-0.5 flex-1 bg-neutral-200 mt-2 rounded-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-3">
                      <p className="font-mono text-xs font-bold text-neutral-900 truncate">{call.callId} • {formatDate(call.startTime)} • {formatDuration(call.durationMinutes)}</p>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border shrink-0 ${call.status==='completed'?'bg-success/10 text-success border-success/20':'bg-error/10 text-error border-error/20'}`}>{call.status}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-3 p-2.5 bg-neutral-50 rounded-xl border border-neutral-200">
                      <div className="w-9 h-9 rounded-xl bg-white border border-neutral-200 flex items-center justify-center shrink-0 shadow-sm"><svg className="w-5 h-5 text-neutral-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg></div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900 truncate">{inmates[call.inmateId] ? `${inmates[call.inmateId].firstName} ${inmates[call.inmateId].lastName}` : call.inmateId}</p>
                        <p className="text-xs text-neutral-500">{call.kioskId} • {call.type} • {formatDuration(call.durationMinutes)}</p>
                      </div>
                    </div>

                    {rec && <div className="mt-3 flex items-center gap-3 text-xs p-2.5 bg-white border border-neutral-200 rounded-xl"><span className="px-2 py-1 bg-neutral-900 text-white rounded-full text-xs font-bold">{rec.encryption || 'AES-256'}</span>{rec.retentionDays && <><div className="flex-1 max-w-32 h-1.5 bg-neutral-200 rounded-full"><div className="h-1.5 bg-purple-600 rounded-full" style={{width: `${retentionLeft(rec).pct}%`}} /></div><span className="text-purple-600 font-bold">{retentionLeft(rec).left}d left</span></>}<button onClick={e=>{e.stopPropagation(); setPlaying(rec)}} className="ml-auto px-3 py-1.5 bg-primary-600 text-white rounded-full text-xs font-bold hover:bg-primary-700">▶ Play</button></div>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="px-4 py-3"><input type="checkbox" className="rounded" checked={paged.length>0 && paged.every(c=>selectedIds.has(c.callId))} onChange={e=>{ if(e.target.checked) setSelectedIds(new Set(paged.map(c=>c.callId))); else setSelectedIds(new Set());}} /></th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Call ID</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider cursor-pointer select-none" onClick={()=>toggleSort('date')}>Date {sortField==='date'?(sortDir==='asc'?'↑':'↓'):''}</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Inmate</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Contact</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Kiosk</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Type</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider cursor-pointer select-none" onClick={()=>toggleSort('duration')}>Duration {sortField==='duration'?(sortDir==='asc'?'↑':'↓'):''}</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Recording</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((call) => {
                  const rec = recordings[call.callId];
                  const ret = rec ? retentionLeft(rec) : null;
                  return (
                  <tr key={call.callId} onClick={()=>setSelected(call)} className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer even:bg-neutral-50/50">
                    <td className="px-3" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(call.callId)} onChange={()=>toggleBulk(call.callId)} /></td>
                     <td className="py-3 px-4"><div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${quality(call)} shadow-sm`} /><span className="font-mono text-xs font-bold text-neutral-900">{call.callId}</span></div></td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{formatDate(call.startTime)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center shrink-0"><svg className="w-5 h-5 text-[#8696A0]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg></div>
                        <div>
                          <p className="text-sm font-medium text-neutral-900">{inmates[call.inmateId] ? `${inmates[call.inmateId].firstName} ${inmates[call.inmateId].lastName}` : call.inmateId}</p>
                          <p className="text-xs text-neutral-500">{call.inmateId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{call.contactId}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{call.kioskId}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900 capitalize">{call.type}</td>
                    <td className="py-3 px-4 text-sm text-neutral-900">{formatDuration(call.durationMinutes)}</td>
                     <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                        call.status === 'completed' ? 'bg-success/10 text-success border-success/20' : 'bg-error/10 text-error border-error/20'
                      }`}>
                        {call.status}
                      </span>
                    </td>
                    <td className="py-3 px-4" onClick={e=>e.stopPropagation()}>
                      {rec?.url ? (
                        <div className="space-y-1.5">
                          <div className="flex gap-2">
                            <button onClick={() => setPlaying(rec)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-full text-xs font-bold hover:bg-primary-700 shadow-sm">▶ Play</button>
                            <a href={rec.url} download className="inline-flex items-center gap-1 px-3 py-1.5 bg-neutral-900 text-white rounded-full text-xs font-bold hover:bg-black shadow-sm">⬇ Download</a>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs"><div className="flex-1 max-w-20 h-1.5 bg-neutral-200 rounded-full"><div className="h-1.5 bg-purple-600 rounded-full" style={{width:`${ret!.pct}%`}} /></div><span className="text-purple-600 font-bold">{ret!.left}d</span></div>
                        </div>
                      ) : rec ? (
                        <span className="px-2 py-1 bg-neutral-100 border border-neutral-200 rounded-full text-xs font-bold capitalize">{rec.status}</span>
                      ) : (
                        <span className="text-xs text-neutral-400">No recording</span>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > pageSize && (
          <div className="flex items-center justify-between mt-5 px-1 py-3 bg-neutral-50 border border-neutral-200 rounded-xl">
            <span className="text-sm text-neutral-600 px-3">Showing <span className="font-bold text-neutral-900">{(page-1)*pageSize+1}-{Math.min(page*pageSize, filtered.length)}</span> of <span className="font-bold text-neutral-900">{filtered.length}</span></span>
            <div className="flex items-center gap-1 pr-2">
              <button disabled={page===1} onClick={()=>setPage(1)} className="px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:bg-neutral-50 shadow-sm">«</button>
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:bg-neutral-50 shadow-sm">Prev</button>
              <span className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold shadow-sm">{page} / {totalPages}</span>
              <button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:bg-neutral-50 shadow-sm">Next</button>
              <button disabled={page===totalPages} onClick={()=>setPage(totalPages)} className="px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-30 hover:bg-neutral-50 shadow-sm">»</button>
            </div>
          </div>
        )}
      </Card>
      {playing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setPlaying(null)}>
          <div className="bg-white rounded-xl p-4 max-w-3xl w-full" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Recording - {playing.callId}</h3>
              <button onClick={() => setPlaying(null)} className="text-neutral-500 hover:text-neutral-900">✕</button>
            </div>
            {playing.callId && (
              calls.find(c=>c.callId===playing.callId)?.type==='audio' ? (
                <audio controls autoPlay src={playing.url || ''} className="w-full" />
              ) : (
                <video controls autoPlay src={playing.url || ''} className="w-full rounded-lg bg-black" style={{maxHeight:'60vh'}} />
              )
            )}
            <p className="text-xs text-neutral-500 mt-2">Inmate {playing.inmateId} • {formatDuration((playing.duration||0)/60)}</p>
          </div>
        </div>
      )}
      {selected && (
        <div className="fixed inset-0 bg-black/60 flex justify-end z-50" onClick={()=>setSelected(null)}>
          <div className="bg-white w-full max-w-md h-full overflow-auto p-6" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Call Details</h3>
              <button onClick={()=>setSelected(null)} className="text-neutral-500">✕</button>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center shrink-0"><svg className="w-7 h-7 text-[#8696A0]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg></div>
              <div>
                <p className="font-medium">{inmates[selected.inmateId] ? `${inmates[selected.inmateId].firstName} ${inmates[selected.inmateId].lastName}` : selected.inmateId}</p>
                <p className="text-xs text-neutral-500">{selected.inmateId} • {inmates[selected.inmateId]?.cellBlock || ''}</p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <p><b>Call ID:</b> {selected.callId}</p>
              <p><b>Date:</b> {formatDate(selected.startTime)}</p>
              <p><b>Kiosk:</b> {selected.kioskId}</p>
              <p><b>Type:</b> {selected.type} • <b>Duration:</b> {formatDuration(selected.durationMinutes)} • <b>Status:</b> {selected.status}</p>
              <p><b>Contact:</b> {selected.contactId}</p>
            </div>
            {recordings[selected.callId]?.url && (
              <div className="mt-4">
                <p className="text-sm font-semibold mb-2">Recording</p>
                <video controls src={recordings[selected.callId].url!} className="w-full rounded-lg bg-black" />
                <a href={recordings[selected.callId].url!} download className="mt-2 inline-block px-4 py-2 bg-primary-600 text-white rounded text-sm">⬇ Download Recording</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
