mod cloud_commands;
mod commands;
mod config_commands;
mod db;
mod match_commands;
mod models;
mod web_server;

use std::sync::Arc;
use tauri::{menu::{MenuBuilder, SubmenuBuilder}, Manager};
use tracing_subscriber::EnvFilter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env()
                .add_directive("volley_scout_pro=debug".parse().unwrap()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()
                .expect("failed to get app data dir");
            let db_path = app_dir.join("volley-scout.db");

            let pool = tauri::async_runtime::block_on(db::open(db_path))
                .expect("failed to open database");
            let pool_arc = Arc::new(pool.clone());
            // Start bench tablet web server
            let _web_tx = web_server::start(pool_arc);
            app.manage(pool);

            // Native macOS menu bar
            let menu = MenuBuilder::new(app)
                .items(&[
                    &SubmenuBuilder::new(app, "VolleyScoutPro")
                        .about(None)
                        .separator()
                        .hide()
                        .hide_others()
                        .show_all()
                        .separator()
                        .quit()
                        .build()?,
                    &SubmenuBuilder::new(app, "Modifica")
                        .undo()
                        .redo()
                        .separator()
                        .cut()
                        .copy()
                        .paste()
                        .select_all()
                        .build()?,
                    &SubmenuBuilder::new(app, "Finestra")
                        .minimize()
                        .maximize()
                        .separator()
                        .close_window()
                        .build()?,
                ])
                .build()?;
            app.set_menu(menu)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Event log
            commands::append_event,
            commands::get_match_events,
            commands::undo_event,
            commands::get_matches,
            commands::get_match,
            commands::update_video_sync_offset,
            // Configuration
            config_commands::get_attack_combinations,
            config_commands::upsert_attack_combination,
            config_commands::delete_attack_combination,
            config_commands::get_setter_calls,
            config_commands::upsert_setter_call,
            config_commands::get_compound_config,
            config_commands::create_config_snapshot,
            config_commands::get_shortcuts,
            config_commands::upsert_shortcut,
            config_commands::delete_shortcut,
            // Match / roster / formation
            match_commands::create_match,
            match_commands::get_teams,
            match_commands::create_team,
            match_commands::get_players,
            match_commands::create_player,
            match_commands::update_player,
            match_commands::link_player_to_team,
            match_commands::save_formation,
            match_commands::get_formation,
            match_commands::bootstrap,
            match_commands::get_app_state,
            match_commands::export_vsp,
            match_commands::import_vsp,
            match_commands::save_file,
            match_commands::pick_video_file,
            // Cloud
            cloud_commands::publish_to_cloud,
            cloud_commands::fetch_from_cloud,
            cloud_commands::save_cloud_credentials,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
