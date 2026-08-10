'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Download, Zap, Sparkles, FileText, Loader2 } from 'lucide-react';
import { getTemplateThumbnail } from '@/lib/utils/image-placeholders';

interface PublicTemplate {
  id: string;
  name: string;
  slug: string;
  description?: string;
  documentCategory?: string;
  category?: string;
  thumbnail?: string;
}

export default function InstantDownloadPage() {
  const [templates, setTemplates] = useState<PublicTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch('/api/templates?type=PUBLIC&isPremium=false&pageSize=50');
        const data = await res.json();
        if (data.success) {
          setTemplates(data.data || []);
          const cats = [...new Set(data.data.map((t: PublicTemplate) => t.documentCategory || t.category))] as string[];
          setCategories(cats);
        }
      } catch (err) {
        console.error('Failed to load templates:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTemplates();
  }, []);

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || (t.documentCategory || t.category) === category;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 to-purple-700 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Badge variant="secondary" size="lg" className="mb-4 bg-white/20 text-white border-0">
            <Zap className="w-4 h-4 mr-1" />
            No Login Required
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Instant Document Download
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl mx-auto mb-8">
            Choose a template, fill the form, pay ₹9, and download your document instantly. No signup needed.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="flex items-center space-x-2 text-blue-100">
              <FileText className="w-5 h-5" />
              <span>{templates.length > 0 ? `${templates.length} Templates` : '200+ Templates'}</span>
            </div>
            <div className="flex items-center space-x-2 text-blue-100">
              <Download className="w-5 h-5" />
              <span>PDF & DOCX</span>
            </div>
            <div className="flex items-center space-x-2 text-blue-100">
              <Sparkles className="w-5 h-5" />
              <span>AI Powered</span>
            </div>
          </div>
        </div>
      </section>

      {/* Search & Filters */}
      <section className="border-b border-gray-200 bg-white sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              <Button
                variant={category === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategory('all')}
              >
                All
              </Button>
              {categories.map((cat) => (
                <Button
                  key={cat}
                  variant={category === cat ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Template Grid */}
      <section className="py-8 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : filteredTemplates.length > 0 ? (
            <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredTemplates.map((template) => (
                <Link key={template.id} href={`/instant/${template.slug}`}>
                  <Card hover className="overflow-hidden">
                    <div className="aspect-[3/4] relative">
                      <Image
                        src={template.thumbnail || getTemplateThumbnail(template.name, template.documentCategory || 'General')}
                        alt={template.name}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-sm mb-1">{template.name}</h3>
                      <p className="text-xs text-gray-500 mb-3 line-clamp-2">{template.description}</p>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" size="sm">{template.documentCategory || template.category}</Badge>
                        <span className="text-xs font-medium text-blue-600">₹9</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
              <p className="text-gray-500">Try a different search or category</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
