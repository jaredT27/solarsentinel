/**
 * Document Parser — Extracts text from uploaded files
 *
 * Supports: PDF, DOCX, XLSX/CSV, JSON, plain text
 *
 * For production PDF parsing, consider:
 *   - pdf-parse (lightweight, used here)
 *   - @anthropic-ai/pdf (if available)
 *   - Unstructured.io API (best for complex tables/layouts)
 *   - Amazon Textract (for scanned documents)
 *
 * Install: npm install pdf-parse
 * For DOCX: npm install mammoth
 */

export interface ParsedDocument {
  filename: string;
  content: string;
  pageCount?: number;
  error?: string;
}

/**
 * Parse a single file buffer into text.
 * Falls back gracefully if a parser isn't installed.
 */
export async function parseDocument(
  filename: string,
  buffer: Buffer
): Promise<ParsedDocument> {
  const ext = filename.toLowerCase().split(".").pop() ?? "";

  try {
    switch (ext) {
      case "pdf":
        return await parsePDF(filename, buffer);
      case "docx":
        return await parseDOCX(filename, buffer);
      case "xlsx":
      case "csv":
        return parseSpreadsheet(filename, buffer, ext);
      case "json":
        return parseJSON(filename, buffer);
      case "txt":
      case "md":
        return { filename, content: buffer.toString("utf-8") };
      default:
        // Attempt plain text
        return { filename, content: buffer.toString("utf-8") };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { filename, content: "", error: `Failed to parse ${filename}: ${msg}` };
  }
}

async function parsePDF(filename: string, buffer: Buffer): Promise<ParsedDocument> {
  try {
    // Use require() to avoid webpack static analysis bundling
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as typeof import("pdf-parse")["default"];
    const data = await pdfParse(buffer);
    return {
      filename,
      content: data.text,
      pageCount: data.numpages,
    };
  } catch {
    // Fallback: note for Claude that this is an unparsed PDF
    return {
      filename,
      content: `[PDF file: ${filename} — ${(buffer.length / 1024).toFixed(0)} KB. To enable PDF parsing: npm install pdf-parse]`,
      error: "pdf-parse not available",
    };
  }
}

async function parseDOCX(filename: string, buffer: Buffer): Promise<ParsedDocument> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth") as typeof import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { filename, content: result.value };
  } catch {
    return {
      filename,
      content: `[DOCX file: ${filename} — ${(buffer.length / 1024).toFixed(0)} KB. Install mammoth for parsing: npm install mammoth]`,
      error: "mammoth not installed",
    };
  }
}

function parseSpreadsheet(filename: string, buffer: Buffer, ext: string): ParsedDocument {
  if (ext === "csv") {
    return { filename, content: buffer.toString("utf-8") };
  }
  // For XLSX, we'd use xlsx/exceljs — for now, note the gap
  return {
    filename,
    content: `[XLSX file: ${filename} — ${(buffer.length / 1024).toFixed(0)} KB. For full parsing, install: npm install xlsx]`,
    error: "xlsx parser not installed",
  };
}

function parseJSON(filename: string, buffer: Buffer): ParsedDocument {
  const raw = buffer.toString("utf-8");
  try {
    // Pretty-print for better Claude comprehension
    const parsed = JSON.parse(raw);
    return { filename, content: JSON.stringify(parsed, null, 2) };
  } catch {
    return { filename, content: raw };
  }
}

/**
 * Parse multiple files in parallel.
 */
export async function parseDocuments(
  files: Array<{ filename: string; buffer: Buffer }>
): Promise<ParsedDocument[]> {
  return Promise.all(files.map((f) => parseDocument(f.filename, f.buffer)));
}
