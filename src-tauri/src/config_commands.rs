use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use ulid::Ulid;

// ─────────────────────────────────────────────
// ATTACK COMBINATIONS
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AttackCombination {
    pub id: String,
    pub org_id: String,
    pub season_id: Option<String>,
    pub code: String,
    pub description: String,
    pub ball_type: Option<String>,
    pub attacker_position: Option<String>,
    pub zone_from: Option<i64>,
    pub use_cones: i64,
    pub trajectory_data: Option<String>,
    pub sort_order: i64,
    pub is_active: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpsertAttackCombination {
    pub id: Option<String>,
    pub org_id: String,
    pub season_id: Option<String>,
    pub code: String,
    pub description: String,
    pub ball_type: Option<String>,
    pub attacker_position: Option<String>,
    pub zone_from: Option<i64>,
    pub use_cones: Option<i64>,
    pub trajectory_data: Option<String>,
    pub sort_order: Option<i64>,
}

#[tauri::command]
pub async fn get_attack_combinations(
    db: State<'_, SqlitePool>,
    org_id: String,
    season_id: Option<String>,
) -> Result<Vec<AttackCombination>, String> {
    // Return org-specific + defaults (org_id='__defaults__'), org overrides defaults
    let rows = sqlx::query_as::<_, AttackCombination>(
        r#"
        SELECT * FROM attack_combinations
        WHERE (org_id = ? OR org_id = '__defaults__')
          AND (season_id IS NULL OR season_id = ?)
          AND is_active = 1
        ORDER BY
          CASE WHEN org_id = ? THEN 0 ELSE 1 END,
          sort_order ASC, code ASC
        "#,
    )
    .bind(&org_id)
    .bind(&season_id)
    .bind(&org_id)
    .fetch_all(db.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub async fn upsert_attack_combination(
    db: State<'_, SqlitePool>,
    req: UpsertAttackCombination,
) -> Result<AttackCombination, String> {
    let id = req.id.unwrap_or_else(|| Ulid::new().to_string());

    let row = sqlx::query_as::<_, AttackCombination>(
        r#"
        INSERT INTO attack_combinations
          (id, org_id, season_id, code, description, ball_type, attacker_position,
           zone_from, use_cones, trajectory_data, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(org_id, code, COALESCE(season_id, '')) DO UPDATE SET
          description      = excluded.description,
          ball_type        = excluded.ball_type,
          attacker_position = excluded.attacker_position,
          zone_from        = excluded.zone_from,
          use_cones        = excluded.use_cones,
          trajectory_data  = excluded.trajectory_data,
          sort_order       = excluded.sort_order,
          is_active        = 1
        RETURNING *
        "#,
    )
    .bind(&id)
    .bind(&req.org_id)
    .bind(&req.season_id)
    .bind(&req.code)
    .bind(&req.description)
    .bind(&req.ball_type)
    .bind(&req.attacker_position)
    .bind(req.zone_from)
    .bind(req.use_cones.unwrap_or(0))
    .bind(&req.trajectory_data)
    .bind(req.sort_order.unwrap_or(0))
    .fetch_one(db.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(row)
}

#[tauri::command]
pub async fn delete_attack_combination(
    db: State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    // Soft delete only
    sqlx::query("UPDATE attack_combinations SET is_active = 0 WHERE id = ?")
        .bind(&id)
        .execute(db.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─────────────────────────────────────────────
// SETTER CALLS
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SetterCall {
    pub id: String,
    pub org_id: String,
    pub season_id: Option<String>,
    pub code: String,
    pub description: String,
    pub movement_data: Option<String>,
    pub set_zone_data: Option<String>,
    pub color_hex: String,
    pub is_active: i64,
}

#[derive(Debug, Deserialize)]
pub struct UpsertSetterCall {
    pub id: Option<String>,
    pub org_id: String,
    pub season_id: Option<String>,
    pub code: String,
    pub description: String,
    pub movement_data: Option<String>,
    pub set_zone_data: Option<String>,
    pub color_hex: Option<String>,
}

#[tauri::command]
pub async fn get_setter_calls(
    db: State<'_, SqlitePool>,
    org_id: String,
    season_id: Option<String>,
) -> Result<Vec<SetterCall>, String> {
    let rows = sqlx::query_as::<_, SetterCall>(
        r#"
        SELECT * FROM setter_calls
        WHERE (org_id = ? OR org_id = '__defaults__')
          AND (season_id IS NULL OR season_id = ?)
          AND is_active = 1
        ORDER BY
          CASE WHEN org_id = ? THEN 0 ELSE 1 END, code ASC
        "#,
    )
    .bind(&org_id)
    .bind(&season_id)
    .bind(&org_id)
    .fetch_all(db.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub async fn upsert_setter_call(
    db: State<'_, SqlitePool>,
    req: UpsertSetterCall,
) -> Result<SetterCall, String> {
    let id = req.id.unwrap_or_else(|| Ulid::new().to_string());

    let row = sqlx::query_as::<_, SetterCall>(
        r#"
        INSERT INTO setter_calls
          (id, org_id, season_id, code, description, movement_data, set_zone_data, color_hex, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(org_id, code, COALESCE(season_id, '')) DO UPDATE SET
          description   = excluded.description,
          movement_data = excluded.movement_data,
          set_zone_data = excluded.set_zone_data,
          color_hex     = excluded.color_hex,
          is_active     = 1
        RETURNING *
        "#,
    )
    .bind(&id)
    .bind(&req.org_id)
    .bind(&req.season_id)
    .bind(&req.code)
    .bind(&req.description)
    .bind(&req.movement_data)
    .bind(&req.set_zone_data)
    .bind(req.color_hex.as_deref().unwrap_or("#888888"))
    .fetch_one(db.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(row)
}

// ─────────────────────────────────────────────
// COMPOUND CODE CONFIG
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CompoundCodeConfig {
    pub id: String,
    pub org_id: String,
    pub skill_a: String,
    pub skill_b: String,
    pub quality_map: String,   // JSON
    pub propagate_type: i64,
    pub propagate_zones: i64,
    pub is_active: i64,
}

#[tauri::command]
pub async fn get_compound_config(
    db: State<'_, SqlitePool>,
    org_id: String,
) -> Result<Vec<CompoundCodeConfig>, String> {
    let rows = sqlx::query_as::<_, CompoundCodeConfig>(
        r#"
        SELECT * FROM compound_code_config
        WHERE (org_id = ? OR org_id = '__defaults__') AND is_active = 1
        ORDER BY CASE WHEN org_id = ? THEN 0 ELSE 1 END, skill_a, skill_b
        "#,
    )
    .bind(&org_id)
    .bind(&org_id)
    .fetch_all(db.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

// ─────────────────────────────────────────────
// CODE SHORTCUTS
// ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct CodeShortcut {
    pub id: String,
    pub org_id: String,
    pub shortcut: String,
    pub expands_to: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct UpsertCodeShortcut {
    pub id: Option<String>,
    pub org_id: String,
    pub shortcut: String,
    pub expands_to: String,
    pub description: Option<String>,
}

#[tauri::command]
pub async fn get_shortcuts(
    db: State<'_, SqlitePool>,
    org_id: String,
) -> Result<Vec<CodeShortcut>, String> {
    let rows = sqlx::query_as::<_, CodeShortcut>(
        "SELECT id, org_id, shortcut, expands_to, description FROM code_shortcuts WHERE org_id = ? ORDER BY shortcut ASC",
    )
    .bind(&org_id)
    .fetch_all(db.inner())
    .await
    .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub async fn upsert_shortcut(
    db: State<'_, SqlitePool>,
    req: UpsertCodeShortcut,
) -> Result<CodeShortcut, String> {
    let id = req.id.unwrap_or_else(|| Ulid::new().to_string());

    let row = sqlx::query_as::<_, CodeShortcut>(
        r#"
        INSERT INTO code_shortcuts (id, org_id, shortcut, expands_to, description, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(org_id, shortcut) DO UPDATE SET
          expands_to  = excluded.expands_to,
          description = excluded.description
        RETURNING id, org_id, shortcut, expands_to, description
        "#,
    )
    .bind(&id)
    .bind(&req.org_id)
    .bind(&req.shortcut)
    .bind(&req.expands_to)
    .bind(req.description.as_deref().unwrap_or(""))
    .bind(chrono::Utc::now().timestamp_millis())
    .fetch_one(db.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(row)
}

#[tauri::command]
pub async fn delete_shortcut(
    db: State<'_, SqlitePool>,
    id: String,
) -> Result<(), String> {
    sqlx::query("DELETE FROM code_shortcuts WHERE id = ?")
        .bind(&id)
        .execute(db.inner())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ─────────────────────────────────────────────
// CONFIG SNAPSHOT (on match start)
// ─────────────────────────────────────────────

#[tauri::command]
pub async fn create_config_snapshot(
    db: State<'_, SqlitePool>,
    org_id: String,
    match_id: Option<String>,
) -> Result<String, String> {
    let pool = db.inner();

    // Gather all config in one query
    let combos: Vec<AttackCombination> = sqlx::query_as(
        "SELECT * FROM attack_combinations WHERE org_id = ? AND is_active = 1",
    )
    .bind(&org_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let calls: Vec<SetterCall> = sqlx::query_as(
        "SELECT * FROM setter_calls WHERE org_id = ? AND is_active = 1",
    )
    .bind(&org_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let snapshot = serde_json::json!({
        "attack_combinations": combos,
        "setter_calls": calls,
        "snapshot_at": chrono::Utc::now().timestamp_millis(),
    })
    .to_string();

    let id = Ulid::new().to_string();
    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query(
        "INSERT INTO config_snapshots (id, org_id, match_id, snapshot, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&org_id)
    .bind(&match_id)
    .bind(&snapshot)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(id)
}
