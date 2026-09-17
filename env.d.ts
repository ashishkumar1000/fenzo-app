/**
 * Minimal ambient typing for `process`.
 *
 * src/config no longer reads env vars (the API URL is a plain constant), so
 * no ProcessEnv shape is declared — the index signature only keeps stray
 * `process.env` references from hard-failing if one ever reappears. Kept out
 * of `tsconfig` `types` on purpose: adding full @types/node would drag
 * Node-only globals into RN code.
 */
interface ProcessEnv {
  [key: string]: string | undefined;
}

declare const process: {
  env: ProcessEnv;
};

/**
 * Hermes implements atob/btoa globally, but RN 0.87's types no longer
 * declare them (the old global.d.ts shipped them). Used to decode the JWT
 * payload in src/services/realtimeToken.ts.
 */
declare function atob(input: string): string;