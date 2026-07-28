'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Plus,
  Search,
  Star,
  Archive,
  Trash2,
  Loader2,
  Clock,
  Copy,
  FolderIcon,
  FolderPlus,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  List as ListIcon,
  Tags,
  X,
  CheckCircle2,
  Edit3,
} from 'lucide-react';

interface FolderData {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  _count: { documents: number };
  parentId?: string | null;
}

interface DocumentType {
  id: string;
  title: string;
  documentType: string;
  status: 'DRAFT' | 'COMPLETED' | 'ARCHIVED' | 'DELETED';
  isFavorite: boolean;
  isArchived: boolean;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  category?: { name: string; slug: string } | null;
  folder?: { name: string } | null;
}

interface TagData {
  name: string;
  count: number;
}

const FILTER_OPTIONS = [
  { key: 'all', label: 'All Documents', icon: FileText },
  { key: 'drafts', label: 'Drafts', icon: Edit3 },
  { key: 'favorites', label: 'Favorites', icon: Star },
  { key: 'archived', label: 'Archived', icon: Archive },
];

export default function DocumentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // State
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('updatedAt');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);

  // Folders
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [showFolders, setShowFolders] = useState(true);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Tags
  const [tags, setTags] = useState<TagData[]>([]);
  const [showTags, setShowTags] = useState(false);

  // Context menu
  // Fetch documents with explicit params to avoid stale closures
  const fetchDocuments = useCallback(async (pageNum?: number) => {
    setIsLoading(true);
    const currentPage = pageNum ?? page;
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('pageSize', '24');
      params.set('sortBy', sortBy);

      if (filter === 'favorites') params.set('isFavorite', 'true');
      if (filter === 'archived') params.set('isArchived', 'true');
      if (filter === 'drafts') params.set('status', 'DRAFT');
      if (selectedFolder) params.set('folderId', selectedFolder);
      if (selectedTag) params.set('tags', selectedTag);
      if (search) params.set('search', search);

      const res = await fetch(`/api/documents?${params}`);
      const data = await res.json();
      if (data.success) {
        setDocuments(data.data || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      }
    } catch {
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, [filter, selectedFolder, selectedTag, search, sortBy, page]);

  // Fetch folders
  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/folders');
      const data = await res.json();
      if (data.success) setFolders(data.data || []);
    } catch { /* ignore */ }
  }, []);

  // Fetch tags
  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/documents/tags');
      const data = await res.json();
      if (data.success) setTags(data.data || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  // Initial data fetch (runs once when session is ready)
  useEffect(() => {
    if (session) {
      fetchFolders();
      fetchTags();
      fetchDocuments(); // This + the filter effect below both fire on mount
    }
  }, [session]);

  // Refetch when filters change (also triggers on mount due to page=1)
  useEffect(() => {
    if (session) fetchDocuments();
  }, [filter, selectedFolder, selectedTag, sortBy, page]);

  // Search debounce (reset to page 1, pass page explicitly)
  useEffect(() => {
    if (!session) return;
    const delay = setTimeout(() => {
      setPage(1);
      fetchDocuments(1); // Pass page=1 explicitly to avoid stale closure
    }, 300);
    return () => clearTimeout(delay);
  }, [search]);

  // ─── Folder Actions ───

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Folder created');
        setNewFolderName('');
        setShowNewFolderInput(false);
        fetchFolders();
      }
    } catch {
      toast.error('Failed to create folder');
    }
  };

  const handleRenameFolder = async (id: string) => {
    if (!renameValue.trim()) return;
    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (res.ok) {
        toast.success('Folder renamed');
        setRenamingFolder(null);
        fetchFolders();
      }
    } catch {
      toast.error('Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Delete folder? Documents will be moved to root.')) return;
    try {
      const res = await fetch(`/api/folders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Folder deleted');
        if (selectedFolder === id) setSelectedFolder(null);
        fetchFolders();
        fetchDocuments();
      }
    } catch {
      toast.error('Failed to delete folder');
    }
  };

  const getFolderDocCount = (id: string) => {
    const folder = folders.find(f => f.id === id);
    return folder?._count?.documents ?? 0;
  };

  // ─── Document Actions ───

  const handleToggleFavorite = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isFavorite: !documents.find(d => d.id === id)?.isFavorite,
        }),
      });
      if (res.ok) {
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, isFavorite: !d.isFavorite } : d));
        toast.success('Favorite toggled');
      }
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleToggleArchive = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isArchived: !documents.find(d => d.id === id)?.isArchived,
        }),
      });
      if (res.ok) {
        setDocuments(prev =>
          prev.map(d => d.id === id ? { ...d, isArchived: !d.isArchived } : d)
        );
        toast.success(documents.find(d => d.id === id)?.isArchived ? 'Unarchived' : 'Archived');
      }
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'POST' });
      if (res.ok) {
        toast.success('Document duplicated');
        fetchDocuments();
      }
    } catch {
      toast.error('Failed to duplicate');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document permanently?')) return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== id));
        setTotal(prev => prev - 1);
        toast.success('Document deleted');
      }
    } catch {
      toast.error('Failed to delete');
    }
  };

  // Guard
  if (status === 'loading') {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const activeFiltersCount = [filter !== 'all', selectedFolder, selectedTag].filter(Boolean).length;

  return (
    <div className="min-h-[calc(100vh-4rem)] flex bg-gray-50/50">
      {/* Left Sidebar - Folders & Tags */}
      <aside className="w-64 border-r border-gray-200 bg-white hidden md:flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">Folders</h2>
            <button
              onClick={() => { setShowNewFolderInput(true); setShowFolders(true); }}
              className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="New Folder"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>
          {showNewFolderInput && (
            <div className="mt-2 flex gap-1">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="flex-1 text-xs rounded-lg border border-gray-300 px-2 py-1.5 focus:ring-1 focus:ring-blue-500"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolderInput(false); }}
                autoFocus
              />
              <button onClick={handleCreateFolder} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }} className="p-1.5 text-gray-400 hover:text-gray-600 rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Folder List */}
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          <button
            onClick={() => setSelectedFolder(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              !selectedFolder ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <FolderIcon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">All Documents</span>
            <span className="ml-auto text-xs text-gray-400">{total}</span>
          </button>

          {folders.map((folder) => (
            <div key={folder.id} className="group">
              {renamingFolder === folder.id ? (
                <div className="flex items-center gap-1 px-3 py-1">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="flex-1 text-xs rounded border border-gray-300 px-2 py-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameFolder(folder.id);
                      if (e.key === 'Escape') setRenamingFolder(null);
                    }}
                    autoFocus
                  />
                  <button onClick={() => handleRenameFolder(folder.id)} className="text-blue-600"><CheckCircle2 className="w-3 h-3" /></button>
                  <button onClick={() => setRenamingFolder(null)} className="text-gray-400"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedFolder(selectedFolder === folder.id ? null : folder.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedFolder === folder.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <FolderOpen className="w-4 h-4 flex-shrink-0" style={{ color: folder.color || '#6B7280' }} />
                  <span className="truncate flex-1 text-left">{folder.name}</span>
                  <span className="text-xs text-gray-400">{getFolderDocCount(folder.id)}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5 ml-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setRenamingFolder(folder.id); setRenameValue(folder.name); }}
                      className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder.id); }}
                      className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </button>
              )}
            </div>
          ))}

          {folders.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">No folders yet</p>
          )}
        </div>

        {/* Tags Section */}
        {tags.length > 0 && (
          <div className="border-t border-gray-100 px-2 py-2">
            <button
              onClick={() => setShowTags(!showTags)}
              className="flex items-center gap-2 px-3 py-2 w-full text-left text-xs font-semibold text-gray-900 uppercase tracking-wider hover:bg-gray-50 rounded-lg"
            >
              {showTags ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Tags className="w-3.5 h-3.5" />
              Tags
            </button>
            {showTags && (
              <div className="mt-1 space-y-0.5">
                {tags.map((tag) => (
                  <button
                    key={tag.name}
                    onClick={() => setSelectedTag(selectedTag === tag.name ? null : tag.name)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      selectedTag === tag.name ? 'bg-purple-50 text-purple-700 font-medium' : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                    <span className="truncate">{tag.name}</span>
                    <span className="ml-auto text-gray-400">{tag.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Documents</h1>
              <p className="text-sm text-gray-500 mt-1">{total} document{total !== 1 ? 's' : ''}</p>
            </div>
            <Link href="/documents/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Document
              </Button>
            </Link>
          </div>

          {/* Search + Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or tag..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="updatedAt">Recently Updated</option>
                <option value="createdAt">Newest</option>
                <option value="title">Name (A-Z)</option>
              </select>
              <div className="hidden sm:flex items-center bg-gray-100 rounded-xl p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <ListIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-2 mb-6">
            {FILTER_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.key}
                  onClick={() => { setFilter(opt.key); setPage(1); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    filter === opt.key
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
            {selectedFolder && (
              <button
                onClick={() => setSelectedFolder(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {folders.find(f => f.id === selectedFolder)?.name || 'Folder'}
                <X className="w-3 h-3 ml-1" />
              </button>
            )}
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700"
              >
                <Tags className="w-3.5 h-3.5" />
                {selectedTag}
                <X className="w-3 h-3 ml-1" />
              </button>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          )}

          {/* Empty State */}
          {!isLoading && documents.length === 0 && (
            <div className="text-center py-20">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No documents found</h3>
              <p className="text-gray-500 mb-6">
                {search ? 'Try a different search term' : 'Create your first document to get started'}
              </p>
              {!search && (
                <Link href="/documents/new">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Document
                  </Button>
                </Link>
              )}
            </div>
          )}

          {/* Grid View */}
          {!isLoading && documents.length > 0 && viewMode === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-blue-200 transition-all duration-200 relative"
                >
                  <Link href={`/documents/${doc.id}/edit`} className="block p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex items-center gap-1">
                        {doc.isFavorite && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                        {doc.isArchived && <Archive className="w-3.5 h-3.5 text-gray-400" />}
                      </div>
                    </div>
                    <h3 className="font-semibold text-gray-900 text-sm group-hover:text-blue-600 transition-colors line-clamp-1">
                      {doc.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">{doc.documentType}</p>
                    <div className="mt-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        doc.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        doc.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' :
                        doc.status === 'ARCHIVED' ? 'bg-gray-100 text-gray-600' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {doc.status}
                      </span>
                    </div>
                  </Link>

                  {/* Tags */}
                  {doc.tags.length > 0 && (
                    <div className="px-5 pb-1 flex flex-wrap gap-1">
                      {doc.tags.slice(0, 3).map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">
                          {tag}
                        </span>
                      ))}
                      {doc.tags.length > 3 && (
                        <span className="text-[10px] text-gray-400">+{doc.tags.length - 3}</span>
                      )}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="px-5 pb-3 flex items-center justify-between text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </span>
                    <span>v{doc.version}</span>
                  </div>

                  {/* Actions */}
                  <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.preventDefault(); handleToggleFavorite(doc.id); }}
                        className={`p-1.5 rounded-lg transition-colors ${
                          doc.isFavorite ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50'
                        }`}
                        title={doc.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star className={`w-3.5 h-3.5 ${doc.isFavorite ? 'fill-amber-400' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); handleToggleArchive(doc.id); }}
                        className={`p-1.5 rounded-lg transition-colors ${
                          doc.isArchived ? 'text-blue-500 hover:bg-blue-50' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                        }`}
                        title={doc.isArchived ? 'Unarchive' : 'Archive'}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); handleDuplicate(doc.id); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-green-500 hover:bg-green-50 transition-colors"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* List View */}
          {!isLoading && documents.length > 0 && viewMode === 'list' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-8"></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Tags</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Updated</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {documents.map((doc) => (
                    <tr
                      key={doc.id}
                      className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/documents/${doc.id}/edit`)}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleFavorite(doc.id); }}
                          className={`transition-colors ${doc.isFavorite ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400'}`}
                        >
                          <Star className={`w-4 h-4 ${doc.isFavorite ? 'fill-amber-400' : ''}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                            <FileText className="w-4 h-4 text-blue-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                            <p className="text-xs text-gray-500">{doc.documentType} · v{doc.version}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          doc.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                          doc.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {doc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex gap-1">
                          {doc.tags.slice(0, 2).map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 hidden sm:table-cell">
                        {new Date(doc.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleArchive(doc.id); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                            title={doc.isArchived ? 'Unarchive' : 'Archive'}
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDuplicate(doc.id); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-green-500 hover:bg-green-50 transition-colors"
                            title="Duplicate"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
              <div className="flex gap-1">
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
              </div>
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


    </div>
  );
}
