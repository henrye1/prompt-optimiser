import path from 'node:path';
import { MarkItDown } from 'markitdown-ts';

const markitdown = new MarkItDown();

/** Converts an uploaded file buffer (PDF, xlsx, docx, …) to markdown text. */
export async function convertToMarkdown(buffer: Buffer, fileName: string): Promise<string> {
  const ext = path.extname(fileName) || '.txt';
  const result = await markitdown.convertBuffer(buffer, { file_extension: ext });
  return result?.markdown ?? '';
}
