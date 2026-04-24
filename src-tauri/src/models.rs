use serde::{Deserialize, Serialize};

// ─── DB read model (snake_case, payload as String) ──────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EventRow {
    pub id: String,
    pub match_id: String,
    pub set_id: Option<String>,
    pub rally_id: Option<String>,
    pub sequence: i64,
    pub timestamp_ms: i64,
    pub video_ts_ms: Option<i64>,
    pub r#type: String,
    pub actor_user_id: String,
    pub player_id: Option<String>,
    pub team_side: Option<String>,
    pub raw_code: Option<String>,
    pub skill: Option<String>,
    pub skill_type: Option<String>,
    pub quality: Option<String>,
    pub combination: Option<String>,
    pub zone_from: Option<i64>,
    pub zone_to: Option<i64>,
    pub zone_to_sub: Option<String>,
    pub end_zone_plus: Option<String>,
    pub payload: String,
    pub is_valid: i64,
    pub undone_at_ms: Option<i64>,
    pub undone_by_seq: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppendEventRequest {
    pub match_id: String,
    pub set_id: Option<String>,
    pub rally_id: Option<String>,
    pub timestamp_ms: i64,
    pub video_ts_ms: Option<i64>,
    pub r#type: String,
    pub actor_user_id: String,
    pub player_id: Option<String>,
    pub team_side: Option<String>,
    pub raw_code: Option<String>,
    pub skill: Option<String>,
    pub skill_type: Option<String>,
    pub quality: Option<String>,
    pub combination: Option<String>,
    pub zone_from: Option<i64>,
    pub zone_to: Option<i64>,
    pub zone_to_sub: Option<String>,
    pub end_zone_plus: Option<String>,
    pub payload: String,
    #[serde(default = "default_true")]
    pub is_valid: bool,
}

fn default_true() -> bool { true }

// ─── IPC response model (camelCase, payload as JSON object) ─────────────────
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventResponse {
    pub id: String,
    pub match_id: String,
    pub set_id: Option<String>,
    pub rally_id: Option<String>,
    pub sequence: i64,
    pub timestamp_ms: i64,
    pub video_ts_ms: Option<i64>,
    #[serde(rename = "type")]
    pub event_type: String,
    pub actor_user_id: String,
    pub player_id: Option<String>,
    pub team_side: Option<String>,
    pub raw_code: Option<String>,
    pub payload: serde_json::Value,
    pub is_valid: bool,
    #[serde(rename = "undoneSince", skip_serializing_if = "Option::is_none")]
    pub undone_at_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub undone_by_seq: Option<i64>,
}

impl From<EventRow> for EventResponse {
    fn from(row: EventRow) -> Self {
        let payload = serde_json::from_str::<serde_json::Value>(&row.payload)
            .unwrap_or_else(|_| serde_json::Value::Object(Default::default()));
        EventResponse {
            id: row.id,
            match_id: row.match_id,
            set_id: row.set_id,
            rally_id: row.rally_id,
            sequence: row.sequence,
            timestamp_ms: row.timestamp_ms,
            video_ts_ms: row.video_ts_ms,
            event_type: row.r#type,
            actor_user_id: row.actor_user_id,
            player_id: row.player_id,
            team_side: row.team_side,
            raw_code: row.raw_code,
            payload,
            is_valid: row.is_valid != 0,
            undone_at_ms: row.undone_at_ms,
            undone_by_seq: row.undone_by_seq,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MatchRow {
    pub id: String,
    pub org_id: String,
    pub tournament_id: Option<String>,
    pub season_id: String,
    pub home_team_id: String,
    pub away_team_id: String,
    pub scouted_team: String,
    pub date: String,
    pub venue: Option<String>,
    pub phase: String,
    pub winning_team: Option<String>,
    pub sets_home: i64,
    pub sets_away: i64,
    pub video_path: Option<String>,
    pub video_sync_offset_ms: Option<i64>,
    pub notes: Option<String>,
    pub created_by: String,
    pub created_at: i64,
    pub updated_at: i64,
}
