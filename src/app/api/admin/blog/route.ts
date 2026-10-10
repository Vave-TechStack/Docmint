import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/security/authorization';
import { validateExternalImageUrl } from '@/lib/security/image-url';
import {
  assertSameOrigin,
  readJsonBody,
  parsePagination,
  cleanString,
  enumValue,
  ValidationError,
} from '@/lib/security/request';

export const dynamic = 'force-dynamic';

const POST_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;

/**
 * `/api/admin/blog` is the marketing CMS.
 *
 * `BlogPost` has NO `organizationId` — every post is global and appears on the
 * public site. A tenant ADMIN was previously able to create, edit and publish
 * platform-wide marketing content (and unpublish/delete existing posts), which
 * is a platform-level capability. All four verbs now require SUPER_ADMIN.
 *
 * Secondary fixes:
 *  - `status` was written straight from the body to the `PostStatus` enum.
 *  - `slug` was derived from an unbounded title and only de-duplicated with
 *    `Date.now()`, so a long/unicode title produced a >200 char slug.
 *  - `content` is stored raw and later rendered as markup, so it is now
 *    length-capped and its tags array validated.
 */
export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip, take } = parsePagination(searchParams, 20);
    const status = enumValue(searchParams.get('status') ?? '', POST_STATUSES);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const [posts, total] = await Promise.all([
      prisma.blogPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.blogPost.count({ where }),
    ]);

    return NextResponse.json({ success: true, data: posts, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    console.error('Admin blog error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch posts' }, { status: 500 });
  }
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 20)
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => cleanString(tag, 40))
    .filter((tag) => tag.length > 0);
}

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);
    const title = cleanString(body.title, 200, { required: true });
    const content = cleanString(body.content, 200_000, { required: true, keepNewlines: true });
    const excerpt = cleanString(body.excerpt, 500, { keepNewlines: true });
    // Validated against the shared host allowlist: `cleanString` only capped the
    // length, so an arbitrary https:// URL could be stored and would be fetched
    // by the browser as soon as the admin UI starts rendering cover images.
    const coverImageCheck = validateExternalImageUrl(body.coverImage, {
      allowEmpty: true,
      field: 'coverImage',
    });
    if (!coverImageCheck.valid) {
      return NextResponse.json(
        { success: false, error: coverImageCheck.reason },
        { status: 400 }
      );
    }
    const coverImage = coverImageCheck.value ?? '';
    const category = cleanString(body.category, 64);
    const tags = readTags(body.tags);

    // An unrecognised status must be rejected, not silently coerced to DRAFT —
    // a typo in the CMS would otherwise publish to the wrong visibility.
    const status = body.status === undefined
      ? 'DRAFT'
      : enumValue(body.status, POST_STATUSES);
    if (!status) {
      return NextResponse.json(
        { success: false, error: `status must be one of ${POST_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // `cleanString` truncates at the cap, which would silently clip a post.
    // Refuse instead so the author knows the body was rejected.
    if (typeof body.content === 'string' && body.content.length > 200_000) {
      return NextResponse.json(
        { success: false, error: 'content exceeds the 200000 character limit' },
        { status: 400 }
      );
    }

    // Base slug is capped so the final `slug-${timestamp}` stays well within a
    // sane URL length even for unicode-heavy titles.
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 120) || 'post';

    let slug = `${base}-${Date.now().toString(36)}`;
    // Guarded uniqueness check so a collision is a retry, not a Prisma P2002 500.
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await prisma.blogPost.findUnique({ where: { slug }, select: { id: true } });
      if (!clash) break;
      slug = `${base}-${Date.now().toString(36)}${attempt}`;
    }

    const post = await prisma.blogPost.create({
      data: {
        title,
        slug,
        content,
        excerpt: excerpt || null,
        coverImage: coverImage || null,
        tags,
        category: category || null,
        status,
        author: cleanString(guard.guard.user.name, 120) || 'Admin',
        ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({ success: true, data: post });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin blog create error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create post' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);
    const id = cleanString(body.id, 64, { required: true });

    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData.title = cleanString(body.title, 200, { required: true });
    if (body.content !== undefined) {
      updateData.content = cleanString(body.content, 200_000, { required: true, keepNewlines: true });
    }
    if (body.excerpt !== undefined) updateData.excerpt = cleanString(body.excerpt, 500, { keepNewlines: true }) || null;
    if (body.coverImage !== undefined) {
      const coverCheck = validateExternalImageUrl(body.coverImage, {
        allowEmpty: true,
        field: 'coverImage',
      });
      if (!coverCheck.valid) {
        return NextResponse.json(
          { success: false, error: coverCheck.reason },
          { status: 400 }
        );
      }
      updateData.coverImage = coverCheck.value ? coverCheck.value : null;
    }
    if (body.tags !== undefined) updateData.tags = readTags(body.tags);
    if (body.category !== undefined) updateData.category = cleanString(body.category, 64) || null;
    if (body.status !== undefined) {
      const status = enumValue(body.status, POST_STATUSES);
      if (!status) {
        return NextResponse.json(
          { success: false, error: `status must be one of ${POST_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.status = status;
      if (status === 'PUBLISHED') updateData.publishedAt = new Date();
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    // Guarded update so a missing id is a 404 rather than a thrown P2025 -> 500.
    const { count } = await prisma.blogPost.updateMany({ where: { id }, data: updateData });
    if (count === 0) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    const post = await prisma.blogPost.findUnique({ where: { id } });
    return NextResponse.json({ success: true, data: post });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin blog update error:', error);
    return NextResponse.json({ success: false, error: 'Failed to update post' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireSuperAdmin(request);
  if (!guard.ok) return guard.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const { searchParams } = new URL(request.url);
    const id = cleanString(searchParams.get('id'), 64, { required: true });

    const { count } = await prisma.blogPost.deleteMany({ where: { id } });
    if (count === 0) {
      return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Post deleted' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Admin blog delete error:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete post' }, { status: 500 });
  }
}
