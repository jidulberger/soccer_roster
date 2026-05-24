'use client'

import { Fragment, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  INITIAL_PLAYERS, ALL_GRADES, GRADE_VAL, GRADE_COLORS, POS_COLORS,
  generateRotation,
} from '@/lib/algorithm';

export default function SoccerRotation() {
  const [seed, setSeed] = useState(0);
  const [shiftExclusions, setShiftExclusions] = useState({});
  const [shiftForceIns, setShiftForceIns] = useState({
    // Game 1 H1·2: Thea / Abigail / Emerson / Maddie on field, positions by algorithm
    "0-1": ["Thea", "Abigail", "Emerson", "Maddie"],
  });
  const [shiftForcePositions, setShiftForcePositions] = useState({
    // Game 1 H1·1: Harlow G · Ona D · Maron R · Amelia R · Mae Mae O
    "0-0": { "Harlow": "G", "Ona": "D", "Maron": "R", "Amelia": "R", "Mae Mae": "O" },
    // Game 1 H1·2: Harlow stays in goal
    "0-1": { "Harlow": "G" },
  });
  const [gameExclusions, setGameExclusions] = useState({});
  const [lockedShifts, setLockedShifts] = useState({});
  const [killedShifts, setKilledShifts] = useState({}); // { "g-s": true } — shifts to skip & slide up
  const [goalieMode, setGoalieMode] = useState("pairs"); // "pairs" (2-shift) | "halves" (4-shift)
  const [shiftsPerGame, setShiftsPerGame] = useState([8, 8, 8, 8]); // per-game [G1, G2, G3, G4], each 4|6|8
  const [players, setPlayers] = useState(INITIAL_PLAYERS);
  const [showRoster, setShowRoster] = useState(false);
  const [activeGame, setActiveGameRaw] = useState(0);
  const setActiveGame = useCallback((g) => {
    setActiveGameRaw(g);
    try { window.localStorage.setItem("dw_activeGame", String(g)); } catch(e) {}
  }, []);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("dw_activeGame");
      if (saved !== null) setActiveGameRaw(Number(saved));
    } catch(e) {}
  }, []);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState([]); // local undo stack — not synced to server
  // positionPicker: which sitting cell the user tapped — shows position chooser bar
  const [positionPicker, setPositionPicker] = useState(null); // { g, s, playerName } | null
  // shiftEditorModal: full shift editor — tap a column header to open
  const [shiftEditorModal, setShiftEditorModal] = useState(null); // { g, s } | null
  const [editorDraft, setEditorDraft] = useState({ G: null, D: null, R1: null, R2: null, O: null });
  const [editorPickingSlot, setEditorPickingSlot] = useState(null); // "G"|"D"|"R1"|"R2"|"O"|null
  const [syncInfo, setSyncInfo] = useState({ storage: "?", savedAt: null, fetchedAt: null, error: null });
  const [syncFlash, setSyncFlash] = useState(false); // brief green glow when poll picks up remote changes
  const [totalsTab, setTotalsTab] = useState("total"); // "this" | "sofar" | "total"
  const [timerHalfMin, setTimerHalfMin] = useState(20);
  const [timerIntervalMin, setTimerIntervalMin] = useState(5);
  const [timerWarnSec, setTimerWarnSec] = useState(60);
  const [timerHalf, setTimerHalf] = useState(1);
  const [gameResults, setGameResults] = useState({}); // { 0: {home:3,away:2}, 1: ... }
  const [scoreForm, setScoreForm] = useState({ home: '', away: '' });

  // Keep score form in sync with active game's saved result
  useEffect(() => {
    const r = gameResults[activeGame];
    setScoreForm(r ? { home: String(r.home), away: String(r.away) } : { home: '', away: '' });
  }, [activeGame, gameResults]);

  const applyBlobState = useCallback((state) => {
    if (state.seed !== undefined) setSeed(state.seed);
    if (state.shiftExclusions) setShiftExclusions(state.shiftExclusions);
    if (state.shiftForceIns) setShiftForceIns(state.shiftForceIns);
    if (state.shiftForcePositions) setShiftForcePositions(state.shiftForcePositions);
    if (state.gameExclusions) setGameExclusions(state.gameExclusions);
    if (state.lockedShifts) setLockedShifts(state.lockedShifts);
    if (state.killedShifts) setKilledShifts(state.killedShifts);
    if (state.goalieMode) setGoalieMode(state.goalieMode);
    if (state.shiftsPerGame) {
      setShiftsPerGame(Array.isArray(state.shiftsPerGame)
        ? state.shiftsPerGame
        : [state.shiftsPerGame, state.shiftsPerGame, state.shiftsPerGame, state.shiftsPerGame]);
    }
    if (state.players) setPlayers(state.players);
    if (state.timerHalfMin) setTimerHalfMin(state.timerHalfMin);
    if (state.timerIntervalMin) setTimerIntervalMin(state.timerIntervalMin);
    if (state.timerWarnSec) setTimerWarnSec(state.timerWarnSec);
    if (state.timerHalf !== undefined) setTimerHalf(state.timerHalf);
    if (state.gameResults) setGameResults(state.gameResults);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tryLoad = async () => {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const state = await res.json();
        if (cancelled) return;
        // Don't trust a payload that looks empty/error — refuse to load it
        // so the debounce save can't overwrite real blob data with our initial state.
        if (state._error || state._storage === 'blob-error') throw new Error(state._error || 'blob-error');
        applyBlobState(state);
        lastSeenSavedAtRef.current = state._savedAt || 0;
        setSyncInfo({ storage: state._storage || "?", savedAt: state._savedAt || null, fetchedAt: Date.now() });
        setLoaded(true);
      } catch (e) {
        if (cancelled) return;
        setSyncInfo(prev => ({ ...prev, storage: 'load-failed', error: String(e?.message || e), fetchedAt: Date.now() }));
        setTimeout(tryLoad, 3000); // retry until we get a clean load — never auto-save before then
      }
    };
    tryLoad();
    return () => { cancelled = true; };
  }, [applyBlobState]);

  // lastSeenSavedAtRef: the blob _savedAt we most recently fetched or saved ourselves.
  // Comparing against this (not our save time) means device B won't skip device A's
  // changes just because B saved something more recently.
  const lastSeenSavedAtRef = useRef(0);
  const skipNextSaveRef = useRef(false); // prevent poll-triggered debounce from re-saving

  useEffect(() => {
    if (!loaded) return;
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    const timer = setTimeout(() => {
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed, shiftExclusions, shiftForceIns, shiftForcePositions, gameExclusions, lockedShifts, killedShifts, goalieMode, shiftsPerGame, players, timerHalfMin, timerIntervalMin, timerWarnSec, timerHalf, gameResults }),
      }).then(r => r.json()).then(j => {
        lastSeenSavedAtRef.current = j.savedAt || 0;
        setSyncInfo(prev => ({ ...prev, storage: j.storage || prev.storage, savedAt: j.savedAt || prev.savedAt, error: j.error || null }));
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [seed, shiftExclusions, shiftForceIns, shiftForcePositions, gameExclusions, lockedShifts, killedShifts, goalieMode, shiftsPerGame, players, timerHalfMin, timerIntervalMin, timerWarnSec, timerHalf, gameResults, loaded]);

  const handleSync = useCallback(async () => {
    try {
      const state = await fetch('/api/state').then(r => r.json());
      lastSeenSavedAtRef.current = state._savedAt || 0;
      applyBlobState(state);
      setSyncInfo({ storage: state._storage || "?", savedAt: state._savedAt || null, fetchedAt: Date.now() });
    } catch(e) {}
  }, [applyBlobState]);

  // Undo stack — snapshot overrideable state into a ref so saveToHistory is stable
  const snapRef = useRef({});
  useEffect(() => {
    snapRef.current = { shiftExclusions, shiftForceIns, shiftForcePositions, gameExclusions, lockedShifts, killedShifts };
  }, [shiftExclusions, shiftForceIns, shiftForcePositions, gameExclusions, lockedShifts, killedShifts]);

  // Always-current state ref — used by saveNow to avoid stale closures
  const currentStateRef = useRef({});
  useEffect(() => {
    currentStateRef.current = { seed, shiftExclusions, shiftForceIns, shiftForcePositions, gameExclusions, lockedShifts, killedShifts, goalieMode, shiftsPerGame, players, timerHalfMin, timerIntervalMin, timerWarnSec, timerHalf, gameResults };
  }, [seed, shiftExclusions, shiftForceIns, shiftForcePositions, gameExclusions, lockedShifts, killedShifts, goalieMode, shiftsPerGame, players, timerHalfMin, timerIntervalMin, timerWarnSec, timerHalf, gameResults]);

  // Immediate save — used for lock/kill/score to ensure cross-device visibility
  const saveNow = useCallback(async (overrides = {}) => {
    if (!loaded) return;
    const payload = { ...currentStateRef.current, ...overrides };
    try {
      const j = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json());
      lastSeenSavedAtRef.current = j.savedAt || 0;
      setSyncInfo(prev => ({ ...prev, storage: j.storage || prev.storage, savedAt: j.savedAt || prev.savedAt, error: j.error || null }));
    } catch(e) {}
  }, [loaded]);

  // Poll every 5 seconds — skip if blob version unchanged since last fetch/save
  useEffect(() => {
    if (!loaded) return;
    const id = setInterval(async () => {
      try {
        const state = await fetch('/api/state').then(r => r.json());
        const isNewer = state._savedAt && state._savedAt > lastSeenSavedAtRef.current;
        if (isNewer) {
          lastSeenSavedAtRef.current = state._savedAt;
          skipNextSaveRef.current = true; // prevent debounce from re-saving this polled data
          applyBlobState(state);
          setSyncInfo({ storage: state._storage || "?", savedAt: state._savedAt, fetchedAt: Date.now() });
          setSyncFlash(true);
          setTimeout(() => setSyncFlash(false), 1200);
        } else {
          setSyncInfo(prev => ({ ...prev, fetchedAt: Date.now() }));
        }
      } catch(e) {}
    }, 5000);
    return () => clearInterval(id);
  }, [loaded, applyBlobState]);

  const saveToHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-9), { ...snapRef.current }]);
  }, []);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const snap = prev[prev.length - 1];
      setShiftExclusions(snap.shiftExclusions);
      setShiftForceIns(snap.shiftForceIns);
      setShiftForcePositions(snap.shiftForcePositions);
      setGameExclusions(snap.gameExclusions);
      setLockedShifts(snap.lockedShifts);
      if (snap.killedShifts !== undefined) setKilledShifts(snap.killedShifts);
      return prev.slice(0, -1);
    });
  }, []);

  // Active game's shift count drives the grid layout
  const activeShiftCount = shiftsPerGame[activeGame] || 8;
  const shiftsPerHalf = activeShiftCount / 2;

  // Render ALL shifts for the active game; killed ones get a special look.
  const visibleH1 = Array.from({ length: shiftsPerHalf }, (_, i) => i);
  const visibleH2 = Array.from({ length: shiftsPerHalf }, (_, i) => i + shiftsPerHalf);

  const toggleKillShift = useCallback((gameIdx, shiftIdx) => {
    saveToHistory();
    const key = `${gameIdx}-${shiftIdx}`;
    const cur = currentStateRef.current.killedShifts || {};
    const next = { ...cur };
    if (next[key]) delete next[key]; else next[key] = true;
    setKilledShifts(next);
    saveNow({ killedShifts: next });
  }, [saveToHistory, saveNow]);

  const { games, totalShifts, totalPositions } = useMemo(() => {
    return generateRotation(seed, players, shiftExclusions, gameExclusions, shiftForceIns, lockedShifts, shiftForcePositions, goalieMode, shiftsPerGame, killedShifts);
  }, [seed, players, shiftExclusions, gameExclusions, shiftForceIns, lockedShifts, shiftForcePositions, goalieMode, shiftsPerGame, killedShifts]);

  const displayedTotals = useMemo(() => {
    const fromG = totalsTab === "this" ? activeGame : 0;
    const toG = totalsTab === "total" ? 3 : activeGame;
    const result = {};
    players.forEach(p => { result[p.name] = { G: 0, D: 0, R: 0, O: 0, total: 0 }; });
    for (let g = fromG; g <= toG; g++) {
      (games[g] || []).forEach(shift => {
        if (!shift || shift._killed) return;
        const add = (name, pos) => {
          if (name && result[name]) { result[name][pos]++; result[name].total++; }
        };
        add(shift.G, 'G'); add(shift.D, 'D'); add(shift.R1, 'R'); add(shift.R2, 'R'); add(shift.O, 'O');
      });
    }
    return result;
  }, [games, players, totalsTab, activeGame]);

  const excludeFromShift = useCallback((gameIdx, shiftIdx, playerName) => {
    saveToHistory();
    setShiftExclusions(prev => {
      const key = `${gameIdx}-${shiftIdx}`;
      const list = [...(prev[key] || [])];
      if (!list.includes(playerName)) list.push(playerName);
      return { ...prev, [key]: list };
    });
  }, [saveToHistory]);

  const toggleGameExclusion = useCallback((gameIdx, playerName) => {
    saveToHistory();
    setGameExclusions(prev => {
      const list = [...(prev[gameIdx] || [])];
      const idx = list.indexOf(playerName);
      if (idx >= 0) {
        setShiftExclusions(prevSE => {
          const nse = { ...prevSE };
          for (let s = 0; s < 8; s++) {
            const key = `${gameIdx}-${s}`;
            if (nse[key]) {
              nse[key] = nse[key].filter(n => n !== playerName);
              if (nse[key].length === 0) delete nse[key];
            }
          }
          return nse;
        });
        return { ...prev, [gameIdx]: list.filter(n => n !== playerName) };
      }
      return { ...prev, [gameIdx]: [...list, playerName] };
    });
  }, []);

  const restoreFromShift = useCallback((gameIdx, shiftIdx, playerName) => {
    saveToHistory();
    setShiftExclusions(prev => {
      const key = `${gameIdx}-${shiftIdx}`;
      if (!prev[key]) return prev;
      const list = prev[key].filter(n => n !== playerName);
      if (list.length === 0) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: list };
    });
  }, [saveToHistory]);

  // Force a player into a shift, optionally at a specific position (G/D/R/O).
  // If position is null, any position (algorithm decides).
  const forceIntoShift = useCallback((gameIdx, shiftIdx, playerName, position = null) => {
    saveToHistory();
    const key = `${gameIdx}-${shiftIdx}`;
    setShiftForceIns(prev => {
      const list = [...(prev[key] || [])];
      if (!list.includes(playerName)) list.push(playerName);
      return { ...prev, [key]: list };
    });
    if (position) {
      setShiftForcePositions(prev => ({
        ...prev,
        [key]: { ...(prev[key] || {}), [playerName]: position },
      }));
    }
  }, [saveToHistory]);

  const unforceFromShift = useCallback((gameIdx, shiftIdx, playerName) => {
    saveToHistory();
    const key = `${gameIdx}-${shiftIdx}`;
    setShiftForceIns(prev => {
      if (!prev[key]) return prev;
      const list = prev[key].filter(n => n !== playerName);
      if (list.length === 0) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: list };
    });
    setShiftForcePositions(prev => {
      if (!prev[key] || !prev[key][playerName]) return prev;
      const { [playerName]: _removed, ...rest } = prev[key];
      if (Object.keys(rest).length === 0) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: rest };
    });
  }, [saveToHistory]);

  // Remove player from shift: clears any force and adds to exclusions (one undo entry).
  const removeFromShift = useCallback((gameIdx, shiftIdx, playerName) => {
    saveToHistory();
    const key = `${gameIdx}-${shiftIdx}`;
    setShiftForceIns(prev => {
      if (!prev[key]) return prev;
      const list = prev[key].filter(n => n !== playerName);
      if (list.length === 0) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: list };
    });
    setShiftForcePositions(prev => {
      if (!prev[key] || !prev[key][playerName]) return prev;
      const { [playerName]: _r, ...rest } = prev[key];
      if (Object.keys(rest).length === 0) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: rest };
    });
    setShiftExclusions(prev => {
      const list = [...(prev[key] || [])];
      if (!list.includes(playerName)) list.push(playerName);
      return { ...prev, [key]: list };
    });
  }, [saveToHistory]);

  const toggleLockShift = useCallback((gameIdx, shiftIdx) => {
    saveToHistory();
    const key = `${gameIdx}-${shiftIdx}`;
    const cur = currentStateRef.current.lockedShifts || {};
    const next = { ...cur };
    if (next[key]) { delete next[key]; }
    else {
      const shift = games[gameIdx]?.[shiftIdx];
      if (shift) next[key] = { ...shift };
    }
    setLockedShifts(next);
    saveNow({ lockedShifts: next });
  }, [games, saveToHistory, saveNow]);

  const openShiftEditor = useCallback((g, s) => {
    const current = lockedShifts[`${g}-${s}`] || games[g]?.[s] || {};
    setEditorDraft({ G: current.G || null, D: current.D || null, R1: current.R1 || null, R2: current.R2 || null, O: current.O || null });
    setEditorPickingSlot(null);
    setShiftEditorModal({ g, s });
  }, [lockedShifts, games]);

  const saveShiftEditor = useCallback(() => {
    if (!shiftEditorModal) return;
    saveToHistory();
    const { g, s } = shiftEditorModal;
    const key = `${g}-${s}`;
    const state = currentStateRef.current;
    const newLocks = { ...(state.lockedShifts || {}), [key]: { ...editorDraft } };
    let newForcePositions = { ...(state.shiftForcePositions || {}) };

    // Propagate goalie to partner shifts in the same goalie block so the
    // user doesn't have to edit each shift individually.
    if (editorDraft.G) {
      const sg = Array.isArray(state.shiftsPerGame) ? (state.shiftsPerGame[g] || 8) : 8;
      const blockSize = state.goalieMode === 'halves' ? (sg / 2) : 2;
      const blockStart = Math.floor(s / blockSize) * blockSize;
      for (let ps = blockStart; ps < Math.min(blockStart + blockSize, sg); ps++) {
        if (ps === s) continue;
        const pk = `${g}-${ps}`;
        if (newLocks[pk]) {
          newLocks[pk] = { ...newLocks[pk], G: editorDraft.G };
        } else {
          // Force the goalie for this unlocked shift, remove any prior force-G
          const existing = newForcePositions[pk] || {};
          const cleaned = Object.fromEntries(Object.entries(existing).filter(([, pos]) => pos !== 'G'));
          newForcePositions[pk] = { ...cleaned, [editorDraft.G]: 'G' };
        }
      }
    }

    setLockedShifts(newLocks);
    setShiftForcePositions(newForcePositions);
    setShiftEditorModal(null);
    saveNow({ lockedShifts: newLocks, shiftForcePositions: newForcePositions });
  }, [shiftEditorModal, editorDraft, saveToHistory, saveNow]);

  const isGameExcluded  = (gi, name) => (gameExclusions[gi] || []).includes(name);
  const isShiftExcluded = (gi, si, name) => (shiftExclusions[`${gi}-${si}`] || []).includes(name);
  const isShiftForced   = (gi, si, name) => (shiftForceIns[`${gi}-${si}`] || []).includes(name);
  const getForcedPos    = (gi, si, name) => (shiftForcePositions[`${gi}-${si}`] || {})[name] || null;

  const exCount = (gi) => {
    const ge = (gameExclusions[gi] || []).length;
    const se = new Set();
    for (let s = 0; s < 8; s++) { (shiftExclusions[`${gi}-${s}`] || []).forEach(n => se.add(n)); }
    return ge + se.size;
  };

  const getPos = (shift, name) => {
    if (!shift) return "";
    if (shift.G === name) return "G"; if (shift.D === name) return "D";
    if (shift.R1 === name) return "R"; if (shift.R2 === name) return "R";
    if (shift.O === name) return "O"; return "";
  };

  const hasAnyOverrides = Object.values(gameExclusions).some(e => e.length > 0) ||
    Object.keys(shiftExclusions).length > 0 ||
    Object.keys(shiftForceIns).length > 0 ||
    Object.keys(shiftForcePositions).length > 0 ||
    Object.keys(lockedShifts).length > 0;

  // ── Styles ──
  const S = {
    root: { fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", padding: "16px", maxWidth: "920px", margin: "0 auto", color: "#1a1a2e" },
    tabs: { display: "flex", gap: "6px", marginBottom: "12px" },
    tab: (on) => ({ flex: 1, padding: "9px 0", border: on ? "2px solid #1a1a2e" : "2px solid #e5e7eb", borderRadius: "8px",
      background: on ? "#1a1a2e" : "#fff", color: on ? "#fff" : "#1a1a2e", fontFamily: "'DM Sans'", fontWeight: 600, fontSize: "13px", cursor: "pointer" }),
    grid: { background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden",
      display: "grid",
      gridTemplateColumns: `82px repeat(${visibleH1.length}, minmax(0, 1fr)) 3px repeat(${visibleH2.length}, minmax(0, 1fr))`,
      marginBottom: "16px" },
    badge: (pos) => ({
      fontSize: "10px", fontFamily: "'DM Mono', monospace", fontWeight: 600,
      padding: "2px 4px", borderRadius: "4px",
      border: "1px solid transparent",
      display: "block", textAlign: "center", userSelect: "none",
      boxSizing: "border-box", minWidth: "22px",
      background: POS_COLORS[pos]?.bg || "transparent",
      color: POS_COLORS[pos]?.text || "#ccc",
      cursor: "pointer",
    }),
    xBadge: {
      fontSize: "10px", fontFamily: "'DM Mono', monospace", fontWeight: 600,
      padding: "2px 4px", borderRadius: "4px",
      border: "1px dashed #fca5a5",
      display: "block", textAlign: "center", userSelect: "none",
      boxSizing: "border-box", minWidth: "22px",
      background: "#fef2f2", color: "#991b1b",
      cursor: "pointer",
    },
    sit: {
      fontSize: "10px", fontFamily: "'DM Mono', monospace", fontWeight: 600,
      padding: "2px 4px", borderRadius: "4px",
      border: "1px solid transparent",
      display: "block", textAlign: "center", userSelect: "none",
      boxSizing: "border-box", minWidth: "22px",
      background: "transparent", color: "#ccc",
      cursor: "pointer",
    },
    btn: (bg = "#1a1a2e") => ({ padding: "9px 18px", background: bg, color: "#fff", border: "none", borderRadius: "8px",
      fontFamily: "'DM Sans'", fontWeight: 600, fontSize: "12px", cursor: "pointer" }),
  };

  const cHdr  = (extra = {}) => ({ padding: "8px 2px", fontSize: "10px", fontWeight: 600, color: "#999",
    textAlign: "center", textTransform: "uppercase", letterSpacing: "0.5px",
    background: "#fafafa", borderBottom: "2px solid #e5e7eb", ...extra });
  const cLock = (extra = {}) => ({ padding: "4px 2px", display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", background: "#f0fdf4", borderBottom: "1px solid #e5e7eb", ...extra });
  const cData = (bg, bdr, extra = {}) => ({ padding: "4px 2px", display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", background: bg, ...bdr, ...extra });
  const cAvg  = (extra = {}) => ({ padding: "4px 2px", display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden", background: "#f8f7f4", borderTop: "2px solid #e5e7eb", ...extra });
  const cDiv  = (extra = {}) => ({ background: "#1a1a2e", ...extra });

  if (!loaded) {
    return (
      <div style={{ ...S.root, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "200px" }}>
        <span style={{ fontSize: "14px", color: "#999" }}>Loading rotation...</span>
      </div>
    );
  }


  return (
    <div style={S.root}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 2px", letterSpacing: "-0.5px" }}>⚽ Deathwalkers Roster Rotation</h1>
      <MatchTimer
        halfMin={timerHalfMin} setHalfMin={v => { setTimerHalfMin(v); saveNow({ timerHalfMin: v }); }}
        intervalMin={timerIntervalMin} setIntervalMin={v => { setTimerIntervalMin(v); saveNow({ timerIntervalMin: v }); }}
        warnSec={timerWarnSec} setWarnSec={v => { setTimerWarnSec(v); saveNow({ timerWarnSec: v }); }}
        half={timerHalf} setHalf={v => { setTimerHalf(v); saveNow({ timerHalf: v }); }}
        activeGame={activeGame}
        gameResult={gameResults[activeGame]}
        onSetResult={(home, away) => {
          const next = { ...gameResults };
          if (home === null) { delete next[activeGame]; } else { next[activeGame] = { home, away }; }
          setGameResults(next);
          saveNow({ gameResults: next });
        }}
      />
      <p style={{ fontSize: "11px", color: "#666", margin: "0 0 4px", lineHeight: 1.5 }}>
        Tap <b>badge</b> or <b>–</b> → set / change position&nbsp;&nbsp;·&nbsp;&nbsp;
        Tap <b style={{ color: "#991b1b" }}>✕</b> → undo&nbsp;&nbsp;·&nbsp;&nbsp;
        Tap <b>name</b> → out for game
      </p>
      <p style={{ fontSize: "10px", color: "#2563eb", margin: "0 0 12px", fontWeight: 500 }}>
        💾 Changes auto-save and sync to all devices
      </p>

      {/* Roster editor */}
      <div style={{ marginBottom: "12px" }}>
        <button onClick={() => setShowRoster(!showRoster)} style={{ ...S.btn(showRoster ? "#7c3aed" : "#444"), fontSize: "11px", padding: "6px 14px" }}>
          {showRoster ? "Hide Roster" : "📋 Edit Roster"}
        </button>
        {showRoster && (
          <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px",
            background: "#f9fafb", borderRadius: "10px", padding: "12px", border: "1px solid #e5e7eb" }}>
            {players.map(p => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, width: "80px" }}>{p.name}</span>
                <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
                  {ALL_GRADES.map(gr => (
                    <button key={gr} onClick={() => setPlayers(prev => prev.map(x => x.name === p.name ? { ...x, grade: gr } : x))}
                      style={{
                        padding: "3px 5px", borderRadius: "4px", fontSize: "10px", fontWeight: 600, cursor: "pointer",
                        fontFamily: "'DM Mono'", minWidth: "26px",
                        background: p.grade === gr ? GRADE_COLORS[gr] : "#fff",
                        color: p.grade === gr ? (["A+", "A", "A-", "B+"].includes(gr) ? "#fff" : "#1a1a2e") : "#999",
                        border: p.grade === gr ? `2px solid ${GRADE_COLORS[gr]}` : "1px solid #e5e7eb",
                      }}>
                      {gr}
                    </button>
                  ))}
                </div>
                <button onClick={() => setPlayers(prev => prev.map(x => x.name === p.name ? { ...x, canGoalie: !x.canGoalie } : x))}
                  style={{
                    padding: "3px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 600, cursor: "pointer",
                    fontFamily: "'DM Sans'", marginLeft: "auto",
                    background: p.canGoalie ? "#d97706" : "#f3f4f6", color: p.canGoalie ? "#fff" : "#999",
                    border: p.canGoalie ? "2px solid #b45309" : "1px solid #e5e7eb",
                  }}>
                  {p.canGoalie ? "🧤 GK" : "GK"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Game tabs */}
      <div style={S.tabs}>
        {[0, 1, 2, 3].map(g => {
          const ec = exCount(g);
          const result = gameResults[g];
          return <button key={g} onClick={() => setActiveGame(g)} style={S.tab(activeGame === g)}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
              <span>
                {result ? "✅" : ""} G{g + 1}
                {ec > 0 && <span style={{ color: activeGame === g ? "#fca5a5" : "#dc2626", marginLeft: "3px" }}>−{ec}</span>}
              </span>
              {result && <span style={{ fontSize: "9px", opacity: 0.85, fontFamily: "'DM Mono'", letterSpacing: "0.5px" }}>
                {result.home}–{result.away}
              </span>}
            </span>
          </button>;
        })}
      </div>


      {/* Per-game shifts selector + result */}
      <div style={{ display: "flex", gap: "4px", alignItems: "center", marginBottom: "6px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", fontWeight: 600, color: "#888", marginRight: "2px" }}>
          G{activeGame + 1} shifts:
        </span>
        {[4, 6, 8].map(n => (
          <button key={n} onClick={() => setShiftsPerGame(prev => {
            const next = [...prev];
            next[activeGame] = n;
            return next;
          })} style={{
            padding: "4px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 700,
            cursor: "pointer", fontFamily: "'DM Mono'", border: "none",
            background: activeShiftCount === n ? "#1a1a2e" : "#f0f0f0",
            color: activeShiftCount === n ? "#fff" : "#666",
          }}>{n}</button>
        ))}
        <span style={{ fontSize: "10px", color: "#bbb", marginLeft: "8px" }}>
          all: [{shiftsPerGame.map((n, i) => i === activeGame ? <b key={i} style={{color:"#1a1a2e"}}>{n}</b> : <span key={i}>{n}</span>).reduce((a, c, i) => i === 0 ? [c] : [...a, ", ", c], [])}]
        </span>
      </div>

      {/* Game result row */}
      {(() => {
        const result = gameResults[activeGame];
        const inputS = { width: "56px", padding: "4px 6px", borderRadius: "6px", border: "1px solid #e5e7eb", fontSize: "13px", fontFamily: "'DM Mono'", fontWeight: 700, textAlign: "center" };
        if (result) return (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "10px", fontWeight: 600, color: "#888" }}>Final:</span>
            <span style={{ fontFamily: "'DM Mono'", fontWeight: 800, fontSize: "15px" }}>
              {result.home} – {result.away}
            </span>
            <button onClick={() => {
              const next = { ...gameResults };
              delete next[activeGame];
              setGameResults(next);
              saveNow({ gameResults: next });
              setScoreForm({ home: '', away: '' });
            }} style={{ padding: "3px 8px", borderRadius: "5px", border: "1px solid #fca5a5", background: "#fff5f5", color: "#dc2626", fontSize: "10px", fontWeight: 600, cursor: "pointer" }}>
              clear
            </button>
          </div>
        );
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
            <span style={{ fontSize: "10px", fontWeight: 600, color: "#888" }}>G{activeGame + 1} result:</span>
            <input type="number" min="0" max="99" placeholder="Us" value={scoreForm.home}
              onChange={e => setScoreForm(p => ({ ...p, home: e.target.value }))}
              style={inputS} />
            <span style={{ fontWeight: 700, color: "#888" }}>–</span>
            <input type="number" min="0" max="99" placeholder="Them" value={scoreForm.away}
              onChange={e => setScoreForm(p => ({ ...p, away: e.target.value }))}
              style={inputS} />
            <button onClick={() => {
              const h = parseInt(scoreForm.home, 10);
              const a = parseInt(scoreForm.away, 10);
              if (isNaN(h) || isNaN(a)) return;
              const next = { ...gameResults, [activeGame]: { home: h, away: a } };
              setGameResults(next);
              saveNow({ gameResults: next });
            }} style={{ padding: "4px 10px", borderRadius: "6px", border: "none", background: "#1a1a2e", color: "#fff", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
              ✅ Done
            </button>
          </div>
        );
      })()}

      {/* Rotation grid */}
      <div style={S.grid}>

        {/* Header row */}
        <div style={{ padding: "8px", fontSize: "10px", fontWeight: 600, color: "#999", textTransform: "uppercase",
          background: "#fafafa", borderBottom: "2px solid #e5e7eb" }}>Player</div>
        {visibleH1.map((origIdx, i) => {
          const k = !!killedShifts[`${activeGame}-${origIdx}`];
          return <div key={origIdx} style={cHdr(k ? { color: "#991b1b", textDecoration: "line-through" } : {})}>H1·{i + 1}{k && " 💀"}</div>;
        })}
        <div style={cDiv({ borderBottom: "2px solid #1a1a2e" })} />
        {visibleH2.map((origIdx, i) => {
          const k = !!killedShifts[`${activeGame}-${origIdx}`];
          return <div key={origIdx} style={cHdr(k ? { color: "#991b1b", textDecoration: "line-through" } : {})}>H2·{i + 1}{k && " 💀"}</div>;
        })}

        {/* Lock/Edit row — tap any cell to open the shift editor.
            Lock icon shows whether the shift is currently locked. */}
        <div style={{ padding: "4px 8px", fontSize: "9px", fontWeight: 600, color: "#888",
          background: "#f0fdf4", borderBottom: "1px solid #e5e7eb" }}>Edit</div>
        {visibleH1.map(s => {
          const lk = `${activeGame}-${s}`;
          return (
            <div key={s} style={cLock({ cursor: "pointer", background: killedShifts[lk] ? "#fef2f2" : undefined })} onClick={() => openShiftEditor(activeGame, s)}>
              <span style={{ fontSize: "14px", userSelect: "none" }}>{killedShifts[lk] ? "💀" : lockedShifts[lk] ? "🔒" : "✏️"}</span>
            </div>
          );
        })}
        <div style={cDiv({ borderBottom: "1px solid #1a1a2e" })} />
        {visibleH2.map(s => {
          const lk = `${activeGame}-${s}`;
          return (
            <div key={s} style={cLock({ cursor: "pointer", background: killedShifts[lk] ? "#fef2f2" : undefined })} onClick={() => openShiftEditor(activeGame, s)}>
              <span style={{ fontSize: "14px", userSelect: "none" }}>{killedShifts[lk] ? "💀" : lockedShifts[lk] ? "🔒" : "✏️"}</span>
            </div>
          );
        })}

        {/* Player rows */}
        {players.map((player, pi) => {
          const g = activeGame;
          const gameEx = isGameExcluded(g, player.name);
          const bg = pi % 2 !== 0 ? "#fafbfc" : "#fff";
          const bdr = { borderBottom: pi < players.length - 1 ? "1px solid #f0f0f0" : "none" };

          const renderShiftCell = (s) => {
            const isKilled = !!killedShifts[`${g}-${s}`];
            const killedBg = isKilled ? "#fef2f2" : bg;
            if (gameEx) {
              return <div key={s} style={cData(killedBg, bdr)}>
                <span style={{ ...S.xBadge, opacity: 0.4 }}>✕</span>
              </div>;
            }
            if (isShiftExcluded(g, s, player.name)) {
              return <div key={s} style={cData(killedBg, bdr, { cursor: "pointer" })}
                onClick={() => restoreFromShift(g, s, player.name)}>
                <span style={S.xBadge}>✕</span>
              </div>;
            }
            const shift = games[g]?.[s];
            const pos = shift ? getPos(shift, player.name) : "";
            const forced = isShiftForced(g, s, player.name);
            const forcedPos = getForcedPos(g, s, player.name);
            const pickerHere = positionPicker?.g === g && positionPicker?.s === s && positionPicker?.playerName === player.name;
            if (pos) {
              return <div key={s} style={cData(killedBg, bdr, { cursor: "pointer", background: pickerHere ? "#f0f9ff" : killedBg })}
                onClick={() => {
                  if (pickerHere) setPositionPicker(null);
                  else setPositionPicker({ g, s, playerName: player.name, currentPos: pos });
                }}>
                <span style={{
                  ...S.badge(pos),
                  ...(forced ? { boxShadow: "0 0 0 2px #22c55e", borderRadius: "5px" } : {}),
                  ...(forcedPos ? { boxShadow: "0 0 0 2px #f59e0b", borderRadius: "5px" } : {}),
                  ...(pickerHere ? { outline: "2px solid #2563eb", outlineOffset: "1px" } : {}),
                  ...(isKilled ? { opacity: 0.55, textDecoration: "line-through", filter: "grayscale(40%)" } : {}),
                }}>
                  {isKilled ? `💀${pos}` : pos}
                </span>
              </div>;
            }
            return <div key={s} style={cData(killedBg, bdr, { cursor: "pointer", background: pickerHere ? "#f0f9ff" : killedBg })}
              onClick={() => {
                if (pickerHere) setPositionPicker(null);
                else setPositionPicker({ g, s, playerName: player.name, currentPos: null });
              }}>
              <span style={{ ...S.sit, color: pickerHere ? "#2563eb" : (isKilled ? "#ddd" : "#ccc") }}>–</span>
            </div>;
          };

          return (
            <Fragment key={player.name}>
              {/* Name cell */}
              <div style={{ padding: "6px 8px", display: "flex", alignItems: "center", cursor: "pointer",
                userSelect: "none", background: gameEx ? "#fef2f2" : bg, ...bdr }}
                onClick={() => toggleGameExclusion(g, player.name)}>
                <span style={{ fontSize: "12px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap", textDecoration: gameEx ? "line-through" : "none",
                  color: gameEx ? "#991b1b" : "#1a1a2e" }}>
                  {player.name}
                </span>
              </div>

              {visibleH1.map(renderShiftCell)}
              <div key="div" style={cDiv({ borderBottom: pi < players.length - 1 ? "1px solid #1a1a2e" : "none" })} />
              {visibleH2.map(renderShiftCell)}
            </Fragment>
          );
        })}

        {/* Field avg row */}
        <div style={{ padding: "8px", fontSize: "10px", fontWeight: 700, color: "#666",
          background: "#f8f7f4", borderTop: "2px solid #e5e7eb" }}>Field Avg</div>
        {visibleH1.map(s => {
          const shift = games[activeGame]?.[s];
          if (!shift) return <div key={s} style={cAvg()}>–</div>;
          const fp = [shift.D, shift.R1, shift.R2, shift.O].filter(Boolean);
          const avg = fp.length ? fp.reduce((sum, n) => sum + (GRADE_VAL[players.find(p => p.name === n)?.grade] || 0), 0) / fp.length : 0;
          const color = avg >= 2.3 ? "#22c55e" : avg >= 2.0 ? "#eab308" : "#ef4444";
          return <div key={s} style={cAvg()}><span style={{ fontSize: "10px", fontFamily: "'DM Mono'", fontWeight: 700, color }}>{avg.toFixed(1)}</span></div>;
        })}
        <div style={cDiv({ borderTop: "2px solid #1a1a2e" })} />
        {visibleH2.map(s => {
          const shift = games[activeGame]?.[s];
          if (!shift) return <div key={s} style={cAvg()}>–</div>;
          const fp = [shift.D, shift.R1, shift.R2, shift.O].filter(Boolean);
          const avg = fp.length ? fp.reduce((sum, n) => sum + (GRADE_VAL[players.find(p => p.name === n)?.grade] || 0), 0) / fp.length : 0;
          const color = avg >= 2.3 ? "#22c55e" : avg >= 2.0 ? "#eab308" : "#ef4444";
          return <div key={s} style={cAvg()}><span style={{ fontSize: "10px", fontFamily: "'DM Mono'", fontWeight: 700, color }}>{avg.toFixed(1)}</span></div>;
        })}

      </div>{/* end grid */}

      {/* Legend */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px", alignItems: "center" }}>
        {[{ l: "Defense", c: "D" }, { l: "Rover", c: "R" }, { l: "Offense", c: "O" }, { l: "Goalie", c: "G" }].map(({ l, c }) =>
          <div key={c} style={{ display: "flex", alignItems: "center", gap: "3px" }}>
            <span style={{ ...S.badge(c), cursor: "default", fontSize: "9px", padding: "1px 5px" }}>{c}</span>
            <span style={{ fontSize: "10px", color: "#888" }}>{l}</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
          <span style={{ ...S.xBadge, cursor: "default", fontSize: "9px", padding: "1px 5px" }}>✕</span>
          <span style={{ fontSize: "10px", color: "#888" }}>Out (tap to restore)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "3px" }}>
          <span style={{ ...S.badge("D"), boxShadow: "0 0 0 2px #f59e0b", borderRadius: "5px", cursor: "default", fontSize: "9px", padding: "1px 5px" }}>D</span>
          <span style={{ fontSize: "10px", color: "#888" }}>Position forced</span>
        </div>
      </div>

      {/* Tournament totals */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: "16px" }}>
        <div style={{ padding: "8px 14px", background: "#fafafa", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#1a1a2e", marginRight: "4px" }}>Totals</span>
          {[
            { key: "this",  label: `This Game (G${activeGame + 1})` },
            { key: "sofar", label: activeGame === 0 ? "So Far" : `So Far (G1–G${activeGame + 1})` },
            { key: "total", label: "Tournament" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTotalsTab(key)} style={{
              padding: "4px 10px", borderRadius: "6px", fontSize: "10px", fontWeight: 700,
              cursor: "pointer", border: "none", fontFamily: "'DM Sans'",
              background: totalsTab === key ? "#1a1a2e" : "#efefef",
              color: totalsTab === key ? "#fff" : "#666",
            }}>{label}</button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "90px repeat(5,1fr) 50px", padding: "6px 0", fontSize: "10px", fontWeight: 600, color: "#999", textTransform: "uppercase", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ paddingLeft: "14px" }}>Player</div>
          <div style={{ textAlign: "center" }}>D</div><div style={{ textAlign: "center" }}>R</div>
          <div style={{ textAlign: "center" }}>O</div><div style={{ textAlign: "center" }}>G</div>
          <div style={{ textAlign: "center" }}>Field</div><div style={{ textAlign: "center" }}>Tot</div>
        </div>
        {players.map((p, i) => {
          const pos = displayedTotals[p.name] || { G: 0, D: 0, R: 0, O: 0, total: 0 };
          const ft = pos.D + pos.R + pos.O;
          return <div key={p.name} style={{ display: "grid", gridTemplateColumns: "90px repeat(5,1fr) 50px",
            padding: "5px 0", fontSize: "12px", borderBottom: i < players.length - 1 ? "1px solid #f5f5f5" : "none",
            background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
            <div style={{ paddingLeft: "14px", fontWeight: 600, fontSize: "11px" }}>{p.name}</div>
            <div style={{ textAlign: "center", color: POS_COLORS.D.bg, fontWeight: 600 }}>{pos.D}</div>
            <div style={{ textAlign: "center", color: POS_COLORS.R.bg, fontWeight: 600 }}>{pos.R}</div>
            <div style={{ textAlign: "center", color: POS_COLORS.O.bg, fontWeight: 600 }}>{pos.O}</div>
            <div style={{ textAlign: "center", color: POS_COLORS.G.bg, fontWeight: 600 }}>{pos.G}</div>
            <div style={{ textAlign: "center", fontWeight: 500 }}>{ft}</div>
            <div style={{ textAlign: "center", fontWeight: 700 }}>{pos.total}</div>
          </div>;
        })}
      </div>

      {/* Actions */}
      {(() => {
        let minAvg = Infinity; let minLabel = "";
        for (let g = 0; g < 4; g++) {
          const sg = shiftsPerGame[g] || 8;
          const sh = sg / 2;
          for (let s = 0; s < sg; s++) {
            const shift = games[g]?.[s];
            if (!shift) continue;
            const fp = [shift.D, shift.R1, shift.R2, shift.O].filter(Boolean);
            if (fp.length === 0) continue;
            const avg = fp.reduce((sum, n) => sum + (GRADE_VAL[players.find(p => p.name === n)?.grade] || 0), 0) / fp.length;
            if (avg < minAvg) { minAvg = avg; minLabel = `G${g + 1} ${s < sh ? `H1·${s + 1}` : `H2·${s - sh + 1}`}`; }
          }
        }
        const color = minAvg >= 2.3 ? "#22c55e" : minAvg >= 2.0 ? "#eab308" : "#ef4444";
        return (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => setSeed(s => s + 1)} style={S.btn()}>🔄 Regenerate</button>
            <button
              onClick={async () => {
                const payload = { seed, shiftExclusions, shiftForceIns, shiftForcePositions, gameExclusions, lockedShifts, killedShifts, goalieMode, shiftsPerGame, players, timerHalfMin, timerIntervalMin, timerWarnSec, timerHalf, gameResults };
                const text = JSON.stringify(payload, null, 2);
                try {
                  await navigator.clipboard.writeText(text);
                  alert("Roster JSON copied to clipboard — paste it somewhere safe.");
                } catch {
                  prompt("Copy this JSON manually:", text);
                }
              }}
              style={S.btn("#8b5cf6")}
            >💾 Export</button>
            <div title={`Backend: ${syncInfo.storage}. Blob version: ${syncInfo.savedAt || "—"}. Fetched: ${syncInfo.fetchedAt ? new Date(syncInfo.fetchedAt).toLocaleTimeString() : "—"}.${syncInfo.error ? ` Error: ${syncInfo.error}` : ""}`}
              style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 10px",
                background: syncFlash ? "#dcfce7" : "#f9fafb",
                borderRadius: "8px", border: syncFlash ? "1px solid #22c55e" : "1px solid #e5e7eb",
                fontSize: "10px", fontFamily: "'DM Mono'",
                transition: "background 0.3s, border 0.3s" }}>
              <span style={{
                width: "8px", height: "8px", borderRadius: "50%",
                background: syncInfo.storage === "blob" ? "#22c55e" : syncInfo.storage.startsWith("blob") ? "#eab308" : "#ef4444",
              }} />
              <span style={{ color: "#666", fontWeight: 600 }}>{syncInfo.storage}</span>
              <span style={{ color: "#999" }}>
                {" · blob "}<b style={{ color: "#1a1a2e" }}>{syncInfo.savedAt ? new Date(syncInfo.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</b>
                {" · fetch "}{syncInfo.fetchedAt ? new Date(syncInfo.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
              </span>
            </div>
            <button onClick={() => setGoalieMode(m => m === "pairs" ? "halves" : "pairs")}
              title={goalieMode === "pairs" ? "Each goalie plays 2 shifts (current). Tap to switch to 4-shift halves." : "Each goalie owns a half (4 shifts). Tap to switch to 2-shift pairs."}
              style={S.btn("#d97706")}>
              🧤 {goalieMode === "pairs" ? "2-shift" : "Half"}
            </button>
            {history.length > 0 && (
              <button onClick={undo} style={S.btn("#7c3aed")}>↩ Undo</button>
            )}
            {hasAnyOverrides && (
              <button onClick={() => {
                saveToHistory();
                setShiftExclusions({}); setGameExclusions({}); setShiftForceIns({});
                setShiftForcePositions({}); setLockedShifts({});
              }} style={S.btn("#dc2626")}>Clear All</button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "#f9fafb",
              borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px", fontFamily: "'DM Sans'" }}>
              <span style={{ color: "#666", fontWeight: 500 }}>Min field avg:</span>
              <span style={{ fontWeight: 700, fontFamily: "'DM Mono'", color, fontSize: "13px" }}>{minAvg === Infinity ? "–" : minAvg.toFixed(2)}</span>
              <span style={{ color: "#999", fontSize: "10px" }}>{minLabel}</span>
            </div>
            <button onClick={async () => {
              const defaults = { seed: 0, shiftExclusions: {}, shiftForceIns: {}, shiftForcePositions: {}, gameExclusions: {}, lockedShifts: {}, killedShifts: {}, goalieMode: "pairs", shiftsPerGame: [8, 8, 8, 8], players: INITIAL_PLAYERS };
              setSeed(0); setShiftExclusions({}); setGameExclusions({});
              setShiftForceIns({}); setShiftForcePositions({}); setLockedShifts({}); setKilledShifts({}); setGoalieMode("pairs"); setShiftsPerGame([8, 8, 8, 8]); setPlayers(INITIAL_PLAYERS);
              try {
                await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(defaults) });
              } catch(e) {}
            }} style={{ ...S.btn("#666"), fontSize: "11px", padding: "6px 12px" }}>🗑 Reset All</button>
          </div>
        );
      })()}

      <ShiftEditorModal
        modal={shiftEditorModal}
        draft={editorDraft}
        pickingSlot={editorPickingSlot}
        players={players}
        lockedShifts={lockedShifts}
        killedShifts={killedShifts}
        shiftsPerHalf={shiftsPerHalf}
        S={S}
        onClose={() => setShiftEditorModal(null)}
        onSave={saveShiftEditor}
        onUnlock={() => {
          if (!shiftEditorModal) return;
          setLockedShifts(prev => { const next = { ...prev }; delete next[`${shiftEditorModal.g}-${shiftEditorModal.s}`]; return next; });
          setShiftEditorModal(null);
        }}
        onKill={() => {
          if (!shiftEditorModal) return;
          toggleKillShift(shiftEditorModal.g, shiftEditorModal.s);
        }}
        setDraft={setEditorDraft}
        setPickingSlot={setEditorPickingSlot}
      />

      {/* Position picker — fixed bottom sheet, always visible regardless of scroll */}
      {positionPicker && createPortal(
        <>
          <div onClick={() => setPositionPicker(null)} style={{ position: "fixed", inset: 0, zIndex: 998, background: "rgba(0,0,0,0.45)" }} />
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 999, background: "#1a1a2e", borderRadius: "20px 20px 0 0", padding: "20px 16px 36px", boxShadow: "0 -4px 32px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", fontFamily: "'DM Sans'" }}>
                  {positionPicker.playerName}
                </div>
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>
                  {positionPicker.s < shiftsPerHalf ? `H1·${positionPicker.s + 1}` : `H2·${positionPicker.s - shiftsPerHalf + 1}`}
                  {" · "}
                  {positionPicker.currentPos !== null ? "change position or remove" : "force into shift at…"}
                </div>
              </div>
              <button onClick={() => setPositionPicker(null)} style={{ background: "none", border: "none", color: "#64748b", fontSize: "26px", cursor: "pointer", lineHeight: 1, padding: "0 4px", marginTop: "-2px" }}>×</button>
            </div>

            {/* Position buttons */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
              {["G", "D", "R", "O"].map(pos => (
                <button key={pos} onClick={() => {
                  // Moving goalie → field: clear their forced-G in all other shifts of this game
                  // so the algorithm can reassign a replacement goalie in those shifts too.
                  if (positionPicker.currentPos === "G" && pos !== "G") {
                    setShiftForcePositions(prev => {
                      const next = { ...prev };
                      const pickerSg = shiftsPerGame[positionPicker.g] || 8;
                    for (let si = 0; si < pickerSg; si++) {
                        if (si === positionPicker.s) continue;
                        const key = `${positionPicker.g}-${si}`;
                        if (next[key]?.[positionPicker.playerName] === "G") {
                          const { [positionPicker.playerName]: _r, ...rest } = next[key];
                          if (Object.keys(rest).length === 0) delete next[key];
                          else next[key] = rest;
                        }
                      }
                      return next;
                    });
                  }
                  forceIntoShift(positionPicker.g, positionPicker.s, positionPicker.playerName, pos);
                  setPositionPicker(null);
                }} style={{
                  flex: 1, padding: "14px 0", borderRadius: "10px",
                  fontFamily: "'DM Mono'", fontWeight: 700, fontSize: "16px",
                  cursor: "pointer", border: "none",
                  background: POS_COLORS[pos].bg, color: POS_COLORS[pos].text,
                }}>
                  {pos}
                </button>
              ))}
            </div>

            {/* Secondary actions */}
            <div style={{ display: "flex", gap: "8px" }}>
              {positionPicker.currentPos === null && (
                <button onClick={() => {
                  forceIntoShift(positionPicker.g, positionPicker.s, positionPicker.playerName, null);
                  setPositionPicker(null);
                }} style={{
                  flex: 1, padding: "11px 0", borderRadius: "8px",
                  fontFamily: "'DM Sans'", fontWeight: 600, fontSize: "12px",
                  cursor: "pointer", border: "1px solid #475569",
                  background: "transparent", color: "#94a3b8",
                }}>
                  Any position
                </button>
              )}
              {positionPicker.currentPos !== null && (
                <button onClick={() => {
                  removeFromShift(positionPicker.g, positionPicker.s, positionPicker.playerName);
                  setPositionPicker(null);
                }} style={{
                  flex: 1, padding: "11px 0", borderRadius: "8px",
                  fontFamily: "'DM Sans'", fontWeight: 600, fontSize: "12px",
                  cursor: "pointer", border: "1px solid #ef4444",
                  background: "transparent", color: "#ef4444",
                }}>
                  Remove from shift
                </button>
              )}
              <button onClick={() => setPositionPicker(null)} style={{
                padding: "11px 20px", borderRadius: "8px",
                fontFamily: "'DM Sans'", fontWeight: 600, fontSize: "12px",
                cursor: "pointer", border: "1px solid #334155",
                background: "transparent", color: "#64748b",
              }}>
                Cancel
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ── Match Timer ──
// Settings (halfMin, intervalMin, warnSec, half) are synced via parent state.
// Running state and elapsed time are device-local.
function playBeep(ctx, freqs, durationMs = 250, gap = 80) {
  if (!ctx) return;
  try {
    const arr = Array.isArray(freqs) ? freqs : [freqs];
    arr.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      osc.type = "sine";
      const t0 = ctx.currentTime + i * (durationMs / 1000 + gap / 1000);
      const t1 = t0 + durationMs / 1000;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.35, t0 + 0.02);
      gain.gain.setValueAtTime(0.35, t1 - 0.05);
      gain.gain.linearRampToValueAtTime(0, t1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    });
  } catch(e) {}
}

function MatchTimer({ halfMin, setHalfMin, intervalMin, setIntervalMin, warnSec, setWarnSec, half, setHalf, activeGame, gameResult, onSetResult }) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const startRef = useRef(null);
  const baseRef = useRef(0);
  const lastShiftRef = useRef(0);
  const lastWarnRef = useRef(0);
  const halfWarnRef = useRef(false);
  const endRef = useRef(false);
  const audioCtxRef = useRef(null);
  const [, setTick] = useState(0);
  const [, forceRender] = useState(0); // used to force a re-render from refs only (e.g. reset while stopped)
  const [flash, setFlash] = useState(null);

  const elapsed = (running && startRef.current ? Date.now() - startRef.current : 0) + baseRef.current;
  const halfMs = halfMin * 60000;
  const intMs = intervalMin * 60000;
  const warnMs = warnSec * 1000;
  const remaining = Math.max(0, halfMs - elapsed);
  const totalShifts = Math.max(1, Math.ceil(halfMs / intMs));
  const currentShift = Math.min(totalShifts, Math.floor(elapsed / intMs) + 1);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick(t => t + 1), 200);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    // Halftime reached → stop timer with alarm
    if (elapsed >= halfMs && !endRef.current) {
      endRef.current = true;
      playBeep(audioCtxRef.current, [880, 660, 880, 660], 350, 80);
      try { navigator.vibrate?.([400, 100, 400, 100, 400]); } catch(e) {}
      baseRef.current = halfMs;
      startRef.current = null;
      setRunning(false);
      setFlash({ kind: "halftime", ts: Date.now() });
      return;
    }
    // Halftime warning (warnSec before halftime)
    if (!halfWarnRef.current && elapsed >= halfMs - warnMs && elapsed < halfMs) {
      halfWarnRef.current = true;
      playBeep(audioCtxRef.current, [520, 520], 220, 100);
      try { navigator.vibrate?.([150, 80, 150]); } catch(e) {}
      setFlash({ kind: "warnHalf", ts: Date.now() });
      return;
    }
    // Swap mark
    const shiftIdx = Math.floor(elapsed / intMs);
    if (shiftIdx > lastShiftRef.current && shiftIdx * intMs < halfMs) {
      lastShiftRef.current = shiftIdx;
      playBeep(audioCtxRef.current, [660, 880], 280, 60);
      try { navigator.vibrate?.([300, 100, 300]); } catch(e) {}
      setFlash({ kind: "swap", ts: Date.now() });
      return;
    }
    // Swap warning (warnSec before next swap mark)
    const warnIdx = Math.floor((elapsed + warnMs) / intMs);
    if (warnIdx > lastWarnRef.current) {
      lastWarnRef.current = warnIdx;
      const upcoming = warnIdx * intMs;
      if (upcoming < halfMs) {
        playBeep(audioCtxRef.current, [520], 220);
        try { navigator.vibrate?.([150]); } catch(e) {}
        setFlash({ kind: "warn", ts: Date.now() });
      }
    }
  });

  useEffect(() => {
    if (!flash) return;
    const dur = flash.kind === "halftime" ? 10000 : flash.kind.startsWith("warn") ? 2500 : 3500;
    const id = setTimeout(() => setFlash(null), dur);
    return () => clearTimeout(id);
  }, [flash]);

  const ensureAudio = () => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtxRef.current = new Ctx();
      }
      if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    } catch(e) {}
  };

  const start = () => {
    ensureAudio();
    if (elapsed >= halfMs) return;
    startRef.current = Date.now();
    setRunning(true);
  };
  const pause = () => {
    baseRef.current = elapsed;
    startRef.current = null;
    setRunning(false);
  };
  const reset = () => {
    startRef.current = null;
    baseRef.current = 0;
    lastShiftRef.current = 0;
    lastWarnRef.current = 0;
    halfWarnRef.current = false;
    endRef.current = false;
    setRunning(false);
    forceRender(x => x + 1); // ensure display updates even if running was already false
  };
  const goNextHalf = () => {
    const nextHalf = half === 1 ? 2 : 1;
    startRef.current = null;
    baseRef.current = 0;
    lastShiftRef.current = 0;
    lastWarnRef.current = 0;
    halfWarnRef.current = false;
    endRef.current = false;
    setRunning(false);
    setHalf(nextHalf);
    forceRender(x => x + 1);
  };
  const addSeconds = (sec) => {
    // Moves the clock FORWARD (skips ahead) — useful for catching up if timer started late
    const ms = sec * 1000;
    if (running && startRef.current) {
      startRef.current -= ms; // shift start backward → increases elapsed → reduces remaining
    } else {
      baseRef.current = Math.min(halfMs, baseRef.current + ms);
    }
    forceRender(x => x + 1);
  };
  const [htScoreForm, setHtScoreForm] = useState({ home: '', away: '' });
  useEffect(() => {
    if (gameResult) setHtScoreForm({ home: String(gameResult.home), away: String(gameResult.away) });
  }, [gameResult]);
  const testBeep = () => { ensureAudio(); playBeep(audioCtxRef.current, [660], 200); };

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const fmt = `${mm}:${String(ss).padStart(2, "0")}`;
  const nextMarkMs = Math.min(halfMs, (Math.floor(elapsed / intMs) + 1) * intMs);
  const tilNext = Math.max(0, nextMarkMs - elapsed);
  const tnMm = Math.floor(tilNext / 60000);
  const tnSs = Math.floor((tilNext % 60000) / 1000);

  const btnS = (bg) => ({
    padding: "7px 12px", borderRadius: "6px", border: "none",
    background: bg, color: "#fff", fontWeight: 700, fontSize: "12px",
    fontFamily: "'DM Sans'", cursor: "pointer",
  });
  const chip = (active, disabled) => ({
    padding: "3px 7px", borderRadius: "4px", border: "none",
    cursor: disabled ? "not-allowed" : "pointer", marginLeft: "3px",
    background: active ? "#fff" : "rgba(255,255,255,0.08)",
    color: active ? "#1a1a2e" : "inherit", opacity: disabled ? 0.5 : 1,
    fontFamily: "'DM Mono'", fontWeight: 700, fontSize: "10px",
  });

  const flashMap = {
    warn:     { bg: "rgba(234,179,8,0.6)",  icon: "⚠️", title: "SUBS READY",     sub: `${Math.round(warnSec)}s until swap` },
    warnHalf: { bg: "rgba(234,88,12,0.65)", icon: "⚠️", title: "HALFTIME SOON",  sub: `${Math.round(warnSec)}s left` },
    swap:     { bg: "rgba(34,197,94,0.65)", icon: "🔔", title: "SWAP SHIFTS",    sub: `Shift ${currentShift} of ${totalShifts}` },
    halftime: { bg: "rgba(220,38,38,0.72)", icon: "🛑", title: "HALFTIME",       sub: `H${half} complete` },
  };
  const FlashOverlay = flash && createPortal(
    <div onClick={() => setFlash(null)} style={{
      position: "fixed", inset: 0, zIndex: 10000, background: flashMap[flash.kind].bg,
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
    }}>
      <div style={{
        background: "#fff", padding: "28px 40px", borderRadius: "20px",
        fontFamily: "'DM Sans'", fontWeight: 800, fontSize: "30px", color: "#1a1a2e",
        textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.4)", lineHeight: 1.3,
      }}>
        <div style={{ fontSize: "48px", marginBottom: "6px" }}>{flashMap[flash.kind].icon}</div>
        {flashMap[flash.kind].title}
        <div style={{ fontSize: "14px", color: "#666", fontWeight: 600, marginTop: "8px" }}>{flashMap[flash.kind].sub}</div>
        <div style={{ fontSize: "10px", color: "#aaa", fontWeight: 500, marginTop: "10px" }}>tap to dismiss</div>
      </div>
    </div>,
    document.body
  );

  if (!expanded) {
    return (
      <div style={{ marginBottom: "10px" }}>
        <button onClick={() => setExpanded(true)} style={{
          padding: "6px 12px", borderRadius: "8px", border: "1px solid #e5e7eb",
          background: running ? "#1a1a2e" : "#fff", color: running ? "#fff" : "#1a1a2e",
          fontFamily: "'DM Sans'", fontWeight: 600, fontSize: "11px", cursor: "pointer",
          display: "inline-flex", alignItems: "center", gap: "6px",
        }}>
          ⏱ {running ? `H${half} ${fmt} · shift ${currentShift}/${totalShifts}` : "Match Timer"}
        </button>
        {FlashOverlay}
      </div>
    );
  }

  return (
    <>
      {FlashOverlay}
      <div style={{
        marginBottom: "12px", padding: "12px 14px", border: "2px solid #1a1a2e",
        borderRadius: "12px", background: running ? "#1a1a2e" : "#fff",
        color: running ? "#fff" : "#1a1a2e",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ fontWeight: 700, fontSize: "12px" }}>⏱ Match Timer · H{half}</span>
          <button onClick={() => setExpanded(false)} style={{
            background: "none", border: "none", color: running ? "#94a3b8" : "#666",
            cursor: "pointer", fontSize: "11px", padding: "0 4px",
          }}>hide</button>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "16px", marginBottom: "8px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "'DM Mono'", fontWeight: 700, fontSize: "44px", lineHeight: 1 }}>{fmt}</span>
          <span style={{ fontSize: "11px", opacity: 0.85 }}>
            shift {currentShift}/{totalShifts} · next swap in {tnMm}:{String(tnSs).padStart(2, "0")}
          </span>
        </div>
        <div style={{ height: "10px", background: running ? "#334155" : "#f0f0f0", borderRadius: "6px",
          position: "relative", overflow: "hidden", marginBottom: "10px" }}>
          <div style={{ width: `${Math.min(100, (elapsed / halfMs) * 100)}%`, height: "100%",
            background: elapsed >= halfMs ? "#dc2626" : "#22c55e", transition: "width 0.2s linear" }} />
          {Array.from({ length: totalShifts - 1 }, (_, i) => i + 1).map(i => (
            <div key={i} style={{
              position: "absolute", left: `${(i / totalShifts) * 100}%`, top: 0, bottom: 0,
              width: "2px", background: "rgba(0,0,0,0.4)",
            }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "8px" }}>
          {!running ? (
            <button onClick={start} style={btnS("#22c55e")}>▶ Start</button>
          ) : (
            <button onClick={pause} style={btnS("#eab308")}>⏸ Pause</button>
          )}
          <button onClick={reset} style={btnS("#666")}>↺ Reset</button>
          <button onClick={goNextHalf} style={btnS("#7c3aed")}>→ {half === 1 ? "H2" : "H1"}</button>
          <button onClick={() => addSeconds(30)} style={btnS("#2563eb")}>+30s</button>
          <button onClick={testBeep} style={{ ...btnS("transparent"), color: running ? "#94a3b8" : "#666", border: `1px solid ${running ? "#94a3b8" : "#cbd5e1"}` }}>🔊 test</button>
        </div>
        <div style={{ fontSize: "10px", opacity: 0.85, display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
          <span>half:
            {[15, 20, 25, 30].map(n => (
              <button key={n} onClick={() => { if (!running) setHalfMin(n); }} style={chip(halfMin === n, running)}>{n}m</button>
            ))}
          </span>
          <span>swap:
            {[3, 5, 7, 10].map(n => (
              <button key={n} onClick={() => { if (!running) setIntervalMin(n); }} style={chip(intervalMin === n, running)}>{n}m</button>
            ))}
          </span>
          <span>warn:
            {[30, 60, 90].map(n => (
              <button key={n} onClick={() => { if (!running) setWarnSec(n); }} style={chip(warnSec === n, running)}>{n}s</button>
            ))}
          </span>
        </div>

        {/* Halftime score prompt — shown when the timer has ended */}
        {endRef.current && onSetResult && (
          <div style={{ marginTop: "10px", padding: "10px 12px", borderRadius: "8px",
            background: running ? "#1e3a5f" : "#f0f9ff", border: "1px solid #93c5fd" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: running ? "#93c5fd" : "#1d4ed8", marginBottom: "8px" }}>
              🏁 H{half} done — enter score for G{(activeGame || 0) + 1}
            </div>
            {gameResult ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontFamily: "'DM Mono'", fontWeight: 800, fontSize: "16px", color: running ? "#fff" : "#1a1a2e" }}>
                  {gameResult.home} – {gameResult.away}
                </span>
                <button onClick={() => onSetResult(null, null)} style={{ ...btnS("#94a3b8"), fontSize: "10px", padding: "4px 8px" }}>clear</button>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input type="number" min="0" max="99" placeholder="Us" value={htScoreForm.home}
                  onChange={e => setHtScoreForm(p => ({ ...p, home: e.target.value }))}
                  style={{ width: "52px", padding: "5px", borderRadius: "5px", border: "1px solid #93c5fd", fontSize: "14px", fontFamily: "'DM Mono'", fontWeight: 700, textAlign: "center" }} />
                <span style={{ fontWeight: 700, color: running ? "#93c5fd" : "#888" }}>–</span>
                <input type="number" min="0" max="99" placeholder="Them" value={htScoreForm.away}
                  onChange={e => setHtScoreForm(p => ({ ...p, away: e.target.value }))}
                  style={{ width: "52px", padding: "5px", borderRadius: "5px", border: "1px solid #93c5fd", fontSize: "14px", fontFamily: "'DM Mono'", fontWeight: 700, textAlign: "center" }} />
                <button onClick={() => {
                  const h = parseInt(htScoreForm.home, 10);
                  const a = parseInt(htScoreForm.away, 10);
                  if (!isNaN(h) && !isNaN(a)) onSetResult(h, a);
                }} style={btnS("#1d4ed8")}>✅ Done</button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Shift Editor Modal ──
// Rendered via portal so position:fixed is relative to the viewport, not any
// ancestor. Tap a column header (H1·1 … H2·4) to open.
function ShiftEditorModal({ modal, draft, pickingSlot, players, lockedShifts, killedShifts, shiftsPerHalf, S, onClose, onSave, onUnlock, onKill, setDraft, setPickingSlot }) {
  if (!modal) return null;
  const { g, s } = modal;
  const sph = shiftsPerHalf || 4;
  const shiftLabel = `Game ${g + 1} · ${s < sph ? `H1·${s + 1}` : `H2·${s - sph + 1}`}`;
  const posSlots = [
    { slot: "G",  label: "Goalie",  pos: "G" },
    { slot: "D",  label: "Defense", pos: "D" },
    { slot: "R1", label: "Rover",   pos: "R" },
    { slot: "R2", label: "Rover",   pos: "R" },
    { slot: "O",  label: "Offense", pos: "O" },
  ];
  const assignedElsewhere = (currentSlot) =>
    Object.entries(draft)
      .filter(([sl]) => sl !== currentSlot)
      .map(([, name]) => name)
      .filter(Boolean);

  const overlayStyle = {
    position: "fixed", top: 0, right: 0, bottom: 0, left: 0,
    background: "rgba(0,0,0,0.6)", zIndex: 9999,
    display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
  };
  const cardStyle = {
    background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "360px",
    overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  };

  return createPortal(
    <div style={overlayStyle} onClick={() => { if (!pickingSlot) onClose(); }}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>

        <div style={{ padding: "14px 16px", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: "15px", fontFamily: "'DM Sans'" }}>{shiftLabel}</span>
            {lockedShifts[`${g}-${s}`] && (
              <span style={{ background: "#22c55e", color: "#fff", fontSize: "9px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px", letterSpacing: "0.05em" }}>FROZEN</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "20px", cursor: "pointer", lineHeight: 1, padding: "4px 8px" }}>✕</button>
        </div>

        {pickingSlot ? (
          <>
            <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: "10px" }}>
              <button onClick={() => setPickingSlot(null)}
                style={{ background: "none", border: "none", color: "#2563eb", fontSize: "13px", fontWeight: 600, cursor: "pointer", padding: "4px 0" }}>← Back</button>
              <span style={{ fontSize: "12px", color: "#666" }}>
                Pick {pickingSlot === "R1" || pickingSlot === "R2" ? "Rover" : posSlots.find(p => p.slot === pickingSlot)?.label}
              </span>
            </div>
            <div style={{ maxHeight: "340px", overflowY: "auto" }}>
              <div style={{ padding: "14px 16px", fontSize: "13px", color: "#999", cursor: "pointer", borderBottom: "1px solid #f0f0f0" }}
                onClick={() => { setDraft(prev => ({ ...prev, [pickingSlot]: null })); setPickingSlot(null); }}>
                — Leave empty —
              </div>
              {players
                .filter(p => pickingSlot !== "G" || p.canGoalie)
                .filter(p => !assignedElsewhere(pickingSlot).includes(p.name))
                .map(p => (
                  <div key={p.name}
                    style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px",
                      cursor: "pointer", borderBottom: "1px solid #f5f5f5",
                      background: draft[pickingSlot] === p.name ? "#eff6ff" : "#fff" }}
                    onClick={() => { setDraft(prev => ({ ...prev, [pickingSlot]: p.name })); setPickingSlot(null); }}>
                    <span style={{ fontSize: "14px", fontWeight: 600, flex: 1 }}>{p.name}</span>
                    <span style={{ fontSize: "10px", fontFamily: "'DM Mono'", fontWeight: 600, color: "#999" }}>{p.grade}</span>
                  </div>
                ))
              }
            </div>
          </>
        ) : (
          <>
            {posSlots.map(({ slot, label, pos }) => (
              <div key={slot}
                style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px",
                  borderBottom: "1px solid #f0f0f0", cursor: "pointer" }}
                onClick={() => setPickingSlot(slot)}>
                <span style={{ ...S.badge(pos), cursor: "default", minWidth: "26px", fontSize: "11px", padding: "3px 6px" }}>{pos}</span>
                <span style={{ fontSize: "12px", color: "#666", width: "60px" }}>{label}</span>
                <span style={{ fontSize: "14px", fontWeight: 600, flex: 1, color: draft[slot] ? "#1a1a2e" : "#ccc" }}>
                  {draft[slot] || "—"}
                </span>
                <span style={{ fontSize: "16px", color: "#cbd5e1" }}>›</span>
              </div>
            ))}
            <div style={{ padding: "12px 16px", borderTop: "2px solid #f0f0f0" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={onSave} style={{ ...S.btn(), flex: 1, fontSize: "13px" }}>
                  {lockedShifts[`${g}-${s}`] ? "💾 Save Changes" : "🔒 Freeze Lineup"}
                </button>
                {lockedShifts[`${g}-${s}`] && (
                  <button onClick={onUnlock} title="Let the algorithm control this shift" style={{ ...S.btn("#6b7280"), fontSize: "11px", padding: "9px 12px" }}>🔓 Unfreeze</button>
                )}
                {onKill && (
                  <button onClick={onKill} style={{ ...S.btn(killedShifts && killedShifts[`${g}-${s}`] ? "#16a34a" : "#dc2626"), fontSize: "11px", padding: "9px 12px" }}>
                    {killedShifts && killedShifts[`${g}-${s}`] ? "↩ Unkill" : "💀 Kill"}
                  </button>
                )}
              </div>
              <p style={{ margin: "8px 0 0", fontSize: "10px", textAlign: "center",
                color: lockedShifts[`${g}-${s}`] ? "#22c55e" : "#94a3b8" }}>
                {lockedShifts[`${g}-${s}`]
                  ? "🔒 Frozen — Regenerate won't change this shift."
                  : "Freezing pins this lineup so Regenerate won't touch it."}
              </p>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
