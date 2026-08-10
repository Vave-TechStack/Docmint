'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
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

  const loadRazorpayScript = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      if (typeof window !== 'undefined' && window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  const handlePayment = useCallback(async () => {
    setState('loading');
    setErrorMsg('');

    try {
      // 1. Load Razorpay SDK
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        setState('error');
        setErrorMsg('Failed to load payment gateway. Please check your internet connection.');
        return;
      }

      // 2. Create order via our backend
      const orderRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, amount }),
      });

      const orderData = await orderRes.json();

      if (!orderData.success) {
        setState('error');
        setErrorMsg(orderData.error || 'Failed to create payment order. Please try again.');
        return;
      }

      const order = orderData.data;

      // 3. Check if Razorpay public key is available
      if (!order.key || order.key.includes('xxxxxxxx')) {
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
        key: order.key,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'DocMint',
        description,
        order_id: order.id,
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

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (err) {
      console.error('Payment error:', err);
      setState('error');
      setErrorMsg('An unexpected error occurred. Please try again.');
      onComplete?.();
    }
  }, [amount, type, description, prefill, onSuccess, onComplete, loadRazorpayScript]);

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
