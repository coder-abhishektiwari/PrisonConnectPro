import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { apiClient } from '@/services/api/client';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import { usePageHeader } from '@/context/PageHeaderContext';
import { FilterDropdown } from '@/components/FilterDropdown';
import type { ColumnFilter } from '@/components/FilterDropdown';
import ExcelJS from 'exceljs';

import type { CallHistoryItem, Recording, Inmate, CallHistoryParams } from '@/services/api/wardenApi';

const PAGE_SIZE = 20;

export function CallHistoryPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [recordings, setRecordings] = useState<Record<string, Recording>>({});
  const [inmates, setInmates] = useState<Record<string, Inmate>>({});
  const [allKiosks, setAllKiosks] = useState<{value:string,label:string}[]>([]);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<CallHistoryItem | null>(null);
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const [typeFilter, setTypeFilter] = useState<ColumnFilter>({ value: 'all', open: false });
  const [statusFilter, setStatusFilter] = useState<ColumnFilter>({ value: 'all', open: false });
  const [kioskFilter, setKioskFilter] = useState<ColumnFilter>({ value: 'all', open: false });
  const [qualityFilter, setQualityFilter] = useState<ColumnFilter>({ value: 'all', open: false });
  const [recordingFilter, setRecordingFilter] = useState<ColumnFilter>({ value: 'all', open: false });

  const buildParams = useCallback((): CallHistoryParams => ({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    search: search || undefined,
    type: typeFilter.value !== 'all' ? typeFilter.value : undefined,
    status: statusFilter.value !== 'all' ? statusFilter.value : undefined,
    kioskId: kioskFilter.value !== 'all' ? kioskFilter.value : undefined,
    quality: qualityFilter.value !== 'all' ? qualityFilter.value : undefined,
    recording: recordingFilter.value !== 'all' ? recordingFilter.value : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sortField: 'date',
    sortDir,
  }), [page, search, typeFilter.value, statusFilter.value, kioskFilter.value, qualityFilter.value, recordingFilter.value, dateFrom, dateTo, sortDir]);

  const loadCalls = useCallback(async () => {
    try {
      const [pagedResult, recs] = await Promise.all([
        wardenApi.getCallHistory(buildParams()),
        wardenApi.getRecordings(),
      ]);
      setCalls(pagedResult.calls ?? []);
      setTotal(pagedResult.total ?? 0);
      const map: Record<string, Recording> = {};
      (recs ?? []).forEach((r) => { map[r.callId] = r; });
      setRecordings(map);
    } catch { setCalls([]); setTotal(0); setRecordings({}); }
    finally { setIsLoading(false); }
  }, [buildParams]);

  const loadInmates = useCallback(async () => {
    try {
      const result = await wardenApi.getInmates({ limit: 1000, offset: 0 });
      const imap: Record<string, Inmate> = {};
      (result?.items ?? []).forEach((i) => { imap[i.inmateId] = i; });
      setInmates(imap);
    } catch { /* ignore */ }
  }, []);

  const loadKiosks = useCallback(async () => {
    try {
      const r = await apiClient.get('/kiosks');
      const items = r.data?.data ?? [];
      setAllKiosks(items.map((k: any) => ({ value: k.kioskId, label: k.kioskId })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadCalls(); }, [loadCalls]);
  useEffect(() => { loadInmates(); }, [loadInmates]);
  useEffect(() => { loadKiosks(); }, [loadKiosks]);
  useWardenSocket(() => { loadCalls(); });

  useEffect(() => { setPage(1); }, [search, dateFrom, dateTo, typeFilter.value, statusFilter.value, kioskFilter.value, qualityFilter.value, recordingFilter.value, sortDir]);

  const exportExcel = async (rows: CallHistoryItem[], filename: string) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Call Logs');
    const headers = ['Call ID', 'Date', 'Inmate', 'Family', 'Kiosk', 'Type', 'Duration', 'Status', 'Quality', 'Recording'];
    const colsCount = headers.length;

    ws.mergeCells(1, 1, 1, colsCount);
    const titleCell = ws.getCell('A1');
    titleCell.value = 'Call Logs Report';
    titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF000000' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 32;

    ws.mergeCells(2, 1, 2, colsCount);
    const brandCell = ws.getCell('A2');
    brandCell.value = { text: 'DSS Solutions  |  www.dsssolutions.in', hyperlink: 'http://www.dsssolutions.in', tooltip: 'Visit DSS Solutions' };
    brandCell.font = { name: 'Calibri', size: 14, color: { argb: 'FF000000' }, underline: true };
    brandCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 24;
    ws.getRow(3).height = 10;

    const headerRow = ws.getRow(4);
    headerRow.height = 26;
    headers.forEach((h, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    rows.forEach((c) => {
      const rec = recordings[c.callId];
      const row = ws.addRow([
        c.callId, fmtDate(c.startTime), inmates[c.inmateId]?.name || c.inmateId,
        c.familyMemberName || '', c.kioskId, c.type, fmtDur(c.durationMinutes),
        c.status, c.connectionQuality || '', rec?.url ? 'Yes' : 'No'
      ]);
      row.eachCell((cell) => { cell.numFmt = '@'; });
    });

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'D0D0D0' } },
      left: { style: 'thin', color: { argb: 'D0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'D0D0D0' } },
      right: { style: 'thin', color: { argb: 'D0D0D0' } }
    };
    ws.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) {
        row.eachCell((cell, colNumber) => {
          cell.border = thinBorder;
          if (rowNumber > 4) {
            cell.alignment = { horizontal: [1, 2, 5, 6, 7, 8, 9, 10].includes(colNumber) ? 'center' : 'left', vertical: 'middle' };
            cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
          }
        });
      }
    });
    ws.columns = [{ width: 18 }, { width: 15 }, { width: 22 }, { width: 22 }, { width: 15 }, { width: 12 }, { width: 14 }, { width: 15 }, { width: 14 }, { width: 14 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const hasSelection = selectedIds.size > 0;
      let rows: CallHistoryItem[];
      if (hasSelection) {
        rows = calls.filter((c) => selectedIds.has(c.callId));
      } else {
        const allResult = await wardenApi.getCallHistory({ ...buildParams(), limit: 10000, offset: 0 });
        rows = allResult.calls ?? [];
      }
      const suffix = hasSelection ? '_selected_records' : '-all';
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}-${String(now.getSeconds()).padStart(2,'0')}`;
      await exportExcel(rows, `call-logs${suffix}_${ts}.xlsx`);
    } finally { setIsExporting(false); }
  };

  const headerIcon = useMemo(() => <span className="material-icons text-primary-600 text-xl">schedule</span>, []);

  usePageHeader({
    title: 'Call Logs',
    subtitle: `${total} calls total`,
    icon: headerIcon,
    actions: useMemo(() => (
      <button onClick={handleExport} disabled={isExporting} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-success text-white rounded-xl text-sm font-bold hover:bg-success-700 shadow-sm disabled:opacity-50">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        {isExporting ? 'Exporting...' : `Export Excel${selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}`}
      </button>
    ), [handleExport, isExporting, selectedIds.size]),
  });

  if (isLoading) return <Loading message="Loading call history..." />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fmtDur = (m: number) => {
    if (!Number.isFinite(m) || m == null) return '00:00';
    const mins = Math.floor(m); const secs = Math.floor((m % 1) * 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  const fmtDate = (iso: string) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };
  const fmtDateTime = (iso: string) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }); };

  const getFailReason = (c: CallHistoryItem) => {
    if (c.failReason) return c.failReason;
    if (!c.mediaConnectedAt) return 'Family member did not join the call';
    if (c.durationMinutes === 0) return 'Call ended immediately after connecting';
    return 'Call ended unexpectedly';
  };

  const toggleBulk = (id: string) => { setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const toggleAll = () => { if (calls.every((c) => selectedIds.has(c.callId))) setSelectedIds(new Set()); else setSelectedIds(new Set(calls.map((c) => c.callId))); };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm flex gap-3">
        <div className="flex-1 relative">
          <svg className="w-5 h-5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search inmate, family, kiosk..." className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm" />
        </div>
        <div className="flex gap-2 items-center">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} className="px-3 py-2.5 text-error font-bold text-sm hover:bg-error/10 rounded-xl transition-colors">Clear</button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {calls.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg></div>
            <p className="text-neutral-900 font-semibold">No call logs found</p>
            <p className="text-sm text-neutral-500 mt-1">Try adjusting filters or date range</p>
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-280px)]">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="px-4 py-3 w-10"><input type="checkbox" checked={calls.length > 0 && calls.every((c) => selectedIds.has(c.callId))} onChange={toggleAll} className="rounded border-neutral-300" /></th>
                  <th className="text-left py-3 px-4"><FilterDropdown label="Type" options={[{ value: 'video', label: 'Video' }, { value: 'audio', label: 'Audio' }]} filter={typeFilter} setFilter={setTypeFilter} /></th>
                  <th className="text-left py-3 px-4"><button onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-neutral-500 hover:text-primary-600 transition-colors">Date {sortDir === 'asc' ? '↑' : '↓'}</button></th>
                  <th className="text-left py-3 px-4"><span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Inmate ⇄ Family</span></th>
                  <th className="text-left py-3 px-4"><FilterDropdown label="Kiosk" options={allKiosks} filter={kioskFilter} setFilter={setKioskFilter} /></th>
                  <th className="text-left py-3 px-4"><span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Duration</span></th>
                  <th className="text-left py-3 px-4"><FilterDropdown label="Status" options={[{ value: 'completed', label: 'Completed' }, { value: 'failed', label: 'Failed' }, { value: 'active', label: 'Active' }]} filter={statusFilter} setFilter={setStatusFilter} /></th>
                  <th className="text-left py-3 px-4"><FilterDropdown label="Quality" options={[{ value: 'excellent', label: 'Excellent' }, { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }]} filter={qualityFilter} setFilter={setQualityFilter} /></th>
                  <th className="text-left py-3 px-4"><FilterDropdown label="Recording" options={[{ value: 'available', label: 'Available' }, { value: 'none', label: 'None' }]} filter={recordingFilter} setFilter={setRecordingFilter} /></th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => {
                  const rec = recordings[call.callId];
                  const inmate = inmates[call.inmateId];
                  const isInmateName = inmate?.name || call.inmateName || call.inmateId;
                  const familyName = call.familyMemberName || '—';
                  const isLive = call.status === 'active';

                  return (
                    <tr key={call.callId} onClick={() => setSelected(call)} className={`border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer ${isLive ? 'bg-success/5' : 'even:bg-neutral-50/50'}`}>
                      <td className="px-4" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(call.callId)} onChange={() => toggleBulk(call.callId)} className="rounded border-neutral-300" /></td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${call.type === 'video' ? 'bg-primary-600 text-white border-primary-600' : 'bg-info text-white border-info'}`}>{call.type === 'video' ? '▶ Video' : '● Audio'}</span>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-900">{fmtDate(call.startTime)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-neutral-900 truncate">{isInmateName}</span>
                          <span className="text-xs text-neutral-400">⇄</span>
                          <span className="text-sm font-medium text-neutral-700 truncate">{familyName}</span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">{call.inmateId}</p>
                      </td>
                      <td className="py-3 px-4 text-sm text-neutral-900">{call.kioskId}</td>
                      <td className="py-3 px-4">
                        {isLive ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-success">
                            <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
                            {fmtDur(call.durationMinutes)}
                          </span>
                        ) : (
                          <span className="text-sm text-neutral-900">{fmtDur(call.durationMinutes)}</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {isLive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-success text-white">
                            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                            Live
                          </span>
                        ) : call.status === 'failed' ? (
                          <div className="relative group">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border bg-error/10 text-error border-error/20 cursor-help">Failed</span>
                            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-72">
                              <div className="bg-neutral-900 text-white text-xs rounded-xl p-3 shadow-xl leading-relaxed">
                                <p className="font-bold mb-1">Failure Reason</p>
                                <p className="text-neutral-300">{getFailReason(call)}</p>
                              </div>
                              <div className="w-2 h-2 bg-neutral-900 transform rotate-45 absolute -bottom-1 left-4" />
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border bg-success/10 text-success border-success/20">Completed</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${call.connectionQuality === 'excellent' ? 'bg-success/10 text-success border-success/20' : call.connectionQuality === 'good' ? 'bg-info-100 text-info border-info/20' : call.connectionQuality === 'fair' ? 'bg-warning/10 text-warning border-warning/20' : 'bg-error/10 text-error border-error/20'}`}>{call.connectionQuality || '—'}</span>
                      </td>
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        {rec?.url ? (
                          <button onClick={() => setPlaying(rec)} className="w-9 h-9 bg-neutral-900 text-white rounded-full flex items-center justify-center hover:bg-black transition-colors shadow-sm" title="Play recording">
                            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                          </button>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-4 bg-neutral-50 border-t border-neutral-200">
            <span className="text-sm text-neutral-600">Showing <span className="font-semibold text-neutral-900">{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)}</span> of <span className="font-semibold text-neutral-900">{total}</span></span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(1)} className="px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-neutral-50 shadow-sm">«</button>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-neutral-50 shadow-sm">Prev</button>
              <span className="px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold shadow-sm">{page} / {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="px-4 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-neutral-50 shadow-sm">Next</button>
              <button disabled={page === totalPages} onClick={() => setPage(totalPages)} className="px-3 py-2 bg-white border border-neutral-200 rounded-xl text-xs font-bold disabled:opacity-40 hover:bg-neutral-50 shadow-sm">»</button>
            </div>
          </div>
        )}
      </Card>

      {createPortal(<>
        {playing && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setPlaying(null)}>
            <div className="bg-white rounded-2xl p-4 max-w-3xl w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-neutral-900">Recording — {playing.callId}</h3>
                <button onClick={() => setPlaying(null)} className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-neutral-900">✕</button>
              </div>
              {calls.find((c) => c.callId === playing.callId)?.type === 'audio' ? (
                <audio controls autoPlay src={playing.url || ''} className="w-full" />
              ) : (
                <video controls autoPlay src={playing.url || ''} className="w-full rounded-lg bg-black" style={{ maxHeight: '60vh' }} />
              )}
            </div>
          </div>
        )}

        {selected && (
          <div className="fixed inset-0 bg-black/60 z-[999]" onClick={() => setSelected(null)}>
            <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-200 shrink-0">
                <h3 className="text-lg font-bold text-neutral-900">Call Details</h3>
                <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-neutral-900">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="flex gap-2 mb-6">
                  {selected.status === 'active' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-success text-white"><span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />Live</span>
                  ) : selected.status === 'completed' ? (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border bg-success/10 text-success border-success/20">✓ Completed</span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border bg-error/10 text-error border-error/20">✕ {selected.status}</span>
                  )}
                  <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold border ${selected.type === 'video' ? 'bg-primary-600 text-white border-primary-600' : 'bg-info text-white border-info'}`}>{selected.type === 'video' ? '▶ Video' : '● Audio'}</span>
                </div>

                <div className="space-y-4">
                  <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                    <p className="text-[11px] font-bold text-primary-600 uppercase tracking-wide mb-2">Participants</p>
                    <div className="space-y-2">
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Inmate</span><span className="text-sm font-semibold text-neutral-900">{inmates[selected.inmateId]?.name || selected.inmateName || selected.inmateId}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Inmate ID</span><span className="text-sm font-mono text-neutral-900">{selected.inmateId}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Family Member</span><span className="text-sm font-semibold text-neutral-900">{selected.familyMemberName || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Contact ID</span><span className="text-sm font-mono text-neutral-900">{selected.contactId}</span></div>
                    </div>
                  </div>

                  <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                    <p className="text-[11px] font-bold text-primary-600 uppercase tracking-wide mb-2">Call Info</p>
                    <div className="space-y-2">
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Call ID</span><span className="text-sm font-mono text-neutral-900">{selected.callId}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Room ID</span><span className="text-sm font-mono text-neutral-900">{selected.roomId}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Kiosk</span><span className="text-sm font-semibold text-neutral-900">{selected.kioskId}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Started</span><span className="text-sm text-neutral-900">{fmtDateTime(selected.startTime)}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Ended</span><span className="text-sm text-neutral-900">{selected.endTime ? fmtDateTime(selected.endTime) : '—'}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Duration</span><span className="text-sm font-semibold text-neutral-900">{fmtDur(selected.durationMinutes)}</span></div>
                    </div>
                  </div>

                  <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                    <p className="text-[11px] font-bold text-primary-600 uppercase tracking-wide mb-2">Technical</p>
                    <div className="space-y-2">
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Quality</span><span className={`text-sm font-semibold ${selected.connectionQuality === 'excellent' ? 'text-success' : selected.connectionQuality === 'good' ? 'text-info' : selected.connectionQuality === 'fair' ? 'text-warning' : 'text-error'}`}>{selected.connectionQuality || '—'}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Media Connected</span><span className="text-sm text-neutral-900">{selected.mediaConnectedAt ? fmtDateTime(selected.mediaConnectedAt) : 'Never'}</span></div>
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Recording</span><span className="text-sm text-neutral-900">{selected.recordingStatus || '—'}</span></div>
                    </div>
                  </div>

                  {selected.status === 'failed' && (
                    <div className="bg-error/5 rounded-xl p-4 border border-error/20">
                      <p className="text-[11px] font-bold text-error uppercase tracking-wide mb-2">Failure Details</p>
                      <p className="text-sm text-neutral-700">{getFailReason(selected)}</p>
                    </div>
                  )}

                  <div className="bg-neutral-50 rounded-xl p-4 border border-neutral-200">
                    <p className="text-[11px] font-bold text-primary-600 uppercase tracking-wide mb-2">Billing</p>
                    <div className="space-y-2">
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Rate</span><span className="text-sm text-neutral-900">₹{selected.ratePerMinute || 0}/min</span></div>
                      <div className="flex justify-between"><span className="text-sm text-neutral-600">Charge</span><span className="text-sm font-bold text-neutral-900">₹{selected.chargeAmount || 0}</span></div>
                    </div>
                  </div>
                </div>

                {recordings[selected.callId]?.url && (
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-neutral-900 mb-2">Recording</p>
                    <video controls src={recordings[selected.callId].url!} className="w-full rounded-lg bg-black" />
                    <a href={recordings[selected.callId].url!} download className="mt-2 inline-block px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold hover:bg-primary-700">⬇ Download</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </>, document.body)}
    </div>
  );
}
