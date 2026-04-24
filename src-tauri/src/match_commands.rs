use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use ulid::Ulid;
use crate::models::MatchRow;

// ─────────────────────────────────────────────
// ROSTER
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PlayerRow {
    pub id: String,
    pub org_id: String,
    pub first_name: String,
    pub last_name: String,
    pub number: i64,
    pub role: String,
    pub is_libero: i64,
    pub birth_date: Option<String>,
    pub height_cm: Option<i64>,
    pub hand: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TeamRow {
    pub id: String,
    pub org_id: String,
    pub name: String,
    pub short_name: Option<String>,
    pub is_own_team: i64,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct CreateMatchRequest {
    pub org_id: String,
    pub season_id: String,
    pub home_team_id: String,
    pub away_team_id: String,
    pub date: String,
    pub venue: Option<String>,
    pub competition: Option<String>,  // campionato / torneo
    pub match_phase: Option<String>,  // girone, playoff, finale…
    pub scouted_team: Option<String>,
    pub video_path: Option<String>,
    pub notes: Option<String>,
    pub created_by: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTeamRequest {
    pub org_id: String,
    pub name: String,
    pub short_name: Option<String>,
    pub is_own_team: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlayerRequest {
    pub org_id: String,
    pub first_name: String,
    pub last_name: String,
    pub number: i64,
    pub role: String,
    pub is_libero: Option<bool>,
    pub birth_date: Option<String>,
    pub height_cm: Option<i64>,
    pub hand: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LinkPlayerToTeamRequest {
    pub team_id: String,
    pub player_id: String,
    pub season_id: String,
    pub number: i64,
    pub role: String,
    pub is_libero: Option<bool>,
}

// ─────────────────────────────────────────────
// COMMANDS
// ─────────────────────────────────────────────

#[tauri::command]
pub async fn create_match(
    db: State<'_, SqlitePool>,
    req: CreateMatchRequest,
) -> Result<MatchRow, String> {
    let id = Ulid::new().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    // Store competition and phase in notes as JSON metadata
    let notes_json = {
        let mut parts = vec![];
        if let Some(ref c) = req.competition { parts.push(format!("\"competition\":\"{}\"", c.replace('"', "\\\""))); }
        if let Some(ref p) = req.match_phase { parts.push(format!("\"phase\":\"{}\"", p.replace('"', "\\\""))); }
        if let Some(ref n) = req.notes { parts.push(format!("\"notes\":\"{}\"", n.replace('"', "\\\""))); }
        if parts.is_empty() { None } else { Some(format!("{{{}}}", parts.join(","))) }
    };
    let effective_notes = notes_json.or(req.notes.clone());

    let row = sqlx::query_as::<_, MatchRow>(
        r#"
        INSERT INTO matches
          (id, org_id, season_id, home_team_id, away_team_id,
           scouted_team, date, venue, phase, sets_home, sets_away,
           video_path, notes, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'not_started', 0, 0, ?, ?, ?, ?, ?)
        RETURNING *
        "#,
    )
    .bind(&id)
    .bind(&req.org_id)
    .bind(&req.season_id)
    .bind(&req.home_team_id)
    .bind(&req.away_team_id)
    .bind(req.scouted_team.as_deref().unwrap_or("home"))
    .bind(&req.date)
    .bind(&req.venue)
    .bind(&req.video_path)
    .bind(&effective_notes)
    .bind(&req.created_by)
    .bind(now)
    .bind(now)
    .fetch_one(db.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(row)
}

#[tauri::command]
pub async fn get_teams(
    db: State<'_, SqlitePool>,
    org_id: String,
) -> Result<Vec<TeamRow>, String> {
    let rows = sqlx::query_as::<_, TeamRow>(
        "SELECT * FROM teams WHERE org_id = ? ORDER BY is_own_team DESC, name ASC",
    )
    .bind(&org_id)
    .fetch_all(db.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub async fn create_team(
    db: State<'_, SqlitePool>,
    req: CreateTeamRequest,
) -> Result<TeamRow, String> {
    let id = Ulid::new().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let row = sqlx::query_as::<_, TeamRow>(
        r#"
        INSERT INTO teams (id, org_id, name, short_name, is_own_team, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING *
        "#,
    )
    .bind(&id)
    .bind(&req.org_id)
    .bind(&req.name)
    .bind(&req.short_name)
    .bind(req.is_own_team.unwrap_or(false) as i64)
    .bind(now)
    .fetch_one(db.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(row)
}

#[tauri::command]
pub async fn get_players(
    db: State<'_, SqlitePool>,
    org_id: String,
    team_id: Option<String>,
) -> Result<Vec<PlayerRow>, String> {
    if let Some(tid) = team_id {
        let rows = sqlx::query_as::<_, PlayerRow>(
            r#"
            SELECT p.* FROM players p
            JOIN team_players tp ON tp.player_id = p.id
            WHERE p.org_id = ? AND tp.team_id = ?
            ORDER BY tp.number ASC
            "#,
        )
        .bind(&org_id)
        .bind(&tid)
        .fetch_all(db.inner())
        .await
        .map_err(|e| e.to_string())?;
        Ok(rows)
    } else {
        let rows = sqlx::query_as::<_, PlayerRow>(
            "SELECT * FROM players WHERE org_id = ? ORDER BY number ASC",
        )
        .bind(&org_id)
        .fetch_all(db.inner())
        .await
        .map_err(|e| e.to_string())?;
        Ok(rows)
    }
}

#[tauri::command]
pub async fn create_player(
    db: State<'_, SqlitePool>,
    req: CreatePlayerRequest,
) -> Result<PlayerRow, String> {
    let id = Ulid::new().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    let row = sqlx::query_as::<_, PlayerRow>(
        r#"
        INSERT INTO players
          (id, org_id, first_name, last_name, number, role, is_libero, birth_date, height_cm, hand, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
        "#,
    )
    .bind(&id)
    .bind(&req.org_id)
    .bind(&req.first_name)
    .bind(&req.last_name)
    .bind(req.number)
    .bind(&req.role)
    .bind(req.is_libero.unwrap_or(false) as i64)
    .bind(&req.birth_date)
    .bind(req.height_cm)
    .bind(req.hand.as_deref().unwrap_or("R"))
    .bind(now)
    .fetch_one(db.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(row)
}

#[derive(Debug, Deserialize)]
pub struct UpdatePlayerRequest {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub number: i64,
    pub role: String,
    pub is_libero: Option<bool>,
    pub height_cm: Option<i64>,
    pub hand: Option<String>,
}

#[tauri::command]
pub async fn update_player(
    db: State<'_, SqlitePool>,
    req: UpdatePlayerRequest,
) -> Result<PlayerRow, String> {
    let row = sqlx::query_as::<_, PlayerRow>(
        r#"
        UPDATE players SET
          first_name = ?, last_name = ?, number = ?, role = ?,
          is_libero = ?, height_cm = ?, hand = ?
        WHERE id = ?
        RETURNING *
        "#,
    )
    .bind(&req.first_name)
    .bind(&req.last_name)
    .bind(req.number)
    .bind(&req.role)
    .bind(req.is_libero.unwrap_or(false) as i64)
    .bind(req.height_cm)
    .bind(req.hand.as_deref().unwrap_or("R"))
    .bind(&req.id)
    .fetch_one(db.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(row)
}

#[tauri::command]
pub async fn link_player_to_team(
    db: State<'_, SqlitePool>,
    req: LinkPlayerToTeamRequest,
) -> Result<(), String> {
    let id = Ulid::new().to_string();
    sqlx::query(
        r#"
        INSERT OR IGNORE INTO team_players
          (id, team_id, player_id, season_id, number, role, is_captain, is_libero)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
        "#,
    )
    .bind(&id)
    .bind(&req.team_id)
    .bind(&req.player_id)
    .bind(&req.season_id)
    .bind(req.number)
    .bind(&req.role)
    .bind(req.is_libero.unwrap_or(false) as i64)
    .execute(db.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ─────────────────────────────────────────────
// FORMATIONS
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SetFormationRow {
    pub id: String,
    pub match_id: String,
    pub set_id: String,
    pub set_number: i64,
    pub team_side: String,
    pub pos1_player_id: Option<String>,
    pub pos2_player_id: Option<String>,
    pub pos3_player_id: Option<String>,
    pub pos4_player_id: Option<String>,
    pub pos5_player_id: Option<String>,
    pub pos6_player_id: Option<String>,
    pub setter_id: Option<String>,
    pub libero1_id: Option<String>,
    pub libero2_id: Option<String>,
    pub entry_method: String,
    pub is_confirmed: i64,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct SaveFormationRequest {
    pub match_id: String,
    pub set_id: String,
    pub set_number: i64,
    pub team_side: String,
    pub positions: [Option<String>; 6],
    pub setter_id: Option<String>,
    pub libero1_id: Option<String>,
    pub libero2_id: Option<String>,
    pub entry_method: Option<String>,
}

#[tauri::command]
pub async fn save_formation(
    db: State<'_, SqlitePool>,
    req: SaveFormationRequest,
) -> Result<SetFormationRow, String> {
    let id = Ulid::new().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    let method = req.entry_method.as_deref().unwrap_or("manual");

    let row = sqlx::query_as::<_, SetFormationRow>(
        r#"
        INSERT INTO set_formations
          (id, match_id, set_id, set_number, team_side,
           pos1_player_id, pos2_player_id, pos3_player_id,
           pos4_player_id, pos5_player_id, pos6_player_id,
           setter_id, libero1_id, libero2_id, entry_method, is_confirmed, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(match_id, set_number, team_side) DO UPDATE SET
          pos1_player_id = excluded.pos1_player_id,
          pos2_player_id = excluded.pos2_player_id,
          pos3_player_id = excluded.pos3_player_id,
          pos4_player_id = excluded.pos4_player_id,
          pos5_player_id = excluded.pos5_player_id,
          pos6_player_id = excluded.pos6_player_id,
          setter_id      = excluded.setter_id,
          libero1_id     = excluded.libero1_id,
          libero2_id     = excluded.libero2_id,
          entry_method   = excluded.entry_method,
          is_confirmed   = 1
        RETURNING *
        "#,
    )
    .bind(&id)
    .bind(&req.match_id)
    .bind(&req.set_id)
    .bind(req.set_number)
    .bind(&req.team_side)
    .bind(&req.positions[0])
    .bind(&req.positions[1])
    .bind(&req.positions[2])
    .bind(&req.positions[3])
    .bind(&req.positions[4])
    .bind(&req.positions[5])
    .bind(&req.setter_id)
    .bind(&req.libero1_id)
    .bind(&req.libero2_id)
    .bind(method)
    .bind(now)
    .fetch_one(db.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(row)
}

#[tauri::command]
pub async fn get_formation(
    db: State<'_, SqlitePool>,
    match_id: String,
    set_number: i64,
    team_side: String,
) -> Result<Option<SetFormationRow>, String> {
    let row = sqlx::query_as::<_, SetFormationRow>(
        "SELECT * FROM set_formations WHERE match_id = ? AND set_number = ? AND team_side = ?",
    )
    .bind(&match_id)
    .bind(set_number)
    .bind(&team_side)
    .fetch_optional(db.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(row)
}

// ─────────────────────────────────────────────
// VSP EXPORT / IMPORT
// ─────────────────────────────────────────────

/// Export a match's full event log + metadata as a .vsp file.
/// Opens a native save-file dialog, writes the file, returns the chosen path.
/// Returns None if the user cancelled.
#[tauri::command]
pub async fn export_vsp(
    db: State<'_, SqlitePool>,
    match_id: String,
) -> Result<Option<String>, String> {
    use crate::models::EventRow;

    // Collect all events for the match
    let events: Vec<EventRow> = sqlx::query_as(
        "SELECT * FROM events WHERE match_id = ? ORDER BY sequence ASC",
    )
    .bind(&match_id)
    .fetch_all(db.inner())
    .await
    .map_err(|e| e.to_string())?;

    let match_row: Option<crate::models::MatchRow> =
        sqlx::query_as("SELECT * FROM matches WHERE id = ?")
            .bind(&match_id)
            .fetch_optional(db.inner())
            .await
            .map_err(|e| e.to_string())?;

    let vsp = serde_json::json!({
        "version": 1,
        "format": "vsp",
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "match": match_row,
        "events": events,
    });

    let content = serde_json::to_string_pretty(&vsp).map_err(|e| e.to_string())?;

    // Show native save-file dialog
    let handle = rfd::AsyncFileDialog::new()
        .add_filter("VolleyScoutPro", &["vsp"])
        .set_file_name(format!("partita-{}.vsp", &match_id[..8]))
        .save_file()
        .await;

    if let Some(file) = handle {
        let path = file.path().to_path_buf();
        std::fs::write(&path, content).map_err(|e| e.to_string())?;
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// Open a .vsp file from a native open-file dialog.
/// Returns the raw JSON string so TypeScript can parse and replay it.
#[tauri::command]
pub async fn import_vsp() -> Result<Option<String>, String> {
    let handle = rfd::AsyncFileDialog::new()
        .add_filter("VolleyScoutPro", &["vsp"])
        .pick_file()
        .await;

    if let Some(file) = handle {
        let bytes = file.read().await;
        let content = String::from_utf8(bytes).map_err(|e| e.to_string())?;
        Ok(Some(content))
    } else {
        Ok(None)
    }
}

/// Open a native file picker filtered to common video formats.
/// Returns the absolute path to the chosen file, or None if cancelled.
#[tauri::command]
pub async fn pick_video_file() -> Result<Option<String>, String> {
    let handle = rfd::AsyncFileDialog::new()
        .add_filter("Video", &["mp4", "mov", "avi", "mkv", "webm", "m4v"])
        .set_title("Seleziona file video")
        .pick_file()
        .await;

    Ok(handle.map(|f| f.path().to_string_lossy().to_string()))
}

/// Generic file-save dialog — used for HTML reports and CSV exports.
#[tauri::command]
pub async fn save_file(
    content: String,
    default_name: String,
    filter_ext: String,
    filter_label: String,
) -> Result<Option<String>, String> {
    let handle = rfd::AsyncFileDialog::new()
        .add_filter(&filter_label, &[filter_ext.as_str()])
        .set_file_name(&default_name)
        .save_file()
        .await;

    if let Some(file) = handle {
        let path = file.path().to_path_buf();
        std::fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
        Ok(Some(path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

// ─────────────────────────────────────────────
// BOOTSTRAP (first-run org + season + user)
// ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct BootstrapRequest {
    pub org_name: String,
    pub season_name: String,
    pub user_name: String,
}

#[derive(Debug, Serialize)]
pub struct BootstrapResult {
    pub org_id: String,
    pub season_id: String,
    pub user_id: String,
}

#[tauri::command]
pub async fn bootstrap(
    db: State<'_, SqlitePool>,
    req: BootstrapRequest,
) -> Result<BootstrapResult, String> {
    let now = chrono::Utc::now().timestamp_millis();
    let org_id = Ulid::new().to_string();
    let season_id = Ulid::new().to_string();
    let user_id = Ulid::new().to_string();

    let pool = db.inner();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("INSERT INTO orgs (id, name, created_at) VALUES (?, ?, ?)")
        .bind(&org_id).bind(&req.org_name).bind(now)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query("INSERT INTO seasons (id, org_id, name, is_active, created_at) VALUES (?, ?, ?, 1, ?)")
        .bind(&season_id).bind(&org_id).bind(&req.season_name).bind(now)
        .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    sqlx::query(
        "INSERT INTO users (id, org_id, name, role, created_at) VALUES (?, ?, ?, 'admin', ?)",
    )
    .bind(&user_id).bind(&org_id).bind(&req.user_name).bind(now)
    .execute(&mut *tx).await.map_err(|e| e.to_string())?;

    // Persist IDs to app_state
    for (k, v) in [("active_org_id", &org_id), ("active_season_id", &season_id), ("active_user_id", &user_id)] {
        sqlx::query("INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)")
            .bind(k).bind(v).execute(&mut *tx).await.map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(BootstrapResult { org_id, season_id, user_id })
}

#[tauri::command]
pub async fn get_app_state(
    db: State<'_, SqlitePool>,
    key: String,
) -> Result<Option<String>, String> {
    let row: Option<(String,)> =
        sqlx::query_as("SELECT value FROM app_state WHERE key = ?")
            .bind(&key)
            .fetch_optional(db.inner())
            .await
            .map_err(|e| e.to_string())?;
    Ok(row.map(|(v,)| v))
}
