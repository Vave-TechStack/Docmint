import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let profile = await prisma.companyProfile.findFirst({
      where: {
        organizationId: session.user.organizationId,
        userId: session.user.id,
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
          companyName: session.user.name || '',
          companyLogo: null,
          companySeal: null,
          authorizedSign: null,
          hrSignature: null,
          directorSignature: null,
          financeSignature: null,
          companyAddress: '',
          companyWebsite: '',
          companyEmail: session.user.email || '',
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
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      companyName,
      companyLogo,
      companyLogoDark,
      companyLogoLight,
      companySeal,
      authorizedSign,
      hrSignature,
      directorSignature,
      financeSignature,
      companyAddress,
      companyWebsite,
      companyEmail,
      companyPhone,
      gstNumber,
      panNumber,
      cinNumber,
      msmeNumber,
      bankName,
      bankAccount,
      bankIfsc,
      bankBranch,
      upiId,
      headerText,
      footerText,
      termsConditions,
      primaryColor,
      secondaryColor,
      fontFamily,
      fontSize,
    } = body;

    // Find existing profile
    const existing = await prisma.companyProfile.findFirst({
      where: {
        organizationId: session.user.organizationId,
        userId: session.user.id,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const data = {
      companyName: companyName || session.user.name || 'My Company',
      companyLogo: companyLogo || null,
      companyLogoDark: companyLogoDark || null,
      companyLogoLight: companyLogoLight || null,
      companySeal: companySeal || null,
      authorizedSign: authorizedSign || null,
      hrSignature: hrSignature || null,
      directorSignature: directorSignature || null,
      financeSignature: financeSignature || null,
      companyAddress: companyAddress || null,
      companyWebsite: companyWebsite || null,
      companyEmail: companyEmail || session.user.email || null,
      companyPhone: companyPhone || null,
      gstNumber: gstNumber || null,
      panNumber: panNumber || null,
      cinNumber: cinNumber || null,
      msmeNumber: msmeNumber || null,
      bankName: bankName || null,
      bankAccount: bankAccount || null,
      bankIfsc: bankIfsc || null,
      bankBranch: bankBranch || null,
      upiId: upiId || null,
      headerText: headerText || null,
      footerText: footerText || null,
      termsConditions: termsConditions || null,
      primaryColor: primaryColor || '#2563EB',
      secondaryColor: secondaryColor || '#64748B',
      fontFamily: fontFamily || 'Inter',
      fontSize: fontSize || '12',
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
          organizationId: session.user.organizationId,
          userId: session.user.id,
          isDefault: true,
          isActive: true,
        },
      });
    }

    return NextResponse.json({ success: true, data: profile });
  } catch (error) {
    console.error('Company profile update error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update company profile' },
      { status: 500 }
    );
  }
}
