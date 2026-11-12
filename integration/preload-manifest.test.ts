import { resolve } from 'path';
import type { Rollup } from 'vite';
import { describe, expect, it } from 'vitest';
import type { ModuleFederationOptions } from '../src/utils/normalizeModuleFederationOptions';
import { buildFixture, FIXTURES } from './helpers/build';

const options = {
  name: 'preloadHost',
  hostInitInjectLocation: 'entry',
  remotes: {
    remote1: { name: 'remote1', type: 'module', entry: 'https://example.test/remoteEntry.js' },
    duplicate: { name: 'duplicate', type: 'module', entry: 'https://example.test/remoteEntry.js' },
    root: { name: 'root', type: 'esm', entry: '/remote/remoteEntry.js' },
    manifest: { name: 'manifest', type: 'module', entry: 'https://example.test/mf-manifest.json' },
    relative: { name: 'relative', type: 'module', entry: './remoteEntry.js' },
    script: { name: 'script', type: 'var', entry: 'https://example.test/script.js' },
  },
} satisfies Partial<ModuleFederationOptions>;

function preloadAsset(output: Rollup.RollupOutput) {
  return output.output.find(
    (file): file is Rollup.OutputAsset =>
      file.type === 'asset' && file.fileName === '.vite/mf-preload.json'
  );
}

function preloadTargets(output: Rollup.RollupOutput): {
  hostInit: string[];
  remoteEntries: string[];
} {
  const asset = preloadAsset(output);
  expect(asset).toBeDefined();
  return JSON.parse(String(asset!.source));
}

describe('client preload manifest', () => {
  it('emits base-free chunk paths and only statically known module remote entries without HTML', async () => {
    const output = await buildFixture({
      fixture: 'basic-host',
      mfOptions: options,
      viteConfig: {
        base: '/application/',
        build: { rollupOptions: { input: resolve(FIXTURES, 'basic-host', 'entry.js') } },
      },
    });
    const targets = preloadTargets(output);
    expect(output.output.some((file) => file.fileName.endsWith('.html'))).toBe(false);
    expect(targets.remoteEntries).toEqual([
      'https://example.test/remoteEntry.js',
      '/remote/remoteEntry.js',
    ]);
    expect(targets.hostInit.some((file) => file.includes('hostInit'))).toBe(true);
    expect(new Set(targets.hostInit).size).toBe(targets.hostInit.length);
    for (const file of targets.hostInit) {
      expect(file.startsWith('/')).toBe(false);
      expect(output.output.some((chunk) => chunk.type === 'chunk' && chunk.fileName === file)).toBe(
        true
      );
    }
    const bootstrapChunks = output.output.filter(
      (chunk) => chunk.type === 'chunk' && chunk.facadeModuleId?.includes('mf-entry-bootstrap')
    );
    expect(bootstrapChunks.length).toBeGreaterThan(0);
    for (const chunk of bootstrapChunks) expect(targets.hostInit).toContain(chunk.fileName);
  });

  it.each(['html', 'entry'] as const)(
    'uses the same targets as %s-injected HTML with a base',
    async (inject) => {
      const output = await buildFixture({
        fixture: 'basic-host',
        mfOptions: { ...options, hostInitInjectLocation: inject },
        viteConfig: { base: '/application/' },
      });
      const targets = preloadTargets(output);
      const html = output.output.find(
        (file): file is Rollup.OutputAsset =>
          file.type === 'asset' && file.fileName.endsWith('.html')
      );
      const hrefs = Array.from(
        String(html!.source).matchAll(/<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g),
        (match) => match[1]
      );
      // Vite may add other application preloads; only the MF targets are this asset's contract.
      for (const href of [
        ...targets.remoteEntries,
        ...targets.hostInit.map((file) => `/application/${file}`),
      ]) {
        expect(hrefs.filter((candidate) => candidate === href)).toHaveLength(1);
      }
      expect(hrefs).not.toContain('https://example.test/mf-manifest.json');
      expect(hrefs).not.toContain('./remoteEntry.js');
    }
  );

  it('keeps renderBuiltUrl transformations in HTML and output-relative paths in JSON', async () => {
    const output = await buildFixture({
      fixture: 'basic-host',
      mfOptions: options,
      viteConfig: {
        experimental: { renderBuiltUrl: (file) => `https://cdn.example.test/${file}` },
      },
    });
    const targets = preloadTargets(output);
    const html = output.output.find(
      (file): file is Rollup.OutputAsset => file.type === 'asset' && file.fileName.endsWith('.html')
    );
    for (const file of targets.hostInit) {
      expect(file).not.toContain('https://');
      expect(String(html!.source)).toContain(`href="https://cdn.example.test/${file}"`);
    }
  });

  it('can disable the asset while retaining HTML preloads', async () => {
    const output = await buildFixture({
      fixture: 'basic-host',
      mfOptions: { ...options, preloadManifest: false },
    });
    expect(preloadAsset(output)).toBeUndefined();
    const html = output.output.find(
      (file): file is Rollup.OutputAsset => file.type === 'asset' && file.fileName.endsWith('.html')
    );
    expect(String(html!.source)).toContain('rel="modulepreload"');
    expect(String(html!.source)).toContain('href="https://example.test/remoteEntry.js"');
  });

  it('respects modulePreload: false', async () => {
    const output = await buildFixture({
      fixture: 'basic-host',
      mfOptions: options,
      viteConfig: { build: { modulePreload: false } },
    });
    expect(preloadAsset(output)).toBeUndefined();
    const html = output.output.find(
      (file): file is Rollup.OutputAsset => file.type === 'asset' && file.fileName.endsWith('.html')
    );
    expect(String(html!.source)).not.toContain('rel="modulepreload"');
  });

  it('does not emit the client asset in an SSR build', async () => {
    const output = await buildFixture({
      fixture: 'basic-host',
      mfOptions: options,
      viteConfig: {
        build: {
          ssr: true,
          rollupOptions: { input: resolve(FIXTURES, 'basic-host', 'entry.js') },
        },
      },
    });
    expect(preloadAsset(output)).toBeUndefined();
  });

  it('combines preload targets from multiple federation configurations', async () => {
    const output = await buildFixture({
      fixture: 'basic-host',
      mfOptions: [
        { ...options, filename: 'firstRemoteEntry.js' },
        {
          name: 'secondHost',
          filename: 'secondRemoteEntry.js',
          hostInitInjectLocation: 'entry',
          remotes: {
            second: {
              name: 'second',
              type: 'module',
              entry: 'https://example.test/secondRemoteEntry.js',
            },
          },
        },
      ],
    });
    const targets = preloadTargets(output);
    expect(output.output.filter((file) => file.fileName === '.vite/mf-preload.json')).toHaveLength(
      1
    );
    expect(targets.remoteEntries).toEqual([
      'https://example.test/remoteEntry.js',
      '/remote/remoteEntry.js',
      'https://example.test/secondRemoteEntry.js',
    ]);
    const html = output.output.find(
      (file): file is Rollup.OutputAsset => file.type === 'asset' && file.fileName.endsWith('.html')
    );
    for (const href of targets.remoteEntries)
      expect(String(html!.source)).toContain(`href="${href}"`);
  });
});
