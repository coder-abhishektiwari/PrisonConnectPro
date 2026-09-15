import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { useWardenSocket } from '@/hooks/useWardenSocket';
import ExcelJS from 'exceljs';

import type { CallHistoryItem, Recording, Inmate } from '@/services/api/wardenApi';

const PAGE_SIZE = 10;

type SortField = 'date' | 'duration' | 'type';
type SortDir = 'asc' | 'desc';

interface ColumnFilter { value: string; open: boolean; }

function FilterDropdown({ label, options, filter, setFilter }: {
  label: string; options: { value: string; label: string }[];
  filter: ColumnFilter; setFilter: (f: ColumnFilter) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setFilter({ ...filter, open: false }); };
    if (filter.open) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [filter.open, setFilter]);
  return (
    <div ref={ref} className="relative inline-block">
      <button onClick={() => setFilter({ ...filter, open: !filter.open })}
        className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider hover:text-primary-600 transition-colors ${filter.value !== 'all' ? 'text-primary-600' : 'text-neutral-500'}`}>
        {label}
        {filter.value !== 'all' && <span className="w-4 h-4 bg-primary-600 text-white rounded-full text-[9px] flex items-center justify-center">1</span>}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {filter.open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-xl z-50 min-w-[160px] py-1">
          <button onClick={() => setFilter({ value: 'all', open: false })} className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 ${filter.value === 'all' ? 'font-bold text-primary-600' : 'text-neutral-700'}`}>All {label}</button>
          {options.map((o) => (
            <button key={o.value} onClick={() => setFilter({ value: o.value, open: false })} className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 ${filter.value === o.value ? 'font-bold text-primary-600' : 'text-neutral-700'}`}>{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CallHistoryPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [recordings, setRecordings] = useState<Record<string, Recording>>({});
  const [inmates, setInmates] = useState<Record<string, Inmate>>({});
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<CallHistoryItem | null>(null);
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [typeFilter, setTypeFilter] = useState<ColumnFilter>({ value: 'all', open: false });
  const [statusFilter, setStatusFilter] = useState<ColumnFilter>({ value: 'all', open: false });
  const [kioskFilter, setKioskFilter] = useState<ColumnFilter>({ value: 'all', open: false });
  const [qualityFilter, setQualityFilter] = useState<ColumnFilter>({ value: 'all', open: false });
  const [recordingFilter, setRecordingFilter] = useState<ColumnFilter>({ value: 'all', open: false });

  const loadCalls = useCallback(async () => {
    try {
      const [callHistory, recs, inmateList] = await Promise.all([
        wardenApi.getCallHistory(), wardenApi.getRecordings(),
        wardenApi.getInmates().catch(() => [] as Inmate[]),
      ]);
      setCalls(callHistory ?? []);
      const map: Record<string, Recording> = {};
      (recs ?? []).forEach((r) => { map[r.callId] = r; });
      setRecordings(map);
      const imap: Record<string, Inmate> = {};
      (inmateList ?? []).forEach((i) => { imap[i.inmateId] = i; });
      setInmates(imap);
    } catch { setCalls([]); setRecordings({}); setInmates({}); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { loadCalls(); }, [loadCalls]);
  useWardenSocket(() => { loadCalls(); });

  if (isLoading) return <Loading message="Loading call history..." />;

  const fmtDur = (m: number) => {
    if (!Number.isFinite(m) || m == null) return '00:00';
    const mins = Math.floor(m); const secs = Math.floor((m % 1) * 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  const fmtDate = (iso: string) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };
  const fmtDateTime = (iso: string) => { if (!iso) return '—'; const d = new Date(iso); return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }); };

  const kiosks = Array.from(new Set(calls.map((c) => c.kioskId).filter(Boolean)));

  const filtered = calls.filter((c) => {
    if (!c || !c.startTime) return false;
    const s = search.toLowerCase();
    const inmate = inmates[c.inmateId];
    const matchSearch = !s || (inmate?.name || '').toLowerCase().includes(s) || (c.familyMemberName || '').toLowerCase().includes(s) || c.inmateId.toLowerCase().includes(s) || c.kioskId.toLowerCase().includes(s);
    const matchType = typeFilter.value === 'all' || c.type === typeFilter.value;
    const matchStatus = statusFilter.value === 'all' || c.status === statusFilter.value;
    const matchKiosk = kioskFilter.value === 'all' || c.kioskId === kioskFilter.value;
    const matchQuality = qualityFilter.value === 'all' || c.connectionQuality === qualityFilter.value;
    const hasRec = recordings[c.callId]?.url;
    const matchRec = recordingFilter.value === 'all' || (recordingFilter.value === 'available' && hasRec) || (recordingFilter.value === 'none' && !hasRec);
    const d = new Date(c.startTime).toISOString().slice(0, 10);
    const matchFrom = !dateFrom || d >= dateFrom;
    const matchTo = !dateTo || d <= dateTo;
    return matchSearch && matchType && matchStatus && matchKiosk && matchQuality && matchRec && matchFrom && matchTo;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.status === 'active' && b.status !== 'active') return -1;
    if (a.status !== 'active' && b.status === 'active') return 1;
    let cmp = 0;
    if (sortField === 'date') cmp = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    else if (sortField === 'duration') cmp = (a.durationMinutes || 0) - (b.durationMinutes || 0);
    else if (sortField === 'type') cmp = a.type.localeCompare(b.type);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (f: SortField) => { if (sortField === f) setSortDir((d) => d === 'asc' ? 'desc' : 'asc'); else { setSortField(f); setSortDir('desc'); } };

  const getFailReason = (c: CallHistoryItem) => {
    if (c.failReason) return c.failReason;
    if (!c.mediaConnectedAt) return 'Family member did not join the call';
    if (c.durationMinutes === 0) return 'Call ended immediately after connecting';
    return 'Call ended unexpectedly';
  };

  const toggleBulk = (id: string) => { setSelectedIds((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const toggleAll = () => { if (paged.every((c) => selectedIds.has(c.callId))) setSelectedIds(new Set()); else setSelectedIds(new Set(paged.map((c) => c.callId))); };



  const exportExcel = async (rows: CallHistoryItem[], filename: string) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Call Logs');

    const headers = ['Call ID', 'Date', 'Inmate', 'Family', 'Kiosk', 'Type', 'Duration', 'Status', 'Quality', 'Recording'];
    const colsCount = headers.length;

    // 1. Title Row (A1:J1)
    ws.mergeCells(1, 1, 1, colsCount);
    const titleCell = ws.getCell('A1');
    titleCell.value = 'Call Logs Report';
    titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FF000000' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 32;

    // 2. Branding & Hyperlink Row (A2:J2)
    ws.mergeCells(2, 1, 2, colsCount);
    const brandCell = ws.getCell('A2');
    brandCell.value = {
      text: 'DSS Solutions  |  www.dsssolutions.in',
      hyperlink: 'http://www.dsssolutions.in',
      tooltip: 'Visit DSS Solutions'
    };
    brandCell.font = { name: 'Calibri', size: 14, color: { argb: 'FF000000' }, underline: true };
    brandCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 24;

    // Blank spacer row height
    ws.getRow(3).height = 10;

    // 3. Header Row (Row 4)
    const headerRow = ws.getRow(4);
    headerRow.height = 26;
    headers.forEach((h, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF000000' } // Pure Black Header Background
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // 4. Data Rows (Row 5 onwards)
    rows.forEach((c) => {
      const rec = recordings[c.callId];
      const row = ws.addRow([
        c.callId,
        fmtDate(c.startTime),
        inmates[c.inmateId]?.name || c.inmateId,
        c.familyMemberName || '',
        c.kioskId,
        c.type,
        fmtDur(c.durationMinutes),
        c.status,
        c.connectionQuality || '',
        rec?.url ? 'Yes' : 'No'
      ]);
      row.eachCell((cell) => { cell.numFmt = '@'; });
    });

    // 5. Apply Borders & Alignments to Header + Data Table
    const thinBorder: Partial<Workbook.Borders> = {
      top: { style: 'thin', color: { argb: 'D0D0D0' } },
      left: { style: 'thin', color: { argb: 'D0D0D0' } },
      bottom: { style: 'thin', color: { argb: 'D0D0D0' } },
      right: { style: 'thin', color: { argb: 'D0D0D0' } }
    };

    ws.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) { // Only table header & data rows
        row.eachCell((cell, colNumber) => {
          cell.border = thinBorder;
          if (rowNumber > 4) {
            cell.alignment = {
              horizontal: [1, 2, 5, 6, 7, 8, 9, 10].includes(colNumber) ? 'center' : 'left',
              vertical: 'middle'
            };
            cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF000000' } };
          }
        });
      }
    });

    // Set column widths
    ws.columns = [
      { width: 18 }, // Call ID
      { width: 15 }, // Date
      { width: 22 }, // Inmate
      { width: 22 }, // Family
      { width: 15 }, // Kiosk
      { width: 12 }, // Type
      { width: 14 }, // Duration
      { width: 15 }, // Status
      { width: 14 }, // Quality
      { width: 14 }  // Recording
    ];

    // 6. Save File cleanly without corruption
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Call Logs</h1>
              </div>
              <p className="text-sm text-neutral-600 mt-1">{filtered.length} calls</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => {
              const selected = selectedIds.size > 0;
              const rows = selected ? filtered.filter((c) => selectedIds.has(c.callId)) : filtered;
              const suffix = selected ? '_selected_records' : '-all';
              exportExcel(rows, `call-logs${suffix}.xlsx`);
            }} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-success text-white rounded-xl text-sm font-bold hover:bg-success-700 shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Export Excel{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Search + Date */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm flex gap-3">
        <div className="flex-1 relative">
          <svg className="w-5 h-5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search inmate, family, kiosk..." className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white text-sm" />
        </div>
        <div className="flex gap-2 items-center">
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500" />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }} className="px-3 py-2.5 text-error font-bold text-sm hover:bg-error/10 rounded-xl transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {sorted.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg></div>
            <p className="text-neutral-900 font-semibold">No call logs found</p>
            <p className="text-sm text-neutral-500 mt-1">Try adjusting filters or date range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-neutral-50">
                  <th className="px-4 py-3 w-10"><input type="checkbox" checked={paged.length > 0 && paged.every((c) => selectedIds.has(c.callId))} onChange={toggleAll} className="rounded border-neutral-300" /></th>
                  <th className="text-left py-3 px-4"><FilterDropdown label="Type" options={[{ value: 'video', label: 'Video' }, { value: 'audio', label: 'Audio' }]} filter={typeFilter} setFilter={setTypeFilter} /></th>
                  <th className="text-left py-3 px-4"><button onClick={() => toggleSort('date')} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-neutral-500 hover:text-primary-600 transition-colors">Date {sortField === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                  <th className="text-left py-3 px-4"><span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Inmate ⇄ Family</span></th>
                  <th className="text-left py-3 px-4"><FilterDropdown label="Kiosk" options={kiosks.map((k) => ({ value: k, label: k }))} filter={kioskFilter} setFilter={setKioskFilter} /></th>
                  <th className="text-left py-3 px-4"><button onClick={() => toggleSort('duration')} className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-neutral-500 hover:text-primary-600 transition-colors">Duration {sortField === 'duration' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</button></th>
                  <th className="text-left py-3 px-4"><FilterDropdown label="Status" options={[{ value: 'completed', label: 'Completed' }, { value: 'failed', label: 'Failed' }]} filter={statusFilter} setFilter={setStatusFilter} /></th>
                  <th className="text-left py-3 px-4"><FilterDropdown label="Quality" options={[{ value: 'excellent', label: 'Excellent' }, { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'poor', label: 'Poor' }]} filter={qualityFilter} setFilter={setQualityFilter} /></th>
                  <th className="text-left py-3 px-4"><FilterDropdown label="Recording" options={[{ value: 'available', label: 'Available' }, { value: 'none', label: 'None' }]} filter={recordingFilter} setFilter={setRecordingFilter} /></th>
                </tr>
              </thead>
              <tbody>
                {paged.map((call) => {
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

        {sorted.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-4 bg-neutral-50 border-t border-neutral-200">
            <span className="text-sm text-neutral-600">Showing <span className="font-semibold text-neutral-900">{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, sorted.length)}</span> of <span className="font-semibold text-neutral-900">{sorted.length}</span></span>
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
        {/* Recording Player */}
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

        {/* Call Details — Full Height */}
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
