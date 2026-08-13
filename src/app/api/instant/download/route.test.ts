import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the document pipeline so no real HTML/DOCX generation or DB lookups
// happen; the test only exercises the route's gating and flow.
const { engineMocks, templateMocks, docxMocks, prismaMocks } = vi.hoisted(() => ({
  engineMocks: {
    generateFromTemplate: vi.fn(),
    wrapStyledHtml: vi.fn((html: string) => html),
    extractBodyContent: vi.fn((html: string) => html),
  },
  templateMocks: {
    resolveTemplateWithFallback: vi.fn(),
  },
  docxMocks: {
    generate: vi.fn(),
  },
  prismaMocks: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@/lib/engine/document-engine', () => ({
  DocumentEngine: { generateFromTemplate: engineMocks.generateFromTemplate },
  wrapStyledHtml: engineMocks.wrapStyledHtml,
  extractBodyContent: engineMocks.extractBodyContent,
}));
vi.mock('@/lib/data/sample-templates', () => ({
  resolveTemplateWithFallback: templateMocks.resolveTemplateWithFallback,
}));
vi.mock('@/lib/docx/docx-generator', () => ({
  DOCXGenerator: { generate: docxMocks.generate },
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { payment: prismaMocks },
}));

import { POST } from './route';
import { PaymentService } from '@/lib/payment/razorpay';

const FAKE_TEMPLATE = {
  id: 'tpl_1',
  name: 'Test Template',
  slug: 'test-template',
  htmlTemplate: '<html><body>{{CompanyName}}</body></html>',
  isPremium: false,
};

const VALID_PAYLOAD = {
  templateId: 'tpl_1',
  variables: { CompanyName: 'Acme Corp' },
  format: 'pdf',
  paymentId: 'pay_1',
  orderId: 'order_1',
  signature: 'sig_1',
};

// Unique client IP per request so the in-memory per-IP rate limiter
// (10/min) can never trip across tests in this file.
let ipSeed = 0;
function nextIp(): string {
  ipSeed += 1;
  return `10.1.0.${(ipSeed % 250) + 1}`;
}

function post(body: unknown): Promise<Response> {
  const request = new NextRequest('http://localhost:3000/api/instant/download', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() },
    body: JSON.stringify(body),
  });
  return POST(request);
}

describe('POST /api/instant/download', () => {
  let verifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // resetAllMocks clears call history AND implementations on both vi.fn()
    // hoisted mocks and spies, so no state can leak between tests.
    vi.resetAllMocks();
    verifySpy = vi.spyOn(PaymentService, 'verifyInstantDownloadPayment');
    // Default: a fresh payment that hasn't been consumed and whose webhook
    // already recorded it (normal successful flow).
    prismaMocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects requests missing payment fields with 400 before any work happens', async () => {
    const res = await post({ templateId: 'tpl_1', variables: {}, format: 'pdf' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Missing required fields' });
    expect(verifySpy).not.toHaveBeenCalled();
    expect(templateMocks.resolveTemplateWithFallback).not.toHaveBeenCalled();
    expect(engineMocks.generateFromTemplate).not.toHaveBeenCalled();
  });

  it('rejects a tampered payment signature with 400 and never generates the document', async () => {
    verifySpy.mockResolvedValue(false);
    const res = await post({ ...VALID_PAYLOAD, signature: 'forged-signature' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ success: false, error: 'Payment verification failed' });
    // Prove the rejection came from verification itself (gate actually ran)
    expect(verifySpy).toHaveBeenCalledWith('order_1', 'pay_1', 'forged-signature');
    // ...and that the payment gate fails BEFORE template resolution and document generation
    expect(templateMocks.resolveTemplateWithFallback).not.toHaveBeenCalled();
    expect(engineMocks.generateFromTemplate).not.toHaveBeenCalled();
    expect(docxMocks.generate).not.toHaveBeenCalled();
  });

  it('returns 500 when verification itself throws (outer catch)', async () => {
    verifySpy.mockRejectedValue(new Error('razorpay down'));
    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to generate document');
    expect(engineMocks.generateFromTemplate).not.toHaveBeenCalled();
  });

  it('generates a PDF document for a verified payment and consumes it once', async () => {
    verifySpy.mockResolvedValue(true);
    templateMocks.resolveTemplateWithFallback.mockResolvedValue(FAKE_TEMPLATE);
    engineMocks.generateFromTemplate.mockResolvedValue('<html>Acme Corp</html>');

    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual(
      expect.objectContaining({ title: 'Test Template', slug: 'test-template', format: 'pdf' })
    );
    expect(verifySpy).toHaveBeenCalledWith('order_1', 'pay_1', 'sig_1');
    // The payment row must be atomically marked used.
    expect(prismaMocks.updateMany).toHaveBeenCalledWith({
      where: { razorpayPaymentId: 'pay_1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(templateMocks.resolveTemplateWithFallback).toHaveBeenCalledWith('tpl_1');
    expect(engineMocks.generateFromTemplate).toHaveBeenCalledWith(FAKE_TEMPLATE, {
      CompanyName: 'Acme Corp',
    });
  });

  it('rejects a replayed payment (already consumed) with 409 and no document', async () => {
    verifySpy.mockResolvedValue(true);
    prismaMocks.updateMany.mockResolvedValue({ count: 0 });
    prismaMocks.findUnique.mockResolvedValue({ usedAt: new Date() });
    templateMocks.resolveTemplateWithFallback.mockResolvedValue(FAKE_TEMPLATE);

    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('already been used');
    expect(engineMocks.generateFromTemplate).not.toHaveBeenCalled();
  });

  it('records + consumes the payment when the webhook has not landed yet', async () => {
    verifySpy.mockResolvedValue(true);
    prismaMocks.updateMany.mockResolvedValue({ count: 0 });
    prismaMocks.findUnique.mockResolvedValue(null);
    prismaMocks.create.mockResolvedValue({});
    templateMocks.resolveTemplateWithFallback.mockResolvedValue(FAKE_TEMPLATE);

    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(200);
    expect(prismaMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          razorpayOrderId: 'order_1',
          razorpayPaymentId: 'pay_1',
          status: 'SUCCESS',
          paymentType: 'INSTANT_DOWNLOAD',
          usedAt: expect.any(Date),
        }),
      })
    );
    expect(engineMocks.generateFromTemplate).toHaveBeenCalled();
  });

  it('rejects when two requests race to consume the same payment', async () => {
    verifySpy.mockResolvedValue(true);
    prismaMocks.updateMany.mockResolvedValue({ count: 0 });
    prismaMocks.findUnique.mockResolvedValue(null);
    prismaMocks.create.mockRejectedValue(new Error('Unique constraint failed'));

    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(409);
    expect(engineMocks.generateFromTemplate).not.toHaveBeenCalled();
  });

  it('returns a DOCX binary for a verified docx payment', async () => {
    verifySpy.mockResolvedValue(true);
    templateMocks.resolveTemplateWithFallback.mockResolvedValue(FAKE_TEMPLATE);
    docxMocks.generate.mockResolvedValue(Buffer.from('PK test docx'));

    const res = await post({ ...VALID_PAYLOAD, format: 'docx' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('openxmlformats');
    expect(docxMocks.generate).toHaveBeenCalledTimes(1);
    expect(engineMocks.generateFromTemplate).toHaveBeenCalledWith(FAKE_TEMPLATE, {
      CompanyName: 'Acme Corp',
    });
  });

  it('rejects image data in a non-image field with 400 before payment verification', async () => {
    const res = await post({
      ...VALID_PAYLOAD,
      variables: { CompanyName: 'data:image/png;base64,iVBORw0KGgo=' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('logo, signature');
    expect(verifySpy).not.toHaveBeenCalled();
    expect(engineMocks.generateFromTemplate).not.toHaveBeenCalled();
  });

  it('returns 404 when the template cannot be resolved', async () => {
    verifySpy.mockResolvedValue(true);
    templateMocks.resolveTemplateWithFallback.mockResolvedValue(null);

    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('Template not found');
    expect(engineMocks.generateFromTemplate).not.toHaveBeenCalled();
  });

  it('blocks premium templates from the instant flow with 403', async () => {
    verifySpy.mockResolvedValue(true);
    templateMocks.resolveTemplateWithFallback.mockResolvedValue({ ...FAKE_TEMPLATE, isPremium: true });

    const res = await post(VALID_PAYLOAD);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('Premium');
    expect(engineMocks.generateFromTemplate).not.toHaveBeenCalled();
  });
});
