import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { usePageHeader } from '@/context/PageHeaderContext';
import { FilterDropdown } from '@/components/FilterDropdown';
import type { ColumnFilter } from '@/components/FilterDropdown';
import type { Inmate, ListParams } from '@/services/api/wardenApi';

export function InmateFamilyPage() {
  const navigate = useNavigate();
  const [inmates, setInmates] = useState<Inmate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchPrisoner, setSearchPrisoner] = useState('');
  const [filterGender, setFilterGender] = useState<ColumnFilter>({ value: 'all', open: false });
  const [filterSecurity, setFilterSecurity] = useState<ColumnFilter>({ value: 'all', open: false });
  const [filterCell, setFilterCell] = useState<ColumnFilter>({ value: 'all', open: false });
  const [filterBlock, setFilterBlock] = useState<ColumnFilter>({ value: 'all', open: false });
  const [filterKiosk, setFilterKiosk] = useState<ColumnFilter>({ value: 'all', open: false });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prisonerPage, setPrisonerPage] = useState(1);
  const [prisonerTotal, setPrisonerTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const params: ListParams = { limit: 100, offset: 0, search: searchPrisoner || undefined };
      const im = await wardenApi.getInmates(params);
      const items = im?.items ?? [];
      // Sort: active first, then inactive at bottom
      items.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        return 0;
      });
      setInmates(items);
      setPrisonerTotal(im?.total ?? items.length);
    } catch (e: any) {
      setLoadError(e?.response?.data?.error?.message || e?.message || 'Failed to load inmates');
      setInmates([]);
    } finally { setLoading(false); }
  }, [searchPrisoner]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPrisonerPage(1); }, [filterGender.value, filterSecurity.value, filterCell.value, filterBlock.value, filterKiosk.value]);

  const toggleInmate = async (inmateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await wardenApi.toggleInmate(inmateId);
      if (updated) {
        setInmates(prev => {
          const next = prev.map(x => x.inmateId === updated.inmateId ? { ...x, ...updated } : x);
          // Re-sort: active first
          next.sort((a, b) => {
            if (a.status === 'active' && b.status !== 'active') return -1;
            if (a.status !== 'active' && b.status === 'active') return 1;
            return 0;
          });
          return next;
        });
      }
    } catch { }
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
    title: 'Prisoner & Family',
    subtitle: `${prisonerTotal} prisoners`,
    icon: headerIcon,
    actions: useMemo(() => (
      <button onClick={() => navigate('/inmates-family/new')} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 shadow-sm">+ Add Inmate</button>
    ), []),
  });

  if (loading) return <Loading message="Loading..." />;
  if (loadError) return <Card><div className="text-center py-12"><p className="text-error mb-4">{loadError}</p><button onClick={() => { setLoading(true); load(); }} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">Retry</button></div></Card>;

  const prisonerTotalPages = Math.max(1, Math.ceil(inmates.length / 20));
  const pageInmates = inmates.filter(i => {
    if (filterGender.value !== 'all' && i.gender !== filterGender.value) return false;
    if (filterSecurity.value !== 'all' && i.securityLevel !== filterSecurity.value) return false;
    if (filterCell.value !== 'all' && i.cellId !== filterCell.value) return false;
    if (filterBlock.value !== 'all' && i.blockId !== filterBlock.value) return false;
    if (filterKiosk.value !== 'all' && i.assignedKioskId !== filterKiosk.value) return false;
    return true;
  }).slice((prisonerPage - 1) * 20, prisonerPage * 20);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-5 border-b border-neutral-200 bg-neutral-50/50">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-700 flex items-center gap-2"><span className="w-2 h-2 bg-primary-600 rounded-full animate-pulse" />All Inmates <span className="px-2 py-1 bg-white border border-neutral-200 rounded-full text-xs font-bold text-neutral-900">{prisonerTotal}</span></h2>
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
                <th className="text-center py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Prisoner Number</th>
                <th className="text-center py-3 px-4"><FilterDropdown label="Gender" options={genderOptions} filter={filterGender} setFilter={setFilterGender} /></th>
                <th className="text-center py-3 px-4"><FilterDropdown label="Security" options={securityOptions} filter={filterSecurity} setFilter={setFilterSecurity} /></th>
                <th className="text-center py-3 px-4"><FilterDropdown label="Cell" options={cellOptions} filter={filterCell} setFilter={setFilterCell} /></th>
                <th className="text-center py-3 px-4"><FilterDropdown label="Block" options={blockOptions} filter={filterBlock} setFilter={setFilterBlock} /></th>
                <th className="text-center py-3 px-4"><FilterDropdown label="Kiosk" options={kioskOptions} filter={filterKiosk} setFilter={setFilterKiosk} /></th>
                <th className="text-center py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {pageInmates.length === 0 ? (
                <tr><td colSpan={5} className="py-16 text-center"><div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-3"><span className="material-icons text-neutral-400 text-2xl">person_off</span></div><p className="text-sm font-semibold text-neutral-900">No Inmates</p><p className="text-xs text-neutral-500">{prisonerTotal === 0 ? 'No inmates registered' : `No match for "${searchPrisoner}"`}</p></td></tr>
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
        {prisonerTotalPages > 1 && <div className="flex items-center justify-between mt-4 px-5 pb-4"><span className="text-xs text-neutral-500">Showing {(prisonerPage - 1) * 20 + 1}-{Math.min(prisonerPage * 20, inmates.length)} of {inmates.length}</span><div className="flex items-center gap-1"><button disabled={prisonerPage === 1} onClick={() => setPrisonerPage(1)} className="px-2.5 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">«</button><button disabled={prisonerPage === 1} onClick={() => setPrisonerPage(p => p - 1)} className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">Prev</button><span className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-medium">{prisonerPage} / {prisonerTotalPages}</span><button disabled={prisonerPage === prisonerTotalPages} onClick={() => setPrisonerPage(p => p + 1)} className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">Next</button><button disabled={prisonerPage === prisonerTotalPages} onClick={() => setPrisonerPage(prisonerTotalPages)} className="px-2.5 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">»</button></div></div>}
      </Card>

    </div>
  );
}
