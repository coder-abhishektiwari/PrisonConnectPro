import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/Card';
import { Loading } from '@/components/States';
import { SearchableSelect } from '@/components/SearchableSelect';
import { wardenApi } from '@/services/api/wardenApi';
import { apiClient } from '@/services/api/client';
import { usePageHeader } from '@/context/PageHeaderContext';
import type { Inmate, Contact, DeviceFingerprint } from '@/services/api/wardenApi';

/**
 * Android/iOS user agents never say "Samsung"/"Vivo" outright, but they do
 * carry the model code, and each vendor owns a distinctive prefix. Ordered
 * most-specific-first so a vendor's own token wins over a shared pattern.
 */
const BRAND_RULES: Array<[RegExp, string]> = [
  [/\bSamsung\b|\bSM-[A-Z]?\d{3,4}[A-Z]?\b|\bGT-[A-Z]?\d{3,4}[A-Z]?\b|\bSCG\d{2,3}\b|\bSC-\d{3}[A-Z]?\b|\bSGH-[A-Z]?\d{3,4}\b|\bSCH-[A-Z]?\d{3,4}\b/i, 'Samsung'],
  [/\bvivo\b|\bV\d{4}[A-Z]?\b/i, 'Vivo'],
  [/\boppo\b|\bCPH\d{4}\b|\bPCHP\d{3}\b/i, 'Oppo'],
  [/\brealme\b|\bRMX\d{3,4}\b/i, 'Realme'],
  [/\bXiaomi\b|\bRedmi\b|\bPOCO\b|\bM2\d{3}[A-Z0-9]*\b/i, 'Xiaomi'],
  [/\boneplus\b|\bKB200\d\b|\bLE21\d{2}\b|\bNE22\d{2}\b|\bBE20\d{2}\b|\bIN202\d\b|\bGM19\d{2}\b|\bHD19\d{2}\b/i, 'OnePlus'],
  [/\bmotorola\b|\bmoto\b|\bXT\d{4}\b/i, 'Motorola'],
  [/\bpixel\b/i, 'Google'],
  [/\biPhone\b|\biPad\b|\biPod\b/i, 'Apple'],
  [/\bNokia\b|\bHMD\b/i, 'Nokia'],
  [/\bInfinix\b/i, 'Infinix'],
  [/\bTECNO\b/i, 'Tecno'],
  [/\biTel\b/i, 'iTel'],
  [/\bLava\b/i, 'Lava'],
  [/\bHonor\b/i, 'Honor'],
  [/\bHuawei\b/i, 'Huawei'],
  [/\bSony\b/i, 'Sony'],
  [/\bAsus\b/i, 'Asus'],
  [/\bLenovo\b/i, 'Lenovo'],
];

function brandFromUserAgent(ua?: string): string | null {
  if (!ua) return null;
  for (const [re, brand] of BRAND_RULES) if (re.test(ua)) return brand;
  return null;
}

/** Model code from the Android UA segment, e.g. "SM-S918B", "CPH2365", "Pixel 7". */
function modelFromUserAgent(ua?: string): string | null {
  if (!ua) return null;
  // Prefer the `... ; <model> Build/...` form — model names may contain ")"
  // (e.g. "moto g power (2022)"), which would cut a bracket-based match short.
  const built = /Android\s+[\d.]+;\s*(.+?)\s+Build\//i.exec(ua);
  if (built?.[1]) {
    const model = built[1].trim();
    if (model && !/^(wv|aarch64|armv81)$/i.test(model)) return model;
  }
  const bare = /Android\s+[\d.]+;\s*([^;)]+)/i.exec(ua);
  if (bare?.[1]) {
    const model = bare[1].trim();
    if (model && !/^(wv|aarch64|armv81)$/i.test(model)) return model;
  }
  const apple = /\b(iPhone\d+,\d+|iPad\d+,\d+)\b/.exec(ua);
  return apple ? apple[1] : null;
}

const digits = (v?: string) => String(v || '').replace(/\D/g, '');

/** A contact has exactly one verified device — pick the one on file. */
function primaryDevice(c: Contact): DeviceFingerprint | null {
  const list = c.deviceFingerprints || [];
  if (list.length === 0) return null;
  const want = digits(c.phoneNumber || c.phone || c.mobileNumber).slice(-10);
  if (want) {
    const onFile = list.find(d => digits(d.phone).slice(-10) === want);
    if (onFile) return onFile;
  }
  return list[0];
}

export function InmateDetailPage() {
  const { inmateId } = useParams<{ inmateId: string }>();
  const navigate = useNavigate();
  const isNew = !inmateId || inmateId === 'new';
  const [inmate, setInmate] = useState<Inmate | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingInmate, setEditingInmate] = useState(isNew);
  const [editData, setEditData] = useState<Partial<Inmate>>(isNew ? { status: 'active', securityLevel: 'medium', gender: 'male' } : {});
  const [saving, setSaving] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [contactEditData, setContactEditData] = useState<Partial<Contact>>({});
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [newFamily, setNewFamily] = useState({ name: '', relationship: '', phoneNumber: '', address: '', city: '', state: '' });
  const [addFamilyError, setAddFamilyError] = useState('');
  const [saveContactError, setSaveContactError] = useState('');
  const [cellNames, setCellNames] = useState<{ id: string; name: string }[]>([]);
  const [blockNames, setBlockNames] = useState<{ id: string; name: string }[]>([]);
  const [kioskNames, setKioskNames] = useState<{ id: string; name: string }[]>([]);
  const [toggling, setToggling] = useState(false);
  const [showResetPin, setShowResetPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [resetPinError, setResetPinError] = useState('');
  const [resetPinSuccess, setResetPinSuccess] = useState(false);
  const [nextId, setNextId] = useState<string>('');
  const [biometrics, setBiometrics] = useState<any[]>([]);
  const [biometricsLoading, setBiometricsLoading] = useState(false);
  const [deletingBiometric, setDeletingBiometric] = useState<string | null>(null);
  const [biometricError, setBiometricError] = useState('');
  const [removingDevice, setRemovingDevice] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      if (isNew) {
        const [cells, blocks, kiosks, generatedId] = await Promise.all([
          wardenApi.getCells().catch(() => []),
          wardenApi.getBlocks().catch(() => []),
          apiClient.get('/kiosks').then(r => r.data?.data?.items ?? r.data?.data ?? []).catch(() => []),
          wardenApi.getNextInmateId().catch(() => ''),
        ]);
        setCellNames(cells.map((c: any) => ({ id: c.cellId, name: c.name })).filter(c => c.id && c.name));
        setBlockNames(blocks.map((b: any) => ({ id: b.blockId, name: b.name })).filter(b => b.id && b.name));
        setKioskNames(kiosks.map((k: any) => ({ id: k.kioskId, name: k.kioskId })).filter(k => k.id));
        setNextId(generatedId || '');
        setLoading(false);
        return;
      }
      const [im, co, cells, blocks, kiosks] = await Promise.all([
        wardenApi.getInmate(inmateId),
        apiClient.get(`/contacts/admin/prisoners/${inmateId}/contacts`).then(r => r.data?.data ?? []),
        wardenApi.getCells().catch(() => []),
        wardenApi.getBlocks().catch(() => []),
        apiClient.get('/kiosks').then(r => r.data?.data?.items ?? r.data?.data ?? []).catch(() => []),
      ]);
      setInmate(im ?? null);
      setContacts(Array.isArray(co) ? co : []);
      setCellNames(cells.map((c: any) => ({ id: c.cellId, name: c.name })).filter(c => c.id && c.name));
      setBlockNames(blocks.map((b: any) => ({ id: b.blockId, name: b.name })).filter(b => b.id && b.name));
      setKioskNames(kiosks.map((k: any) => ({ id: k.kioskId, name: k.kioskId })).filter(k => k.id));
      // Load biometrics
      setBiometricsLoading(true);
      wardenApi.getInmateBiometrics(inmateId).then(bm => {
        setBiometrics(Array.isArray(bm) ? bm : []);
      }).catch(() => setBiometrics([])).finally(() => setBiometricsLoading(false));
    } catch (e: any) {
      setLoadError(e?.response?.data?.error?.message || 'Failed to load inmate details');
    } finally { setLoading(false); }
  }, [inmateId, isNew]);

  useEffect(() => { load(); }, [load]);

  const startEditInmate = () => {
    if (!inmate) return;
    setEditData({ ...inmate });
    setEditingInmate(true);
  };

  const saveInmate = async () => {
    if (!editData.name) return;
    setSaving(true);
    try {
      if (isNew) {
        const payload = { ...editData, inmateId: nextId, status: 'active', photoUrl: '' } as any;
        const saved = await wardenApi.createInmate(payload);
        if (saved) navigate(`/inmates-family/${saved.inmateId}`, { replace: true });
      } else {
        const updated = await wardenApi.updateInmate(editData.inmateId, editData);
        if (updated) setInmate(updated);
        else setInmate({ ...inmate!, ...editData } as Inmate);
        setEditingInmate(false);
      }
    } catch { }
    setSaving(false);
  };

  const deleteInmate = async () => {
    if (!inmate) return;
    try { await wardenApi.deleteInmateApi(inmate.inmateId); } catch { }
    navigate('/inmates-family');
  };

  const toggleInmate = async () => {
    if (!inmate || toggling) return;
    setToggling(true);
    try {
      const updated = await wardenApi.toggleInmate(inmate.inmateId);
      if (updated) setInmate(updated);
      else setInmate({ ...inmate, status: inmate.status === 'active' ? 'inactive' : 'active' });
    } catch { }
    setToggling(false);
  };

  const startEditContact = (c: Contact) => {
    setContactEditData({ ...c });
    setSelectedContact(c);
    setEditingContact(true);
  };

  const saveContact = async () => {
    if (!contactEditData.contactId) return;
    setSaveContactError('');
    try {
      await wardenApi.updateContact(contactEditData.contactId, contactEditData as any);
      setContacts(prev => prev.map(c => c.contactId === contactEditData.contactId ? { ...c, ...contactEditData } as Contact : c));
      if (selectedContact?.contactId === contactEditData.contactId) {
        setSelectedContact({ ...selectedContact, ...contactEditData } as Contact);
      }
    } catch (e: any) {
      setSaveContactError(e?.response?.data?.error?.message || 'Failed to update contact. Please try again.');
      return;
    }
    setEditingContact(false);
  };

  const deleteContact = async (contactId: string) => {
    setSaveContactError('');
    try {
      await wardenApi.deleteContactApi(contactId);
    } catch (e: any) {
      setSaveContactError(e?.response?.data?.error?.message || 'Failed to delete contact. Please try again.');
      return;
    }
    setContacts(prev => prev.filter(c => c.contactId !== contactId));
    if (selectedContact?.contactId === contactId) { setSelectedContact(null); setEditingContact(false); }
  };

  const toggleContact = async (contactId: string) => {
    try {
      const updated = await wardenApi.toggleContact(contactId);
      if (updated) {
        setContacts(prev => prev.map(c => c.contactId === contactId ? { ...c, ...updated } : c));
        if (selectedContact?.contactId === contactId) setSelectedContact({ ...selectedContact, ...updated } as Contact);
      }
    } catch { }
  };

  const removeDevice = async (contactId: string, fingerprintId: string) => {
    if (removingDevice) return;
    setDeviceError('');
    setRemovingDevice(fingerprintId);
    try {
      await wardenApi.removeContactDevice(contactId, fingerprintId);
      const strip = (c: Contact): Contact => ({ ...c, deviceFingerprints: (c.deviceFingerprints || []).filter(d => d.fingerprintId !== fingerprintId) });
      setContacts(prev => prev.map(c => c.contactId === contactId ? strip(c) : c));
      if (selectedContact?.contactId === contactId) setSelectedContact(strip(selectedContact));
    } catch (e: any) {
      setDeviceError(e?.response?.data?.error?.message || 'Failed to remove device. Please try again.');
    } finally {
      setRemovingDevice(null);
    }
  };

  const clearDevices = async (contactId: string) => {
    if (removingDevice) return;
    setDeviceError('');
    setRemovingDevice('__all__');
    try {
      await wardenApi.clearContactDevices(contactId);
      const strip = (c: Contact): Contact => ({ ...c, deviceFingerprints: [] });
      setContacts(prev => prev.map(c => c.contactId === contactId ? strip(c) : c));
      if (selectedContact?.contactId === contactId) setSelectedContact(strip(selectedContact));
    } catch (e: any) {
      setDeviceError(e?.response?.data?.error?.message || 'Failed to clear devices. Please try again.');
    } finally {
      setRemovingDevice(null);
    }
  };

  const resetPin = async () => {
    if (!inmate || !newPin.trim()) return;
    if (!/^\d{4}$/.test(newPin.trim())) { setResetPinError('PIN must be exactly 4 digits'); return; }
    setResetPinError('');
    try {
      await wardenApi.resetInmatePin(inmate.inmateId, newPin.trim());
      setResetPinSuccess(true);
      setNewPin('');
      setTimeout(() => { setShowResetPin(false); setResetPinSuccess(false); }, 1500);
    } catch (e: any) {
      setResetPinError(e?.response?.data?.error?.message || 'Failed to reset PIN');
    }
  };

  const deleteBiometric = async (biometricId: string) => {
    if (!inmate || deletingBiometric) return;
    setDeletingBiometric(biometricId);
    setBiometricError('');
    try {
      await wardenApi.deleteBiometric(biometricId, inmate.inmateId);
      const refreshed = await wardenApi.getInmateBiometrics(inmate.inmateId);
      setBiometrics(Array.isArray(refreshed) ? refreshed : []);
    } catch (e: any) {
      setBiometricError(e?.response?.data?.error?.message || 'Failed to delete biometric. Please try again.');
    } finally {
      setDeletingBiometric(null);
    }
  };

  const addFamily = async () => {
    if (!newFamily.name.trim() || !newFamily.phoneNumber.trim()) { setAddFamilyError('Full Name and Phone are required'); return; }
    if (!inmateId) return;
    setAddFamilyError('');
    const payload = { name: newFamily.name.trim(), relationship: newFamily.relationship.trim() || 'Family', phoneNumber: newFamily.phoneNumber.trim(), address: newFamily.address.trim(), city: newFamily.city.trim(), state: newFamily.state.trim() } as any;
    try {
      const saved = await wardenApi.createContact(inmateId, payload);
      if (saved) {
        setContacts(prev => [...prev, saved as Contact]);
      } else {
        setAddFamilyError('Failed to save contact — server returned empty response');
        return;
      }
    } catch (e: any) {
      setAddFamilyError(e?.response?.data?.error?.message || 'Failed to save contact. Please try again.');
      return;
    }
    setNewFamily({ name: '', relationship: '', phoneNumber: '', address: '', city: '', state: '' });
    setShowAddFamily(false);
  };

  const headerIcon = useMemo(() => <span className="material-icons text-primary-600 text-xl">{isNew ? 'person_add' : 'person'}</span>, [isNew]);
  usePageHeader({
    title: isNew ? 'Add New Inmate' : (inmate?.name || 'Inmate Details'),
    subtitle: isNew ? 'Fill in inmate details' : (inmate ? `${inmate.inmateId} • ${inmate.cellBlock || 'No block'}` : ''),
    icon: headerIcon,
    actions: useMemo(() => (
      <button onClick={() => navigate('/inmates-family')} className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition">
        <span className="material-icons text-base">arrow_back</span> Back to List
      </button>
    ), []),
  });

  if (loading) return <Loading message="Loading inmate details..." />;
  if (loadError) return <Card><div className="text-center py-12"><p className="text-error mb-4">{loadError}</p><button onClick={() => { setLoading(true); load(); }} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">Retry</button></div></Card>;
  if (!isNew && !inmate) return <Card><div className="text-center py-12"><p className="text-neutral-600">Inmate not found</p></div></Card>;

  const fieldRow = (label: string, key: keyof Inmate, icon: string, opts?: { type?: string; radio?: string[]; placeholder?: string; readOnly?: boolean }) => {
    const val = editingInmate ? (editData[key] ?? '') : (inmate?.[key] ?? '');
    if (editingInmate && !opts?.readOnly) {
      if (opts?.radio) {
        return (
          <div key={key} className="py-3 border-b border-neutral-100 last:border-0">
            <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{label}</p>
            <div className="flex gap-3">
              {opts.radio.map(r => (
                <label key={r} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name={key} value={r} checked={val === r} onChange={() => setEditData({ ...editData, [key]: r })} className="text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm capitalize">{r}</span>
                </label>
              ))}
            </div>
          </div>
        );
      }
      return (
        <div key={key} className="py-3 border-b border-neutral-100 last:border-0">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{label}</p>
          <input
            type={opts?.type || 'text'}
            value={String(val)}
            onChange={e => setEditData({ ...editData, [key]: e.target.value })}
            placeholder={opts?.placeholder || label}
            className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      );
    }
    return (
      <div key={key} className="py-3 border-b border-neutral-100 last:border-0 flex items-center gap-3">
        <span className="material-icons text-neutral-400 text-lg">{icon}</span>
        <div>
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">{label}</p>
          <p className="text-sm text-neutral-900">{val || '—'}</p>
        </div>
      </div>
    );
  };

  const searchableRow = (label: string, key: keyof Inmate, icon: string, options: { id: string; name: string }[], addLabel?: string, fallbackKey?: keyof Inmate) => {
    const val = editingInmate ? (editData[key] ?? '') : (inmate?.[key] ?? '');
    const fallback = fallbackKey ? String(inmate?.[fallbackKey] ?? '') : '';
    if (editingInmate) {
      return (
        <div key={key} className="py-3 border-b border-neutral-100 last:border-0">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{label}</p>
          <SearchableSelect
            value={String(val)}
            options={options}
            onChange={v => setEditData({ ...editData, [key]: v })}
            fallbackLabel={fallback}
            onAdd={async (name) => {
              if (key === 'cellId') {
                const created = await wardenApi.createCell(name).catch(() => null);
                if (created) setCellNames(prev => [...prev, { id: created.cellId, name }]);
                else setCellNames(prev => [...prev, { id: `temp-${Date.now()}`, name }]);
              } else if (key === 'blockId') {
                const created = await wardenApi.createBlock(name).catch(() => null);
                if (created) setBlockNames(prev => [...prev, { id: created.blockId, name }]);
                else setBlockNames(prev => [...prev, { id: `temp-${Date.now()}`, name }]);
              } else if (key === 'assignedKioskId') {
                setKioskNames(prev => [...prev, { id: name, name }]);
              }
            }}
            addLabel={addLabel}
            placeholder={`Select ${label}`}
          />
        </div>
      );
    }
    return (
      <div key={key} className="py-3 border-b border-neutral-100 last:border-0 flex items-center gap-3">
        <span className="material-icons text-neutral-400 text-lg">{icon}</span>
        <div>
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">{label}</p>
          <p className="text-sm text-neutral-900">{val || '—'}</p>
        </div>
      </div>
    );
  };

  const contactFieldRow = (label: string, key: keyof Contact, icon: string) => {
    const val = editingContact ? (contactEditData[key] ?? '') : (selectedContact?.[key] ?? '');
    if (editingContact) {
      return (
        <div key={key} className="py-3 border-b border-neutral-100 last:border-0">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-2">{label}</p>
          <input
            type="text"
            value={String(val)}
            onChange={e => setContactEditData({ ...contactEditData, [key]: e.target.value })}
            placeholder={label}
            className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      );
    }
    const display = val == null || typeof val === 'object' ? '' : String(val);
    return (
      <div key={key} className="py-3 border-b border-neutral-100 last:border-0 flex items-center gap-3">
        <span className="material-icons text-neutral-400 text-lg">{icon}</span>
        <div>
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">{label}</p>
          <p className="text-sm text-neutral-900">{display || '—'}</p>
        </div>
      </div>
    );
  };

  const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const renderDevices = (contact: Contact) => {
    const devices = contact.deviceFingerprints || [];
    const device = primaryDevice(contact);
    const s = device?.signals || {};
    const info = device?.deviceInfo || {};
    const brand = brandFromUserAgent(s.userAgent);
    const model = modelFromUserAgent(s.userAgent);

    return (
      <div className="pt-4 border-t border-neutral-100 mt-1">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-icons text-sm">devices</span> Verified Device
          </p>
          {devices.length > 1 && (
            <button
              onClick={() => clearDevices(contact.contactId)}
              disabled={removingDevice !== null}
              className="text-[11px] text-neutral-500 hover:text-red-600 transition disabled:opacity-50"
              title="Remove every registered record for this contact"
            >
              Clear all ({devices.length})
            </button>
          )}
        </div>
        {deviceError && <p className="text-xs text-red-500 mb-2">{deviceError}</p>}
        {!device ? (
          <p className="text-xs text-neutral-400">No device registered yet. A device is registered the first time this contact opens a call link on their phone.</p>
        ) : (
          <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="material-icons text-neutral-400 mt-0.5">smartphone</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-neutral-900 truncate">
                  {brand || info.os || 'Registered device'}
                  {model && model !== brand ? <span className="font-normal text-neutral-500">{' · '}{model}</span> : null}
                </p>
                {(info.os || info.browser) && (
                  <p className="text-[11px] text-neutral-500 truncate">{[info.os, info.browser].filter(Boolean).join(' · ')}</p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-neutral-500">
                  {device.phone && <span>Phone: {device.phone}</span>}
                  {(s.screen || info.screen) && <span>Screen: {s.screen || info.screen}</span>}
                  {s.timezone && <span>TZ: {s.timezone}</span>}
                  {s.platform && <span>Platform: {s.platform}</span>}
                  {s.deviceMemory != null && <span>Memory: {s.deviceMemory} GB</span>}
                  {typeof s.hardwareConcurrency === 'number' && <span>Cores: {s.hardwareConcurrency}</span>}
                  <span>Uses: {device.verifiedCount || 0}×</span>
                  {device.lastVerifiedAt && <span>Last: {fmtDate(device.lastVerifiedAt)}</span>}
                  {device.firstSeenAt && <span>First: {fmtDate(device.firstSeenAt)}</span>}
                </div>
                {s.deviceId && <p className="mt-1 text-[10px] font-mono text-neutral-400 truncate">ID: {s.deviceId}</p>}
              </div>
              <button
                onClick={() => removeDevice(contact.contactId, device.fingerprintId)}
                disabled={removingDevice !== null}
                className="w-8 h-8 shrink-0 flex items-center justify-center bg-white border border-neutral-200 text-neutral-600 rounded-lg hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50"
                title="Remove this device"
              >
                <span className="material-icons text-base">{removingDevice === device.fingerprintId ? 'hourglass_top' : 'delete'}</span>
              </button>
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">
              {devices.length > 1
                ? `${devices.length} records on file — only one device can be active. Removing forces this phone to register again on its next call.`
                : 'Only one device can be registered per contact. Removing it lets this phone register again on its next call.'}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex gap-6 h-[calc(100vh-120px)] ${isNew ? 'justify-center' : ''}`}>
      {/* LEFT — Inmate Details */}
      <div className={`flex-1 min-w-0 overflow-y-auto ${!isNew && inmate?.status !== 'active' ? 'opacity-50' : ''}`}>
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-700 flex items-center gap-2">
              <button onClick={() => navigate(-1)} className="p-1 rounded-lg hover:bg-neutral-100 transition-colors" title="Go back">
                <span className="material-icons text-neutral-500 text-xl">arrow_back</span>
              </button>
              <span className="w-2 h-2 bg-primary-600 rounded-full" />{isNew ? 'New Inmate' : 'Inmate Details'}
            </h2>
            <div className="flex items-center gap-2">
              {editingInmate ? (
                <>
                  {!isNew && <button onClick={() => setEditingInmate(false)} className="px-3 py-1.5 bg-white border border-neutral-200 text-neutral-700 rounded-lg text-xs font-medium hover:bg-neutral-50 transition">Cancel</button>}
                  <button onClick={saveInmate} disabled={saving || !editData.name} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition disabled:opacity-50">
                    {saving ? 'Saving...' : isNew ? 'Create Inmate' : 'Save'}
                  </button>
                </>
              ) : !isNew && inmate ? (
                <>
                  <button
                    onClick={toggleInmate}
                    disabled={toggling}
                    className={`transition hover:opacity-80 ${inmate.status === 'active' ? 'text-success' : 'text-neutral-400'}`}
                    title={inmate.status === 'active' ? 'Deactivate' : 'Activate'}
                  >
                    <span className="material-icons" style={{ fontSize: '42px' }}>{inmate.status === 'active' ? 'toggle_on' : 'toggle_off'}</span>
                  </button>
                  {inmate.status === 'active' && (
                    <>
                      <button onClick={startEditInmate} className="w-8 h-8 flex items-center justify-center bg-white border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 hover:text-primary-600 transition" title="Edit"><span className="material-icons text-base">edit</span></button>
                      <button onClick={() => setShowResetPin(true)} className="w-8 h-8 flex items-center justify-center bg-white border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 hover:text-amber-600 transition" title="Reset PIN"><span className="material-icons text-base">lock_reset</span></button>
                      <button onClick={deleteInmate} className="w-8 h-8 flex items-center justify-center bg-white border border-neutral-200 text-neutral-600 rounded-lg hover:bg-red-50 hover:text-red-600 transition" title="Delete"><span className="material-icons text-base">delete</span></button>
                    </>
                  )}
                </>
              ) : null}
            </div>
          </div>
          {!isNew && inmate && (
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-neutral-200">
              <div className="w-16 h-16 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center shrink-0">
                <span className="material-icons text-[#8696A0] text-3xl">person</span>
              </div>
              <div>
                <p className="font-bold text-lg text-neutral-900">{inmate.name}</p>
                <p className="text-sm text-neutral-500 font-mono">{inmate.inmateId}</p>
              </div>
            </div>
          )}
          {isNew && <div className="mb-4" />}
          {fieldRow('Full Name', 'name', 'person')}
          {isNew ? (
            <div className="py-3 border-b border-neutral-100 last:border-0 flex items-center gap-3">
              <span className="material-icons text-neutral-400 text-lg">badge</span>
              <div>
                <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">Inmate ID</p>
                {nextId ? (
                  <p className="text-sm text-neutral-900 font-mono font-bold">{nextId}</p>
                ) : (
                  <div className="h-4 w-20 bg-neutral-200 rounded animate-pulse" />
                )}
              </div>
              <span className="ml-auto px-2 py-0.5 bg-primary-50 text-primary-700 text-[10px] font-bold rounded-full uppercase">Auto-generated</span>
            </div>
          ) : fieldRow('Inmate ID', 'inmateId', 'badge', { readOnly: true })}
          {fieldRow('Prisoner Number', 'prisonerNumber', 'tag')}
          {fieldRow('Gender', 'gender', 'wc', { radio: ['male', 'female', 'other'] })}
          {fieldRow('Date of Admission', 'dateOfAdmission', 'calendar_today', { type: 'date' })}
          {searchableRow('Cell', 'cellId', 'domain', cellNames, '+ Add new cell', 'cellName')}
          {searchableRow('Block', 'blockId', 'location_on', blockNames, '+ Add new block', 'blockName')}
          {fieldRow('Security Level', 'securityLevel', 'security', { radio: ['minimum', 'medium', 'maximum'] })}
          {fieldRow('Sentence Details', 'sentenceDetails', 'gavel')}
          {searchableRow('Assigned Kiosk', 'assignedKioskId', 'tablet_mac', kioskNames, '+ Add new kiosk', 'kioskName')}

          {/* Biometrics Section */}
          {!isNew && (
            <div className="mt-4 pt-4 border-t border-neutral-200">
              <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500 mb-3 flex items-center gap-2">
                <span className="material-icons text-sm">fingerprint</span> Biometrics
                <span className="text-[10px] text-neutral-400 normal-case tracking-normal ml-1">(Register from kiosk only)</span>
              </h3>
              {biometricError && (
                <p className="text-xs text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2 mb-3">{biometricError}</p>
              )}
              {biometricsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-neutral-100 rounded-lg animate-pulse" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {([
                    { type: 'face', label: 'Face', icon: 'face' },
                    { type: 'fingerprint', label: 'Fingerprint', icon: 'fingerprint' },
                    { type: 'rfid', label: 'RFID', icon: 'credit_card' },
                  ]).map(({ type, label, icon }) => {
                    const bio = biometrics.find(b => b.type === type);
                    const isRegistered = bio?.status?.toLowerCase() === 'registered';
                    return (
                      <div key={type} className="flex items-center justify-between px-3 py-2.5 bg-neutral-50 rounded-lg border border-neutral-100">
                        <div className="flex items-center gap-3">
                          <span className="material-icons text-neutral-500 text-lg">{icon}</span>
                          <div>
                            <p className="text-sm font-medium text-neutral-800">{label}</p>
                            <p className="text-[11px] text-neutral-400">
                              {isRegistered ? 'Registered' : 'Not registered'}
                              {bio?.registeredAt && ` • ${new Date(bio.registeredAt).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isRegistered ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-500'}`}>
                            {isRegistered ? 'ACTIVE' : 'NONE'}
                          </span>
                          {isRegistered && bio && (
                            <button
                              onClick={() => deleteBiometric(bio.biometricId)}
                              disabled={deletingBiometric === bio.biometricId}
                              className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                              title={`Remove ${label}`}
                            >
                              <span className="material-icons text-sm">{deletingBiometric === bio.biometricId ? 'hourglass_empty' : 'delete'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* RIGHT — Family Members (hidden in add mode) */}
      {!isNew && (
      <div className={`w-[420px] shrink-0 flex flex-col bg-white rounded-xl shadow-md border border-neutral-200 overflow-hidden ${inmate.status !== 'active' ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 bg-neutral-50/50 shrink-0">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-700 flex items-center gap-2">
            <span className="w-2 h-2 bg-success rounded-full" />Family Members
            <span className="px-2 py-0.5 bg-white border border-neutral-200 rounded-full text-xs font-bold text-neutral-900">{contacts.length}</span>
          </h2>
          <button onClick={() => setShowAddFamily(true)} className="w-8 h-8 flex items-center justify-center bg-success text-white rounded-lg hover:bg-success-700 transition" title="Add Family"><span className="material-icons text-base">person_add</span></button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {!selectedContact ? (
            <div className="divide-y divide-neutral-100">
              {contacts.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="material-icons text-neutral-300 text-4xl">people_outline</span>
                  <p className="text-sm text-neutral-500 mt-2">No family members</p>
                  <button onClick={() => setShowAddFamily(true)} className="mt-3 px-4 py-2 bg-success text-white rounded-lg text-xs font-medium hover:bg-success-700 transition">+ Add Family</button>
                </div>
              ) : contacts.map(c => (
                <div key={c.contactId} onClick={() => { setSelectedContact(c); setEditingContact(false); }} className="flex items-center gap-3 px-5 py-3.5 hover:bg-neutral-50 cursor-pointer transition-colors">
                  <div className="w-10 h-10 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center shrink-0">
                    <span className="material-icons text-[#8696A0]">person</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 truncate">{c.name}</p>
                    <p className="text-xs text-neutral-500">{c.relationship} • {c.phoneNumber}</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); toggleContact(c.contactId); }}
                    className={`shrink-0 transition hover:opacity-80 ${c.active !== false ? 'text-success' : 'text-neutral-400'}`}
                    title={c.active !== false ? 'Deactivate' : 'Activate'}
                  >
                    <span className="material-icons" style={{ fontSize: '42px' }}>{c.active !== false ? 'toggle_on' : 'toggle_off'}</span>
                  </button>
                  <span className="material-icons text-neutral-300 text-lg">chevron_right</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <button onClick={() => { setSelectedContact(null); setEditingContact(false); }} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-primary-600 mb-4 transition">
                <span className="material-icons text-sm">arrow_back</span> Back to list
              </button>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#E9EEF3] border border-[#D1D7DB] flex items-center justify-center">
                    <span className="material-icons text-[#8696A0] text-xl">person</span>
                  </div>
                  <div>
                    <p className="font-bold text-neutral-900">{selectedContact.name}</p>
                    <p className="text-xs text-neutral-500">{selectedContact.relationship}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleContact(selectedContact.contactId)}
                    className={`transition hover:opacity-80 ${selectedContact.active !== false ? 'text-success' : 'text-neutral-400'}`}
                    title={selectedContact.active !== false ? 'Deactivate' : 'Activate'}
                  >
                    <span className="material-icons" style={{ fontSize: '32px' }}>{selectedContact.active !== false ? 'toggle_on' : 'toggle_off'}</span>
                  </button>
                  {editingContact ? (
                    <>
                      <button onClick={() => { setEditingContact(false); setSaveContactError(''); }} className="w-8 h-8 flex items-center justify-center bg-white border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 transition" title="Cancel"><span className="material-icons text-base">close</span></button>
                      <button onClick={saveContact} className="w-8 h-8 flex items-center justify-center bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition" title="Save"><span className="material-icons text-base">check</span></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEditContact(selectedContact)} className="w-8 h-8 flex items-center justify-center bg-white border border-neutral-200 text-neutral-600 rounded-lg hover:bg-neutral-50 hover:text-primary-600 transition" title="Edit"><span className="material-icons text-base">edit</span></button>
                      <button onClick={() => deleteContact(selectedContact.contactId)} className="w-8 h-8 flex items-center justify-center bg-white border border-neutral-200 text-neutral-600 rounded-lg hover:bg-red-50 hover:text-red-600 transition" title="Delete"><span className="material-icons text-base">delete</span></button>
                    </>
                  )}
                </div>
                {saveContactError && <p className="text-xs text-red-500 mt-2">{saveContactError}</p>}
              </div>
              {contactFieldRow('Full Name', 'name', 'person')}
              {contactFieldRow('Relationship', 'relationship', 'family_restroom')}
              {contactFieldRow('Mobile Number', 'phoneNumber', 'phone')}
              {contactFieldRow('Email', 'email', 'email')}
              {contactFieldRow('Address', 'address', 'home')}
              {contactFieldRow('City', 'city', 'location_city')}
              {contactFieldRow('State', 'state', 'map')}
              {renderDevices(selectedContact)}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Add Family Modal */}
      {showAddFamily && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setShowAddFamily(false); setAddFamilyError(''); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-4">Add Family Member</h3>
            {addFamilyError && <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2 mb-3">{addFamilyError}</p>}
            <input placeholder="Full Name *" value={newFamily.name} onChange={e => setNewFamily({ ...newFamily, name: e.target.value })} className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <input placeholder="Relationship" value={newFamily.relationship} onChange={e => setNewFamily({ ...newFamily, relationship: e.target.value })} className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <input placeholder="Phone *" value={newFamily.phoneNumber} onChange={e => setNewFamily({ ...newFamily, phoneNumber: e.target.value })} className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <input placeholder="Address" value={newFamily.address} onChange={e => setNewFamily({ ...newFamily, address: e.target.value })} className="w-full mb-3 px-3 py-2 border rounded-lg" />
            <div className="flex gap-3 mb-3">
              <input placeholder="City" value={newFamily.city} onChange={e => setNewFamily({ ...newFamily, city: e.target.value })} className="flex-1 px-3 py-2 border rounded-lg" />
              <input placeholder="State" value={newFamily.state} onChange={e => setNewFamily({ ...newFamily, state: e.target.value })} className="flex-1 px-3 py-2 border rounded-lg" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowAddFamily(false); setAddFamilyError(''); }} className="px-4 py-2 border rounded-lg">Cancel</button>
              <button onClick={addFamily} className="px-4 py-2 bg-success text-white rounded-lg">Add</button>
            </div>
          </div>
        </div>
      )}
      {/* Reset PIN Modal */}
      {showResetPin && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { setShowResetPin(false); setResetPinError(''); setNewPin(''); setResetPinSuccess(false); }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-4">Reset Inmate PIN</h3>
            {resetPinSuccess ? (
              <p className="text-sm text-success bg-success/10 border border-success/20 rounded-lg px-3 py-2 mb-3">PIN reset successfully!</p>
            ) : (
              <>
                {resetPinError && <p className="text-sm text-error bg-error/10 border border-error/20 rounded-lg px-3 py-2 mb-3">{resetPinError}</p>}
                <p className="text-sm text-neutral-600 mb-3">Enter a new 4-digit PIN for <strong>{inmate.name}</strong></p>
                <input
                  type="password"
                  maxLength={4}
                  pattern="[0-9]*"
                  inputMode="numeric"
                  value={newPin}
                  onChange={e => { setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setResetPinError(''); }}
                  placeholder="••••"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </>
            )}
            <div className="flex gap-2 justify-end mt-4">
              <button onClick={() => { setShowResetPin(false); setResetPinError(''); setNewPin(''); setResetPinSuccess(false); }} className="px-4 py-2 border rounded-lg text-sm">Close</button>
              {!resetPinSuccess && <button onClick={resetPin} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm">Reset PIN</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
