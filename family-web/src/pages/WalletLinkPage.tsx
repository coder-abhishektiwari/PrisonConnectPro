import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loading } from '@/components/States';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { walletApi } from '@/services/api';
import type { WalletLinkInfo, WalletVerifyResult } from '@/types/wallet';

type Phase = 'loading' | 'invalid' | 'ready' | 'paying' | 'success';

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

export function WalletLinkPage() {
  const [searchParams] = useSearchParams();
  // Token is the first query KEY (`/w?<token>`), read exactly once so the
  // address-bar cleanup below can never invalidate it.
  const [token] = useState(() => searchParams.keys().next().value ?? null);

  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<WalletLinkInfo | null>(null);
  const [invalidMsg, setInvalidMsg] = useState(
    'This link is no longer valid. Ask the jail office to send you a new one.',
  );
  const [amount, setAmount] = useState('');
  const [payError, setPayError] = useState('');
  const [result, setResult] = useState<WalletVerifyResult | null>(null);
  const [paidPaise, setPaidPaise] = useState(0);

  // Keep the bearer token out of the address bar, browser history, screenshots.
  useEffect(() => {
    if (token) window.history.replaceState({}, '', '/w');
  }, [token]);

  const fetchInfo = useCallback(async () => {
    if (!token) {
      setInvalidMsg('This link is missing its access key. Open the link exactly as it was sent to you.');
      setPhase('invalid');
      return;
    }
    setPhase('loading');
    try {
      const data = await walletApi.getInfo(token);
      setInfo(data);
      setPhase('ready');
    } catch (e) {
      setInvalidMsg(errMessage(e, 'This link is no longer valid. Ask the jail office to send you a new one.'));
      setPhase('invalid');
    }
  }, [token]);

  useEffect(() => {
    void fetchInfo();
  }, [fetchInfo]);

  const pay = async () => {
    if (!token || !info || phase === 'paying') return;
    const value = Number(amount);
    const min = info.limits?.minRupees ?? 10;
    const max = info.limits?.maxRupees ?? 2000;
    if (!Number.isInteger(value) || value < min || value > max) {
      setPayError(`Enter a whole amount between Rs.${min} and Rs.${max}`);
      return;
    }
    setPayError('');
    setPhase('paying');
    try {
      const order = await walletApi.createOrder(token, value);
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
        description: `Wallet deposit${info.inmateName ? ` for ${info.inmateName}` : ''}`,
        handler: (response: RazorpayResponse) => {
          void (async () => {
            try {
              const verified = await walletApi.verify(token, {
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

  const done = async () => {
    setAmount('');
    setResult(null);
    await fetchInfo();
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-neutral-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">{children}</div>
    </div>
  );

  if (phase === 'loading') return shell(<Loading message="Checking your wallet link..." />);

  if (phase === 'invalid' || !info) {
    return shell(
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-full bg-neutral-100 flex items-center justify-center mb-4 text-neutral-500 text-2xl font-bold">
          &#8377;
        </div>
        <h1 className="text-xl font-bold text-neutral-900">Wallet link</h1>
        <p className="text-sm text-neutral-600 mt-3 leading-relaxed">{invalidMsg}</p>
      </div>,
    );
  }

  if (phase === 'success' && result) {
    const chargePaise = Math.max(paidPaise - result.creditedPaise, 0);
    return shell(
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
        <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4 text-white text-2xl font-bold bg-success">
          &#10003;
        </div>
        <h1 className="text-xl font-bold text-neutral-900">Payment successful</h1>
        <p className="text-sm text-neutral-500 mt-1">{info.inmateName}</p>

        <div className="mt-5 p-4 rounded-xl border border-neutral-200 bg-neutral-50 text-left text-sm text-neutral-700 space-y-1.5 font-mono">
          <div className="flex justify-between">
            <span>Paid</span>
            <span>&#8377;{rupees(paidPaise)}</span>
          </div>
          <div className="flex justify-between text-neutral-500">
            <span>Gateway charges</span>
            <span>&#8377;{rupees(chargePaise)}</span>
          </div>
          <div className="flex justify-between font-semibold text-neutral-900 border-t border-neutral-200 pt-1.5">
            <span>Credited</span>
            <span>&#8377;{rupees(result.creditedPaise)}</span>
          </div>
        </div>

        <div className="mt-4 p-4 rounded-xl border border-neutral-200 text-center">
          <p className="text-xs text-neutral-500 uppercase tracking-wide">New balance</p>
          <p className="text-3xl font-extrabold text-success font-mono mt-1">
            &#8377;{result.balance.toLocaleString('en-IN')}
          </p>
        </div>

        <Button variant="primary" size="lg" className="w-full mt-6" onClick={() => void done()}>
          Done
        </Button>
      </div>,
    );
  }

  const min = info.limits?.minRupees ?? 10;
  const max = info.limits?.maxRupees ?? 2000;
  const value = Number(amount);
  const amountValid = Number.isInteger(value) && value >= min && value <= max;

  return shell(
    <div className="bg-white rounded-2xl shadow-xl p-8">
      <div className="text-center">
        <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3 text-white text-2xl font-bold bg-success">
          &#8377;
        </div>
        <h1 className="text-xl font-bold text-neutral-900">Wallet</h1>
        <p className="text-sm text-neutral-500 mt-1">{info.inmateName}</p>
      </div>

      <div className="mt-5 p-4 rounded-xl border border-neutral-200 bg-neutral-50 text-center">
        <p className="text-xs text-neutral-500 uppercase tracking-wide">Current balance</p>
        <p className="text-3xl font-extrabold text-success font-mono mt-1">
          &#8377;{info.balance.toLocaleString('en-IN')}
        </p>
      </div>

      {info.requestedAmount > 0 && (
        <div className="mt-3 p-3 rounded-xl border border-warning/40 bg-warning/10 text-center">
          <p className="text-sm text-neutral-800">
            Requested: <span className="font-semibold font-mono">&#8377;{info.requestedAmount.toLocaleString('en-IN')}</span>
          </p>
          <p className="text-xs text-neutral-600 mt-0.5">Your family member asked for this amount from the kiosk.</p>
        </div>
      )}

      <div className="mt-6">
        <Input
          label="Amount to send (Rs.)"
          value={amount}
          onChange={(v) => {
            setAmount(v.replace(/[^\d]/g, ''));
            setPayError('');
          }}
          type="text"
          inputMode="numeric"
          placeholder={`${min} - ${max}`}
          error={payError || undefined}
          disabled={phase === 'paying'}
        />
        {!payError && (
          <p className="mt-1 text-xs text-neutral-500">
            Between &#8377;{min} and &#8377;{max}. A payment-gateway charge applies; the exact credited amount is
            shown on the receipt and in every wallet transaction.
          </p>
        )}
      </div>

      <Button
        variant="primary"
        size="lg"
        className="w-full mt-5"
        onClick={() => void pay()}
        disabled={phase === 'paying' || !amountValid}
      >
        {phase === 'paying' ? 'Opening payment window...' : amount ? `Pay Online Rs.${value}` : 'Pay Online'}
      </Button>

      <p className="text-center text-xs text-neutral-400 mt-4">
        Powered by Razorpay. Secure payment, credited after gateway charges.
      </p>
    </div>,
  );
}
