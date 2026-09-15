import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { wardenApi } from '@/services/api/wardenApi';
import { usePageHeader } from '@/context/PageHeaderContext';
import type { Inmate, Contact, ListParams } from '@/services/api/wardenApi';

export function InmateFamilyPage() {
  const [inmates, setInmates] = useState<Inmate[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddInmate, setShowAddInmate] = useState(false);
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [searchPrisoner, setSearchPrisoner] = useState('');
  const [searchFamily, setSearchFamily] = useState('');
  const [editingInmate, setEditingInmate] = useState<Inmate | null>(null);
  const [editingFamily, setEditingFamily] = useState<Contact | null>(null);
  const [detailPrisoner, setDetailPrisoner] = useState<Inmate | null>(null);
  const [newInmate, setNewInmate] = useState({name:'',inmateId:'',facility:'', kioskId:''});
  const [newFamily, setNewFamily] = 
useState({name:'',relationship:'',phoneNumber:'',inmateId:''});
  const [kiosks, setKiosks] = useState<{deviceId: string; name: string; location?: string}[]>([]);

  const [loadError, setLoadError] = useState<string|null>(null);
  const [prisonerPage, setPrisonerPage] = useState(1);
  const [prisonerTotal, setPrisonerTotal] = useState(0);
  const [familyPage, setFamilyPage] = useState(1);
  const [familyTotal, setFamilyTotal] = useState(0);
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [relationFilter, setRelationFilter] = useState('all');

  const load = useCallback(async()=>{
    try{
      setLoadError(null);
      const params: ListParams = { limit: 20, offset: (prisonerPage-1)*20, search: searchPrisoner || undefined };
      const contactParams: ListParams = { limit: 100, offset: 0 };
      const [im, co, dv] = await Promise.all([wardenApi.getInmates(params), wardenApi.getContacts(contactParams), wardenApi.getDevices()]);
      setInmates(im?.items ?? []);
      setPrisonerTotal(im?.total ?? 0);
      setContacts(co?.items ?? []);
      setFamilyTotal(co?.total ?? 0);
      setKiosks((dv?.items ?? []).map((d:any)=>({deviceId:d.deviceId||d.id,name:d.name||d.deviceId||d.id,location:d.location})));
    }catch(e:any){
      setLoadError(e?.response?.data?.error?.message || e?.message || 'Failed to load prisoners & family');
      setInmates([]); setContacts([]);
    }finally{ setLoading(false); }
  },[prisonerPage, searchPrisoner]);
  useEffect(()=>{load();},[load]);

  const deleteInmate = async (id:string)=> { try{ await wardenApi.deleteInmateApi(id); }catch{} setInmates(s=>s.filter(i=>i.inmateId!==id)); };
  const updateInmate = async () => { if(!editingInmate) return; try{ await wardenApi.createInmate(editingInmate as any); }catch{} setInmates(s=> s.map(i=> i.inmateId===editingInmate.inmateId ? editingInmate : i)); setEditingInmate(null); };
  const deleteFamily = async (id:string)=> { try{ await wardenApi.deleteContactApi(id); }catch{} setContacts(s=>s.filter(c=>c.contactId!==id)); };
  const updateFamily = async () => { if(!editingFamily) return; try{ await wardenApi.createContact(editingFamily.inmateId, editingFamily as any); }catch{} setContacts(s=> s.map(c=> c.contactId===editingFamily.contactId ? editingFamily : c)); setEditingFamily(null); };
  const toggleApproval = async (id:string)=> { const c=contacts.find(x=>x.contactId===id); if(!c) return; const upd={...c, active:!c.active}; try{ await wardenApi.createContact(upd.inmateId, upd as any); }catch{} setContacts(s=>s.map(x=> x.contactId===id ? upd : x)); };
  const addInmate = async ()=>{ if(!newInmate.inmateId||!newInmate.name||!newInmate.kioskId) return; const payload={ inmateId:newInmate.inmateId, name:newInmate.name, facility:newInmate.facility, status:'active', photoUrl:'', securityLevel:'medium', sentenceDetails:'', kioskId:newInmate.kioskId } as any; try{ const saved=await wardenApi.createInmate(payload); setInmates(s=>[...s, (saved||payload) as Inmate]); }catch{ setInmates(s=>[...s, payload as Inmate]); } setNewInmate({name:'',inmateId:'',facility:'', kioskId:''}); setShowAddInmate(false); };
  const [addFamilyError, setAddFamilyError] = useState('');
  const addFamily = async ()=>{ 
    if(!newFamily.name.trim()||!newFamily.phoneNumber.trim()){ setAddFamilyError('Full Name and Phone are required'); return; }
    const targetId = newFamily.inmateId || selectedId || detailPrisoner?.inmateId || inmates[0]?.inmateId;
    if(!targetId){ setAddFamilyError('Select a prisoner'); return; }
    setAddFamilyError('');
    const payload={ name:newFamily.name.trim(), relationship:newFamily.relationship.trim()||'Family', phoneNumber:newFamily.phoneNumber.trim(), inmateId:targetId } as any;
    try{ const saved=await wardenApi.createContact(targetId, payload); setContacts(s=>[...s, (saved||{ contactId:`FAM-${Date.now()}`, ...payload, active:true, photoUrl:'', lastCallDate:new Date().toISOString(), nextScheduledCallDate:null } as Contact)]); }catch{ setContacts(s=>[...s,{ contactId:`FAM-${Date.now()}`, inmateId:targetId, name:payload.name, relationship:payload.relationship, phoneNumber:payload.phoneNumber, active:true, photoUrl:'', lastCallDate:new Date().toISOString(), nextScheduledCallDate:null } as Contact]); }
    setNewFamily({name:'',relationship:'',phoneNumber:'',inmateId:''}); setShowAddFamily(false); setAddFamilyError('');
    if(detailPrisoner && detailPrisoner.inmateId!==targetId){
      const inmate = inmates.find(i=>i.inmateId===targetId);
      if(inmate) setDetailPrisoner(inmate);
    }
  };

  usePageHeader({
    title: 'Prisoner & Family',
    subtitle: `${prisonerTotal} prisoners • ${familyTotal} family`,
  });

  if(loading) return <Loading message="Loading..." />;
  if(loadError) return <Card><div className="text-center py-12"><p className="text-error mb-4">{loadError}</p><button onClick={()=>{setLoading(true); load();}} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">Retry</button></div></Card>;
  const selected = inmates.find(i=>i.inmateId===selectedId);
  const facilities = Array.from(new Set(inmates.map(i=>i.facility)));
  const relations = Array.from(new Set(contacts.map(c=>c.relationship)));
  const filteredPrisoners = inmates.filter(i=> facilityFilter==='all' || i.facility===facilityFilter);
  const familyOfSelected = selectedId ? contacts.filter(c=>c.inmateId===selectedId) : [];
  const filteredFamilyBase = familyOfSelected.filter(c=> (!searchFamily || `${c.name} ${c.relationship} ${c.phoneNumber}`.toLowerCase().includes(searchFamily.toLowerCase())) && (relationFilter==='all' || c.relationship===relationFilter));
  const prisonerTotalPages = Math.max(1, Math.ceil(prisonerTotal/20));
  const familyTotalPages = Math.max(1, Math.ceil(filteredFamilyBase.length/4));
  const pagedPrisoners = filteredPrisoners;
  const filteredFamily = filteredFamilyBase.slice((familyPage-1)*4, familyPage*4);
  return (
    <div className="space-y-6">
      <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm">
  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
    <div className="flex gap-4">
      <div className="w-12 h-12 rounded-xl bg-neutral-900 text-white flex items-center justify-center shrink-0">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
      </div>
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Prisoner & Family</h1>
          <span className="px-2.5 py-1 bg-neutral-900 text-white rounded-full text-xs font-bold">{prisonerTotal} prisoners</span>
          <span className="px-2.5 py-1 bg-primary-50 border border-primary-200 text-primary-700 rounded-full text-xs font-bold">{familyTotal} family</span>
        </div>
        <p className="text-sm text-neutral-600 mt-1">Manage inmates and approved family contacts • Click prisoner for details</p>
      </div>
    </div>
    <button onClick={()=>setShowAddInmate(true)} className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-bold hover:bg-primary-700 shadow-sm">+ Add Prisoner</button>
  </div>
</div>
      <Card className="overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-5 border-b border-neutral-200 bg-neutral-50/50">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-700 flex items-center gap-2"><span className="w-2 h-2 bg-primary-600 rounded-full animate-pulse" />All Prisoners <span className="px-2 py-1 bg-white border border-neutral-200 rounded-full text-xs font-bold text-neutral-900">{prisonerTotal}</span> {selected && <span className="text-xs font-bold text-primary-600 normal-case tracking-normal">• {selected.name} selected</span>}</h2>
          <div className="flex gap-2">
            <div className="relative">
              <svg className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input value={searchPrisoner} onChange={e=>{setSearchPrisoner(e.target.value); setPrisonerPage(1)}} placeholder="Search prisoner..." className="pl-9 pr-4 py-2.5 bg-white border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm shadow-sm w-64" />
            </div>
            <select value={facilityFilter} onChange={e=>{setFacilityFilter(e.target.value); setPrisonerPage(1)}} className="px-3 py-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500"><option value="all">All Facilities</option>{facilities.map(f=><option key={f} value={f}>{f}</option>)}</select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b bg-neutral-50"><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Photo</th><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">ID</th><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Name</th><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Facility</th><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Kiosk</th><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Status</th><th className="text-left py-3 px-4 text-xs font-bold text-neutral-500 uppercase tracking-wider">Action</th></tr></thead>
            <tbody>
              {pagedPrisoners.length===0 ? (
                <tr><td colSpan={7} className="py-16 text-center"><div className="w-12 h-12 bg-neutral-100 rounded-xl flex items-center justify-center mx-auto mb-3"><svg className="w-6 h-6 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857" /></svg></div><p className="text-sm font-semibold text-neutral-900">No prisoners</p><p className="text-xs text-neutral-500">{prisonerTotal===0 ? 'Backend empty — Add Prisoner' : `No match for "${searchPrisoner}"`}</p></td></tr>
              ) : pagedPrisoners.map(i=>(
                <tr key={i.inmateId} onClick={()=>{setSelectedId(i.inmateId); setDetailPrisoner(i);}} className={`border-b hover:bg-neutral-50 cursor-pointer transition-colors even:bg-neutral-50/30 ${selectedId===i.inmateId?'bg-primary-50 ring-1 ring-inset ring-primary-200':''}`}>
                  <td className="py-2.5 px-3"><div className="w-9 h-9 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center"><svg className="w-5 h-5 text-[#8696A0]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg></div></td>
                  <td className="py-2.5 px-3 text-sm font-mono font-medium">{i.inmateId}</td>
                  <td className="py-2.5 px-3 text-sm font-medium">{i.name} {selectedId===i.inmateId && <span className="ml-2 text-xs text-primary-600 font-bold">←</span>}</td>
                  <td className="py-2.5 px-3 text-sm text-neutral-600">{i.facility} • {i.cellBlock}</td>
                  <td className="py-2.5 px-3 text-sm"><span className={`px-2 py-1 rounded-full text-xs font-medium border ${(i as any).kioskId?'bg-primary-600 text-white border-primary-600':'bg-amber-100 text-amber-700 border-amber-200'}`}>{(i as any).kioskId || 'Unassigned'}</span></td>
                  <td className="py-2.5 px-3"><span className="px-2.5 py-1 bg-success/10 text-success rounded-full text-xs font-medium border border-success/20">{i.status}</span></td>
                  <td className="py-2.5 px-3" onClick={e=>e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button onClick={()=>setEditingInmate({...i})} className="px-2.5 py-1.5 bg-white border border-primary-600 text-primary-600 rounded-lg text-xs font-medium hover:bg-primary-600 hover:text-white transition-colors">Edit</button>
                      <button onClick={()=>deleteInmate(i.inmateId)} className="px-2.5 py-1.5 bg-white border border-error text-error rounded-lg text-xs font-medium hover:bg-error hover:text-white transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {prisonerTotalPages>1 && <div className="flex items-center justify-between mt-4 px-1"><span className="text-xs text-neutral-500">Showing {(prisonerPage-1)*20+1}-{Math.min(prisonerPage*20, prisonerTotal)} of {prisonerTotal}</span><div className="flex items-center gap-1"><button disabled={prisonerPage===1} onClick={()=>setPrisonerPage(1)} className="px-2.5 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">«</button><button disabled={prisonerPage===1} onClick={()=>setPrisonerPage(p=>p-1)} className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">Prev</button><span className="px-3 py-1.5 bg-neutral-900 text-white rounded-lg text-xs font-medium">{prisonerPage} / {prisonerTotalPages}</span><button disabled={prisonerPage===prisonerTotalPages} onClick={()=>setPrisonerPage(p=>p+1)} className="px-3 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">Next</button><button disabled={prisonerPage===prisonerTotalPages} onClick={()=>setPrisonerPage(prisonerTotalPages)} className="px-2.5 py-1.5 border rounded-lg text-xs disabled:opacity-30 hover:bg-neutral-50">»</button></div></div>}
        {showAddInmate && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowAddInmate(false)}>
            <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e=>e.stopPropagation()}>
              <h3 className="font-bold mb-4">Add Prisoner - Assign Kiosk *</h3>
              <input placeholder="Inmate ID (INM-1026) *" value={newInmate.inmateId} onChange={e=>setNewInmate({...newInmate,inmateId:e.target.value})} className="w-full mb-3 px-3 py-2 border rounded-lg" />
              <input placeholder="Name *" value={newInmate.name} onChange={e=>setNewInmate({...newInmate,name:e.target.value})} className="w-full mb-3 px-3 py-2 border rounded-lg" />
              <select value={newInmate.kioskId} onChange={e=>setNewInmate({...newInmate,kioskId:e.target.value})} className="w-full mb-3 px-3 py-2 border-2 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="">Select Kiosk * (required)</option>
                {kiosks.map(k=>(
                  <option key={k.deviceId} value={k.deviceId}>{k.name}{k.location ? ` - ${k.location}` : ''}</option>
                ))}
              </select>
              <input placeholder="Facility" value={newInmate.facility} onChange={e=>setNewInmate({...newInmate,facility:e.target.value})} className="w-full mb-3 px-3 py-2 border rounded-lg" />
              <div className="flex gap-2 justify-end">
                <button onClick={()=>setShowAddInmate(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                <button onClick={addInmate} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Add</button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {createPortal(<>
      {showAddInmate && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setShowAddInmate(false)}>
            <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e=>e.stopPropagation()}>
              <h3 className="font-bold mb-4">Add Prisoner - Assign Kiosk *</h3>
              <input placeholder="Inmate ID (INM-1026) *" value={newInmate.inmateId} onChange={e=>setNewInmate({...newInmate,inmateId:e.target.value})} className="w-full mb-3 px-3 py-2 border rounded-lg" />
              <input placeholder="Name *" value={newInmate.name} onChange={e=>setNewInmate({...newInmate,name:e.target.value})} className="w-full mb-3 px-3 py-2 border rounded-lg" />
              <select value={newInmate.kioskId} onChange={e=>setNewInmate({...newInmate,kioskId:e.target.value})} className="w-full mb-3 px-3 py-2 border-2 rounded-lg focus:ring-2 focus:ring-primary-500">
                <option value="">Select Kiosk * (required)</option>
                {kiosks.map(k=>(
                  <option key={k.deviceId} value={k.deviceId}>{k.name}{k.location ? ` - ${k.location}` : ''}</option>
                ))}
              </select>
              <input placeholder="Facility" value={newInmate.facility} onChange={e=>setNewInmate({...newInmate,facility:e.target.value})} className="w-full mb-3 px-3 py-2 border rounded-lg" />
              <div className="flex gap-2 justify-end">
                <button onClick={()=>setShowAddInmate(false)} className="px-4 py-2 border rounded-lg">Cancel</button>
                <button onClick={addInmate} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Add</button>
              </div>
            </div>
          </div>
        )}

      {showAddFamily && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={()=>{setShowAddFamily(false); setAddFamilyError('');}}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold mb-4">Add Family Members</h3>
            {addFamilyError && <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2 mb-3">{addFamilyError}</p>}
            <input placeholder="Full Name *" value={newFamily.name} onChange={e=>setNewFamily({...newFamily,name:e.target.value})} className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <input placeholder="Relationship" value={newFamily.relationship} onChange={e=>setNewFamily({...newFamily,relationship:e.target.value})} className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <input placeholder="Phone *" value={newFamily.phoneNumber} onChange={e=>setNewFamily({...newFamily,phoneNumber:e.target.value})} className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <select value={newFamily.inmateId} onChange={e=>setNewFamily({...newFamily,inmateId:e.target.value})} className="w-full mb-3 px-3 py-2 border rounded-lg">
              <option value="">Select Inmate *</option>
              {inmates.map(i=><option key={i.inmateId} value={i.inmateId}>{i.name} ({i.inmateId})</option>)}
            </select>
            <p className="text-xs text-neutral-500 mb-3">Will be added to: {newFamily.inmateId || selectedId || detailPrisoner?.inmateId || '— select above'}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={()=>{setShowAddFamily(false); setAddFamilyError('');}} className="px-4 py-2 border rounded-lg">Cancel</button>
              <button onClick={addFamily} className="px-4 py-2 bg-success text-white rounded-lg">Add</button>
            </div>
          </div>
        </div>
      )}

      {editingInmate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setEditingInmate(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold mb-4">Edit Prisoner - {editingInmate.inmateId}</h3>
            <input value={editingInmate.name} onChange={e=>setEditingInmate({...editingInmate, name:e.target.value})} placeholder="Name" className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <input value={editingInmate.facility} onChange={e=>setEditingInmate({...editingInmate, facility:e.target.value})} placeholder="Facility" className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setEditingInmate(null)} className="px-4 py-2 border rounded-lg">Cancel</button>
              <button onClick={updateInmate} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}

      {editingFamily && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={()=>setEditingFamily(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e=>e.stopPropagation()}>
            <h3 className="font-bold mb-4">Edit Family - {editingFamily.name}</h3>
            <input value={editingFamily.name} onChange={e=>setEditingFamily({...editingFamily, name:e.target.value})} placeholder="Full Name" className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <input value={editingFamily.relationship} onChange={e=>setEditingFamily({...editingFamily, relationship:e.target.value})} placeholder="Relationship" className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <input value={editingFamily.phoneNumber} onChange={e=>setEditingFamily({...editingFamily, phoneNumber:e.target.value})} placeholder="Phone" className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setEditingFamily(null)} className="px-4 py-2 border rounded-lg">Cancel</button>
              <button onClick={updateFamily} className="px-4 py-2 bg-primary-600 text-white rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}

      {detailPrisoner && (
        <div className="fixed inset-0 bg-black/60 z-[999]" onClick={()=>setDetailPrisoner(null)}>
          <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-white shadow-2xl flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-200 shrink-0">
              <h3 className="text-xl font-bold">Prisoner Details</h3>
              <button onClick={()=>setDetailPrisoner(null)} className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 hover:text-neutral-900">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-xl mb-6">
                <div className="w-16 h-16 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center shrink-0">
                  <svg className="w-9 h-9 text-[#8696A0]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                </div>
                <div>
                  <p className="font-bold text-lg">{detailPrisoner.name}</p>
                  <p className="text-sm text-neutral-500">{detailPrisoner.inmateId} • {detailPrisoner.facility} • {detailPrisoner.cellBlock}</p>
                  <p className="text-xs mt-1"><span className="px-2 py-0.5 bg-success/10 text-success rounded-full">{detailPrisoner.status}</span> <span className="ml-2 px-2 py-0.5 bg-neutral-200 rounded-full text-xs">{(detailPrisoner as any).kioskId || 'No kiosk'}</span></p>
                </div>
              </div>
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-semibold">Family Members ({contacts.filter(c=>c.inmateId===detailPrisoner.inmateId).length})</h4>
                <button onClick={()=>{setNewFamily({...newFamily, inmateId:detailPrisoner.inmateId}); setShowAddFamily(true);}} className="px-3 py-1.5 bg-success text-white rounded-lg text-xs font-medium hover:bg-success-700">+ Add Family Members</button>
              </div>
              <div className="space-y-3">
                {contacts.filter(c=>c.inmateId===detailPrisoner.inmateId).length===0 ? <p className="text-sm text-neutral-500">No family - click + Add Family above</p> : contacts.filter(c=>c.inmateId===detailPrisoner.inmateId).map(c=>(
                  <div key={c.contactId} className="flex items-center justify-between p-3 border rounded-xl hover:bg-neutral-50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center shrink-0">
                        <svg className="w-6 h-6 text-[#8696A0]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-neutral-500">{c.relationship} • {c.phoneNumber}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={()=>setEditingFamily({...c})} className="px-2.5 py-1 text-xs border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-600 hover:text-white">Edit</button>
                      <button onClick={()=>deleteFamily(c.contactId)} className="px-2.5 py-1 text-xs border border-error text-error rounded-lg hover:bg-error hover:text-white">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      </>, document.body)}
    </div>
  );
}
