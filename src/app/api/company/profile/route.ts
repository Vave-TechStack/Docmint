import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserScope } from '@/lib/security/authorization';
import { assertSameOrigin, readJsonBody, cleanString, ValidationError } from '@/lib/security/request';
import { validateImageVariables } from '@/lib/utils/image-upload';
import { validateExternalImageUrl } from '@/lib/security/image-url';

export const dynamic = 'force-dynamic';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FONT_SIZE = /^\d{1,2}$/;

/**
 * `CompanyProfile` holds sensitive, per-organization billing details (bank
 * account number, PAN, GST, CIN) plus values that are interpolated into
 * generated documents and CSS. Every field was previously stored with no
 * length bound, so a multi-megabyte string could be persisted and re-rendered
 * into every generated PDF/DOCX for that tenant.
 *
 * Colors are additionally constrained to a hex literal because they are emitted
 * as CSS `color`/`background` values; a free-text value there would be a CSS
 * injection vector, and `fontSize` is bounded to a plausible point size.
 */
export async function GET(request: NextRequest) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  try {
    const profile = await prisma.companyProfile.findFirst({
      where: {
        organizationId: scope.organizationId,
        userId: scope.userId,
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Return empty profile if none exists yet
    if (!profile) {
      return NextResponse.json({
        success: true,
        data: {
          id: null,
          companyName: scope.guard.user.name || '',
          companyLogo: null,
          companySeal: null,
          authorizedSign: null,
          hrSignature: null,
          directorSignature: null,
          financeSignature: null,
          companyAddress: '',
          companyWebsite: '',
          companyEmail: scope.guard.user.email || '',
          companyPhone: '',
          gstNumber: '',
          panNumber: '',
          cinNumber: '',
          msmeNumber: '',
          bankName: '',
          bankAccount: '',
          bankIfsc: '',
          bankBranch: '',
          upiId: '',
          headerText: '',
          footerText: '',
          termsConditions: '',
          primaryColor: '#2563EB',
          secondaryColor: '#64748B',
          fontFamily: 'Inter',
          fontSize: '12',
        },
      });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('Company profile fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch company profile' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const scope = await requireUserScope(request);
  if (!scope.ok) return scope.response;

  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  try {
    const body = await readJsonBody(request);

    // Enforce the shared image whitelist + size policy on logo/seal/signature fields
    const imageError = validateImageVariables({
      companyLogo: body.companyLogo,
      companyLogoDark: body.companyLogoDark,
      companyLogoLight: body.companyLogoLight,
      companySeal: body.companySeal,
      authorizedSign: body.authorizedSign,
      hrSignature: body.hrSignature,
      directorSignature: body.directorSignature,
      financeSignature: body.financeSignature,
    });
    if (imageError) {
      return NextResponse.json(
        { success: false, error: imageError },
        { status: 400 }
      );
    }

    // `validateImageVariables` only inspects `data:` payloads and explicitly
    // lets remote URLs through, so an arbitrary `https://` logo was accepted
    // here too. These render via `<Image unoptimized>` / raw `<img>`, which
    // bypasses `images.remotePatterns`, so the host allowlist is enforced here.
    const IMAGE_FIELDS = [
      'companyLogo',
      'companyLogoDark',
      'companyLogoLight',
      'companySeal',
      'authorizedSign',
      'hrSignature',
      'directorSignature',
      'financeSignature',
    ] as const;

    const normalizedImages: Record<string, string | null> = {};
    for (const field of IMAGE_FIELDS) {
      if (body[field] === undefined) continue;
      const checked = validateExternalImageUrl(body[field], {
        allowEmpty: true,
        field,
      });
      if (!checked.valid) {
        return NextResponse.json(
          { success: false, error: checked.reason },
          { status: 400 }
        );
      }
      normalizedImages[field] = checked.value ? checked.value : null;
    }

    // Optional text with a hard cap. `null` when absent/blank so the column is
    // cleared rather than filled with an unbounded value.
    const text = (key: string, max: number, keepNewlines = false) =>
      cleanString(body[key], max, { keepNewlines }) || null;

    // Image fields were validated and normalized against the host allowlist
    // above; reuse that value rather than re-reading the raw body, so the
    // persisted string is exactly the one that passed validation.
    const image = (key: string) =>
      Object.prototype.hasOwnProperty.call(normalizedImages, key)
        ? normalizedImages[key]
        : null;

    const primaryColor = cleanString(body.primaryColor, 9) || '#2563EB';
    const secondaryColor = cleanString(body.secondaryColor, 9) || '#64748B';
    if (!HEX_COLOR.test(primaryColor) || !HEX_COLOR.test(secondaryColor)) {
      return NextResponse.json(
        { success: false, error: 'Colors must be hex values like #2563EB' },
        { status: 400 }
      );
    }

    const fontSize = cleanString(body.fontSize, 2) || '12';
    if (!FONT_SIZE.test(fontSize) || Number(fontSize) < 4 || Number(fontSize) > 72) {
      return NextResponse.json(
        { success: false, error: 'fontSize must be between 4 and 72' },
        { status: 400 }
      );
    }

    // Find existing profile within the caller's scope
    const existing = await prisma.companyProfile.findFirst({
      where: {
        organizationId: scope.organizationId,
        userId: scope.userId,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const data = {
      companyName:
        cleanString(body.companyName, 200) || scope.guard.user.name || 'My Company',
      companyLogo: image('companyLogo'),
      companyLogoDark: image('companyLogoDark'),
      companyLogoLight: image('companyLogoLight'),
      companySeal: image('companySeal'),
      authorizedSign: image('authorizedSign'),
      hrSignature: image('hrSignature'),
      directorSignature: image('directorSignature'),
      financeSignature: image('financeSignature'),
      companyAddress: text('companyAddress', 1000, true),
      companyWebsite: text('companyWebsite', 300),
      companyEmail: text('companyEmail', 200) || scope.guard.user.email || null,
      companyPhone: text('companyPhone', 40),
      gstNumber: text('gstNumber', 20),
      panNumber: text('panNumber', 15),
      cinNumber: text('cinNumber', 30),
      msmeNumber: text('msmeNumber', 30),
      bankName: text('bankName', 150),
      bankAccount: text('bankAccount', 40),
      bankIfsc: text('bankIfsc', 20),
      bankBranch: text('bankBranch', 150),
      upiId: text('upiId', 100),
      headerText: text('headerText', 200, true),
      footerText: text('footerText', 500, true),
      termsConditions: text('termsConditions', 5000, true),
      primaryColor,
      secondaryColor,
      fontFamily: cleanString(body.fontFamily, 64) || 'Inter',
      fontSize,
    };

    let profile;
    if (existing) {
      profile = await prisma.companyProfile.update({
        where: { id: existing.id },
        data,
      });
    } else {
      profile = await prisma.companyProfile.create({
        data: {
          ...data,
          organizationId: scope.organizationId,
          userId: scope.userId,
          isDefault: true,
          isActive: true,
        },
      });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error('Company profile update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update company profile' },
      { status: 500 }
    );
  }
}
