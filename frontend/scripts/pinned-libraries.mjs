export const PINNED_LIBRARIES = [
  '@noble/curves',
  '@noble/hashes',
  '@noble/ciphers',
  'hash-wasm',
  'pdfkit',
  'jsqr',
  'idb',
  'client-zip',
];

const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

function pinned(name) {
  return PINNED_LIBRARIES.includes(name) || name.startsWith('@noble/');
}

export function unpinnedLibraries(manifest) {
  return [manifest.dependencies, manifest.devDependencies]
    .flatMap((libraries) => Object.entries(libraries ?? {}))
    .filter(([name, version]) => pinned(name) && !EXACT_VERSION.test(version))
    .map(([name, version]) => `${name} ${version}`);
}
