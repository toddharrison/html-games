/** Filled in at build time by `vite.config.ts` (`define`). */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

/**
 * The version stamp on the title screen: package.json's version and the commit it was built from,
 * marked `dev` on the dev server (where the code may be ahead of the commit).
 */
export const VERSION = `v${__APP_VERSION__} ${__APP_COMMIT__}${import.meta.env.DEV ? ' dev' : ''}`;
