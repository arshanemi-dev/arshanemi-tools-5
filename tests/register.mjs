// Node's built-in test runner with this app's existing @/ alias and extensionless imports.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes('/node_modules/')) return next(specifier, context);
    let url;
    if (specifier.startsWith('@/')) url = new URL(specifier.slice(2), root);
    else if (specifier.startsWith('.') && context.parentURL) url = new URL(specifier, context.parentURL);
    if (url?.protocol === 'file:' && !existsSync(fileURLToPath(url)) && existsSync(fileURLToPath(url) + '.js')) {
      return next(url.href + '.js', context);
    }
    return next(url ? url.href : specifier, context);
  },
});
