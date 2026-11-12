import { registerHooks } from 'node:module';

const RELATIVE = /^\.\.?\//;
const WITH_EXTENSION = /\.(?:[cm]?[jt]s|json)$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      RELATIVE.test(specifier) &&
      !WITH_EXTENSION.test(specifier) &&
      context.parentURL?.endsWith('.ts')
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

export function importTs(path) {
  return import(new URL(path, import.meta.url).href);
}
