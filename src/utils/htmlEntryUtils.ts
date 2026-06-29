import * as path from 'node:path';

export function sanitizeDevEntryPath(devEntryPath: string): string {
  // devEntryPath is already root-relative at this point (built in pluginAddEntry),
  // just normalize any remaining backslashes for use in HTML/URLs.
  return devEntryPath.replace(/\\\\?/g, '/');
}

/** Guards dev HTML proxy query params from loading paths outside the Vite project root. */
export function isSafeDevEntryParam(entryParam: string, projectRoot: string): boolean {
  if (!entryParam || entryParam.includes('\0')) return false;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(entryParam) || entryParam.startsWith('//')) {
    return false;
  }

  const decoded = decodeURIComponent(entryParam);
  const rootRelative = decoded.replace(/^\//, '');
  const resolved = path.resolve(projectRoot, rootRelative);
  const relative = path.relative(projectRoot, resolved);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Rewrites entry module script tags to point at an external wrapper module.
 * The wrapper can then sequence federation init before the app entry without
 * relying on CSP-breaking inline `<script type="module">`.
 */
export function rewriteEntryScripts(
  html: string,
  createProxySrc: (entrySrc: string) => string
): string {
  const scriptTagRegex =
    /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["'][^"']+["'])([^>]*)>/gi;

  return html.replace(scriptTagRegex, (match, attrs) => {
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) return match;
    const originalSrc = srcMatch[1];
    if (originalSrc.includes('@vite/client')) return match;
    const proxySrc = createProxySrc(originalSrc);
    return match.replace(srcMatch[0], `src=${JSON.stringify(proxySrc)}`);
  });
}

export function injectEntryScript(html: string, initSrc: string): string {
  const src = sanitizeDevEntryPath(initSrc);
  return html.replace('<head>', `<head><script type="module" src=${JSON.stringify(src)}></script>`);
}
