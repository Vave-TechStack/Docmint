'use client';

import React from 'react';
import Image from 'next/image';
import {
  FileText,
  Building2,
  Users,
  Banknote,
  DollarSign,
  Scale,
  Briefcase,
  Megaphone,
  GraduationCap,
  Stethoscope,
  Factory,
  Award,
  ShieldCheck,
  Download,
  Eye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface TemplateThumbnailProps {
  name: string;
  category?: string;
  isPremium?: boolean;
  visibility?: string;
  thumbnailUrl?: string;
  onPreview?: () => void;
  onDownloadSample?: () => void;
  className?: string;
}

const CATEGORY_THEMES: Record<string, { bg: string; border: string; accent: string; text: string; icon: LucideIcon; badgeBg: string }> = {
  'HR Documents': { bg: 'from-blue-500 to-indigo-600', border: 'border-blue-200', accent: 'bg-blue-600', text: 'text-blue-700', icon: Users, badgeBg: 'bg-blue-100 text-blue-800' },
  'Payroll': { bg: 'from-emerald-500 to-teal-600', border: 'border-emerald-200', accent: 'bg-emerald-600', text: 'text-emerald-700', icon: Banknote, badgeBg: 'bg-emerald-100 text-emerald-800' },
  'Finance': { bg: 'from-amber-500 to-orange-600', border: 'border-amber-200', accent: 'bg-amber-600', text: 'text-amber-700', icon: DollarSign, badgeBg: 'bg-amber-100 text-amber-800' },
  'Legal': { bg: 'from-purple-500 to-violet-600', border: 'border-purple-200', accent: 'bg-purple-600', text: 'text-purple-700', icon: Scale, badgeBg: 'bg-purple-100 text-purple-800' },
  'Business': { bg: 'from-pink-500 to-rose-600', border: 'border-pink-200', accent: 'bg-pink-600', text: 'text-pink-700', icon: Briefcase, badgeBg: 'bg-pink-100 text-pink-800' },
  'Marketing': { bg: 'from-orange-500 to-amber-600', border: 'border-orange-200', accent: 'bg-orange-600', text: 'text-orange-700', icon: Megaphone, badgeBg: 'bg-orange-100 text-orange-800' },
  'Resume Builder': { bg: 'from-teal-500 to-cyan-600', border: 'border-teal-200', accent: 'bg-teal-600', text: 'text-teal-700', icon: FileText, badgeBg: 'bg-teal-100 text-teal-800' },
  'Education': { bg: 'from-indigo-500 to-blue-600', border: 'border-indigo-200', accent: 'bg-indigo-600', text: 'text-indigo-700', icon: GraduationCap, badgeBg: 'bg-indigo-100 text-indigo-800' },
  'Medical': { bg: 'from-red-500 to-rose-600', border: 'border-red-200', accent: 'bg-red-600', text: 'text-red-700', icon: Stethoscope, badgeBg: 'bg-red-100 text-red-800' },
  'Manufacturing': { bg: 'from-stone-500 to-zinc-600', border: 'border-stone-200', accent: 'bg-stone-600', text: 'text-stone-700', icon: Factory, badgeBg: 'bg-stone-100 text-stone-800' },
  'Real Estate': { bg: 'from-fuchsia-500 to-purple-600', border: 'border-fuchsia-200', accent: 'bg-fuchsia-600', text: 'text-fuchsia-700', icon: Building2, badgeBg: 'bg-fuchsia-100 text-fuchsia-800' },
  'Certificates': { bg: 'from-amber-600 to-yellow-500', border: 'border-amber-200', accent: 'bg-amber-600', text: 'text-amber-800', icon: Award, badgeBg: 'bg-amber-100 text-amber-900' },
  'General': { bg: 'from-gray-500 to-slate-600', border: 'border-gray-200', accent: 'bg-gray-600', text: 'text-gray-700', icon: FileText, badgeBg: 'bg-gray-100 text-gray-800' },
};

export function TemplateThumbnail({
  name,
  category = 'General',
  isPremium = false,
  visibility = 'PUBLIC',
  thumbnailUrl,
  onPreview,
  onDownloadSample,
  className = '',
}: TemplateThumbnailProps) {
  const theme = CATEGORY_THEMES[category] || CATEGORY_THEMES['General'];
  const CategoryIcon = theme.icon;

  return (
    <div
      className={`group relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${className}`}
    >
      {thumbnailUrl ? (
        <Image src={thumbnailUrl} alt={name} fill unoptimized className="object-cover" />
      ) : (
        /* Realistic A4 Document Visual Mockup */
        <div className="relative flex h-full w-full flex-col justify-between p-3.5 bg-gradient-to-b from-slate-50 via-white to-gray-50 select-none">
          {/* Top Banner / Header Accent */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <div className="flex items-center gap-1.5">
                <div className={`h-5 w-5 rounded-md bg-gradient-to-br ${theme.bg} flex items-center justify-center shadow-xs`}>
                  <CategoryIcon className="h-3 w-3 text-white" />
                </div>
                <span className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">
                  DOCMINT
                </span>
              </div>
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${theme.badgeBg}`}>
                {category}
              </span>
            </div>

            {/* Document Title Header */}
            <div className="pt-1">
              <div className={`h-1.5 w-12 rounded-full ${theme.accent} mb-1.5 opacity-80`} />
              <h4 className="text-xs font-bold text-gray-900 line-clamp-2 leading-tight">
                {name}
              </h4>
            </div>
          </div>

          {/* Skeleton Paragraph / Table Mockup */}
          <div className="my-2 space-y-1.5 rounded-lg bg-gray-50/80 p-2.5 border border-gray-100/80">
            <div className="h-1.5 w-3/4 rounded-full bg-gray-200" />
            <div className="h-1.5 w-full rounded-full bg-gray-150" />
            <div className="h-1.5 w-5/6 rounded-full bg-gray-150" />
            <div className="my-1.5 h-px w-full bg-gray-200/60" />
            <div className="grid grid-cols-3 gap-1 pt-0.5">
              <div className="h-2 rounded bg-gray-200" />
              <div className="h-2 rounded bg-gray-200" />
              <div className="h-2 rounded bg-gray-200" />
            </div>
            <div className="grid grid-cols-3 gap-1">
              <div className="h-1.5 rounded bg-gray-150" />
              <div className="h-1.5 rounded bg-gray-150" />
              <div className="h-1.5 rounded bg-gray-150" />
            </div>
          </div>

          {/* Bottom Footer Mockup (Signature / Seal) */}
          <div className="flex items-end justify-between border-t border-gray-100 pt-2">
            <div className="space-y-1">
              <div className="h-1 w-14 rounded-full bg-gray-300" />
              <div className="h-1 w-10 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center gap-1">
              <ShieldCheck className="h-4 h-4 text-emerald-500 opacity-70" />
              <div className="h-5 w-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-[7px] text-gray-400 font-bold">
                SEAL
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Badges */}
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        {isPremium && (
          <span className="rounded-md bg-gradient-to-r from-amber-500 to-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
            PREMIUM
          </span>
        )}
        {visibility === 'PUBLIC' && !isPremium && (
          <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-sm">
            FREE
          </span>
        )}
      </div>

      {/* Hover Action Overlay */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 bg-slate-900/60 p-4 backdrop-blur-[2px] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        {onPreview && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPreview();
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-xs font-semibold text-gray-900 shadow-md hover:bg-gray-50 transition-colors"
          >
            <Eye className="h-3.5 w-3.5 text-blue-600" />
            Quick Preview
          </button>
        )}
        {onDownloadSample && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDownloadSample();
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white shadow-md hover:bg-blue-700 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Free Sample PDF
          </button>
        )}
      </div>
    </div>
  );
}
