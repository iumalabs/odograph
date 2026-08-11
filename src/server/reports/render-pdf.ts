import { PDFDocument, StandardFonts } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import type { ReportData } from "./maintenance-history-report";

const PAGE_WIDTH = 595.28; // A4, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const BODY_SIZE = 10;
const HEADING_SIZE = 14;
const SUBHEADING_SIZE = 11;
const LINE_HEIGHT = 16;

const NOT_PROVIDED = "not provided";

function formatCost(value: number | null): string {
  return value !== null ? `$${value.toFixed(2)}` : NOT_PROVIDED;
}

function formatOdometer(value: number | null): string {
  return value !== null ? String(value) : NOT_PROVIDED;
}

function formatText(value: string | null): string {
  return value !== null && value !== "" ? value : NOT_PROVIDED;
}

function formatEconomy(value: number | null): string {
  return value !== null ? value.toFixed(2) : NOT_PROVIDED;
}

type Cursor = {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  y: number;
};

function newPage(cursor: Cursor): void {
  cursor.page = cursor.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  cursor.y = PAGE_HEIGHT - MARGIN;
}

/** Adds a new page (pdf-lib has no automatic flow layout, specs/027 plan.md) whenever the next
 * line would overflow the current one — must handle a document with zero rows just as correctly
 * as one with many (FR-009). */
function ensureSpace(cursor: Cursor, needed: number): void {
  if (cursor.y - needed < MARGIN) {
    newPage(cursor);
  }
}

function drawLine(
  cursor: Cursor,
  text: string,
  options: { size?: number; bold?: boolean } = {},
): void {
  const size = options.size ?? BODY_SIZE;
  ensureSpace(cursor, LINE_HEIGHT);
  cursor.page.drawText(text, {
    x: MARGIN,
    y: cursor.y,
    size,
    font: options.bold ? cursor.boldFont : cursor.font,
  });
  cursor.y -= LINE_HEIGHT;
}

/**
 * pdf-lib layout/pagination only — no business logic (specs/027 research.md); every value drawn
 * here comes pre-computed from ReportData, including every "not provided" fallback.
 */
export async function renderReportPdf(data: ReportData): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const cursor: Cursor = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    font,
    boldFont,
    y: 0,
  };
  cursor.y = PAGE_HEIGHT - MARGIN;

  drawLine(cursor, `${data.vehicleName} — Maintenance History Report`, {
    size: HEADING_SIZE,
    bold: true,
  });
  if (data.vehicleSpec) drawLine(cursor, data.vehicleSpec);
  drawLine(cursor, `Generated: ${data.generatedAt}`);
  cursor.y -= LINE_HEIGHT / 2;

  if (data.serviceRows.length === 0 && data.fuelRows.length === 0) {
    drawLine(cursor, "No recorded history yet.");
  } else {
    drawLine(cursor, "Service Records", { size: SUBHEADING_SIZE, bold: true });
    if (data.serviceRows.length === 0) {
      drawLine(cursor, NOT_PROVIDED);
    } else {
      for (const row of data.serviceRows) {
        drawLine(
          cursor,
          `${row.date}  ${row.description}  odometer: ${
            formatOdometer(row.odometerReading)
          }  cost: ${formatCost(row.cost)}`,
        );
      }
    }
    cursor.y -= LINE_HEIGHT / 2;

    drawLine(cursor, "Fuel Records", { size: SUBHEADING_SIZE, bold: true });
    if (data.fuelRows.length === 0) {
      drawLine(cursor, NOT_PROVIDED);
    } else {
      for (const row of data.fuelRows) {
        drawLine(
          cursor,
          `${row.date}  ${formatText(row.station)}  volume: ${row.volume}  cost: ${
            formatCost(row.cost)
          }  odometer: ${row.odometerReading}  economy: ${formatEconomy(row.fuelEconomy)}`,
        );
      }
    }
    cursor.y -= LINE_HEIGHT / 2;
  }

  drawLine(cursor, "Summary", { size: SUBHEADING_SIZE, bold: true });
  drawLine(cursor, `Total maintenance cost: ${formatCost(data.totalMaintenanceCost)}`);
  drawLine(cursor, `Total fuel cost: ${formatCost(data.totalFuelCost)}`);
  drawLine(cursor, `Combined total: ${formatCost(data.totalCost)}`);

  // pdf-lib types save()'s result as Uint8Array<ArrayBufferLike> — at runtime it's always backed
  // by a plain ArrayBuffer (never a SharedArrayBuffer), so this narrows to the stricter type
  // Hono's c.body() expects without copying the bytes.
  const bytes = await doc.save();
  return bytes as Uint8Array<ArrayBuffer>;
}
