/**
 * Minimal ambient typing for `process.env`.
 *
 * Metro inlines `process.env.X` at bundle time (see src/config/index.ts),
 * so the app never needs Node's full process typings — just the shape the
 * config reads. Kept out of `tsconfig` `types` on purpose: adding full
 * @types/node would drag Node-only globals into RN code.
 */
interface ProcessEnv {
  /** Overrides the production API base URL (see PROD_API_URL). */
  readonly API_BASE_URL?: string;
  /** Overrides the default local dev API URL (see DEFAULT_LOCAL_API_URL). */
  readonly DEV_API_URL?: string;
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