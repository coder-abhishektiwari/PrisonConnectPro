import { useState, useEffect } from 'react';
import { wardenApi } from '@/services/api/wardenApi';
import type { ActiveCall, Inmate, Contact, Wallet, Schedule } from '@/services/api/wardenApi';

interface CallDetailsDrawerProps {
  call: ActiveCall | null;
  onClose: () => void;
}

/**
 * Call Details Drawer - Shows prisoner profile, family profile, schedule, wallet, billing, device info, and timeline.
 */
export function CallDetailsDrawer({ call, onClose }: CallDetailsDrawerProps) {
  const [inmate, setInmate] = useState<Inmate | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!call) return;

    const loadDetails = async () => {
      setIsLoading(true);
      try {
        const [inmates, contacts, wallets, schedules] = await Promise.all([
          wardenApi.getInmates(),
          wardenApi.getContacts(),
          wardenApi.getWallets(),
          wardenApi.getSchedule(),
        ]);

        setInmate(inmates.find((i) => i.inmateId === call.inmateId) || null);
        setContact(contacts.find((c) => c.id === call.contactId) || null);
        setWallet(wallets.find((w) => w.inmateId === call.inmateId) || null);
        setSchedule(schedules.find((s) => s.inmateId === call.inmateId) || null);
      } catch (error) {
        console.error('Failed to load call details:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadDetails();
  }, [call]);

  if (!call) return null;

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (minutes: number) => {
    const mins = Math.floor(minutes);
    const secs = Math.floor((minutes % 1) * 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const timeline = [
    { label: 'Call Started', time: call.startTime, icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Room Created', time: call.roomId ? call.startTime : null, icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { label: 'Recording', time: call.recordingStatus === 'recording' ? 'In progress' : call.recordingStatus, icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { label: 'Current Status', time: call.status, icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white shadow-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">Call Details</h2>
            <p className="text-sm text-neutral-600">{call.callId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-neutral-600">Loading details...</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Prisoner Profile */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide mb-3">Prisoner Profile</h3>
              <div className="bg-neutral-50 rounded-lg p-4">
                <div className="flex items-center gap-4">
                  {inmate?.photoUrl && (
                    <img src={inmate.photoUrl} alt={inmate?.firstName} className="w-16 h-16 rounded-full" />
                  )}
                  <div>
                    <p className="font-semibold text-neutral-900">
                      {inmate ? `${inmate.firstName} ${inmate.lastName}` : call.inmateName || call.inmateId}
                    </p>
                    <p className="text-sm text-neutral-600">{inmate?.facility || inmate?.prisonId || 'Unknown'}</p>
                    <p className="text-sm text-neutral-600">
                      {inmate?.cellBlock || 'Unknown'} • {inmate?.securityLevel || 'Unknown'} security
                    </p>
                  </div>
                </div>
                {inmate?.sentenceDetails && (
                  <p className="text-sm text-neutral-600 mt-3">{inmate.sentenceDetails}</p>
                )}
              </div>
            </section>

            {/* Family Profile */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide mb-3">Family Profile</h3>
              <div className="bg-neutral-50 rounded-lg p-4">
                <div className="flex items-center gap-4">
                  {contact?.photoUrl && (
                    <img src={contact.photoUrl} alt={contact.fullName} className="w-16 h-16 rounded-full" />
                  )}
                  <div>
                    <p className="font-semibold text-neutral-900">
                      {contact?.fullName || call.familyMemberName || call.contactId}
                    </p>
                    <p className="text-sm text-neutral-600">{contact?.relationship || 'Family Member'}</p>
                    <p className="text-sm text-neutral-600">{contact?.phoneNumber || '—'}</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Schedule */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide mb-3">Schedule</h3>
              <div className="bg-neutral-50 rounded-lg p-4 space-y-2">
                {schedule ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-neutral-600">Date</span>
                      <span className="text-sm font-medium text-neutral-900">{schedule.date}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-neutral-600">Time Slot</span>
                      <span className="text-sm font-medium text-neutral-900">{schedule.timeSlot}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-neutral-600">Call Type</span>
                      <span className="text-sm font-medium text-neutral-900 capitalize">{schedule.callType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-neutral-600">Status</span>
                      <span className="text-sm font-medium text-neutral-900 capitalize">{schedule.status}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-neutral-600">No scheduled call found</p>
                )}
              </div>
            </section>

            {/* Wallet & Billing */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide mb-3">Wallet & Billing</h3>
              <div className="bg-neutral-50 rounded-lg p-4 space-y-2">
                {wallet ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-sm text-neutral-600">Balance</span>
                      <span className="text-sm font-bold text-success">₹{wallet.balance.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-neutral-600">Remaining Minutes</span>
                      <span className="text-sm font-medium text-neutral-900">{wallet.remainingMinutes}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-neutral-600">Total Spent</span>
                      <span className="text-sm font-medium text-neutral-900">₹{wallet.totalSpent.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-neutral-600">Last Recharge</span>
                      <span className="text-sm font-medium text-neutral-900">₹{wallet.lastRechargeAmount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-neutral-600">Call Duration</span>
                      <span className="text-sm font-medium text-neutral-900">{formatDuration(call.durationMinutes)}</span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-neutral-600">No wallet data found</p>
                )}
              </div>
            </section>

            {/* Device Info */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide mb-3">Device Info</h3>
              <div className="bg-neutral-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-600">Kiosk ID</span>
                  <span className="text-sm font-medium text-neutral-900">{call.kioskId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-600">Room ID</span>
                  <span className="text-sm font-medium text-neutral-900">{call.roomIdLabel || call.roomId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-600">Call Type</span>
                  <span className="text-sm font-medium text-neutral-900 capitalize">{call.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-600">Connection Quality</span>
                  <span className="text-sm font-medium text-neutral-900 capitalize">{call.connectionQuality}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-neutral-600">ICE State</span>
                  <span className="text-sm font-medium text-neutral-900 capitalize">{call.iceState}</span>
                </div>
              </div>
            </section>

            {/* Timeline */}
            <section>
              <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide mb-3">Timeline</h3>
              <div className="space-y-4">
                {timeline.map((item, index) => (
                  <div key={index} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                        </svg>
                      </div>
                      {index < timeline.length - 1 && <div className="w-px flex-1 bg-neutral-200" />}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium text-neutral-900">{item.label}</p>
                      <p className="text-sm text-neutral-600">
                        {item.time ? formatDate(item.time) : '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}