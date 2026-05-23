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
  const [players, setPlayers] = useState(INITIAL_PLAYERS);
  const [showRoster, setShowRoster] = useState(false);
  const [activeGame, setActiveGame] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [history, setHistory] = useState([]); // local undo stack — not synced to server
  // positionPicker: which sitting cell the user tapped — shows position chooser bar
  const [positionPicker, setPositionPicker] = useState(null); // { g, s, playerName } | null
  // shiftEditorModal: full shift editor — tap a column header to open
  const [shiftEditorModal, setShiftEditorModal] = useState(null); // { g, s } | null
  const [editorDraft, setEditorDraft] = useState({ G: null, D: null, R1: null, R2: null, O: null });
  const [editorPickingSlot, setEditorPickingSlot] = useState(null); // "G"|"D"|"R1"|"R2"|"O"|null

  useEffect(() => {
    fetch('/api/state')
      .then(r => r.json())
      .then(state => {
        if (state.seed !== undefined) setSeed(state.seed);
        if (state.shiftExclusions) setShiftExclusions(state.shiftExclusions);
        if (state.shiftForceIns) setShiftForceIns(state.shiftForceIns);
        if (state.shiftForcePositions) setShiftForcePositions(state.shiftForcePositions);
        if (state.gameExclusions) setGameExclusions(state.gameExclusions);
        if (state.lockedShifts) setLockedShifts(state.lockedShifts);
        if (state.players) setPlayers(state.players);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed, shiftExclusions, shiftForceIns, shiftForcePositions, gameExclusions, lockedShifts, players }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [seed, shiftExclusions, shiftForceIns, shiftForcePositions, gameExclusions, lockedShifts, players, loaded]);

  const handleSync = useCallback(async () => {
    try {
      const state = await fetch('/api/state').then(r => r.json());
      if (state.seed !== undefined) setSeed(state.seed);
      if (state.shiftExclusions) setShiftExclusions(state.shiftExclusions);
      if (state.shiftForceIns) setShiftForceIns(state.shiftForceIns);
      if (state.shiftForcePositions) setShiftForcePositions(state.shiftForcePositions);
      if (state.gameExclusions) setGameExclusions(state.gameExclusions);
      if (state.lockedShifts) setLockedShifts(state.lockedShifts);
      if (state.players) setPlayers(state.players);
    } catch(e) {}
  }, []);

  // Undo stack — snapshot overrideable state into a ref so saveToHistory is stable
  const snapRef = useRef({});
  useEffect(() => {
    snapRef.current = { shiftExclusions, shiftForceIns, shiftForcePositions, gameExclusions, lockedShifts };
  }, [shiftExclusions, shiftForceIns, shiftForcePositions, gameExclusions, lockedShifts]);

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
      return prev.slice(0, -1);
    });
  }, []);

  const { games, totalShifts, totalPositions } = useMemo(() => {
    return generateRotation(seed, players, shiftExclusions, gameExclusions, shiftForceIns, lockedShifts, shiftForcePositions);
  }, [seed, players, shiftExclusions, gameExclusions, shiftForceIns, lockedShifts, shiftForcePositions]);

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
    // Also clear any forced position for this player
    setShiftForcePositions(prev => {
      if (!prev[key] || !prev[key][playerName]) return prev;
      const { [playerName]: _removed, ...rest } = prev[key];
      if (Object.keys(rest).length === 0) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: rest };
    });
  }, [saveToHistory]);

  const toggleLockShift = useCallback((gameIdx, shiftIdx) => {
    saveToHistory();
    const key = `${gameIdx}-${shiftIdx}`;
    setLockedShifts(prev => {
      const next = { ...prev };
      if (next[key]) { delete next[key]; }
      else {
        const shift = games[gameIdx]?.[shiftIdx];
        if (shift) next[key] = { ...shift };
      }
      return next;
    });
  }, [games, saveToHistory]);

  const openShiftEditor = useCallback((g, s) => {
    const current = lockedShifts[`${g}-${s}`] || games[g]?.[s] || {};
    setEditorDraft({ G: current.G || null, D: current.D || null, R1: current.R1 || null, R2: current.R2 || null, O: current.O || null });
    setEditorPickingSlot(null);
    setShiftEditorModal({ g, s });
  }, [lockedShifts, games]);

  const saveShiftEditor = useCallback(() => {
    if (!shiftEditorModal) return;
    saveToHistory();
    const key = `${shiftEditorModal.g}-${shiftEditorModal.s}`;
    setLockedShifts(prev => ({ ...prev, [key]: { ...editorDraft } }));
    setShiftEditorModal(null);
  }, [shiftEditorModal, editorDraft, saveToHistory]);

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
      gridTemplateColumns: "82px repeat(4, minmax(0, 1fr)) 3px repeat(4, minmax(0, 1fr))",
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

  // Label for position picker context
  const pickerLabel = positionPicker
    ? `${positionPicker.playerName} · ${positionPicker.s < 4 ? `H1·${positionPicker.s + 1}` : `H2·${positionPicker.s - 3}`}`
    : "";

  return (
    <div style={S.root}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <h1 style={{ fontSize: "20px", fontWeight: 700, margin: "0 0 2px", letterSpacing: "-0.5px" }}>⚽ Deathwalkers Roster Rotation</h1>
      <p style={{ fontSize: "11px", color: "#666", margin: "0 0 4px", lineHeight: 1.5 }}>
        Tap <b>position</b> → remove from shift&nbsp;&nbsp;·&nbsp;&nbsp;
        Tap <b>–</b> → force position&nbsp;&nbsp;·&nbsp;&nbsp;
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
          return <button key={g} onClick={() => setActiveGame(g)} style={S.tab(activeGame === g)}>
            Game {g + 1}{ec > 0 && <span style={{ color: activeGame === g ? "#fca5a5" : "#dc2626", marginLeft: "4px" }}>−{ec}</span>}
          </button>;
        })}
      </div>

      {/* ── Position picker bar ──
          Appears when a sitting player's "–" cell is tapped.
          Lets the coach force that player to a specific position for that shift. */}
      {positionPicker && (
        <div style={{
          marginBottom: "8px", padding: "10px 12px",
          background: "#1a1a2e", borderRadius: "10px",
          display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center",
        }}>
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#e2e8f0", marginRight: "4px", whiteSpace: "nowrap" }}>
            Force {pickerLabel}:
          </span>
          {["G", "D", "R", "O"].map(pos => (
            <button key={pos} onClick={() => {
              forceIntoShift(positionPicker.g, positionPicker.s, positionPicker.playerName, pos);
              setPositionPicker(null);
            }} style={{
              padding: "5px 10px", borderRadius: "6px", fontFamily: "'DM Mono'", fontWeight: 700,
              fontSize: "12px", cursor: "pointer", border: "none",
              background: POS_COLORS[pos].bg, color: POS_COLORS[pos].text,
            }}>
              {pos === "G" ? "🧤 G" : pos}
            </button>
          ))}
          <button onClick={() => {
            forceIntoShift(positionPicker.g, positionPicker.s, positionPicker.playerName, null);
            setPositionPicker(null);
          }} style={{
            padding: "5px 10px", borderRadius: "6px", fontFamily: "'DM Sans'", fontWeight: 600,
            fontSize: "11px", cursor: "pointer", border: "1px solid #475569",
            background: "transparent", color: "#94a3b8",
          }}>
            Any
          </button>
          <button onClick={() => setPositionPicker(null)} style={{
            padding: "5px 8px", borderRadius: "6px", fontFamily: "'DM Sans'", fontWeight: 600,
            fontSize: "11px", cursor: "pointer", border: "none",
            background: "transparent", color: "#64748b", marginLeft: "auto",
          }}>
            ✕
          </button>
        </div>
      )}

      {/* Rotation grid */}
      <div style={S.grid}>

        {/* Header row */}
        <div style={{ padding: "8px", fontSize: "10px", fontWeight: 600, color: "#999", textTransform: "uppercase",
          background: "#fafafa", borderBottom: "2px solid #e5e7eb" }}>Player</div>
        {[1, 2, 3, 4].map(s => (
          <div key={s} style={cHdr()}>H1·{s}</div>
        ))}
        <div style={cDiv({ borderBottom: "2px solid #1a1a2e" })} />
        {[1, 2, 3, 4].map(s => (
          <div key={s + 4} style={cHdr()}>H2·{s}</div>
        ))}

        {/* Lock/Edit row — tap any cell to open the shift editor.
            Lock icon shows whether the shift is currently locked. */}
        <div style={{ padding: "4px 8px", fontSize: "9px", fontWeight: 600, color: "#888",
          background: "#f0fdf4", borderBottom: "1px solid #e5e7eb" }}>Edit</div>
        {[0, 1, 2, 3].map(s => {
          const lk = `${activeGame}-${s}`;
          const isLocked = !!lockedShifts[lk];
          return (
            <div key={s} style={cLock({ cursor: "pointer" })} onClick={() => openShiftEditor(activeGame, s)}>
              <span style={{ fontSize: "14px", userSelect: "none" }}>
                {isLocked ? "🔒" : "✏️"}
              </span>
            </div>
          );
        })}
        <div style={cDiv({ borderBottom: "1px solid #1a1a2e" })} />
        {[4, 5, 6, 7].map(s => {
          const lk = `${activeGame}-${s}`;
          const isLocked = !!lockedShifts[lk];
          return (
            <div key={s} style={cLock({ cursor: "pointer" })} onClick={() => openShiftEditor(activeGame, s)}>
              <span style={{ fontSize: "14px", userSelect: "none" }}>
                {isLocked ? "🔒" : "✏️"}
              </span>
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
            if (gameEx) {
              return <div key={s} style={cData(bg, bdr)}>
                <span style={{ ...S.xBadge, opacity: 0.4 }}>✕</span>
              </div>;
            }
            if (isShiftExcluded(g, s, player.name)) {
              return <div key={s} style={cData(bg, bdr, { cursor: "pointer" })}
                onClick={() => restoreFromShift(g, s, player.name)}>
                <span style={S.xBadge}>✕</span>
              </div>;
            }
            const shift = games[g]?.[s];
            const pos = shift ? getPos(shift, player.name) : "";
            const forced = isShiftForced(g, s, player.name);
            const forcedPos = getForcedPos(g, s, player.name);
            if (pos) {
              // On field — tap to remove from shift (also clears any force)
              return <div key={s} style={cData(bg, bdr, { cursor: "pointer" })}
                onClick={() => {
                  if (forced) unforceFromShift(g, s, player.name);
                  else excludeFromShift(g, s, player.name);
                }}>
                <span style={{
                  ...S.badge(pos),
                  ...(forced ? { boxShadow: "0 0 0 2px #22c55e", borderRadius: "5px" } : {}),
                  // Gold ring if forced to a specific position
                  ...(forcedPos ? { boxShadow: "0 0 0 2px #f59e0b", borderRadius: "5px" } : {}),
                }}>
                  {pos}
                </span>
              </div>;
            }
            // Sitting — tap to open position picker
            const isPickerOpen = positionPicker && positionPicker.g === g && positionPicker.s === s && positionPicker.playerName === player.name;
            return <div key={s} style={cData(bg, bdr, { cursor: "pointer", background: isPickerOpen ? "#f0f9ff" : bg })}
              onClick={() => {
                if (isPickerOpen) { setPositionPicker(null); }
                else { setPositionPicker({ g, s, playerName: player.name }); }
              }}>
              <span style={{ ...S.sit, color: isPickerOpen ? "#2563eb" : "#ccc" }}>–</span>
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

              {[0, 1, 2, 3].map(renderShiftCell)}
              <div key="div" style={cDiv(bdr)} />
              {[4, 5, 6, 7].map(renderShiftCell)}
            </Fragment>
          );
        })}

        {/* Field avg row */}
        <div style={{ padding: "8px", fontSize: "10px", fontWeight: 700, color: "#666",
          background: "#f8f7f4", borderTop: "2px solid #e5e7eb" }}>Field Avg</div>
        {[0, 1, 2, 3].map(s => {
          const shift = games[activeGame]?.[s];
          if (!shift) return <div key={s} style={cAvg()}>–</div>;
          const fp = [shift.D, shift.R1, shift.R2, shift.O].filter(Boolean);
          const avg = fp.length
            ? fp.reduce((sum, n) => sum + (GRADE_VAL[players.find(p => p.name === n)?.grade] || 0), 0) / fp.length
            : 0;
          const color = avg >= 2.3 ? "#22c55e" : avg >= 2.0 ? "#eab308" : "#ef4444";
          return <div key={s} style={cAvg()}>
            <span style={{ fontSize: "10px", fontFamily: "'DM Mono'", fontWeight: 700, color }}>{avg.toFixed(1)}</span>
          </div>;
        })}
        <div style={cDiv({ borderTop: "2px solid #1a1a2e" })} />
        {[4, 5, 6, 7].map(s => {
          const shift = games[activeGame]?.[s];
          if (!shift) return <div key={s} style={cAvg()}>–</div>;
          const fp = [shift.D, shift.R1, shift.R2, shift.O].filter(Boolean);
          const avg = fp.length
            ? fp.reduce((sum, n) => sum + (GRADE_VAL[players.find(p => p.name === n)?.grade] || 0), 0) / fp.length
            : 0;
          const color = avg >= 2.3 ? "#22c55e" : avg >= 2.0 ? "#eab308" : "#ef4444";
          return <div key={s} style={cAvg()}>
            <span style={{ fontSize: "10px", fontFamily: "'DM Mono'", fontWeight: 700, color }}>{avg.toFixed(1)}</span>
          </div>;
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
        <div style={{ padding: "10px 14px", background: "#fafafa", borderBottom: "1px solid #e5e7eb", fontSize: "12px", fontWeight: 600 }}>Tournament Totals</div>
        <div style={{ display: "grid", gridTemplateColumns: "90px repeat(5,1fr) 50px", padding: "6px 0", fontSize: "10px", fontWeight: 600, color: "#999", textTransform: "uppercase", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ paddingLeft: "14px" }}>Player</div>
          <div style={{ textAlign: "center" }}>D</div><div style={{ textAlign: "center" }}>R</div>
          <div style={{ textAlign: "center" }}>O</div><div style={{ textAlign: "center" }}>G</div>
          <div style={{ textAlign: "center" }}>Field</div><div style={{ textAlign: "center" }}>Tot</div>
        </div>
        {players.map((p, i) => {
          const pos = totalPositions[p.name]; const ft = pos.D + pos.R + pos.O; const tot = totalShifts[p.name];
          return <div key={p.name} style={{ display: "grid", gridTemplateColumns: "90px repeat(5,1fr) 50px",
            padding: "5px 0", fontSize: "12px", borderBottom: i < players.length - 1 ? "1px solid #f5f5f5" : "none",
            background: i % 2 === 0 ? "#fff" : "#fafbfc" }}>
            <div style={{ paddingLeft: "14px", fontWeight: 600, fontSize: "11px" }}>{p.name}</div>
            <div style={{ textAlign: "center", color: POS_COLORS.D.bg, fontWeight: 600 }}>{pos.D}</div>
            <div style={{ textAlign: "center", color: POS_COLORS.R.bg, fontWeight: 600 }}>{pos.R}</div>
            <div style={{ textAlign: "center", color: POS_COLORS.O.bg, fontWeight: 600 }}>{pos.O}</div>
            <div style={{ textAlign: "center", color: POS_COLORS.G.bg, fontWeight: 600 }}>{pos.G}</div>
            <div style={{ textAlign: "center", fontWeight: 500 }}>{ft}</div>
            <div style={{ textAlign: "center", fontWeight: 700 }}>{tot}</div>
          </div>;
        })}
      </div>

      {/* Actions */}
      {(() => {
        let minAvg = Infinity; let minLabel = "";
        for (let g = 0; g < 4; g++) {
          for (let s = 0; s < 8; s++) {
            const shift = games[g]?.[s];
            if (!shift) continue;
            const fp = [shift.D, shift.R1, shift.R2, shift.O].filter(Boolean);
            if (fp.length === 0) continue;
            const avg = fp.reduce((sum, n) => sum + (GRADE_VAL[players.find(p => p.name === n)?.grade] || 0), 0) / fp.length;
            if (avg < minAvg) { minAvg = avg; minLabel = `G${g + 1} ${s < 4 ? `H1·${s + 1}` : `H2·${s - 3}`}`; }
          }
        }
        const color = minAvg >= 2.3 ? "#22c55e" : minAvg >= 2.0 ? "#eab308" : "#ef4444";
        return (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => setSeed(s => s + 1)} style={S.btn()}>🔄 Regenerate</button>
            <button onClick={handleSync} style={S.btn("#2563eb")}>📡 Sync</button>
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
              const defaults = { seed: 0, shiftExclusions: {}, shiftForceIns: {}, shiftForcePositions: {}, gameExclusions: {}, lockedShifts: {}, players: INITIAL_PLAYERS };
              setSeed(0); setShiftExclusions({}); setGameExclusions({});
              setShiftForceIns({}); setShiftForcePositions({}); setLockedShifts({}); setPlayers(INITIAL_PLAYERS);
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
        S={S}
        onClose={() => setShiftEditorModal(null)}
        onSave={saveShiftEditor}
        onUnlock={() => {
          if (!shiftEditorModal) return;
          setLockedShifts(prev => { const next = { ...prev }; delete next[`${shiftEditorModal.g}-${shiftEditorModal.s}`]; return next; });
          setShiftEditorModal(null);
        }}
        setDraft={setEditorDraft}
        setPickingSlot={setEditorPickingSlot}
      />
    </div>
  );
}

// ── Shift Editor Modal ──
// Rendered via portal so position:fixed is relative to the viewport, not any
// ancestor. Tap a column header (H1·1 … H2·4) to open.
function ShiftEditorModal({ modal, draft, pickingSlot, players, lockedShifts, S, onClose, onSave, onUnlock, setDraft, setPickingSlot }) {
  if (!modal) return null;
  const { g, s } = modal;
  const shiftLabel = `Game ${g + 1} · ${s < 4 ? `H1·${s + 1}` : `H2·${s - 3}`}`;
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
          <span style={{ color: "#fff", fontWeight: 700, fontSize: "15px", fontFamily: "'DM Sans'" }}>{shiftLabel}</span>
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
            <div style={{ padding: "12px 16px", display: "flex", gap: "8px", borderTop: "2px solid #f0f0f0" }}>
              <button onClick={onSave} style={{ ...S.btn(), flex: 1, fontSize: "13px" }}>🔒 Save & Lock</button>
              {lockedShifts[`${g}-${s}`] && (
                <button onClick={onUnlock} style={{ ...S.btn("#666"), fontSize: "11px", padding: "9px 12px" }}>Unlock</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
