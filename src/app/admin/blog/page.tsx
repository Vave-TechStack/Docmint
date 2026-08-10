'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/text-area';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import toast from 'react-hot-toast';
import { FileText, Plus, Loader2, Edit2, Trash2, Eye, EyeOff } from 'lucide-react';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  coverImage?: string;
  status: string;
  category?: string;
  tags: string[];
  author?: string;
  createdAt: string;
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState({ title: '', content: '', excerpt: '', category: '', tags: '' });

  const fetchPosts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/admin/blog?${params}`);
      const data = await res.json();
      if (data.success) setPosts(data.data || []);
    } catch (err) {
      console.error('Blog fetch error:', err);
      toast.error('Failed to load blog posts');
    } finally { setIsLoading(false); }
  }, [statusFilter]);

  // Intentional: fetch on mount/filter change; the callback updates loading + data state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const openNewPost = () => {
    setEditingPost(null);
    setForm({ title: '', content: '', excerpt: '', category: '', tags: '' });
    setShowEditor(true);
  };

  const openEditPost = (post: BlogPost) => {
    setEditingPost(post);
    setForm({
      title: post.title,
      content: post.content,
      excerpt: post.excerpt || '',
      category: post.category || '',
      tags: post.tags?.join(', ') || '',
    });
    setShowEditor(true);
  };

  const handleSave = async (status: string) => {
    if (!form.title || !form.content) {
      toast.error('Title and content are required');
      return;
    }

    try {
      const body = {
        ...(editingPost ? { id: editingPost.id } : {}),
        title: form.title,
        content: form.content,
        excerpt: form.excerpt || undefined,
        category: form.category || undefined,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
        status,
      };

      const res = await fetch('/api/admin/blog', {
        method: editingPost ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(editingPost ? 'Post updated' : 'Post created');
        setShowEditor(false);
        fetchPosts();
      } else {
        toast.error(data.error || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save post');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this post?')) return;
    try {
      const res = await fetch(`/api/admin/blog?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('Post deleted'); fetchPosts(); }
      else toast.error(data.error);
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Blog / CMS</h1>
          <p className="text-gray-500 mt-1">{posts.length} posts</p>
        </div>
        <Button onClick={openNewPost}><Plus className="w-4 h-4 mr-2" />New Post</Button>
      </div>

      <div className="flex gap-2 mb-6">
        {['', 'DRAFT', 'PUBLISHED', 'ARCHIVED'].map((s) => (
          <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s)}>
            {s || 'All'}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
          ) : posts.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {posts.map((post) => (
                <div key={post.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <h3 className="font-medium text-sm">{post.title}</h3>
                      <Badge variant={post.status === 'PUBLISHED' ? 'success' : post.status === 'DRAFT' ? 'warning' : 'secondary'} size="sm">
                        {post.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500">
                      {post.author} &middot; {new Date(post.createdAt).toLocaleDateString()}
                      {post.category && ` &middot; ${post.category}`}
                    </p>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditPost(post)}><Edit2 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(post.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No posts yet</h3>
              <Button className="mt-4" onClick={openNewPost}><Plus className="w-4 h-4 mr-2" />Create First Post</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={showEditor}
        onClose={() => setShowEditor(false)}
        title={editingPost ? 'Edit Post' : 'New Post'}
        size="full"
      >
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          <div className="grid md:grid-cols-2 gap-4">
            <Input label="Category" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} placeholder="e.g. Product Updates" />
            <Input label="Tags (comma separated)" value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} placeholder="ai, documents, templates" />
          </div>
          <Textarea label="Excerpt" value={form.excerpt} onChange={(e) => setForm((p) => ({ ...p, excerpt: e.target.value }))} rows={2} />
          <Textarea label="Content (HTML)" value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} rows={15} className="font-mono text-sm" />
        </div>
        <div className="flex items-center justify-end space-x-3 mt-6">
          <Button variant="outline" onClick={() => setShowEditor(false)}>Cancel</Button>
          <Button variant="secondary" onClick={() => handleSave('DRAFT')}><EyeOff className="w-4 h-4 mr-2" />Save as Draft</Button>
          <Button onClick={() => handleSave('PUBLISHED')}><Eye className="w-4 h-4 mr-2" />Publish</Button>
        </div>
      </Modal>
    </div>
  );
}
