import { Document, Packer, Paragraph, TextRun } from 'docx';
import type { TranscriptChunk } from './types';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function buildPlainText(text: string, chunks: TranscriptChunk[], withTimestamps: boolean): string {
  if (withTimestamps && chunks.length > 0) {
    return chunks
      .map(c => `[${formatTime(c.timestamp[0])}]  ${c.text.trim()}`)
      .join('\n');
  }
  return text;
}

export function downloadTxt(text: string, chunks: TranscriptChunk[], baseName: string, withTimestamps: boolean) {
  const content = buildPlainText(text, chunks, withTimestamps);
  triggerDownload(new Blob([content], { type: 'text/plain;charset=utf-8' }), `${baseName}.txt`);
}

export async function downloadDocx(
  text: string,
  chunks: TranscriptChunk[],
  baseName: string,
  withTimestamps: boolean
) {
  const children: Paragraph[] =
    withTimestamps && chunks.length > 0
      ? chunks.map(
          c =>
            new Paragraph({
              children: [
                new TextRun({ text: `[${formatTime(c.timestamp[0])}]  `, bold: true, font: 'Courier New' }),
                new TextRun({ text: c.text.trim() }),
              ],
              spacing: { after: 120 },
            })
        )
      : text
          .split('\n')
          .filter(Boolean)
          .map(line => new Paragraph({ children: [new TextRun(line)] }));

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `${baseName}.docx`);
}
