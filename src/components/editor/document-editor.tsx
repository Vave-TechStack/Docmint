'use client';

import { useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { SYSTEM_PLACEHOLDERS } from '@/lib/utils/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Table as TableIcon,
  Image as ImageIcon,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Undo,
  Redo,
  Plus,
  Braces,
  Settings2,
  QrCode,
} from 'lucide-react';

interface DocumentEditorProps {
  content?: string;
  onChange?: (html: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

export function DocumentEditor({ content = '', onChange, onSave, readOnly = false }: DocumentEditorProps) {
  const [showPlaceholderPanel, setShowPlaceholderPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrData, setQrData] = useState('');
  const [pageSize, setPageSize] = useState('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [marginTop, setMarginTop] = useState(20);
  const [marginBottom, setMarginBottom] = useState(20);
  const [marginLeft, setMarginLeft] = useState(15);
  const [marginRight, setMarginRight] = useState(15);
  const [watermark, setWatermark] = useState('');
  const [showHeader, setShowHeader] = useState(true);
  const [showFooter, setShowFooter] = useState(true);
  const [showPageNumbers, setShowPageNumbers] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight,
      Placeholder.configure({ placeholder: 'Start typing or insert placeholders...' }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  const insertPlaceholder = useCallback(
    (key: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(`{{${key}}}`).run();
      setShowPlaceholderPanel(false);
    },
    [editor]
  );

  const addImage = useCallback(
    (url: string) => {
      if (!editor) return;
      editor.chain().focus().setImage({ src: url }).run();
    },
    [editor]
  );

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !editor) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        editor.chain().focus().setImage({ src: dataUrl }).run();
      };
      reader.readAsDataURL(file);
    },
    [editor]
  );

  const insertQRCode = useCallback(() => {
    if (!editor || !qrData) return;
    const qrHtml = `<div style="text-align:center;padding:10px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}" alt="QR Code" style="max-width:150px;" /></div>`;
    editor.chain().focus().insertContent(qrHtml).run();
    setShowQRModal(false);
    setQrData('');
  }, [editor, qrData]);

  const insertTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  const addLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  const ToolbarButton = ({ onClick, active, children, title }: { onClick: () => void; active?: boolean; children: React.ReactNode; title?: string }) => (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  );

  const Divider = () => <div className="w-px h-6 bg-gray-200 mx-1" />;

  if (!editor) return null;

  return (
    <div className="flex h-full">
      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center flex-wrap gap-0.5 p-2 border-b border-gray-200 bg-white sticky top-0 z-10">
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
            <Undo className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
            <Redo className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
            <Bold className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
            <Italic className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Underline">
            <UnderlineIcon className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
            <Strikethrough className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
            <Heading1 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
            <Heading2 className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
            <Heading3 className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet List">
            <List className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered List">
            <ListOrdered className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">
            <Quote className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code Block">
            <Code className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Align Left">
            <AlignLeft className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Center">
            <AlignCenter className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Align Right">
            <AlignRight className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton onClick={insertTable} title="Insert Table">
            <TableIcon className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => fileInputRef.current?.click()} title="Insert Image">
            <ImageIcon className="w-4 h-4" />
          </ToolbarButton>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <ToolbarButton onClick={addLink} active={editor.isActive('link')} title="Add Link">
            <LinkIcon className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => setShowQRModal(true)} title="Insert QR Code">
            <QrCode className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Highlight">
            <Highlighter className="w-4 h-4" />
          </ToolbarButton>

          <Divider />

          <ToolbarButton onClick={() => setShowPlaceholderPanel(!showPlaceholderPanel)} active={showPlaceholderPanel} title="Insert Placeholder">
            <Braces className="w-4 h-4" />
          </ToolbarButton>
          <ToolbarButton onClick={() => setShowSettings(!showSettings)} active={showSettings} title="Page Settings">
            <Settings2 className="w-4 h-4" />
          </ToolbarButton>
        </div>

        {/* Editor Canvas */}
        <div className="flex-1 overflow-y-auto bg-gray-100 p-8">
          <div
            className="bg-white shadow-lg mx-auto transition-all"
            style={{
              width: pageSize === 'A4' ? (orientation === 'portrait' ? '210mm' : '297mm') : '210mm',
              minHeight: orientation === 'portrait' ? '297mm' : '210mm',
              padding: `${marginTop}mm ${marginRight}mm ${marginBottom}mm ${marginLeft}mm`,
              backgroundColor: '#fff',
            }}
          >
            {showHeader && (
              <div className="pb-4 mb-4 border-b border-gray-300 text-xs text-gray-500 text-center">
                Document Header — Company Name | Page 1
              </div>
            )}
            <EditorContent editor={editor} className="prose prose-sm max-w-none" />
            {showFooter && (
              <div className="pt-4 mt-4 border-t border-gray-300 text-xs text-gray-500 text-center">
                {showPageNumbers ? '— Page 1 —' : 'Document Footer'}
              </div>
            )}
            {watermark && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-10 text-6xl font-bold text-gray-400 rotate-[-30deg]">
                {watermark}
              </div>
            )}
          </div>
        </div>


      </div>

      {/* Right Sidebar - Placeholder Panel */}
      {showPlaceholderPanel && (
        <div className="w-72 border-l border-gray-200 bg-white p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
            <Braces className="w-4 h-4 mr-2 text-blue-500" />
            Insert Placeholder
          </h3>
          <div className="space-y-1">
            <p className="text-xs text-gray-500 mb-2">Company Fields</p>
            {['CompanyName', 'CompanyLogo', 'CompanySeal', 'CompanyAddress', 'CompanyPhone', 'CompanyEmail', 'CompanyWebsite', 'GST', 'PAN', 'CIN', 'MSME'].map((key) => (
              <button
                key={key}
                onClick={() => insertPlaceholder(key)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors font-mono text-xs"
              >
                {`{{${key}}}`}
              </button>
            ))}
            <p className="text-xs text-gray-500 mt-4 mb-2">Employee Fields</p>
            {['EmployeeName', 'EmployeeID', 'Department', 'Designation', 'JoiningDate', 'Salary', 'Manager'].map((key) => (
              <button
                key={key}
                onClick={() => insertPlaceholder(key)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors font-mono text-xs"
              >
                {`{{${key}}}`}
              </button>
            ))}
            <p className="text-xs text-gray-500 mt-4 mb-2">Document Fields</p>
            {['InvoiceNumber', 'QuotationNumber', 'DocumentNumber', 'CurrentDate', 'CurrentYear', 'AuthorizedSignature', 'HRSignature', 'QRCode', 'Barcode', 'Watermark'].map((key) => (
              <button
                key={key}
                onClick={() => insertPlaceholder(key)}
                className="w-full text-left px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors font-mono text-xs"
              >
                {`{{${key}}}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Right Sidebar - Page Settings */}
      {showSettings && (
        <div className="w-72 border-l border-gray-200 bg-white p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
            <Settings2 className="w-4 h-4 mr-2 text-blue-500" />
            Page Settings
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Page Size</label>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="A4">A4 (210 × 297mm)</option>
                <option value="A3">A3 (297 × 420mm)</option>
                <option value="A5">A5 (148 × 210mm)</option>
                <option value="LETTER">Letter (216 × 279mm)</option>
                <option value="LEGAL">Legal (216 × 356mm)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Orientation</label>
              <div className="flex space-x-2">
                <button
                  onClick={() => setOrientation('portrait')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-all ${
                    orientation === 'portrait' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  Portrait
                </button>
                <button
                  onClick={() => setOrientation('landscape')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm border transition-all ${
                    orientation === 'landscape' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  Landscape
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Margins (mm)</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Top</label>
                  <input type="number" value={marginTop} onChange={(e) => setMarginTop(Number(e.target.value))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Bottom</label>
                  <input type="number" value={marginBottom} onChange={(e) => setMarginBottom(Number(e.target.value))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Left</label>
                  <input type="number" value={marginLeft} onChange={(e) => setMarginLeft(Number(e.target.value))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Right</label>
                  <input type="number" value={marginRight} onChange={(e) => setMarginRight(Number(e.target.value))} className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Header</span>
                <input type="checkbox" checked={showHeader} onChange={(e) => setShowHeader(e.target.checked)} className="rounded" />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Footer</span>
                <input type="checkbox" checked={showFooter} onChange={(e) => setShowFooter(e.target.checked)} className="rounded" />
              </label>
              <label className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Page Numbers</span>
                <input type="checkbox" checked={showPageNumbers} onChange={(e) => setShowPageNumbers(e.target.checked)} className="rounded" />
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Watermark Text</label>
              <input
                type="text"
                value={watermark}
                onChange={(e) => setWatermark(e.target.value)}
                placeholder="e.g. CONFIDENTIAL"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowQRModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Insert QR Code</h3>
            <Input
              label="Enter data for QR code"
              value={qrData}
              onChange={(e) => setQrData(e.target.value)}
              placeholder="https://example.com or any text"
            />
            <div className="flex justify-end space-x-2 mt-4">
              <Button variant="outline" onClick={() => setShowQRModal(false)}>Cancel</Button>
              <Button onClick={insertQRCode} disabled={!qrData}>Insert QR Code</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
