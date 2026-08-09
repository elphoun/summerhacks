import { serverBaseURL } from '../config';
import { NimbusAPI, PhotoService } from './photoService';
import { isSupabaseConfigured, supabaseURL } from './supabase/env';
import { SupabasePhotoService } from './supabase/supabasePhotoService';

/**
 * Which of the two shared-photo backends this build talks to.
 *
 * Configuration decides, rather than a code change: a `mobile/.env` carrying
 * Supabase credentials is taken as meaning "use them", and a build without them
 * keeps the local Node server it has always had. `EXPO_PUBLIC_NIMBUS_BACKEND`
 * forces the matter either way, which is what makes it possible to check a
 * change against `node server.js` without unsetting anything.
 */
export type BackendKind = 'server' | 'supabase';

export const backendKind: BackendKind = resolveBackendKind();

function resolveBackendKind(): BackendKind {
  const override = process.env.EXPO_PUBLIC_NIMBUS_BACKEND?.trim().toLowerCase();
  if (override === 'server' || override === 'supabase') return override;
  return isSupabaseConfigured ? 'supabase' : 'server';
}

export function createPhotoService(): PhotoService {
  return backendKind === 'supabase' ? new SupabasePhotoService() : new NimbusAPI();
}

/** Where the shared half of the app lives, for anything that has to say so. */
export const backendAddress = (): string =>
  backendKind === 'supabase' ? supabaseURL : serverBaseURL;

/** What to suggest to someone whose photographs are not loading. */
export const backendUnreachableAdvice = (): string =>
  backendKind === 'supabase'
    ? `Can't reach Supabase at ${supabaseURL} — check the project is up and mobile/.env is right.`
    : `Can't reach the photo server at ${serverBaseURL} — run \`node server.js\`.`;
