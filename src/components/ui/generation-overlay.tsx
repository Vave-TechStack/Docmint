'use client';

import { useEffect, useState } from 'react';
import { Loader2, FileText, FileDown } from 'lucide-react';

interface GenerationOverlayProps {
  /** Whether the overlay is visible */
  show: boolean;
  /** File format being generated */
  format?: 'pdf' | 'docx';
  /** Optional custom message */
  message?: string;
}

/**
 * Full-screen overlay shown during PDF/DOCX generation
 * Displays a spinning animation, format icon, and progress messages
 */
export function GenerationOverlay({
  show,
  format = 'pdf',
  message,
}: GenerationOverlayProps) {
  const [step, setStep] = useState(0);
  const steps = [
    'Preparing your document...',
    'Applying formatting...',
    'Generating file...',
    'Almost done...',
  ];

  // Animate through steps while generating
  useEffect(() => {
    if (!show) {
      setStep(0);
      return;
    }
    const interval = setInterval(() => {
      setStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 2500);
    return () => clearInterval(interval);
  }, [show]);

  if (!show) return null;

  const displayMessage = message || steps[step];
  const formatLabel = format.toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300" />

      {/* Card */}
      <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-100 p-8 max-w-sm w-full mx-4 animate-in zoom-in-95 duration-300">
        <div className="flex flex-col items-center text-center">
          {/* Animated spinner */}
          <div className="relative w-20 h-20 mb-6">
            {/* Outer ring */}
            <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
            {/* Spinning segment */}
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-600 border-r-blue-600 animate-spin" />
            {/* Inner icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              {format === 'pdf' ? (
                <FileText className="w-8 h-8 text-blue-600" />
              ) : (
                <FileDown className="w-8 h-8 text-blue-600" />
              )}
            </div>
          </div>

          {/* Format badge */}
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 mb-3">
            {formatLabel}
          </span>

          {/* Status message */}
          <p className="text-sm font-medium text-gray-900 mb-1">
            {displayMessage}
          </p>
          <p className="text-xs text-gray-500">
            Please wait while we generate your document
          </p>

          {/* Progress bar */}
          <div className="w-full mt-6 bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${Math.min((step + 1) / steps.length * 100, 95)}%` }}
            />
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mt-3">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
                  i <= step ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
