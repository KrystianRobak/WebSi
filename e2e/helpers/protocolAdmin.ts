import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { makeUserCredentials, type TestUserCredentials } from '../fixtures/sampleData.js';

export interface ProvisionedUser {
  client: SupabaseClient;
  userId: string;
  email: string;
  password: string;
  displayName: string;
  accessToken: string;
}

export interface ProvisionedTrio {
  gm: ProvisionedUser;
  playerA: ProvisionedUser;
  playerB: ProvisionedUser;
}

export function createAnonClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function createServiceClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function createAuthenticatedUser(
  url: string,
  anonKey: string,
  creds: TestUserCredentials = makeUserCredentials('user'),
): Promise<ProvisionedUser> {
  const client = createAnonClient(url, anonKey);
  const { data, error } = await client.auth.signUp({
    email: creds.email,
    password: creds.password,
    options: {
      data: {
        display_name: creds.displayName,
      },
    },
  });
  if (error || !data.user || !data.session) {
    throw new Error(`Failed to signUp test user ${creds.email}: ${error?.message ?? 'missing user/session'}`);
  }
  return {
    client,
    userId: data.user.id,
    email: creds.email,
    password: creds.password,
    displayName: creds.displayName,
    accessToken: data.session.access_token,
  };
}

export async function signInUser(
  url: string,
  anonKey: string,
  email: string,
  password: string,
): Promise<ProvisionedUser> {
  const client = createAnonClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    throw new Error(`Failed to signIn user ${email}: ${error?.message ?? 'missing user/session'}`);
  }
  const displayName =
    typeof data.user.user_metadata?.display_name === 'string'
      ? data.user.user_metadata.display_name
      : email.split('@')[0];
  return {
    client,
    userId: data.user.id,
    email,
    password,
    displayName,
    accessToken: data.session.access_token,
  };
}

export async function provisionTestTrio(url: string, anonKey: string): Promise<ProvisionedTrio> {
  const gm = await createAuthenticatedUser(url, anonKey, makeUserCredentials('gm'));
  const playerA = await createAuthenticatedUser(url, anonKey, makeUserCredentials('playera'));
  const playerB = await createAuthenticatedUser(url, anonKey, makeUserCredentials('playerb'));
  return { gm, playerA, playerB };
}

export async function assertSupabaseRejected<T>(
  operation: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>,
  contextLabel: string,
): Promise<{ message: string; code?: string }> {
  const res = await operation;
  if (!res.error) {
    throw new Error(`Expected Supabase operation (${contextLabel}) to be rejected by RLS/constraint, but it succeeded.`);
  }
  return res.error;
}
