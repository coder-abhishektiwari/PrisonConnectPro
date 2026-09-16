import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { usePageHeader } from '@/context/PageHeaderContext';
import type { Inmate, ListParams } from '@/services/api/wardenApi';

export function InmateFamilyPage() {
  const navigate = useNavigate();
  const [inmates, setInmates] = useState<Inmate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddInmate, setShowAddInmate] = useState(false);
  const [searchPrisoner, setSearchPrisoner] = useState('');
  const [newInmate, setNewInmate] = useState({ name: '', inmateId: '', facility: '', kioskId: '' });
  const [kiosks, setKiosks] = useState<{ deviceId: string; name: string; location?: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prisonerPage, setPrisonerPage] = useState(1);
  const [prisonerTotal, setPrisonerTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const params: ListParams = { limit: 20, offset: (prisonerPage - 1) * 20, search: searchPrisoner || undefined };
      const [im, dv] = await Promise.all([wardenApi.getInmates(params), wardenApi.getDevices()]);
      setInmates(im?.items ?? []);
      setPrisonerTotal(im?.total ?? 0);
      setKiosks((dv?.items ?? []).map((d: any) => ({ deviceId: d.deviceId || d.id, name: d.name || d.deviceId || d.id, location: d.location })));
    } catch (e: any) {
      setLoadError(e?.response?.data?.error?.message || e?.message || 'Failed to load inmates');
      setInmates([]);
    } finally { setLoading(false); }
  }, [prisonerPage, searchPrisoner]);

  useEffect(() => { load(); }, [load]);

  const deleteInmate = async (id: string) => {
    try { await wardenApi.deleteInmateApi(id); } catch { }
    setInmates(s => s.filter(i => i.inmateId !== id));
  };

  const addInmate = async () => {
    if (!newInmate.inmateId || !newInmate.name || !newInmate.kioskId) return;
    const payload = { inmateId: newInmate.inmateId, name: newInmate.name, facility: newInmate.facility, status: 'active', photoUrl: '', securityLevel: 'medium', sentenceDetails: '', kioskId: newInmate.kioskId } as any;
    try { const saved = await wardenApi.createInmate(payload); setInmates(s => [...s, (saved || payload) as Inmate]); } catch { setInmates(s => [...s, payload as Inmate]); }
    setNewInmate({ name: '', inmateId: '', facility: '', kioskId: '' });
    setShowAddInmate(false);
  };

  const headerIcon = useMemo(() => <span className="material-icons text-primary-600 text-xl">family_restroom</span>, []);

  usePageHeader({
    title: 'Prisoner & Family',
    subtitle: `${prisonerTotal} prisoners`,
    icon: headerIcon,
    actions: useMemo(() => (
      <button onClick={() => setShowAddInmate(true)} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 shadow-sm">+ Add Inmate</button>
    ), []),
  });

  if (loading) return <Loading message="Loading..." />;
  if (loadError) return <Card><div className="text-center py-12"><p className="text-error mb-4">{loadError}</p><button onClick={() => { setLoading(true); load(); }} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">Retry</button></div></Card>;

  const prisonerTotalPages = Math.max(1, Math.ceil(prisonerTotal / 20));

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
            <thead><tr className="border-b bg-neutral-50">
              <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Inmate</th>
              <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Block</th>
              <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Kiosk</th>
              <th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Available</th>
            </tr></thead>
            <tbody>
              {inmates.length === 0 ? (
                <tr><td colSpan={4} className="py-16 text-center"><div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-3"><span className="material-icons text-neutral-400 text-2xl">person_off</span></div><p className="text-sm font-semibold text-neutral-900">No Inmates</p><p className="text-xs text-neutral-500">{prisonerTotal === 0 ? 'No inmates registered' : `No match for "${searchPrisoner}"`}</p></td></tr>
              ) : inmates.map(i => (
                <tr key={i.inmateId} onClick={() => navigate(`/inmates-family/${i.inmateId}`)} className="border-b hover:bg-neutral-50 cursor-pointer transition-colors even:bg-neutral-50/30">
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
                  <td className="py-2.5 px-3 text-sm text-neutral-600">{i.cellBlock || '—'}</td>
                  <td className="py-2.5 px-3 text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${(i as any).kioskId ? 'bg-primary-600 text-white border-primary-600' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>{(i as any).kioskId || 'Unassigned'}</span>
                  </td>
                  <td className="py-2.5 px-3">
                    <button
                      onClick={e => { e.stopPropagation(); wardenApi.toggleInmate(i.inmateId).then(updated => { if (updated) setInmates(s => s.map(x => x.inmateId === updated.inmateId ? { ...x, ...updated } : x)); }); }}
                      className={`px-3 py-2 flex items-center gap-2 rounded-lg transition font-medium text-sm ${i.status === 'active' ? 'bg-success/10 text-success hover:bg-success/20' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
                      title={i.status === 'active' ? 'Deactivate' : 'Activate'}
                    >
                      <span className="material-icons text-xl">{i.status === 'active' ? 'toggle_on' : 'toggle_off'}</span>
                      {i.status === 'active' ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {prisonerTotalPages > 1 && <div className="flex items-center justify-between mt-4 px-5 pb-4"><span className="text-xs text-neutral-500">Showing {(prisonerPage - 1) * 20 + 1}-{Math.min(prisonerPage * 20, prisonerTotal)} of {prisonerTotal}</span><div className="flex items-center gap-1"><button disabled={prisonerPage === 1} onClick={() => setPrisonerPage(1)} className="px-2.5 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">«</button><button disabled={prisonerPage === 1} onClick={() => setPrisonerPage(p => p - 1)} className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">Prev</button><span className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-medium">{prisonerPage} / {prisonerTotalPages}</span><button disabled={prisonerPage === prisonerTotalPages} onClick={() => setPrisonerPage(p => p + 1)} className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">Next</button><button disabled={prisonerPage === prisonerTotalPages} onClick={() => setPrisonerPage(prisonerTotalPages)} className="px-2.5 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">»</button></div></div>}
      </Card>

      {showAddInmate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowAddInmate(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-4">Add Inmate - Assign Kiosk *</h3>
            <input placeholder="Inmate ID (INM-1026) *" value={newInmate.inmateId} onChange={e => setNewInmate({ ...newInmate, inmateId: e.target.value })} className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <input placeholder="Name *" value={newInmate.name} onChange={e => setNewInmate({ ...newInmate, name: e.target.value })} className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <select value={newInmate.kioskId} onChange={e => setNewInmate({ ...newInmate, kioskId: e.target.value })} className="w-full mb-3 px-3 py-2 border-2 rounded-lg focus:ring-2 focus:ring-primary-500">
              <option value="">Select Kiosk * (required)</option>
              {kiosks.map(k => (
                <option key={k.deviceId} value={k.deviceId}>{k.name}{k.location ? ` - ${k.location}` : ''}</option>
              ))}
            </select>
            <input placeholder="Facility" value={newInmate.facility} onChange={e => setNewInmate({ ...newInmate, facility: e.target.value })} className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAddInmate(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
              <button onClick={addInmate} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
