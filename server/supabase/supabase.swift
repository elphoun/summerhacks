import Foundation
import Supabase

/// Shared Supabase client configured from `server/.env`.
enum NimbusSupabase {
    static let client = SupabaseClient(
        supabaseURL: Env.supabaseURL,
        supabaseKey: Env.supabaseKey
    )

    static let mediaBucket = "media"
}
