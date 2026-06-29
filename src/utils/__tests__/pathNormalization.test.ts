import { describe, expect, it } from 'vitest';
import {
  ensureTrailingSlash,
  getBasePath,
  getCommonSharedSubpathFromNodeModulePath,
  getMatchingNodeModuleSubpath,
  isLocalDevModuleParam,
  isNuxtClientBase,
  isNodeModulePath,
  isPathWithinDirectory,
  normalizeNodeModulePath,
  removeTrailingSlash,
  resolveSafeRelativeOutputPath,
} from '../pathNormalization';

describe('pathNormalization', () => {
  it('removes one trailing slash', () => {
    expect(removeTrailingSlash('/vite/')).toBe('/vite');
    expect(removeTrailingSlash('/vite')).toBe('/vite');
  });

  it('ensures one trailing slash', () => {
    expect(ensureTrailingSlash('/vite')).toBe('/vite/');
    expect(ensureTrailingSlash('/vite/')).toBe('/vite/');
  });

  it('normalizes Vite base paths', () => {
    expect(getBasePath('/_nuxt/')).toBe('/_nuxt');
    expect(getBasePath(undefined)).toBe('');
  });

  it('detects Nuxt client base paths', () => {
    expect(isNuxtClientBase('/_nuxt/')).toBe(true);
    expect(isNuxtClientBase('/app/_nuxt/')).toBe(true);
    expect(isNuxtClientBase('/assets/')).toBe(false);
  });

  it('normalizes node_modules paths', () => {
    expect(normalizeNodeModulePath('C:\\repo\\node_modules\\react\\index.js?v=1')).toBe(
      'C:/repo/node_modules/react/index.js'
    );
    expect(isNodeModulePath('/repo/node_modules/react/index.js')).toBe(true);
    expect(isNodeModulePath('C:\\repo\\node_modules\\react\\index.js')).toBe(true);
    expect(isNodeModulePath('/repo/src/App.tsx')).toBe(false);
  });

  it('matches the longest node_modules subpath candidate', () => {
    expect(
      getMatchingNodeModuleSubpath('/repo/node_modules/react-dom/server.browser.js?v=1', [
        'react-dom/server',
        'react-dom/server.browser',
      ])
    ).toBe('react-dom/server.browser');
  });

  it('detects common shared subpaths from node_modules paths', () => {
    expect(
      getCommonSharedSubpathFromNodeModulePath(
        'C:\\repo\\node_modules\\react\\jsx-runtime.js',
        'react'
      )
    ).toBe('react/jsx-runtime');
  });

  it('checks whether a path stays within a directory', () => {
    expect(isPathWithinDirectory('/repo/src/App.tsx', '/repo')).toBe(true);
    expect(isPathWithinDirectory('/repo', '/repo')).toBe(true);
    expect(isPathWithinDirectory('/repo', '/repo', { allowDirectory: false })).toBe(false);
    expect(isPathWithinDirectory('/etc/passwd', '/repo')).toBe(false);
  });

  it('guards local dev module params', () => {
    const root = '/workspace/project';
    expect(isLocalDevModuleParam('/src/main.jsx', root)).toBe(true);
    expect(isLocalDevModuleParam('/../../../etc/passwd', root)).toBe(false);
    expect(isLocalDevModuleParam('https://evil.test/remoteEntry.js', root)).toBe(false);
    expect(isLocalDevModuleParam('%', root)).toBe(false);
  });

  it('sanitizes relative output paths that escape via traversal', () => {
    expect(
      resolveSafeRelativeOutputPath('../../outside/mf-manifest.json', 'mf-manifest.json')
    ).toEqual({ path: 'mf-manifest.json', usedFallback: true });
    expect(resolveSafeRelativeOutputPath('dist/mf-manifest.json', 'mf-manifest.json')).toEqual({
      path: 'dist/mf-manifest.json',
      usedFallback: false,
    });
  });
});
