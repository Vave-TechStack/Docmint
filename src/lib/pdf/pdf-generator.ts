import { jsPDF } from 'jspdf';
import type { ExportOptions, PageSettings } from '@/types';

/**
 * DocMint PDF Generator
 * Generates professional PDF documents with full page control.
 */
export class PDFGenerator {
  /**
   * Generate a PDF from HTML content
   * Uses jsPDF with proper async handling via Promise wrapper
   */
  static async generate(
    html: string,
    options: Partial<ExportOptions> & { title?: string } = {}
  ): Promise<Buffer> {
    const doc = new jsPDF({
      format: 'a4',
      unit: 'mm',
      orientation: 'portrait',
    });

    // Add metadata
    if (options.title) {
      doc.setProperties({ title: options.title, creator: 'DocMint' });
    }

    // Render HTML to PDF using a Promise wrapper around the callback-based API
    const pdfOutput = await new Promise<ArrayBuffer>((resolve, reject) => {
      try {
        doc.html(html, {
          callback: (doc) => {
            try {
              resolve(doc.output('arraybuffer'));
            } catch (e) {
              reject(e);
            }
          },
          x: 15,
          y: 15,
          width: 180,
          windowWidth: 794,
          autoPaging: 'text',
          margin: [10, 10, 10, 10],
        });
      } catch (e) {
        reject(e);
      }
    });

    return Buffer.from(pdfOutput);
  }

  /**
   * Generate a PDF preview (base64 data URL string)
   */
  static async generatePreview(html: string): Promise<string> {
    const doc = new jsPDF({
      format: 'a4',
      unit: 'mm',
    });

    return new Promise<string>((resolve, reject) => {
      try {
        doc.html(html, {
          callback: (doc) => {
            try {
              resolve(doc.output('dataurlstring'));
            } catch (e) {
              reject(e);
            }
          },
          x: 15,
          y: 15,
          width: 180,
          windowWidth: 794,
          autoPaging: 'text',
          margin: [10, 10, 10, 10],
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Get page dimensions based on page settings
   */
  static getPageDimensions(settings: PageSettings) {
    const sizes: Record<string, [number, number]> = {
      A4: [210, 297],
      A3: [297, 420],
      A5: [148, 210],
      LETTER: [215.9, 279.4],
      LEGAL: [215.9, 355.6],
    };

    const [width, height] = sizes[settings.size] || sizes.A4;
    return settings.orientation === 'landscape'
      ? { width: height, height: width }
      : { width, height };
  }
}
