import { useEffect, useCallback } from 'react';
import { useMatchStore } from '@/stores/matchStore';

// ─────────────────────────────────────────────
// GLOBAL KEYBOARD ROUTER
// All scouting input flows through here.
//
// DV4-compatible shortcuts:
//   Enter       — submit current code
//   Esc         — clear buffer
//   Backspace   — delete last char
//   Cmd/Ctrl+Z  — undo last event
//   ,           — Fine Azione: punto Casa (DV4 right key)
//   <           — Fine Azione: punto Ospiti (DV4 left key)
//   F5          — manual point Casa (alternativa)
//   F6          — manual point Ospiti (alternativa)
//   F7          — timeout Casa
//   F8          — timeout Ospiti
// ─────────────────────────────────────────────

export function useKeyboardInput() {
  const {
    appendCode, deleteLastChar, submitCode, clearBuffer, undoLast,
    manualPoint, recordTimeout, togglePause, isPaused,
  } = useMatchStore();

  const handleKeyDown = useCallback(async (e: KeyboardEvent) => {
    // Don't capture keys when a text input / textarea / select is focused
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    // F4 toggles pause regardless of pause state
    if (e.key === 'F4') { e.preventDefault(); togglePause(); return; }

    // While paused: block all other scouting input
    if (isPaused) return;

    // Global shortcuts (with modifier)
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') {
        e.preventDefault();
        await undoLast();
        return;
      }
      return;
    }

    // Function key shortcuts
    if (e.key === 'F5') { e.preventDefault(); await manualPoint('home'); return; }
    if (e.key === 'F6') { e.preventDefault(); await manualPoint('away'); return; }
    if (e.key === 'F7') { e.preventDefault(); await recordTimeout('home'); return; }
    if (e.key === 'F8') { e.preventDefault(); await recordTimeout('away'); return; }

    // Fine Azione DV4 — tasto ',' = punto Casa, '<' = punto Ospiti
    // Questi tasti non fanno parte di nessun codice DV4 valido,
    // quindi vengono intercettati prima dell'appendCode
    if (e.key === ',') { e.preventDefault(); await manualPoint('home'); return; }
    if (e.key === '<') { e.preventDefault(); await manualPoint('away'); return; }

    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        await submitCode();
        break;

      case 'Escape':
        e.preventDefault();
        clearBuffer();
        break;

      case 'Backspace':
        e.preventDefault();
        deleteLastChar();
        break;

      default:
        // Printable ASCII only (32–126), no modifier keys
        if (e.key.length === 1 && !e.altKey && !e.ctrlKey && !e.metaKey) {
          // 'a' è il prefisso Ospiti in DV4 — manteniamo minuscolo per il parser
          // Tutti gli altri char vengono convertiti in maiuscolo
          const char = e.key === 'a' || e.key === 'A' ? e.key : e.key.toUpperCase();
          appendCode(char);
        }
    }
  }, [appendCode, deleteLastChar, submitCode, clearBuffer, undoLast, manualPoint, recordTimeout, togglePause, isPaused]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
