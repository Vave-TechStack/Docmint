'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { ALLOWED_IMAGE_TYPES_ACCEPT, IMAGE_UPLOAD_MAX_MB } from '@/lib/utils/constants';
import { validateImageUpload } from '@/lib/utils/image-upload';
import type { CustomSectionField } from '@/lib/utils/custom-sections';
import { Image as ImageIcon, Plus, X } from 'lucide-react';

interface CustomContentCardProps {
  logo: string;
  onLogoChange: (dataUrl: string) => void;
  header: string;
  onHeaderChange: (value: string) => void;
  footer: string;
  onFooterChange: (value: string) => void;
  fields: CustomSectionField[];
  onFieldsChange: (fields: CustomSectionField[]) => void;
}

/**
 * "Add Custom Content" — lets users add their own logo, a header/footer line
 * and any extra text fields. Used by the template fill-in form and the ₹1
 * instant download form so both flows behave identically. Controlled: the
 * parent owns the values (they feed the preview/download injection).
 */
export function CustomContentCard({
  logo,
  onLogoChange,
  header,
  onHeaderChange,
  footer,
  onFooterChange,
  fields,
  onFieldsChange,
}: CustomContentCardProps) {
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');

  const handleLogoUpload = (file: File) => {
    const validationError = validateImageUpload(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      onLogoChange((e.target?.result as string) || '');
    };
    reader.onerror = () => toast.error('Failed to read image');
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Add Custom Content</h3>
      <p className="text-xs text-gray-500 mb-4">
        Add your logo, a header/footer line, or any extra text fields you need — they appear in
        the preview and in the downloaded document.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Logo upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Logo (optional)</label>
          {logo ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element -- base64 data-URL upload */}
              <img
                src={logo}
                alt="Custom logo"
                className="max-h-20 rounded-lg border border-gray-200 object-contain bg-gray-50"
              />
              <button
                type="button"
                onClick={() => onLogoChange('')}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 shadow-sm transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all duration-200 group">
              <ImageIcon className="w-6 h-6 text-gray-300 group-hover:text-blue-500 transition-colors" />
              <p className="text-[11px] text-gray-400 group-hover:text-blue-500 transition-colors mt-1">Upload Logo</p>
              <p className="text-[10px] text-gray-300">PNG, JPEG, WEBP, SVG or GIF (max {IMAGE_UPLOAD_MAX_MB}MB)</p>
              <input
                type="file"
                accept={ALLOWED_IMAGE_TYPES_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        {/* Header text */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Header Text (optional)</label>
          <input
            type="text"
            value={header}
            onChange={(e) => onHeaderChange(e.target.value)}
            placeholder="e.g. Approved by Management"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      {/* Footer text */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text (optional)</label>
        <input
          type="text"
          value={footer}
          onChange={(e) => onFooterChange(e.target.value)}
          placeholder="e.g. This is a computer-generated document"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {/* Extra fields */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Extra Fields</label>
        <div className="space-y-2">
          {fields.map((field, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                type="text"
                value={field.label}
                onChange={(e) =>
                  onFieldsChange(fields.map((f, i) => (i === idx ? { ...f, label: e.target.value } : f)))
                }
                placeholder="Label"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={field.value}
                onChange={(e) =>
                  onFieldsChange(fields.map((f, i) => (i === idx ? { ...f, value: e.target.value } : f)))
                }
                placeholder="Value"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => onFieldsChange(fields.filter((_, i) => i !== idx))}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="New field label"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Value"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!newLabel.trim() || !newValue.trim()) {
                  toast.error('Enter both a label and a value');
                  return;
                }
                onFieldsChange([...fields, { label: newLabel.trim(), value: newValue.trim() }]);
                setNewLabel('');
                setNewValue('');
              }}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
