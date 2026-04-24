use crate::models::{AppendEventRequest, EventResponse, EventRow, MatchRow};
use sqlx::SqlitePool;
use tauri::State;
use ulid::Ulid;

// ─────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────

/// Append a single event to the log. Returns the new event with assigned id and sequence.
/// This is the critical hot-path — must be fast.
#[tauri::command]
pub async fn append_event(
    db: State<'_, SqlitePool>,
    req: AppendEventRequest,
) -> Result<EventResponse, String> {
    let id = Ulid::new().to_string();
    let now = req.timestamp_ms;

    // Atomically get next sequence number for this match
    let row = sqlx::query_as::<_, EventRow>(
        r#"
        INSERT INTO events (
          id, match_id, set_id, rally_id, sequence, timestamp_ms, video_ts_ms,
          type, actor_user_id, player_id, team_side, raw_code,
          skill, skill_type, quality, combination,
          zone_from, zone_to, zone_to_sub, end_zone_plus,
          payload, is_valid, created_at
        )
        VALUES (
          ?, ?, ?, ?, (SELECT COALESCE(MAX(sequence), 0) + 1 FROM events WHERE match_id = ?),
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        RETURNING *
        "#,
    )
    .bind(&id)
    .bind(&req.match_id)
    .bind(&req.set_id)
    .bind(&req.rally_id)
    .bind(&req.match_id)  // for the subquery
    .bind(req.timestamp_ms)
    .bind(req.video_ts_ms)
    .bind(&req.r#type)
    .bind(&req.actor_user_id)
    .bind(&req.player_id)
    .bind(&req.team_side)
    .bind(&req.raw_code)
    .bind(&req.skill)
    .bind(&req.skill_type)
    .bind(&req.quality)
    .bind(&req.combination)
    .bind(req.zone_from)
    .bind(req.zone_to)
    .bind(&req.zone_to_sub)
    .bind(&req.end_zone_plus)
    .bind(&req.payload)
    .bind(req.is_valid as i64)
    .bind(now)
    .fetch_one(db.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(EventResponse::from(row))
}

/// Get all events for a match, ordered by sequence. Used for replay.
#[tauri::command]
pub async fn get_match_events(
    db: State<'_, SqlitePool>,
    match_id: String,
) -> Result<Vec<EventResponse>, String> {
    let rows = sqlx::query_as::<_, EventRow>(
        "SELECT * FROM events WHERE match_id = ? ORDER BY sequence ASC",
    )
    .bind(&match_id)
    .fetch_all(db.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().map(EventResponse::from).collect())
}

/// Mark an event as undone by appending a new UNDO event that references it.
/// Returns the new UNDO event.
#[tauri::command]
pub async fn undo_event(
    db: State<'_, SqlitePool>,
    match_id: String,
    target_sequence: i64,
    actor_user_id: String,
) -> Result<EventResponse, String> {
    let now = chrono::Utc::now().timestamp_millis();

    let payload = serde_json::json!({ "undoTargetSeq": target_sequence }).to_string();

    // Also annotate the target event with undone_at / undone_by_seq (denormalized cache)
    // This is done in the same tx for consistency
    let pool = db.inner();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let undo_id = Ulid::new().to_string();
    let undo_row = sqlx::query_as::<_, EventRow>(
        r#"
        INSERT INTO events (
          id, match_id, sequence, timestamp_ms, type, actor_user_id, payload, is_valid, created_at
        )
        VALUES (
          ?, ?, (SELECT COALESCE(MAX(sequence), 0) + 1 FROM events WHERE match_id = ?),
          ?, 'undo', ?, ?, 1, ?
        )
        RETURNING *
        "#,
    )
    .bind(&undo_id)
    .bind(&match_id)
    .bind(&match_id)
    .bind(now)
    .bind(&actor_user_id)
    .bind(&payload)
    .bind(now)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    // Annotate the target event (NOT a delete — just a denormalized field update)
    // Note: this is the ONLY allowed UPDATE in the system, and only sets undo metadata.
    sqlx::query(
        "UPDATE events SET undone_at_ms = ?, undone_by_seq = ? WHERE match_id = ? AND sequence = ?",
    )
    .bind(now)
    .bind(undo_row.sequence)
    .bind(&match_id)
    .bind(target_sequence)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(EventResponse::from(undo_row))
}

// ─────────────────────────────────────────────
// MATCHES
// ─────────────────────────────────────────────

#[tauri::command]
pub async fn get_matches(db: State<'_, SqlitePool>) -> Result<Vec<MatchRow>, String> {
    let rows = sqlx::query_as::<_, MatchRow>(
        "SELECT * FROM matches ORDER BY date DESC",
    )
    .fetch_all(db.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub async fn get_match(db: State<'_, SqlitePool>, id: String) -> Result<Option<MatchRow>, String> {
    let row = sqlx::query_as::<_, MatchRow>("SELECT * FROM matches WHERE id = ?")
        .bind(&id)
        .fetch_optional(db.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(row)
}

#[tauri::command]
pub async fn update_video_sync_offset(
    db: State<'_, SqlitePool>,
    match_id: String,
    offset_ms: i64,
) -> Result<(), String> {
    sqlx::query("UPDATE matches SET video_sync_offset_ms = ? WHERE id = ?")
        .bind(offset_ms)
        .bind(&match_id)
        .execute(db.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
