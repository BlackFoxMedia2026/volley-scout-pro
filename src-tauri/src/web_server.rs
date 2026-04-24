// Web Client HTTP server — porta 50105
//
// Serve un'interfaccia HTML/JSON per tablet in panchina senza installare nulla.
// Si avvia in background quando inizia una partita.
// Aggiornamenti via polling JSON (/api/state) oppure WebSocket (/ws).

use axum::{
    body::Body,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, HeaderMap, Method, StatusCode},
    response::{Html, IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};
use tokio_util::io::ReaderStream;

// ─────────────────────────────────────────────
// SHARED STATE
// ─────────────────────────────────────────────

#[derive(Clone)]
pub struct ServerState {
    pub db: Arc<SqlitePool>,
    pub tx: broadcast::Sender<LiveUpdate>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveUpdate {
    pub match_id: String,
    pub score_home: i32,
    pub score_away: i32,
    pub sets_home: i32,
    pub sets_away: i32,
    pub current_set: i32,
    pub serving_team: String,
    pub phase: String,
    pub last_event: Option<LastEvent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LastEvent {
    pub r#type: String,
    pub team_side: Option<String>,
    pub raw_code: Option<String>,
    pub quality: Option<String>,
    pub player_id: Option<String>,
}

// ─────────────────────────────────────────────
// SERVER STARTUP
// ─────────────────────────────────────────────

pub fn start(db: Arc<SqlitePool>) -> broadcast::Sender<LiveUpdate> {
    let (tx, _) = broadcast::channel::<LiveUpdate>(64);
    let tx_clone = tx.clone();
    let state = ServerState { db, tx: tx_clone };

    tauri::async_runtime::spawn(async move {
        let cors = CorsLayer::new()
            .allow_methods([Method::GET, Method::OPTIONS])
            .allow_origin(Any)
            .allow_headers(Any)
            .expose_headers([header::CONTENT_RANGE, header::ACCEPT_RANGES, header::CONTENT_LENGTH]);

        let app = Router::new()
            .route("/", get(serve_index))
            .route("/api/state", get(api_state))
            .route("/ws", get(ws_handler))
            .route("/file", get(serve_file))
            .layer(cors)
            .with_state(state);

        match tokio::net::TcpListener::bind("0.0.0.0:50105").await {
            Ok(l) => {
                tracing::info!("Web client server listening on http://0.0.0.0:50105");
                let _ = axum::serve(l, app).await;
            }
            Err(e) => {
                tracing::warn!("Could not start web client server on port 50105: {}", e);
            }
        }
    });

    tx
}

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

async fn serve_index() -> Html<&'static str> {
    Html(INDEX_HTML)
}

async fn serve_file(
    Query(params): Query<HashMap<String, String>>,
    req_headers: HeaderMap,
) -> Response<Body> {
    let path = match params.get("path") {
        Some(p) => p.clone(),
        None => {
            return Response::builder()
                .status(StatusCode::BAD_REQUEST)
                .body(Body::from("missing path param"))
                .unwrap();
        }
    };

    let mut file = match tokio::fs::File::open(&path).await {
        Ok(f) => f,
        Err(_) => {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("file not found"))
                .unwrap();
        }
    };

    let file_len = match file.metadata().await {
        Ok(m) => m.len(),
        Err(_) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from("metadata error"))
                .unwrap();
        }
    };

    let content_type = content_type_for_path(&path);

    if let Some(range_val) = req_headers.get(header::RANGE) {
        if let Ok(range_str) = range_val.to_str() {
            if let Some(ranges) = range_str.strip_prefix("bytes=") {
                let mut parts = ranges.splitn(2, '-');
                let start: u64 = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
                let end: u64 = parts
                    .next()
                    .and_then(|s| if s.is_empty() { None } else { s.parse().ok() })
                    .unwrap_or(file_len.saturating_sub(1))
                    .min(file_len.saturating_sub(1));
                let length = end.saturating_sub(start) + 1;

                let _ = file.seek(std::io::SeekFrom::Start(start)).await;
                let limited = file.take(length);
                let stream = ReaderStream::new(limited);

                return Response::builder()
                    .status(StatusCode::PARTIAL_CONTENT)
                    .header(header::CONTENT_TYPE, content_type)
                    .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{file_len}"))
                    .header(header::CONTENT_LENGTH, length)
                    .header(header::ACCEPT_RANGES, "bytes")
                    .body(Body::from_stream(stream))
                    .unwrap();
            }
        }
    }

    let stream = ReaderStream::new(file);
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, file_len)
        .header(header::ACCEPT_RANGES, "bytes")
        .body(Body::from_stream(stream))
        .unwrap()
}

fn content_type_for_path(path: &str) -> &'static str {
    let p = path.to_lowercase();
    if p.ends_with(".mp4") { "video/mp4" }
    else if p.ends_with(".mkv") { "video/x-matroska" }
    else if p.ends_with(".webm") { "video/webm" }
    else if p.ends_with(".avi") { "video/x-msvideo" }
    else if p.ends_with(".mov") { "video/quicktime" }
    else { "application/octet-stream" }
}

async fn api_state(State(state): State<ServerState>) -> impl IntoResponse {
    // Return the latest match state from DB
    let row: Option<(String, i64, i64, i64, i64, String)> = sqlx::query_as(
        r#"
        SELECT id, sets_home, sets_away,
          (SELECT COALESCE(MAX(sequence), 0) FROM events WHERE match_id = matches.id) AS last_seq,
          0 AS placeholder, phase
        FROM matches WHERE phase = 'in_progress'
        ORDER BY updated_at DESC LIMIT 1
        "#,
    )
    .fetch_optional(state.db.as_ref())
    .await
    .unwrap_or(None);

    if let Some((match_id, sets_home, sets_away, _, _, phase)) = row {
        // Get current set score from last score-affecting events
        let score: Option<(i64, i64)> = sqlx::query_as(
            r#"
            SELECT
              (SELECT COUNT(*) FROM events WHERE match_id = ? AND type = 'point'
               AND json_extract(payload, '$.pointTeam') = 'home' AND undone_by_seq IS NULL
               AND set_id = (SELECT id FROM sets WHERE match_id = ? ORDER BY set_number DESC LIMIT 1)) as sh,
              (SELECT COUNT(*) FROM events WHERE match_id = ? AND type = 'point'
               AND json_extract(payload, '$.pointTeam') = 'away' AND undone_by_seq IS NULL
               AND set_id = (SELECT id FROM sets WHERE match_id = ? ORDER BY set_number DESC LIMIT 1)) as sa
            "#,
        )
        .bind(&match_id).bind(&match_id).bind(&match_id).bind(&match_id)
        .fetch_optional(state.db.as_ref())
        .await
        .unwrap_or(None);

        let (score_home, score_away) = score.unwrap_or((0, 0));

        let update = LiveUpdate {
            match_id: match_id.clone(),
            score_home: score_home as i32,
            score_away: score_away as i32,
            sets_home: sets_home as i32,
            sets_away: sets_away as i32,
            current_set: (sets_home + sets_away + 1) as i32,
            serving_team: "home".to_string(), // simplified
            phase,
            last_event: None,
        };
        Json(Some(update)).into_response()
    } else {
        Json(Option::<LiveUpdate>::None).into_response()
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<ServerState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| ws_connection(socket, state))
}

async fn ws_connection(mut socket: WebSocket, state: ServerState) {
    let mut rx = state.tx.subscribe();
    loop {
        match rx.recv().await {
            Ok(update) => {
                let json = serde_json::to_string(&update).unwrap_or_default();
                if socket.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
            Err(_) => break,
        }
    }
}

// ─────────────────────────────────────────────
// STATIC HTML
// ─────────────────────────────────────────────

const INDEX_HTML: &str = r#"<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VolleyScoutPro — Live</title>
<style>
  :root { --bg:#0d0f14; --surface:#161b25; --border:#2a3045; --text:#e8ecf4; --muted:#7a8499; --home:#3b82f6; --away:#f97316; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, sans-serif; display: flex; flex-direction: column; height: 100vh; }
  header { background: var(--surface); padding: .75rem 1.5rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  header h1 { font-size: 1rem; font-weight: 700; }
  #status { font-size: .75rem; color: var(--muted); }
  .scoreboard { display: flex; align-items: center; justify-content: center; gap: 2rem; padding: 2rem 1rem; flex: 1; }
  .team { display: flex; flex-direction: column; align-items: center; gap: .5rem; }
  .team-name { font-size: .85rem; color: var(--muted); }
  .score { font-size: 5rem; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; }
  .sets { font-size: 1.2rem; color: var(--muted); }
  .divider { font-size: 3rem; color: var(--border); }
  .home .score { color: var(--home); }
  .away .score { color: var(--away); }
  .meta { display: flex; justify-content: center; gap: 2rem; padding: 1rem; border-top: 1px solid var(--border); font-size: .82rem; color: var(--muted); }
  .serve-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--home); display: inline-block; margin-right: .4rem; }
  #last-event { text-align: center; padding: .5rem; font-size: .85rem; color: var(--muted); border-top: 1px solid var(--border); }
</style>
</head>
<body>
<header>
  <h1>VolleyScoutPro — Live</h1>
  <span id="status">Connessione…</span>
</header>
<div class="scoreboard">
  <div class="team home">
    <div class="team-name">CASA</div>
    <div class="score" id="score-home">0</div>
    <div class="sets" id="sets-home">0</div>
  </div>
  <div class="divider">:</div>
  <div class="team away">
    <div class="score" id="score-away">0</div>
    <div class="sets" id="sets-away">0</div>
    <div class="team-name">OSPITI</div>
  </div>
</div>
<div class="meta">
  <span>Set <span id="set-num">—</span></span>
  <span id="serving">—</span>
</div>
<div id="last-event">—</div>
<script>
let ws;
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => { document.getElementById('status').textContent = 'Live ●'; };
  ws.onclose = () => {
    document.getElementById('status').textContent = 'Disconnesso — riconnessione…';
    setTimeout(connect, 3000);
  };
  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      document.getElementById('score-home').textContent = d.score_home;
      document.getElementById('score-away').textContent = d.score_away;
      document.getElementById('sets-home').textContent = d.sets_home;
      document.getElementById('sets-away').textContent = d.sets_away;
      document.getElementById('set-num').textContent = d.current_set;
      document.getElementById('serving').innerHTML =
        `<span class="serve-dot" style="background:${d.serving_team==='home'?'#3b82f6':'#f97316'}"></span> ${d.serving_team==='home'?'Casa':'Ospiti'} in battuta`;
      if (d.last_event) {
        document.getElementById('last-event').textContent =
          `Ultimo: ${d.last_event.raw_code ?? d.last_event.type}`;
      }
    } catch(e) {}
  };
}
// Fallback polling when WS unavailable
function poll() {
  fetch('/api/state').then(r => r.json()).then(d => {
    if (d) {
      document.getElementById('score-home').textContent = d.score_home;
      document.getElementById('score-away').textContent = d.score_away;
      document.getElementById('sets-home').textContent = d.sets_home;
      document.getElementById('sets-away').textContent = d.sets_away;
      document.getElementById('set-num').textContent = d.current_set;
    }
  }).catch(() => {});
}
connect();
setInterval(poll, 5000); // fallback poll every 5s
</script>
</body>
</html>"#;
