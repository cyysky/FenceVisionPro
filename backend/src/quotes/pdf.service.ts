import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { createWriteStream, promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class PdfService {
  constructor(private storage: StorageService) {}

  async generate(quote: any): Promise<string> {
    const filename = `${quote.id}.pdf`;
    const { absPath, relPath } = await this.storage.writeStream('pdfs', filename);
    return new Promise<string>(async (resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = createWriteStream(absPath);
      doc.pipe(stream);

      // Header
      doc.fillColor('#0f172a').fontSize(22).text('Fence Quotation', { align: 'left' });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#475569').text(`Reference: ${quote.reference}`);
      doc.text(`Date: ${new Date(quote.createdAt).toLocaleDateString()}`);
      if (quote.validUntil) doc.text(`Valid until: ${new Date(quote.validUntil).toLocaleDateString()}`);
      doc.moveDown(0.5);

      // Wholesaler block
      doc.fillColor('#0f172a').fontSize(12).text(quote.wholesaler?.name || 'Wholesaler', { continued: false });
      doc.fontSize(9).fillColor('#475569');
      if (quote.wholesaler?.contactEmail) doc.text(quote.wholesaler.contactEmail);
      if (quote.wholesaler?.contactPhone) doc.text(quote.wholesaler.contactPhone);
      doc.moveDown(0.5);

      // Customer block
      doc.fillColor('#0f172a').fontSize(12).text('Prepared for');
      doc.fontSize(10).fillColor('#0f172a').text(quote.customerName);
      doc.fontSize(9).fillColor('#475569');
      doc.text(quote.customerEmail);
      if (quote.customerPhone) doc.text(quote.customerPhone);
      if (quote.projectAddress) doc.text(quote.projectAddress);
      doc.moveDown(1);

      // Render preview if available
      if (quote.renderUrl) {
        try {
          const url = quote.renderUrl.startsWith('/static/')
            ? join(process.env.DATA_DIR || './data', quote.renderUrl.replace('/static/', ''))
            : quote.renderUrl;
          const buf = await fs.readFile(url);
          doc.image(buf, { fit: [480, 240], align: 'center' });
          doc.moveDown(0.5);
        } catch (_) { /* ignore */ }
      }

      // Line items table
      doc.fillColor('#0f172a').fontSize(12).text('Items');
      doc.moveDown(0.3);
      const tableTop = doc.y;
      const colDesc = 50;
      const colQty = 330;
      const colUnit = 390;
      const colTotal = 470;
      doc.fontSize(9).fillColor('#475569');
      doc.text('Description', colDesc, tableTop);
      doc.text('Qty', colQty, tableTop, { width: 50, align: 'right' });
      doc.text('Unit', colUnit, tableTop, { width: 70, align: 'right' });
      doc.text('Total', colTotal, tableTop, { width: 80, align: 'right' });
      doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#cbd5e1').stroke();
      doc.moveDown(0.4);

      doc.fillColor('#0f172a');
      for (const li of quote.lineItems) {
        const y = doc.y;
        const desc = `${li.description}${li.heightOption ? ` (${li.heightOption})` : ''}${li.colorOption ? ` [${li.colorOption}]` : ''}`;
        doc.fontSize(9).text(desc, colDesc, y, { width: 270 });
        doc.text(String(li.quantity), colQty, y, { width: 50, align: 'right' });
        doc.text(`$${Number(li.unitPrice).toFixed(2)}`, colUnit, y, { width: 70, align: 'right' });
        doc.text(`$${Number(li.lineTotal).toFixed(2)}`, colTotal, y, { width: 80, align: 'right' });
        doc.moveDown(0.5);
      }
      doc.moveDown(0.5);

      // Totals
      const rightX = 390;
      doc.fontSize(10).fillColor('#0f172a');
      doc.text(`Subtotal: $${Number(quote.subtotal).toFixed(2)}`, rightX, doc.y, { width: 155, align: 'right' });
      doc.text(`Tax (${Number(quote.taxRate)}%): $${Number(quote.taxAmount).toFixed(2)}`, rightX, doc.y, { width: 155, align: 'right' });
      doc.fontSize(12).text(`Total: $${Number(quote.total).toFixed(2)}`, rightX, doc.y, { width: 155, align: 'right' });

      // Notes
      if (quote.notes) {
        doc.moveDown(2);
        doc.fontSize(10).fillColor('#0f172a').text('Notes');
        doc.fontSize(9).fillColor('#475569').text(quote.notes, { width: 495 });
      }

      // Approval block
      doc.moveDown(2);
      if (quote.approvedSignatureUrl) {
        try {
          const sigPath = join(process.env.DATA_DIR || './data', quote.approvedSignatureUrl.replace('/static/', ''));
          const buf = await fs.readFile(sigPath);
          doc.fontSize(10).fillColor('#0f172a').text('Approved by customer');
          doc.image(buf, { fit: [200, 80] });
          doc.fontSize(8).fillColor('#475569').text(`Signed on ${new Date(quote.approvedAt).toLocaleString()}`);
        } catch (_) { /* ignore */ }
      } else {
        doc.fontSize(10).fillColor('#0f172a').text('Customer signature');
        doc.moveTo(50, doc.y + 30).lineTo(300, doc.y + 30).strokeColor('#cbd5e1').stroke();
      }

      // Footer / terms
      const terms = quote.wholesaler?.template?.termsHtml;
      if (terms) {
        doc.addPage();
        doc.fontSize(10).fillColor('#0f172a').text('Terms & Conditions');
        doc.fontSize(9).fillColor('#475569').text(terms.replace(/<[^>]+>/g, ''), { width: 495 });
      }

      doc.end();
      stream.on('finish', () => resolve(`/static/pdfs/${filename}`));
      stream.on('error', reject);
    });
  }
}
