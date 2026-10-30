import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { callWalletApi } from '@/services/api';
import type { CallWalletInfo, WalletOrder, WalletVerifyResult } from '@/types/wallet';

type Phase = 'loading' | 'ready' | 'paying' | 'success' | 'expired';

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

const errMessage = (e: unknown, fallback: string): string => {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  return fallback;
};

const rupees = (paise: number) =>
  (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface CallWalletPopupProps {
  sessionToken: string;
  inmateName?: string;
  onClose: () => void;
}

/**
 * Post-call wallet recharge modal. Authenticated by the OTP-verified call JWT
 * (Bearer header) — no URL token involved. Same Razorpay Checkout + HMAC
 * verify + idempotent credit pipeline as the SMS wallet-link page.
 */
export function CallWalletPopup({ sessionToken, inmateName, onClose }: CallWalletPopupProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<CallWalletInfo | null>(null);
  const [amount, setAmount] = useState('');
  const [payError, setPayError] = useState('');
  const [result, setResult] = useState<WalletVerifyResult | null>(null);
  const [paidPaise, setPaidPaise] = useState(0);

  const fetchInfo = useCallback(async () => {
    setPhase('loading');
    try {
      const data = await callWalletApi.getInfo(sessionToken);
      setInfo(data);
      setPhase('ready');
    } catch (e: any) {
      // 401 = JWT expired (call + idle exceeded TTL). Show static fallback.
      if (e?.status === 401) {
        setPhase('expired');
        return;
      }
      setPayError(errMessage(e, 'Could not load wallet. Please try again.'));
      setPhase('ready');
    }
  }, [sessionToken]);

  useEffect(() => {
    void fetchInfo();
  }, [fetchInfo]);

  const pay = async () => {
    if (phase === 'paying') return;
    const value = Number(amount);
    const min = info?.limits?.minRupees ?? 10;
    const max = info?.limits?.maxRupees ?? 2000;
    if (!Number.isInteger(value) || value < min || value > max) {
      setPayError(`Enter a whole amount between Rs.${min} and Rs.${max}`);
      return;
    }
    setPayError('');
    setPhase('paying');
    try {
      const order: WalletOrder = await callWalletApi.createOrder(sessionToken, value);
      if (!(await loadRazorpay())) {
        setPayError('Could not open the payment window. Check your internet connection and try again.');
        setPhase('ready');
        return;
      }
      setPaidPaise(order.amountPaise);
      const RazorpayCtor = (window as any).Razorpay;
      const razorpay = new RazorpayCtor({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        order_id: order.orderId,
        name: 'PrisonConnect',
        description: `Wallet deposit${info?.inmateName ? ` for ${info.inmateName}` : ''}`,
        handler: (response: RazorpayResponse) => {
          void (async () => {
            try {
              const verified = await callWalletApi.verify(sessionToken, {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              setResult(verified);
              setPhase('success');
            } catch (e) {
              setPayError(
                errMessage(
                  e,
                  'Payment verification failed. If your payment went through, it will be credited automatically within a few minutes.',
                ),
              );
              setPhase('ready');
            }
          })();
        },
        modal: { ondismiss: () => setPhase('ready') },
      });
      razorpay.open();
    } catch (e) {
      setPayError(errMessage(e, 'Could not start the payment. Please try again.'));
      setPhase('ready');
    }
  };

  const displayName = info?.inmateName || inmateName || 'your inmate';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 relative max-h-[90vh] overflow-y-auto">
        {/* Close (X) — always available except while Razorpay is open */}
        {phase !== 'paying' && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 flex items-center justify-center text-lg leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        )}

        {phase === 'loading' && (
          <div className="py-10 text-center">
            <div className="w-10 h-10 mx-auto border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            <p className="text-sm text-neutral-500 mt-4">Loading wallet...</p>
          </div>
        )}

        {phase === 'expired' && (
          <div className="py-6 text-center">
            <h2 className="text-lg font-bold text-neutral-900">Session expired</h2>
            <p className="text-sm text-neutral-500 mt-2">
              To add money, open the recharge link sent to your phone via SMS.
            </p>
            <Button variant="secondary" size="md" className="mt-5" onClick={onClose}>
              Close
            </Button>
          </div>
        )}

        {phase === 'success' && result && info && (
          <div className="text-center">
            <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4 text-white text-2xl font-bold bg-success">
              &#10003;
            </div>
            <h2 className="text-xl font-bold text-neutral-900">Payment successful</h2>
            <p className="text-sm text-neutral-500 mt-1">{displayName}</p>

            <div className="mt-5 p-4 rounded-xl border border-neutral-200 bg-neutral-50 text-left text-sm text-neutral-700 space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span>Paid</span>
                <span>&#8377;{rupees(paidPaise)}</span>
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>Gateway charges</span>
                <span>&#8377;{rupees(Math.max(paidPaise - result.creditedPaise, 0))}</span>
              </div>
              <div className="flex justify-between font-semibold text-neutral-900 border-t border-neutral-200 pt-1.5">
                <span>Credited</span>
                <span>&#8377;{rupees(result.creditedPaise)}</span>
              </div>
            </div>

            <div className="mt-4 p-4 rounded-xl border border-neutral-200 text-center">
              <p className="text-xs text-neutral-500 uppercase tracking-wide">New balance</p>
              <p className="text-3xl font-extrabold text-success font-mono mt-1">
                &#8377;{rupees(result.balance)}
              </p>
            </div>

            <Button variant="primary" size="lg" className="w-full mt-6" onClick={onClose}>
              Done
            </Button>
          </div>
        )}

        {(phase === 'ready' || phase === 'paying') && info && (
          <div>
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3 text-white text-2xl font-bold bg-success">
                &#8377;
              </div>
              <h2 className="text-xl font-bold text-neutral-900">Add money</h2>
              <p className="text-sm text-neutral-500 mt-1">{displayName}</p>
            </div>

            <div className="mt-4 p-4 rounded-xl border border-neutral-200 bg-neutral-50 text-center">
              <p className="text-xs text-neutral-500 uppercase tracking-wide">Current balance</p>
              <p className="text-3xl font-extrabold text-success font-mono mt-1">
                &#8377;{rupees(info.balance)}
              </p>
            </div>

            <div className="mt-5">
              <Input
                label="Amount to send (Rs.)"
                value={amount}
                onChange={(v) => {
                  setAmount(v.replace(/[^\d]/g, ''));
                  setPayError('');
                }}
                type="text"
                inputMode="numeric"
                placeholder={`${info.limits?.minRupees ?? 10} - ${info.limits?.maxRupees ?? 2000}`}
                error={payError || undefined}
                disabled={phase === 'paying'}
              />
              {!payError && (
                <p className="mt-1 text-xs text-neutral-500">
                  Between &#8377;{info.limits?.minRupees ?? 10} and &#8377;{info.limits?.maxRupees ?? 2000}. A
                  payment-gateway charge applies; the exact credited amount is shown on the receipt.
                </p>
              )}
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full mt-5"
              onClick={() => void pay()}
              disabled={phase === 'paying' || !amount}
            >
              {phase === 'paying' ? 'Opening payment window...' : amount ? `Pay Online Rs.${Number(amount)}` : 'Pay Online'}
            </Button>

            <Button
              variant="secondary"
              size="md"
              className="w-full mt-2"
              onClick={onClose}
              disabled={phase === 'paying'}
            >
              Maybe later
            </Button>

            <p className="text-center text-xs text-neutral-400 mt-4">
              Powered by Razorpay. Secure payment, credited after gateway charges.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
