import { build } from 'esbuild'

const common = { bundle: true, logLevel: 'info', sourcemap: false }

await build({
  ...common,
  entryPoints: ['renderer/launcher.ts', 'renderer/popup.ts', 'renderer/settings.ts'],
  format: 'esm',
  target: 'chrome120',
  outdir: 'dist',
})

await build({
  ...common,
  entryPoints: ['src/shared/store.ts'],
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/store.cjs',
})

await build({
  ...common,
  entryPoints: ['src/shared/data.ts'],
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/seed.cjs',
})

console.log('bundled renderers + store + seed')
