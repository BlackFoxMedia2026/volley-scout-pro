// Cloud sync commands — publish/fetch via Supabase REST API.
//
// Credentials are stored in the local SQLite app_state table (set during first-run setup).
// Keys:
//   cloud_supabase_url      — e.g. https://xyzabcdef.supabase.co
//   cloud_anon_key          — public anon key (safe to ship)
//   cloud_service_key       — service role key (needed to INSERT)
//
// The dashboard URL is:
//   https://dashboard.volleyscoutpro.io/{share_id}
//
// If credentials are not configured, publish returns an error asking the user to set them up.

use rand::Rng;
use serde_json::Value;
use sqlx::SqlitePool;
use tauri::State;

const DASHBOARD_BASE: &str = "https://dashboard.volleyscoutpro.io";

fn gen_share_id() -> String {
    const CHARS: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..8).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect()
}

async fn get_creds(pool: &SqlitePool) -> Result<(String, String, String), String> {
    let keys = ["cloud_supabase_url", "cloud_anon_key", "cloud_service_key"];
    let mut values = Vec::new();

    for key in &keys {
        let row: Option<(String,)> =
            sqlx::query_as("SELECT value FROM app_state WHERE key = ?")
                .bind(key)
                .fetch_optional(pool)
                .await
                .map_err(|e| e.to_string())?;
        let v = row
            .map(|(v,)| v)
            .ok_or_else(|| format!("Credenziale cloud non configurata: {key}. Vai in Impostazioni → Cloud."))?;
        values.push(v);
    }

    Ok((values.remove(0), values.remove(0), values.remove(0)))
}

// ─────────────────────────────────────────────
// PUBLISH
// ─────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct PublishResult {
    pub share_id: String,
    pub url: String,
}

#[tauri::command]
pub async fn publish_to_cloud(
    db: State<'_, SqlitePool>,
    payload: String,
) -> Result<PublishResult, String> {
    let (supabase_url, _anon_key, service_key) = get_creds(db.inner()).await?;

    let share_id = gen_share_id();

    let body: Value = serde_json::from_str(&payload).map_err(|e| e.to_string())?;
    let record = serde_json::json!({
        "share_id": share_id,
        "match_id": body.get("matchId").and_then(|v| v.as_str()).unwrap_or(""),
        "org_id":   body.get("orgId").and_then(|v| v.as_str()),
        "payload":  body,
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{supabase_url}/rest/v1/shared_matches"))
        .header("apikey", &service_key)
        .header("Authorization", format!("Bearer {service_key}"))
        .header("Content-Type", "application/json")
        .header("Prefer", "return=minimal")
        .json(&record)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let msg = resp.text().await.unwrap_or_default();
        return Err(format!("Errore Supabase: {msg}"));
    }

    let url = format!("{DASHBOARD_BASE}/{share_id}");
    Ok(PublishResult { share_id, url })
}

// ─────────────────────────────────────────────
// FETCH
// ─────────────────────────────────────────────

#[tauri::command]
pub async fn fetch_from_cloud(
    db: State<'_, SqlitePool>,
    share_id: String,
) -> Result<Option<String>, String> {
    let (supabase_url, anon_key, _) = get_creds(db.inner()).await?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!(
            "{supabase_url}/rest/v1/shared_matches?share_id=eq.{share_id}&select=payload&limit=1"
        ))
        .header("apikey", &anon_key)
        .header("Authorization", format!("Bearer {anon_key}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("Errore fetch: {}", resp.status()));
    }

    let rows: Vec<Value> = resp.json().await.map_err(|e| e.to_string())?;
    if let Some(row) = rows.into_iter().next() {
        let payload = row.get("payload").cloned().unwrap_or(Value::Null);
        Ok(Some(payload.to_string()))
    } else {
        Ok(None)
    }
}

// ─────────────────────────────────────────────
// CONFIGURE CREDENTIALS
// ─────────────────────────────────────────────

#[derive(serde::Deserialize)]
pub struct CloudCredentials {
    pub supabase_url: String,
    pub anon_key: String,
    pub service_key: String,
}

#[tauri::command]
pub async fn save_cloud_credentials(
    db: State<'_, SqlitePool>,
    creds: CloudCredentials,
) -> Result<(), String> {
    let pool = db.inner();
    for (k, v) in [
        ("cloud_supabase_url", &creds.supabase_url),
        ("cloud_anon_key", &creds.anon_key),
        ("cloud_service_key", &creds.service_key),
    ] {
        sqlx::query("INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)")
            .bind(k)
            .bind(v)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
