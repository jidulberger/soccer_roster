'use client'

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  INITIAL_PLAYERS, ALL_GRADES, GRADE_VAL, GRADE_COLORS, POS_COLORS,
  generateRotation,
} from '@/lib/algorithm';

export default function SoccerRotation() {
  const [seed, setSeed] = useState(0);
  const [shiftExclusions, setShiftExclusions] = useState({});
  const [shiftForceIns, setShiftForceIns] = useState({});
  const [gameExclusions, setGameExclusions] = useState({});
  const [lockedShifts, setLockedShifts] = useState({});
  const [players, setPlayers] = useState(INITIAL_PLAYERS);
  const [showRoster, setShowRoster] = useState(false);
  const [activeGame, setActiveGame] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Load shared state from API on mount
  useEffect(() => {
    fetch('/api/state')
      .then(r => r.json())
      .then(state => {
        if (state.seed !== undefined) setSeed(state.seed);
        if (state.shiftExclusions) setShiftExclusions(state.shiftExclusions);
        if (state.shiftForceIns) setShiftForceIns(state.shiftForceIns);
        if (state.gameExclusions) setGameExclusions(state.gameExclusions);
        if (state.lockedShifts) setLockedShifts(state.lockedShifts);
        if (state.players) setPlayers(state.players);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Auto-save to shared API 500ms after any change
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed, shiftExclusions, shiftForceIns, gameExclusions, lockedShifts, players }),
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [seed, shiftExclusions, shiftForceIns, gameExclusions, lockedShifts, players, loaded]);

  const handleSync = useCallback(async () => {
    try {
      const state = await fetch('/api/state').then(r => r.json());
      if (state.seed !== undefined) setSeed(state.seed);
      if (state.shiftExclusions) setShiftExclusions(state.shiftExclusions);
      if (state.shiftForceIns) setShiftForceIns(state.shiftForceIns);
      if (state.gameExclusions) setGameExclusions(state.gameExclusions);
      if (state.lockedShifts) setLockedShifts(state.lockedShifts);
      if (state.players) setPlayers(state.players);
    } catch(e) {}
  }, []);

  const { games, totalShifts, totalPositions } = useMemo(() => {
    return generateRotation(seed, players, shiftExclusions, gameExclusions, shiftForceIns, lockedShifts);
  }, [seed, players, shiftExclusions, gameExclusions, shiftForceIns, lockedShifts]);

  const excludeFromShift = useCallback((gameIdx, shiftIdx, playerName) => {
    setShiftExclusions(prev => {
      const key = `${gameIdx}-${shiftIdx}`;
      const list = [...(prev[key] || [])];
      if (!list.includes(playerName)) list.push(playerName);
      return { ...prev, [key]: list };
    });
  }, []);

  const toggleGameExclusion = useCallback((gameIdx, playerName) => {
    setGameExclusions(prev => {
      const list = [...(prev[gameIdx] || [])];
      const idx = list.indexOf(playerName);
      if (idx >= 0) {
        // Restoring player — clear any per-shift exclusions for this game too
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
    setShiftExclusions(prev => {
      const key = `${gameIdx}-${shiftIdx}`;
      if (!prev[key]) return prev;
      const list = prev[key].filter(n => n !== playerName);
      if (list.length === 0) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: list };
    });
  }, []);

  const forceIntoShift = useCallback((gameIdx, shiftIdx, playerName) => {
    setShiftForceIns(prev => {
      const key = `${gameIdx}-${shiftIdx}`;
      const list = [...(prev[key] || [])];
      if (!list.includes(playerName)) list.push(playerName);
      return { ...prev, [key]: list };
    });
  }, []);

  const unforceFromShift = useCallback((gameIdx, shiftIdx, playerName) => {
    setShiftForceIns(prev => {
      const key = `${gameIdx}-${shiftIdx}`;
      if (!prev[key]) return prev;
      const list = prev[key].filter(n => n !== playerName);
      if (list.length === 0) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: list };
    });
  }, []);

  const toggleLockShift = useCallback((gameIdx, shiftIdx) => {
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
  }, [games]);

  const isGameExcluded = (gi, name) => (gameExclusions[gi] || []).includes(name);
  const isShiftExcluded = (gi, si, name) => (shiftExclusions[`${gi}-${si}`] || []).includes(name);
  const isShiftForced = (gi, si, name) => (shiftForceIns[`${gi}-${si}`] || []).includes(name);

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
    Object.keys(lockedShifts).length > 0;

  const S = {
    root: { fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", padding: "16px", maxWidth: "920px", margin: "0 auto", color: "#1a1a2e" },
    tabs: { display: "flex", gap: "6px", marginBottom: "12px" },
    tab: (on) => ({ flex: 1, padding: "9px 0", border: on ? "2px solid #1a1a2e" : "2px solid #e5e7eb", borderRadius: "8px",
      background: on ? "#1a1a2e" : "#fff", color: on ? "#fff" : "#1a1a2e", fontFamily: "'DM Sans'", fontWeight: 600, fontSize: "13px", cursor: "pointer" }),
    grid: { background: "#fff", borderRadius: "12px", border: "1px solid #e5e7eb", overflow: "hidden", marginBottom: "16px" },
    row: (alt) => ({ display: "grid", gridTemplateColumns: "82px repeat(8, 1fr)", background: alt ? "#fafbfc" : "#fff" }),
    hdrCell: (s) => ({ padding: "8px 4px", fontSize: "10px", fontWeight: 600, color: "#999", textAlign: "center",
      textTransform: "uppercase", letterSpacing: "0.5px", borderLeft: s === 5 ? "3px solid #1a1a2e" : "none" }),
    posCell: (s) => ({ padding: "4px 2px", display: "flex", alignItems: "center", justifyContent: "center",
      borderLeft: s === 4 ? "3px solid #1a1a2e" : "none" }),
    badge: (pos) => ({ background: POS_COLORS[pos]?.bg || "transparent", color: POS_COLORS[pos]?.text || "#ccc",
      fontSize: "10px", fontFamily: "'DM Mono', monospace", fontWeight: 600, padding: "2px 8px", borderRadius: "4px",
      cursor: "pointer", userSelect: "none", minWidth: "24px", textAlign: "center" }),
    xBadge: { background: "#fef2f2", color: "#991b1b", fontSize: "10px", fontFamily: "'DM Mono', monospace",
      fontWeight: 600, padding: "2px 8px", borderRadius: "4px", cursor: "pointer", userSelect: "none",
      border: "1px dashed #fca5a5", minWidth: "24px", textAlign: "center" },
    sit: { fontSize: "10px", color: "#ddd", cursor: "default", padding: "2px 8px" },
    nameBtn: (excluded) => ({ padding: "6px 8px", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer",
      userSelect: "none", background: excluded ? "#fef2f2" : "transparent", borderRadius: excluded ? "4px" : "0" }),
    btn: (bg = "#1a1a2e") => ({ padding: "9px 18px", background: bg, color: "#fff", border: "none", borderRadius: "8px",
      fontFamily: "'DM Sans'", fontWeight: 600, fontSize: "12px", cursor: "pointer" }),
  };

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
      <p style={{ fontSize: "11px", color: "#666", margin: "0 0 4px", lineHeight: 1.5 }}>
        Tap <b>position</b> → remove from shift&nbsp;&nbsp;·&nbsp;&nbsp;
        Tap <b>–</b> → force into shift&nbsp;&nbsp;·&nbsp;&nbsp;
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

      {/* Grid */}
      <div style={S.grid}>
        <div style={{ ...S.row(false), borderBottom: "2px solid #e5e7eb", background: "#fafafa" }}>
          <div style={{ padding: "8px", fontSize: "10px", fontWeight: 600, color: "#999", textTransform: "uppercase" }}>Player</div>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <div key={s} style={S.hdrCell(s)}>{s <= 4 ? `H1·${s}` : `H2·${s - 4}`}</div>)}
        </div>

        {/* Lock row */}
        <div style={{ ...S.row(false), borderBottom: "1px solid #e5e7eb", background: "#f0fdf4" }}>
          <div style={{ padding: "4px 8px", fontSize: "9px", fontWeight: 600, color: "#888" }}>Lock</div>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(s => {
            const key = `${activeGame}-${s}`;
            const isLocked = !!lockedShifts[key];
            return <div key={s} style={{ ...S.posCell(s), cursor: "pointer" }} onClick={() => toggleLockShift(activeGame, s)}>
              <span style={{ fontSize: "12px", userSelect: "none", opacity: isLocked ? 1 : 0.3 }}>{isLocked ? "🔒" : "🔓"}</span>
            </div>;
          })}
        </div>

        {players.map((player, pi) => {
          const g = activeGame;
          const gameEx = isGameExcluded(g, player.name);
          return (
            <div key={player.name} style={{ ...S.row(pi % 2 !== 0), borderBottom: pi < players.length - 1 ? "1px solid #f0f0f0" : "none" }}>
              <div style={S.nameBtn(gameEx)} onClick={() => toggleGameExclusion(g, player.name)}>
                <span style={{ fontSize: "12px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  textDecoration: gameEx ? "line-through" : "none", color: gameEx ? "#991b1b" : "#1a1a2e" }}>
                  {player.name}
                </span>
              </div>
              {[0, 1, 2, 3, 4, 5, 6, 7].map(s => {
                if (gameEx) {
                  return <div key={s} style={S.posCell(s)}><span style={{ ...S.xBadge, opacity: 0.4 }}>✕</span></div>;
                }
                const shiftEx = isShiftExcluded(g, s, player.name);
                if (shiftEx) {
                  return <div key={s} style={{ ...S.posCell(s), cursor: "pointer" }} onClick={() => restoreFromShift(g, s, player.name)}>
                    <span style={S.xBadge}>✕</span>
                  </div>;
                }
                const shift = games[g]?.[s];
                const pos = shift ? getPos(shift, player.name) : "";
                const forced = isShiftForced(g, s, player.name);
                if (pos) {
                  return <div key={s} style={{ ...S.posCell(s), cursor: "pointer" }}
                    onClick={() => forced ? unforceFromShift(g, s, player.name) : excludeFromShift(g, s, player.name)}>
                    <span style={{ ...S.badge(pos), ...(forced ? { boxShadow: "0 0 0 2px #22c55e", borderRadius: "5px" } : {}) }}>{pos}</span>
                  </div>;
                } else {
                  return <div key={s} style={{ ...S.posCell(s), cursor: "pointer" }}
                    onClick={() => forceIntoShift(g, s, player.name)}>
                    <span style={{ ...S.sit, color: "#bbb" }}>–</span>
                  </div>;
                }
              })}
            </div>
          );
        })}

        {/* Field avg row */}
        <div style={{ ...S.row(false), borderTop: "2px solid #e5e7eb", background: "#f8f7f4" }}>
          <div style={{ padding: "8px", fontSize: "10px", fontWeight: 700, color: "#666" }}>Field Avg</div>
          {[0, 1, 2, 3, 4, 5, 6, 7].map(s => {
            const shift = games[activeGame]?.[s];
            if (!shift) return <div key={s} style={S.posCell(s)}>–</div>;
            const fp = [shift.D, shift.R1, shift.R2, shift.O].filter(Boolean);
            const avg = fp.length ? fp.reduce((sum, n) => sum + (GRADE_VAL[players.find(p => p.name === n)?.grade] || 0), 0) / fp.length : 0;
            const color = avg >= 2.3 ? "#22c55e" : avg >= 2.0 ? "#eab308" : "#ef4444";
            return <div key={s} style={S.posCell(s)}>
              <span style={{ fontSize: "10px", fontFamily: "'DM Mono'", fontWeight: 700, color }}>{avg.toFixed(1)}</span>
            </div>;
          })}
        </div>
      </div>

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
            {hasAnyOverrides && (
              <button onClick={() => {
                setShiftExclusions({}); setGameExclusions({}); setShiftForceIns({}); setLockedShifts({});
              }} style={S.btn("#dc2626")}>↩ Clear All</button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", background: "#f9fafb",
              borderRadius: "8px", border: "1px solid #e5e7eb", fontSize: "12px", fontFamily: "'DM Sans'" }}>
              <span style={{ color: "#666", fontWeight: 500 }}>Min field avg:</span>
              <span style={{ fontWeight: 700, fontFamily: "'DM Mono'", color, fontSize: "13px" }}>{minAvg === Infinity ? "–" : minAvg.toFixed(2)}</span>
              <span style={{ color: "#999", fontSize: "10px" }}>{minLabel}</span>
            </div>
            <button onClick={async () => {
              const defaults = { seed: 0, shiftExclusions: {}, shiftForceIns: {}, gameExclusions: {}, lockedShifts: {}, players: INITIAL_PLAYERS };
              setSeed(0); setShiftExclusions({}); setGameExclusions({});
              setShiftForceIns({}); setLockedShifts({}); setPlayers(INITIAL_PLAYERS);
              try {
                await fetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(defaults) });
              } catch(e) {}
            }} style={{ ...S.btn("#666"), fontSize: "11px", padding: "6px 12px" }}>🗑 Reset All</button>
          </div>
        );
      })()}
    </div>
  );
}
