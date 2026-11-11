import path from 'node:path';
import sanitizeHtml from 'sanitize-html';
import mammoth from 'mammoth';
import { marked } from 'marked';
import { HttpError } from './errors.ts';

/**
 * Documents are stored as HTML restricted to what the editor can represent.
 * Everything that reaches the database (editor saves and imports) goes through
 * this allowlist, so stored content can never carry scripts, styles or event handlers.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'del',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'a',
];

export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'target', 'rel'], ol: ['start'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    // h4-h6 have no editor equivalent: degrade to h3 rather than dropping the text.
    transformTags: { h4: 'h3', h5: 'h3', h6: 'h3' },
  });
}

export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'] as const;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Plain text: blank lines separate paragraphs, single newlines become line breaks. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function titleFromFilename(filename: string): string {
  const base = path.basename(filename, path.extname(filename)).replace(/[_-]+/g, ' ').trim();
  return (base || 'Imported document').slice(0, 200);
}

/** Converts an uploaded file into sanitized editor HTML. */
export async function importFile(filename: string, buffer: Buffer): Promise<{ title: string; content: string }> {
  const ext = path.extname(filename).toLowerCase();
  let html: string;

  switch (ext) {
    case '.txt':
      html = textToHtml(buffer.toString('utf8'));
      break;
    case '.md':
    case '.markdown':
      html = await marked.parse(buffer.toString('utf8'), { gfm: true });
      break;
    case '.docx': {
      // .docx is a zip archive; reject anything that is not, before handing it to the parser.
      if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
        throw new HttpError(400, 'That file does not look like a valid .docx document');
      }
      try {
        // mammoth drops underline by default; map it explicitly since the editor supports it.
        const result = await mammoth.convertToHtml({ buffer }, { styleMap: ['u => u', 'strike => s'] });
        html = result.value;
      } catch {
        throw new HttpError(400, 'Could not read that .docx file');
      }
      break;
    }
    default:
      throw new HttpError(400, `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`);
  }

  const content = sanitizeContent(html);
  return { title: titleFromFilename(filename), content: content || '<p></p>' };
}
