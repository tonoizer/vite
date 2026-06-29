import * as path from 'node:path';
import { NormalizedModuleFederationOptions } from './normalizeModuleFederationOptions';

/** Returns true when `filePath` resolves inside `directory`. */
export function isPathWithinDirectory(
  filePath: string,
  directory: string,
  options?: { allowDirectory?: boolean }
): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(filePath));
  if (relative === '') return options?.allowDirectory ?? true;
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function resolveSafeRelativeOutputPath(
  relativePath: string,
  fallback: string
): { path: string; usedFallback: boolean } {
  const normalized = path.normalize(relativePath).replace(/\\/g, '/');
  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    return { path: fallback, usedFallback: true };
  }
  return { path: normalized, usedFallback: false };
}

/** Guards dev HTML proxy query params from loading modules outside the Vite project root. */
export function isLocalDevModuleParam(entryParam: string, projectRoot: string): boolean {
  if (!entryParam || entryParam.includes('\0')) return false;
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(entryParam) || entryParam.startsWith('//')) {
    return false;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(entryParam);
  } catch {
    return false;
  }
  const resolved = path.resolve(projectRoot, decoded.replace(/^\//, ''));
  return isPathWithinDirectory(resolved, projectRoot);
}

export const COMMON_SHARED_SUBPATHS: Record<string, string[]> = {
  react: ['react/jsx-runtime', 'react/jsx-dev-runtime', 'react/compiler-runtime'],
  'react-dom': ['react-dom/client', 'react-dom/server', 'react-dom/server.browser'],
  'solid-js': ['solid-js/web', 'solid-js/store', 'solid-js/html', 'solid-js/h'],
  zustand: ['zustand/vanilla', 'zustand/react'],
};

export function removeTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function ensureTrailingSlash(value: string): string {
  return `${removeTrailingSlash(value)}/`;
}

export function getBasePath(base?: string): string {
  return removeTrailingSlash(base || '/');
}

export function isNuxtClientBase(base?: string): boolean {
  return getBasePath(base).endsWith('/_nuxt');
}

export function normalizeNodeModulePath(source: string): string {
  return source.replace(/\\/g, '/').replace(/\?.*$/, '');
}

export function isNodeModulePath(source: string): boolean {
  return source.includes('/node_modules/') || source.includes('\\node_modules\\');
}

export function filterId(id: unknown): id is string {
  return typeof id === 'string' && !id.includes('\0');
}

export function getMatchingNodeModuleSubpath(
  source: string,
  candidates: Iterable<string>
): string | undefined {
  const normalized = normalizeNodeModulePath(source);
  return [...candidates]
    .sort((a, b) => b.length - a.length)
    .find(
      (candidate) =>
        normalized.includes(`/node_modules/${candidate}/`) ||
        normalized.includes(`/node_modules/${candidate}.`)
    );
}

export function getCommonSharedSubpaths(sharedKey: string): string[] {
  return COMMON_SHARED_SUBPATHS[removeTrailingSlash(sharedKey)] || [];
}

export function getCommonSharedSubpathFromNodeModulePath(
  source: string,
  sharedKey: string
): string | undefined {
  const keyBase = removeTrailingSlash(sharedKey);
  return getMatchingNodeModuleSubpath(source, getCommonSharedSubpaths(keyBase));
}

/**
 * Resolves the public path for remote entries
 * @param options - Module Federation options
 * @param viteBase - Vite's base config value
 * @param originalBase - Original base config before any transformations
 * @returns The resolved public path
 */
export function resolvePublicPath(
  options: NormalizedModuleFederationOptions,
  viteBase: string,
  originalBase?: string
): string {
  // Use explicitly set publicPath if provided, but treat "auto" as unset
  // (webpack convention: "auto" means infer at runtime, not a literal path segment)
  if (options.publicPath && options.publicPath !== 'auto') {
    return options.publicPath;
  }

  // Use runtime inference when base was not explicitly configured.
  if (!originalBase) {
    return 'auto';
  }

  // Use viteBase if available, ensuring it ends with a slash
  if (viteBase) {
    return ensureTrailingSlash(viteBase);
  }

  // Fallback to auto if no base is specified
  return 'auto';
}
