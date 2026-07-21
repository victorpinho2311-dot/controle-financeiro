import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublicKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublicKey)

let supabaseClient = null

export const getSupabaseClient = () => {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.local.',
    )
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabasePublicKey)
  }

  return supabaseClient
}
