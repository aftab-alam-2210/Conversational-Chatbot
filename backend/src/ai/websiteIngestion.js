import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_START_URL = 'https://vvntsequor.in/';
const ALLOWED_HOSTNAME = 'vvntsequor.in';
const USER_AGENT = 'VVnTSeQuorKnowledgeBot/1.0 (+https://vvntsequor.in/)';
const MAX_PAGES = 160;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS_PER_PAGE = 16000;
const REQUEST_TIMEOUT_MS = 15000;
const REQUEST_DELAY_MS = 80;

const decodeHtmlEntities = (text) => text
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&mdash;/gi, '—')
  .replace(/&ndash;/gi, '–')
  .replace(/&rsquo;|&lsquo;/gi, "'")
  .replace(/&rdquo;|&ldquo;/gi, '"')
  .replace(/&hellip;/gi, '…')
  .replace(/&middot;/gi, '·')
  .replace(/&bull;/gi, '•')
  .replace(/&sup2;/gi, '²')
  .replace(/&reg;/gi, '®')
  .replace(/&copy;/gi, '©')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
  .replace(/&#x([\da-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)));

const normalizeUrl = (value, baseUrl) => {
  const parsed = new URL(value, baseUrl);
  parsed.hash = '';
  parsed.search = '';
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) parsed.pathname = parsed.pathname.slice(0, -1);
  return parsed;
};

const isSameOriginHttpUrl = (candidate, origin) =>
  ['http:', 'https:'].includes(candidate.protocol) &&
  candidate.origin === origin &&
  !candidate.username &&
  !candidate.password;

async function fetchText(url, { maxBytes = MAX_RESPONSE_BYTES } = {}) {
  const expectedOrigin = new URL(url).origin;
  let currentUrl = url;
  let response;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    response = await fetch(currentUrl, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xml,text/plain;q=0.9,*/*;q=0.1' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'manual',
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location || redirects === 3) throw new Error('The website returned an invalid or excessive redirect.');
    const nextUrl = new URL(location, currentUrl);
    if (nextUrl.origin !== expectedOrigin || nextUrl.protocol !== 'https:') {
      throw new Error('The website redirected outside its configured HTTPS origin.');
    }
    await response.body?.cancel();
    currentUrl = nextUrl.href;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const finalUrl = new URL(response.url || url);
  if (finalUrl.origin !== expectedOrigin) throw new Error('The website redirected outside its configured origin.');
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error('Response exceeded the configured size limit.');
  const reader = response.body?.getReader();
  const chunks = [];
  let totalBytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error('Response exceeded the configured size limit.');
      }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return { response, text: new TextDecoder().decode(body), url: finalUrl.href };
}

function parseRobotsRules(robotsText) {
  const groups = [];
  let current = null;
  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (!current || current.hasRules) {
        current = { agents: [], rules: [], sitemaps: [], hasRules: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      current.hasRules = true;
      if (value) current.rules.push({ allow: key === 'allow', path: value });
    } else if (key === 'sitemap' && value) {
      current.sitemaps.push(value);
    }
  }
  const applicable = groups.filter((group) => group.agents.includes('*'));
  return {
    rules: applicable.flatMap((group) => group.rules),
    sitemaps: groups.flatMap((group) => group.sitemaps),
  };
}

function isAllowedByRobots(url, rules) {
  const pathAndQuery = `${url.pathname}${url.search}`;
  const matching = rules
    .filter((rule) => pathAndQuery.startsWith(rule.path))
    .sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
  return matching.length === 0 || matching[0].allow;
}

function parseSitemapLocations(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeHtmlEntities(match[1].trim()));
}

function extractPageText(html) {
  const title = decodeHtmlEntities(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const mainContent = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html;
  const text = decodeHtmlEntities(mainContent
    .replace(/<(script|style|noscript|svg|iframe|nav|footer|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(header|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(h[1-6]|p|li|section|article|div|br|tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/[\t\f\v ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n'))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  return { title, content: text.slice(0, MAX_TEXT_CHARS_PER_PAGE) };
}

function classifyWebsitePage(url, title, content) {
  const pathname = new URL(url).pathname.toLowerCase();
  const titleText = title.toLowerCase();
  if (/accessibility|inclusive|wcag|vpat/.test(pathname) || /accessibility|inclusive|wcag|vpat/.test(titleText)) return 'Accessibility';
  if (/career|vacanc|recruit|job opening/.test(pathname) || /career|vacanc|recruit/.test(titleText)) return 'Careers';
  if (/contact/.test(pathname) || /contact/.test(titleText)) return 'Contact Information';
  if (/privacy|dpdpa|gdpr/.test(pathname) || /privacy|data protection/.test(titleText)) return 'Privacy & Data Protection';
  if (/compliance/.test(pathname) || /compliance|iso 27001|soc 2/.test(titleText)) return 'Compliance & Audit';
  if (/cybersecurity/.test(pathname) || /cybersecurity|penetration testing|\bvapt\b/.test(titleText)) return 'Cybersecurity';
  if (/clients/.test(pathname) || /client|case stud|portfolio/.test(titleText)) return 'Clients & Portfolio';
  const text = `${titleText} ${content.slice(0, 500).toLowerCase()}`;
  if (/service|offering|capabilit/.test(text)) return 'Services';
  return 'Official Website';
}

function classifyWebsitePageType(url) {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.startsWith('/offerings/')) return 'service_detail';
  if (pathname.startsWith('/services')) return 'service_index';
  if (pathname.startsWith('/knowledge-hub/')) return 'knowledge_resource';
  if (pathname.startsWith('/blog/')) return 'article';
  if (/careers|vacanc|recruit|job-opening/.test(pathname)) return 'careers_detail';
  if (/careers|contact|leadership|clients|credentials/.test(pathname)) return 'company_page';
  return 'company_overview';
}

export async function crawlWebsite(startUrl = process.env.KB_WEBSITE_URL || DEFAULT_START_URL) {
  let start;
  try {
    start = normalizeUrl(startUrl);
  } catch {
    throw new Error('KB_WEBSITE_URL must be a valid website URL.');
  }
  if (start.protocol !== 'https:' || start.username || start.password || start.hostname !== ALLOWED_HOSTNAME) {
    throw new Error(`Website ingestion only accepts HTTPS pages on ${ALLOWED_HOSTNAME} without embedded credentials.`);
  }
  const origin = start.origin;
  const robotsUrl = new URL('/robots.txt', origin).href;
  const { text: robotsText } = await fetchText(robotsUrl, { maxBytes: 256 * 1024 });
  const { rules, sitemaps } = parseRobotsRules(robotsText);
  if (!isAllowedByRobots(start, rules)) throw new Error('The configured start URL is disallowed by robots.txt.');

  const sitemapUrls = sitemaps.length ? sitemaps : [new URL('/sitemap.xml', origin).href];
  const discovered = [start.href];
  const seenSitemaps = new Set();
  for (const sitemapValue of sitemapUrls.slice(0, 5)) {
    let sitemap;
    try { sitemap = normalizeUrl(sitemapValue, origin); } catch { continue; }
    if (!isSameOriginHttpUrl(sitemap, origin) || seenSitemaps.has(sitemap.href)) continue;
    seenSitemaps.add(sitemap.href);
    try {
      const { text: sitemapText } = await fetchText(sitemap.href, { maxBytes: 2 * 1024 * 1024 });
      for (const location of parseSitemapLocations(sitemapText)) {
        let candidate;
        try { candidate = normalizeUrl(location, sitemap.href); } catch { continue; }
        if (isSameOriginHttpUrl(candidate, origin) && isAllowedByRobots(candidate, rules)) discovered.push(candidate.href);
      }
    } catch (error) {
      console.warn(`[Website Ingest] Skipping sitemap ${sitemap.href}: ${error.message}`);
    }
  }

  const urls = [...new Set(discovered)].slice(0, MAX_PAGES);
  const records = [];
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 500, chunkOverlap: 80 });
  for (const url of urls) {
    if (!isAllowedByRobots(new URL(url), rules)) continue;
    try {
      const { response, text: html, url: finalUrl } = await fetchText(url);
      const contentType = response.headers.get('content-type') || '';
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) continue;
      const { title, content } = extractPageText(html);
      if (content.length < 80) continue;
      const canonicalUrl = normalizeUrl(finalUrl).href;
      const contentHash = createHash('sha256').update(content).digest('hex');
      const chunks = await splitter.splitText(content);
      chunks.forEach((chunk, index) => records.push({
        id: `website-${createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 16)}-${index + 1}`,
        title: title || canonicalUrl,
        category: classifyWebsitePage(canonicalUrl, title, content),
        pageType: classifyWebsitePageType(canonicalUrl),
        content: chunk,
        sourceType: 'website',
        sourceUrl: canonicalUrl,
        chunkIndex: index + 1,
        fetchedAt: new Date().toISOString(),
        contentHash,
      }));
    } catch (error) {
      console.warn(`[Website Ingest] Skipping ${url}: ${error.message}`);
    }
    if (records.length < urls.length) await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS));
  }
  if (records.length === 0) throw new Error('No readable HTML pages were fetched; the existing website knowledge file was left unchanged.');
  return records;
}

export async function runWebsiteIngestion() {
  const records = await crawlWebsite();
  const outputPath = path.join(__dirname, 'knowledge', 'website_knowledge_base.json');
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(records, null, 2), 'utf8');
  fs.renameSync(temporaryPath, outputPath);
  const pageCount = new Set(records.map((record) => record.sourceUrl)).size;
  console.log(`[Website Ingest] Saved ${pageCount} same-origin website pages as ${records.length} searchable chunks to website_knowledge_base.json.`);
  return { count: pageCount, chunkCount: records.length, records, outputPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runWebsiteIngestion().catch((error) => {
    console.error(`[Website Ingest] Failed: ${error.message}`);
    process.exitCode = 1;
  });
}
