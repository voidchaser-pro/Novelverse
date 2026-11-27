import JSZip from 'jszip';
import type { EpubMetadata, EpubChapter } from '@/types';

/**
 * Extracts metadata, cover image, and chapter info from an EPUB file.
 * EPUB files are ZIP archives containing XHTML content, OPF metadata,
 * and optional cover images.
 */
export async function extractEpubMetadata(file: File | ArrayBuffer): Promise<EpubMetadata> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  const zip = await JSZip.loadAsync(buffer);

  // Find the OPF (package document) — it's listed in container.xml
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('Invalid EPUB: missing container.xml');
  }

  const containerXml = await containerFile.async('string');
  const opfPath = parseContainerXml(containerXml);
  if (!opfPath) {
    throw new Error('Invalid EPUB: could not find OPF path in container.xml');
  }

  const opfFile = zip.file(opfPath);
  if (!opfFile) {
    throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);
  }

  const opfXml = await opfFile.async('string');
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // Parse metadata from OPF
  const metadata = parseOpfMetadata(opfXml);

  // Extract cover image
  const coverHref = parseCoverHref(opfXml, metadata);
  let coverDataUrl: string | null = null;

  if (coverHref) {
    const coverPath = resolvePath(opfDir, coverHref);
    const coverFile = zip.file(coverPath);
    if (coverFile) {
      const coverBufferResult = await coverFile.async('arraybuffer');
      const coverBlob = new Blob([coverBufferResult], { type: getMimeType(coverPath) });
      coverDataUrl = await blobToDataUrl(coverBlob);
    }
  }

  // Fallback: scan for any image in the zip that looks like a cover
  if (!coverDataUrl) {
    coverDataUrl = await findCoverImageFallback(zip, opfDir, opfXml);
  }

  // Extract chapter (spine) info
  const chapters = await extractChapters(zip, opfXml, opfDir);

  return {
    title: metadata.title,
    author: metadata.author,
    description: metadata.description || null,
    coverDataUrl,
    chapters,
  };
}

// --- XML parsing helpers ---

function parseContainerXml(xml: string): string | null {
  const match = xml.match(/<rootfile[^>]+full-path=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function parseOpfMetadata(xml: string): {
  title: string;
  author: string;
  description: string | null;
} {
  // Strip XML namespaces for simpler regex parsing
  const clean = xml.replace(/xmlns[^=]*=["'][^"']*["']/g, '');

  const titleMatch = clean.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
  const authorMatch = clean.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
  const descMatch = clean.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);

  // Also check meta tags for title/author fallback
  const metaTitleMatch = titleMatch ? null : clean.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i);
  const metaAuthorMatch = authorMatch ? null : clean.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i);

  return {
    title: decodeXmlEntities(
      (titleMatch?.[1] || metaTitleMatch?.[1] || 'Unknown Title').trim()
    ),
    author: decodeXmlEntities(
      (authorMatch?.[1] || metaAuthorMatch?.[1] || 'Unknown Author').trim()
    ),
    description: descMatch ? decodeXmlEntities(descMatch[1].trim()) : null,
  };
}

function parseCoverHref(opfXml: string, metadata: { title: string }): string | null {
  // Method 1: Look for meta name="cover"
  const metaCoverMatch = opfXml.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i);
  if (metaCoverMatch) {
    const itemId = metaCoverMatch[1];
    const itemMatch = opfXml.match(
      new RegExp(`<manifest[^>]*>[\\s\\S]*?<item[^>]+id=["']${escapeRegex(itemId)}["'][^>]+href=["']([^"']+)["']`, 'i')
    );
    if (itemMatch) return itemMatch[1];
  }

  // Method 2: Look for item with properties="cover-image"
  const coverImagePropsMatch = opfXml.match(/<item[^>]+properties=["'][^"']*cover-image[^"']*["'][^>]+href=["']([^"']+)["']/i);
  if (coverImagePropsMatch) return coverImagePropsMatch[1];

  // Method 3: Look for item with id containing "cover" and media-type image
  const itemMatches = opfXml.matchAll(/<item[^>]*>/gi);
  for (const item of itemMatches) {
    const tag = item[0];
    if (/media-type=["']image\//i.test(tag) && /id=["'][^"']*cover[^"']*["']/i.test(tag)) {
      const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
      if (hrefMatch) return hrefMatch[1];
    }
  }

  return null;
}

async function findCoverImageFallback(
  zip: JSZip,
  opfDir: string,
  opfXml: string
): Promise<string | null> {
  // Find all image items in the manifest
  const imageHrefs: string[] = [];
  const itemMatches = opfXml.matchAll(/<item[^>]+href=["']([^"']+)["'][^>]*>/gi);
  for (const item of itemMatches) {
    const tag = item[0];
    const href = item[1];
    if (/media-type=["']image\//i.test(tag) || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(href)) {
      imageHrefs.push(href);
    }
  }

  // Try to find one that looks like a cover
  for (const href of imageHrefs) {
    if (/cover/i.test(href)) {
      const fullPath = resolvePath(opfDir, href);
      const imgFile = zip.file(fullPath);
      if (imgFile) {
        const buf = await imgFile.async('arraybuffer');
        const blob = new Blob([buf], { type: getMimeType(fullPath) });
        return await blobToDataUrl(blob);
      }
    }
  }

  // Last resort: try the first image in the manifest
  if (imageHrefs.length > 0) {
    const fullPath = resolvePath(opfDir, imageHrefs[0]);
    const imgFile = zip.file(fullPath);
    if (imgFile) {
      const buf = await imgFile.async('arraybuffer');
      const blob = new Blob([buf], { type: getMimeType(fullPath) });
      return await blobToDataUrl(blob);
    }
  }

  return null;
}

async function extractChapters(
  zip: JSZip,
  opfXml: string,
  opfDir: string
): Promise<EpubChapter[]> {
  // Parse spine order from OPF
  const spineMatches = [...opfXml.matchAll(/<itemref[^>]+idref=["']([^"']+)["']/gi)];
  if (spineMatches.length === 0) return [];

  // Build manifest map: id -> { href, mediaType }
  const manifest: Record<string, { href: string; mediaType: string }> = {};
  const itemMatches = opfXml.matchAll(/<item[^>]+id=["']([^"']+)["'][^>]*>/gi);
  for (const item of itemMatches) {
    const tag = item[0];
    const id = item[1];
    const hrefMatch = tag.match(/href=["']([^"']+)["']/i);
    const typeMatch = tag.match(/media-type=["']([^"']+)["']/i);
    if (hrefMatch) {
      manifest[id] = {
        href: hrefMatch[1],
        mediaType: typeMatch?.[1] || '',
      };
    }
  }

  const chapters: EpubChapter[] = [];
  let chapterNum = 0;

  for (const spineItem of spineMatches) {
    const idref = spineItem[1];
    const item = manifest[idref];
    if (!item || !item.mediaType.includes('html')) continue;

    const fullPath = resolvePath(opfDir, item.href);
    const htmlFile = zip.file(fullPath);
    if (!htmlFile) continue;

    const htmlContent = await htmlFile.async('string');
    const textContent = stripHtml(htmlContent);
    const title = extractChapterTitle(htmlContent) || `Chapter ${chapterNum + 1}`;

    chapters.push({
      id: `ch-${chapterNum}`,
      title,
      content: textContent,
      wordCount: textContent.split(/\s+/).filter(Boolean).length,
    });
    chapterNum++;
  }

  return chapters;
}

function extractChapterTitle(html: string): string | null {
  // Try <h1>, <h2>, <title> tags
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return stripTags(h1Match[1]).trim();

  const h2Match = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  if (h2Match) return stripTags(h2Match[1]).trim();

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) return stripTags(titleMatch[1]).trim();

  return null;
}

function stripHtml(html: string): string {
  // Remove script and style blocks
  let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Convert <br> and <p> to newlines for paragraph breaks
  clean = clean.replace(/<\/p>/gi, '\n\n');
  clean = clean.replace(/<br\s*\/?>/gi, '\n');
  // Remove all tags
  clean = clean.replace(/<[^>]+>/g, '');
  // Decode entities
  clean = decodeXmlEntities(clean);
  // Collapse excessive whitespace
  clean = clean.replace(/\n[ \t]+/g, '\n');
  clean = clean.replace(/[ \t]+/g, ' ');
  clean = clean.replace(/\n{3,}/g, '\n\n');
  return clean.trim();
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, '').trim();
}

function resolvePath(base: string, relative: string): string {
  if (!base) return relative.replace(/^\.\//, '');
  // Handle absolute paths within the zip
  if (relative.startsWith('/')) return relative.substring(1);
  // Simple path resolution — handle ../
  const parts = (base + relative).split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  return resolved.join('/');
}

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
  };
  return types[ext || ''] || 'application/octet-stream';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
