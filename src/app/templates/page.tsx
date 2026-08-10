'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { DOCUMENT_CATEGORIES } from '@/lib/utils/constants';
import { getTemplateThumbnail } from '@/lib/utils/image-placeholders';
import {
  Search,
  Plus,
  LayoutGrid,
  List as ListIcon,
  Clock,
  TrendingUp,
  Filter,
  Loader2,
  FileText,
  Users,
  Zap,
  Crown,
  PenTool,
} from 'lucide-react';

interface TemplateListItem {
  id: string;
  name: string;
  slug: string;
  description?: string;
  thumbnail?: string;
  documentCategory: string;
  visibility: 'PUBLIC' | 'PRIVATE' | 'ORGANIZATION' | 'PREMIUM' | 'AI';
  isPremium: boolean;
  usageCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  category?: { name: string; icon: string } | null;
  user?: { name: string; image?: string } | null;
}

// Instant (₹1) = PUBLIC & non-premium → the no-login ₹1 download flow.
// Premium = isPremium flag → subscription-gated downloads.
const VISIBILITY_FILTERS = [
  { value: '', label: 'All Templates', icon: LayoutGrid },
  { value: 'INSTANT', label: 'Instant (₹1)', icon: Zap },
  { value: 'PREMIUM', label: 'Premium', icon: Crown },
  { value: 'PRIVATE', label: 'My Templates', icon: Users },
];

function TemplatesPageContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Read initial category from URL params (e.g. from home page category cards)
  useEffect(() => {
    const cat = searchParams.get('category');
    if (cat) {
      const decoded = decodeURIComponent(cat);
      const known = DOCUMENT_CATEGORIES.find(c => c.name === decoded);
      // Intentional: sync the selected category with the URL param.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (known) setSelectedCategory(known.name);
    }
  }, [searchParams]);
  const [selectedVisibility, setSelectedVisibility] = useState('');
  const [sortBy, setSortBy] = useState('usageCount');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

  // Latest-value ref so the debounced search effect can read the current term
  // without making fetchTemplates (and the effects that depend on it) change
  // on every keystroke — which would defeat the debounce with unthrottled refetches.
  const searchRef = useRef(search);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  const fetchTemplates = useCallback(async (searchTerm?: string, pageNum?: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.set('category', selectedCategory);
      if (selectedVisibility === 'INSTANT') {
        // Instant (₹1): PUBLIC visibility AND explicitly not premium.
        params.set('type', 'PUBLIC');
        params.set('isPremium', 'false');
      } else if (selectedVisibility === 'PREMIUM') {
        // Premium templates keep visibility PUBLIC but carry the isPremium flag.
        params.set('isPremium', 'true');
      } else if (selectedVisibility) {
        params.set('type', selectedVisibility);
      }
      if (searchTerm) params.set('search', searchTerm);
      params.set('sortBy', sortBy);
      params.set('page', String(pageNum ?? page));
      params.set('pageSize', '24');

      const res = await fetch(`/api/templates?${params}`);
      const data = await res.json();
      setTemplates(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedVisibility, sortBy, page]);

  useEffect(() => {
    // Intentional: refetch when filters change (reads the latest search term).
    fetchTemplates(searchRef.current);
  }, [selectedCategory, selectedVisibility, sortBy, page, fetchTemplates]);

  useEffect(() => {
    const delay = setTimeout(() => {
      // Fetch with new page=1 and the latest search term
      setPage(1);
      fetchTemplates(searchRef.current, 1);
    }, 300);
    return () => clearTimeout(delay);
  }, [search, fetchTemplates]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Template Library</h1>
              <p className="text-sm text-gray-500 mt-1">
                {total} template{total !== 1 ? 's' : ''} available
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <ListIcon className="w-4 h-4" />
                </button>
              </div>
              {session && (
                <>
                  <Link href="/payslip-designer">
                    <Button variant="outline">
                      <PenTool className="w-4 h-4 mr-2" />
                      Payslip Designer
                    </Button>
                  </Link>
                  <Link href="/templates/new">
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Template
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="usageCount">Most Popular</option>
                <option value="updatedAt">Recently Updated</option>
                <option value="createdAt">Newest</option>
                <option value="name">Name (A-Z)</option>
              </select>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-3 py-2.5 rounded-xl border text-sm flex items-center gap-2 transition-colors ${
                  showFilters || selectedCategory ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filters
                {(selectedCategory || selectedVisibility) && <span className="w-2 h-2 rounded-full bg-blue-500" />}
              </button>
            </div>
          </div>

          {/* Visibility Pills */}
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
            {VISIBILITY_FILTERS.map((vf) => {
              const Icon = vf.icon;
              return (
                <button
                  key={vf.value}
                  onClick={() => setSelectedVisibility(selectedVisibility === vf.value ? '' : vf.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    selectedVisibility === vf.value
                      ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {vf.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Category Pills + Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Categories */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setSelectedCategory('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              !selectedCategory ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {DOCUMENT_CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => setSelectedCategory(selectedCategory === cat.name ? '' : cat.name)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                selectedCategory === cat.name
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Empty State */}
        {!loading && templates.length === 0 && (
          <div className="text-center py-20">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No templates found</h3>
            <p className="text-gray-500 mb-6">
              {search ? 'Try a different search term' : 'No templates available in this category yet'}
            </p>
            {session && (
              <Link href="/templates/new">
                <Button>Create your first template</Button>
              </Link>
            )}
          </div>
        )}

        {/* Grid View */}
        {!loading && templates.length > 0 && viewMode === 'grid' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {templates.map((template) => (
              <Link
                key={template.id}
                href={`/templates/${template.id}`}
                className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-200 transition-all duration-200"
              >
                {/* Thumbnail — real image or a generated category-branded placeholder */}
                <div className="h-36 relative overflow-hidden">
                  <Image
                    src={template.thumbnail || getTemplateThumbnail(template.name, template.documentCategory)}
                    alt={template.name}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                  {/* Badges — Instant (₹1) vs Premium segregation */}
                  <div className="absolute top-2 right-2 flex gap-1">
                    {template.isPremium ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-semibold shadow-sm">
                        PREMIUM
                      </span>
                    ) : template.visibility === 'PUBLIC' ? (
                      <span className="px-1.5 py-0.5 rounded-md bg-gradient-to-r from-blue-600 to-indigo-500 text-white text-[10px] font-semibold shadow-sm">
                        ₹1 INSTANT
                      </span>
                    ) : null}
                  </div>
                </div>
                {/* Info */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 text-sm group-hover:text-blue-600 transition-colors truncate">
                    {template.name}
                  </h3>
                  {template.description && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{template.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <TrendingUp className="w-3 h-3" />
                      {template.usageCount} uses
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      {new Date(template.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* List View */}
        {!loading && templates.length > 0 && viewMode === 'list' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Uses</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {templates.map((template) => (
                  <tr
                    key={template.id}
                    className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                    onClick={() => window.location.href = `/templates/${template.id}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{template.name}</p>
                          {template.description && (
                            <p className="text-xs text-gray-500 truncate max-w-xs">{template.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                        {template.documentCategory}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {template.isPremium ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 font-medium">
                          Premium
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                          {template.visibility === 'PUBLIC' ? 'Instant ₹1' : 'Private'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{template.usageCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                      {new Date(template.updatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-50 hover:bg-gray-50"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const start = Math.max(1, page - 2);
              const p = start + i;
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium ${
                    p === page ? 'bg-blue-600 text-white' : 'border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-50 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Wrap in Suspense for useSearchParams() SSR compatibility
export default function TemplatesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <svg className="animate-spin w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <p className="text-gray-500">Loading templates...</p>
        </div>
      </div>
    }>
      <TemplatesPageContent />
    </Suspense>
  );
}
