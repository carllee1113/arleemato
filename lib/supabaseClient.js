import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
// Import app.json directly as a fallback for environments where Constants.expoConfig is undefined
// Using require to avoid potential issues with JSON module imports in some bundlers
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appConfig = require('../app.json');

// Prefer environment variables for web deployments; fall back to Expo extra
const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const envKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Try Expo Constants first, then fall back to app.json import
const extraFromConstants = Constants?.expoConfig?.extra;
const extraFromAppJson = appConfig?.expo?.extra;
const extra = extraFromConstants || extraFromAppJson || {};

const supabaseUrl = envUrl || extra.supabaseUrl;
const supabaseAnonKey = envKey || extra.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail fast without hardcoded defaults to avoid leaking credentials
  console.error('Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (env) or add supabaseUrl/supabaseAnonKey to app.json extra.');
  throw new Error('Supabase URL and Anon Key are required');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});