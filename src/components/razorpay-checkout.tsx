'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { getCspNonce } from '@/lib/security/csp-nonce';
import { Loader2, CreditCard, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color?: string;
    backdrop_color?: string;
  };
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
  };
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
  on: (event: string, handler: () => void) => void;
}

/**
 * How long to wait for `checkout.js` before giving up.
 *
 * 15s is comfortably above a slow-but-working mobile connection and well below
 * the point where a user concludes the button is broken.
 */
const SCRIPT_LOAD_TIMEOUT_MS = 15_000;

interface RazorpayCheckoutProps {
  /** Amount in paise (e.g., ₹9 = 900) */
  amount: number;
  /** Payment type */
  type: 'instant' | 'subscription' | 'renewal';
  /** Human-readable description */
  description: string;
  /** Button variant */
  variant?: 'default' | 'outline' | 'premium' | 'destructive';
  /** Button size */
  size?: 'default' | 'sm' | 'lg';
  /** Optional prefill info */
  prefill?: { name?: string; email?: string; contact?: string };
  /** Called on payment success with payment details */
  onSuccess: (details: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => Promise<void> | void;
  /** Called when payment completes (success or error) */
  onComplete?: () => void;
  /** Custom class name */
  className?: string;
  /** Disable the button */
  disabled?: boolean;
  /** Button label */
  label?: string;
  /** Icon to show */
  icon?: React.ReactNode;
}

export function RazorpayCheckout({
  amount,
  type,
  description,
  variant = 'default',
  size = 'default',
  prefill,
  onSuccess,
  onComplete,
  className = '',
  disabled = false,
  label,
  icon,
}: RazorpayCheckoutProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'processing' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  /**
 * Loads the Razorpay Checkout script once, with an explicit timeout.
 *
 * Two defects this replaces:
 *
 * 1. No timeout. `script.onload` / `script.onerror` only fire if the network
 *    stack eventually settles. A request that hangs — captive portal, silent
 *    packet drop, ad blocker holding the request open — left the promise
 *    pending forever, so the button stayed on "Preparing..." indefinitely with
 *    no error and no way for the user to recover short of a reload. The
 *    timeout rejects, which the caller turns into a real error state.
 *
 * 2. A rejected `loadRazorpayScript()` promise elsewhere in this component
 *    would be an unhandled rejection; the helper below never rejects, so the
 *    `await` in `handlePayment` is always safe.
 *
 * @param nonce optional CSP nonce for the injected tag. A dynamically created
 *   `<script>` is NOT covered by `'strict-dynamic'` trust propagation in every
 *   browser, so under a nonce-based policy it must carry the nonce explicitly.
 *   Sourced from a trusted request context — see `useCspNonce`.
 */
function loadRazorpayScript(nonce?: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    // Guard against a double-injection when the user clicks twice quickly.
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-razorpay-checkout]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    if (nonce) script.nonce = nonce;

    // Without this a hung request pins the promise forever and the UI hangs.
    const timeout = window.setTimeout(() => {
      script.remove();
      resolve(false);
    }, SCRIPT_LOAD_TIMEOUT_MS);

    const finish = (result: boolean) => {
      window.clearTimeout(timeout);
      if (!result) script.remove();
      resolve(result);
    };

    script.addEventListener('load', () => finish(true), { once: true });
    script.addEventListener('error', () => finish(false), { once: true });

    try {
      document.body.appendChild(script);
    } catch {
      finish(false);
    }
  });
}

const handlePayment = useCallback(async () => {
    // Guard against a double submission creating two orders. The button is also
    // disabled while loading/processing, but a fast double-click can still
    // dispatch twice before React re-renders.
    if (state === 'loading' || state === 'processing') return;

    setState('loading');
    setErrorMsg('');

    try {
      // 1. Load Razorpay SDK
      const loaded = await loadRazorpayScript(getCspNonce());
      if (!loaded) {
        setState('error');
        setErrorMsg(
          'Could not reach the payment gateway. Check your connection, then try again. If this keeps happening the payment scripts may be blocked by your browser or network.'
        );
        return;
      }

      // 2. Create order via our backend
      let orderRes: Response;
      try {
        orderRes = await fetch('/api/payments/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, amount }),
        });
      } catch {
        setState('error');
        setErrorMsg('Network error while contacting the server. Please try again.');
        onComplete?.();
        return;
      }

      // A non-JSON error page (proxy 502, crash) would otherwise throw on
      // `.json()` and surface as the generic catch-all below.
      let orderData: Record<string, unknown>;
      try {
        orderData = (await orderRes.json()) as Record<string, unknown>;
      } catch {
        setState('error');
        setErrorMsg('The server returned an unexpected response. Please try again.');
        onComplete?.();
        return;
      }

      if (!orderRes.ok || !orderData.success) {
        setState('error');
        setErrorMsg(
          typeof orderData.error === 'string'
            ? orderData.error
            : 'Failed to create payment order. Please try again.'
        );
        onComplete?.();
        return;
      }

      const order = orderData.data as Record<string, unknown> | undefined;
      if (!order) {
        setState('error');
        setErrorMsg('Failed to create payment order. Please try again.');
        onComplete?.();
        return;
      }

      // 3. Check if Razorpay public key is available
      const orderKey = typeof order.key === 'string' ? order.key : '';
      if (!orderKey || orderKey.includes('xxxxxxxx')) {
        setState('error');
        setErrorMsg(
          'Razorpay is not fully configured. Please set up your Razorpay API keys in the .env file.\n\n' +
            'To fix: Go to Razorpay Dashboard → Settings → API Keys → Reveal Key Secret → add to .env'
        );
        return;
      }

      setState('processing');

      // 4. Open Razorpay Checkout
      const options: RazorpayOptions = {
        key: orderKey,
        amount: typeof order.amount === 'number' ? order.amount : 0,
        currency: typeof order.currency === 'string' ? order.currency : 'INR',
        name: 'DocMint',
        description,
        order_id: String(order.id ?? ''),
        prefill: {
          name: prefill?.name || '',
          email: prefill?.email || '',
          contact: prefill?.contact || '',
        },
        theme: {
          color: '#6366F1',
          backdrop_color: '#00000033',
        },
        handler: async (response) => {
          // NOTE: this callback only reports that the *gateway* completed.
          // It never marks the order paid on its own — the parent handler
          // re-verifies `razorpay_signature` server-side against the Razorpay
          // API before any entitlement is granted. Never trust these values
          // client-side.
          setState('success');
          try {
            await onSuccess(response);
          } catch {
            // Parent handler completed (even if downstream failed)
          } finally {
            onComplete?.();
          }
        },
        modal: {
          ondismiss: () => {
            setState('idle');
            onComplete?.();
          },
          confirm_close: true,
        },
      };

      try {
        const razorpay = new window.Razorpay(options);
        razorpay.open();
      } catch {
        setState('error');
        setErrorMsg('The payment window could not be opened. Please try again.');
        onComplete?.();
      }
    } catch (err) {
      console.error('Payment error:', err);
      setState('error');
      setErrorMsg('An unexpected error occurred. Please try again.');
      onComplete?.();
    }
  }, [amount, type, description, prefill, onSuccess, onComplete, state]);

  const buttonLabel = label || (type === 'instant' ? 'Pay ₹9 & Download' : type === 'subscription' ? 'Pay ₹299 & Subscribe' : 'Pay Now');

  return (
    <div className={className}>
      <Button
        onClick={handlePayment}
        disabled={disabled || state === 'loading' || state === 'processing'}
        variant={state === 'success' ? 'default' : variant}
        size={size}
        className={`w-full transition-all duration-200 ${
          state === 'success' ? '!bg-green-600 hover:!bg-green-700 !text-white' : ''
        } ${state === 'error' ? '!bg-red-50 !text-red-700 !border-red-300 hover:!bg-red-100' : ''}`}
      >
        {state === 'loading' || state === 'processing' ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {state === 'loading' ? 'Preparing...' : 'Processing...'}
          </>
        ) : state === 'success' ? (
          <>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Payment Successful!
          </>
        ) : state === 'error' ? (
          <>
            <AlertTriangle className="w-4 h-4 mr-2" />
            Try Again
          </>
        ) : (
          <>
            {icon || <CreditCard className="w-4 h-4 mr-2" />}
            {buttonLabel}
          </>
        )}
      </Button>

      {state === 'error' && errorMsg && (
        <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-red-800">Payment Error</p>
              <p className="text-xs text-red-600 mt-0.5 whitespace-pre-wrap">{errorMsg}</p>
            </div>
          </div>
          {errorMsg.includes('Razorpay is not fully configured') && (
            <a
              href="https://dashboard.razorpay.com/settings/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Open Razorpay Dashboard
            </a>
          )}
        </div>
      )}
    </div>
  );
}
