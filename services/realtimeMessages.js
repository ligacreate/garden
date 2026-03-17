import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseClient = null;

const getAuthToken = () => localStorage.getItem('garden_auth_token') || '';

const getSupabaseClient = () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return supabaseClient;
};

export const subscribeToMessages = ({ onInsert, onUpdate, onDelete, onError } = {}) => {
  const client = getSupabaseClient();
  if (!client) return null;

  const token = getAuthToken();
  if (token) {
    client.realtime.setAuth(token).catch((error) => {
      onError?.(error);
    });
  }

  const channel = client
    .channel(`messages-feed-${Date.now()}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => onInsert?.(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages' },
      (payload) => onUpdate?.(payload.new)
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages' },
      (payload) => onDelete?.(payload.old)
    )
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onError?.(error || new Error('Realtime channel unavailable'));
      }
    });

  return () => {
    client.removeChannel(channel);
  };
};
