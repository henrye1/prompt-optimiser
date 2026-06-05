import path from 'node:path';
import { MarkItDown } from 'markitdown-ts';

const markitdown = new MarkItDown();

// markitdown-ts keys converters off the extension and rejects some Excel
// variants (e.g. .xlsm) even though they're the same OOXML workbook the .xlsx
// reader handles. Map those to .xlsx so the data is still extracted.
const EXTENSION_ALIASES: Record<string, string> = {
  '.xlsm': '.xlsx',
  '.xltx': '.xlsx',
  '.xltm': '.xlsx',
};

/** Converts an uploaded file buffer (PDF, xlsx, docx, …) to markdown text. */
export async function convertToMarkdown(buffer: Buffer, fileName: string): Promise<string> {
  const raw = (path.extname(fileName) || '.txt').toLowerCase();
  const ext = EXTENSION_ALIASES[raw] ?? raw;
  const result = await markitdown.convertBuffer(buffer, { file_extension: ext });
  return result?.markdown ?? '';
}
