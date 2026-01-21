/**
 * Supabase Client Configuration
 * Provides authenticated Supabase clients for different use cases
 */

import { createClient } from '@supabase/supabase-js';
import config from './index.js';

// Check if Supabase is configured
const isConfigured = config.supabase.url && config.supabase.serviceRoleKey;

/**
 * Admin client with service role key
 * Bypasses RLS - use only for backend operations
 */
export const supabaseAdmin = isConfigured 
  ? createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  : null;

/**
 * Public client with anon key
 * Respects RLS policies - use for user-context operations
 */
export const supabasePublic = isConfigured
  ? createClient(config.supabase.url, config.supabase.anonKey)
  : null;

/**
 * Create a user-context Supabase client
 * Passes user JWT for RLS policy evaluation
 * 
 * @param {string} accessToken - User's JWT token
 * @returns {SupabaseClient} Authenticated Supabase client
 */
export const createUserClient = (accessToken) => {
  return createClient(
    config.supabase.url,
    config.supabase.anonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    }
  );
};

// Alias for compatibility with various import styles
export const supabase = supabaseAdmin;

export default supabaseAdmin;
