// ── Player Data ──
export const INITIAL_PLAYERS = [
  { name: "Thea", grade: "B", canGoalie: false, prefD: true, prefO: true },
  { name: "Mae Mae", grade: "B", canGoalie: false, prefD: false, prefO: true },
  { name: "Ona", grade: "B", canGoalie: false, prefD: true, prefO: false },
  { name: "Kaitlyn", grade: "B", canGoalie: true, prefD: false, prefO: false },
  { name: "Amelia", grade: "B-", canGoalie: false, prefD: false, prefO: false },
  { name: "Harlow", grade: "B-", canGoalie: true, prefD: false, prefO: false },
  { name: "Abigail", grade: "C+", canGoalie: true, prefD: false, prefO: false },
  { name: "Maddie", grade: "C+", canGoalie: false, prefD: false, prefO: false },
  { name: "Emerson", grade: "C-", canGoalie: true, prefD: false, prefO: false },
  { name: "Lana", grade: "C-", canGoalie: true, prefD: false, prefO: false },
  { name: "Maron", grade: "D", canGoalie: true, prefD: false, prefO: false, lessD: true },
];

export const ALL_GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-"];

export const GRADE_VAL = {
  "A+": 5.0, "A": 4.5, "A-": 4.0,
  "B+": 3.5, "B": 3.0, "B-": 2.5,
  "C+": 2.25, "C": 2.0, "C-": 1.5,
  "D+": 1.25, "D": 1.0, "D-": 0.75,
};

export const GRADE_COLORS = {
  "A+": "#14532d", "A": "#15803d", "A-": "#16a34a",
  "B+": "#22c55e", "B": "#86efac", "B-": "#bbf7d0",
  "C+": "#fef08a", "C": "#fbbf24", "C-": "#fde68a",
  "D+": "#fdba74", "D": "#f87171", "D-": "#fca5a5",
};

export const POS_COLORS = {
  D: { bg: "#2563eb", text: "#fff" }, R: { bg: "#7c3aed", text: "#fff" },
  O: { bg: "#dc2626", text: "#fff" }, G: { bg: "#d97706", text: "#fff" },
};

// ── Utils ──
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function combinations(arr, k) {
  if (k === 0) return [[]]; if (arr.length < k) return [];
  const r = [];
  for (let i = 0; i <= arr.length - k; i++)
    for (const c of combinations(arr.slice(i + 1), k - 1)) r.push([arr[i], ...c]);
  return r;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr]; const r = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) r.push([arr[i], ...p]);
  }
  return r;
}

// ── Core Algorithm ──
// pinnedPositions: { playerName: "D"|"R"|"O" } — pre-assigned field positions.
// Pinned players are placed first; remaining players fill leftover slots optimally.
function assignPositions(selected, goalie, totalPositions, rand, pinnedPositions = {}) {
  const positions = ["D", "R1", "R2", "O"];

  // Resolve pinned players to specific grid positions
  const preAssigned = {}; // "D"|"R1"|"R2"|"O" -> player obj
  const pinnedNames = new Set();
  let r1Taken = false;
  for (const p of selected) {
    const pin = pinnedPositions[p.name];
    if (!pin) continue;
    pinnedNames.add(p.name);
    if (pin === "R") {
      if (!r1Taken && !preAssigned["R1"]) { preAssigned["R1"] = p; r1Taken = true; }
      else if (!preAssigned["R2"]) preAssigned["R2"] = p;
    } else if (!preAssigned[pin]) {
      preAssigned[pin] = p;
    }
  }

  const freePlayers = selected.filter(p => !pinnedNames.has(p.name));
  const freePositions = positions.filter(pos => !preAssigned[pos]);

  let bestAssign = null; let bestScore = -Infinity;
  for (const perm of permutations(freePlayers)) {
    let sc = 0;
    perm.slice(0, freePositions.length).forEach((p, i) => {
      const pos = freePositions[i]; const pk = pos === "R1" || pos === "R2" ? "R" : pos;
      sc -= (totalPositions[p.name]?.[pk] || 0) * 3;
      if (pos === "D" && p.prefD) sc += 2; if (pos === "O" && p.prefO) sc += 2;
      if (pos === "D" && p.lessD) sc -= 3;
      const pv = GRADE_VAL[p.grade] || 0;
      if (pos === "D") sc += pv * 0.5; if (pos === "O") sc += pv * 0.3;
      sc += rand() * 2;
    });
    if (sc > bestScore) {
      bestScore = sc;
      bestAssign = perm.slice(0, freePositions.length).map((p, i) => ({ player: p, pos: freePositions[i] }));
    }
  }

  const shift = { G: goalie, D: null, R1: null, R2: null, O: null };
  Object.entries(preAssigned).forEach(([pos, p]) => { shift[pos] = p.name; });
  if (bestAssign) bestAssign.forEach(({ player, pos }) => { shift[pos] = player.name; });
  return shift;
}

function updateState(shift, goalie, gamePlayers, shiftCounts, history, totalShifts, totalPositions) {
  const onField = [shift.G, shift.D, shift.R1, shift.R2, shift.O].filter(Boolean);
  [["D", "D"], ["R1", "R"], ["R2", "R"], ["O", "O"]].forEach(([k, pk]) => {
    if (shift[k]) { totalPositions[shift[k]][pk]++; shiftCounts[shift[k]]++; totalShifts[shift[k]]++; }
  });
  if (goalie && totalPositions[goalie]) { totalPositions[goalie].G++; shiftCounts[goalie]++; totalShifts[goalie]++; }
  gamePlayers.forEach(p => {
    if (!history[p.name]) history[p.name] = [];
    history[p.name].push(onField.includes(p.name) ? 'play' : 'sit');
  });
}

// goalieMode: "pairs" (default — 2 shifts per goalie) | "halves" (one goalie per half)
// shiftsPerGame: 4 | 6 | 8 (default 8, must be even — split evenly into two halves)
export function generateRotation(seed, players, shiftExclusions = {}, gameExclusions = {}, shiftForceIns = {}, lockedShifts = {}, shiftForcePositions = {}, goalieMode = "pairs", shiftsPerGame = 8) {
  const rand = mulberry32(seed);
  const shiftsPerHalf = shiftsPerGame / 2;
  const games = []; const totalShifts = {}; const totalPositions = {};
  players.forEach(p => { totalShifts[p.name] = 0; totalPositions[p.name] = { D: 0, R: 0, O: 0, G: 0 }; });

  const gamesExcludedCount = {};
  players.forEach(p => {
    let count = 0;
    for (let g = 0; g < 4; g++) {
      const gameEx = gameExclusions[g] || [];
      const allShiftsExcluded = Array.from({ length: shiftsPerGame }, (_, i) => i).every(s => {
        const key = `${g}-${s}`;
        return (shiftExclusions[key] || []).includes(p.name);
      });
      if (gameEx.includes(p.name) || allShiftsExcluded) count++;
    }
    gamesExcludedCount[p.name] = count;
  });

  function buildGoalieSchedule(gameIndex, availPlayers) {
    const ag = availPlayers.filter(p => p.canGoalie).map(p => p.name);
    if (ag.length === 0) return Array(shiftsPerGame).fill(null);
    if (ag.length === 1) return Array(shiftsPerGame).fill(ag[0]);
    const sorted = [...ag].sort((a, b) => (GRADE_VAL[players.find(p => p.name === b).grade] || 0) - (GRADE_VAL[players.find(p => p.name === a).grade] || 0));

    if (goalieMode === "halves") {
      const offset = gameIndex * 2;
      const gk1 = sorted[offset % sorted.length];
      const gk2 = sorted[(offset + 1) % sorted.length];
      return [...Array(shiftsPerHalf).fill(gk1), ...Array(shiftsPerHalf).fill(gk2)];
    }

    // Pairs: rotate every 2 shifts; odd-length halves get a 1-shift final slot
    const pairsPerHalf = Math.ceil(shiftsPerHalf / 2);
    const offset = gameIndex * pairsPerHalf * 2;
    const schedule = [];
    for (let half = 0; half < 2; half++) {
      for (let pair = 0; pair < pairsPerHalf; pair++) {
        const gk = sorted[(offset + half * pairsPerHalf + pair) % sorted.length];
        const len = Math.min(2, shiftsPerHalf - pair * 2);
        for (let i = 0; i < len; i++) schedule.push(gk);
      }
    }
    return schedule;
  }

  const allGKShifts = {}; players.forEach(p => allGKShifts[p.name] = 0);
  const allGameGK = [];
  for (let g = 0; g < 4; g++) {
    const gex = gameExclusions[g] || [];
    const avail = players.filter(p => !gex.includes(p.name));
    const gs = buildGoalieSchedule(g, avail);
    allGameGK.push(gs);
    gs.forEach(n => { if (n) allGKShifts[n]++; });
  }

  const teamAvg = players.reduce((s, p) => s + (GRADE_VAL[p.grade] || 0), 0) / players.length;

  for (let g = 0; g < 4; g++) {
    const gex = gameExclusions[g] || [];
    const gamePlayers = players.filter(p => !gex.includes(p.name));
    const goalieShifts = allGameGK[g];
    const game = [];
    const pShiftsGame = {}; const pHistory = {};
    gamePlayers.forEach(p => { pShiftsGame[p.name] = 0; pHistory[p.name] = []; });

    for (let s = 0; s < shiftsPerGame; s++) {
      const shiftKey = `${g}-${s}`;
      const locked = lockedShifts[shiftKey];
      if (locked) {
        const shift = { ...locked };
        updateState(shift, shift.G, gamePlayers, pShiftsGame, pHistory, totalShifts, totalPositions);
        game.push(shift);
        continue;
      }

      const shiftEx = shiftExclusions[shiftKey] || [];
      const forcedPos = shiftForcePositions[shiftKey] || {}; // { playerName: "G"|"D"|"R"|"O" }

      // Determine effective goalie — force-G overrides the scheduled goalie
      let goalie = goalieShifts[s];
      for (const [name, pos] of Object.entries(forcedPos)) {
        if (pos === "G" && gamePlayers.find(p => p.name === name) && !shiftEx.includes(name)) {
          goalie = name;
          break;
        }
      }

      // If the effective goalie is excluded from this shift, find the best available backup
      if (goalie && shiftEx.includes(goalie)) {
        const backups = gamePlayers
          .filter(p => p.canGoalie && p.name !== goalie && !shiftEx.includes(p.name))
          .sort((a, b) => (totalPositions[a.name]?.G || 0) - (totalPositions[b.name]?.G || 0));
        goalie = backups.length > 0 ? backups[0].name : null;
      }

      // If the effective goalie is forced to a field position in this shift, find a backup
      if (goalie && forcedPos[goalie] && forcedPos[goalie] !== "G") {
        const backups = gamePlayers
          .filter(p => p.canGoalie && p.name !== goalie && !shiftEx.includes(p.name)
            && !(forcedPos[p.name] && forcedPos[p.name] !== "G"))
          .sort((a, b) => (totalPositions[a.name]?.G || 0) - (totalPositions[b.name]?.G || 0));
        goalie = backups.length > 0 ? backups[0].name : null;
      }

      // Force-position field players (non-G) are implicit force-ins
      const forcePosFieldNames = Object.entries(forcedPos)
        .filter(([name, pos]) => pos !== "G" && !shiftEx.includes(name) && gamePlayers.find(p => p.name === name))
        .map(([name]) => name);

      // Merge shiftForceIns + force-position field names, deduplicated
      const allForceInNames = [...new Set([...(shiftForceIns[shiftKey] || []), ...forcePosFieldNames])];
      const forced = allForceInNames.map(n => gamePlayers.find(p => p.name === n)).filter(p => p && p.name !== goalie);

      // Build pinned positions map for assignPositions (field positions only)
      const pinnedPositions = {};
      for (const [name, pos] of Object.entries(forcedPos)) {
        if (pos !== "G" && !shiftEx.includes(name) && gamePlayers.find(p => p.name === name) && name !== goalie) {
          pinnedPositions[name] = pos;
        }
      }

      const available = gamePlayers.filter(p => p.name !== goalie && !shiftEx.includes(p.name));
      const fieldSize = Math.min(4, available.length);
      const forcedAvail = forced.filter(p => available.includes(p));
      const remaining = available.filter(p => !forcedAvail.includes(p));
      const slotsToFill = fieldSize - forcedAvail.length;

      if (available.length <= fieldSize || slotsToFill <= 0) {
        const selected = slotsToFill <= 0 ? forcedAvail.slice(0, fieldSize) : available;
        const shift = assignPositions(selected, goalie, totalPositions, rand, pinnedPositions);
        updateState(shift, goalie, gamePlayers, pShiftsGame, pHistory, totalShifts, totalPositions);
        game.push(shift); continue;
      }

      const combos = slotsToFill > 0 ? combinations(remaining, slotsToFill).map(c => [...forcedAvail, ...c]) : [forcedAvail];
      let bestCombo = null; let bestScore = -Infinity;

      for (const combo of combos) {
        let score = 0;
        const comboAvg = combo.reduce((s, p) => s + (GRADE_VAL[p.grade] || 0), 0) / fieldSize;
        const gradeDiff = Math.abs(comboAvg - teamAvg);
        score -= gradeDiff * 35;
        if (comboAvg < 2.0) score -= 500;
        const isKey = s === 0 || s === 6 || s === 7;
        if (isKey) { if (comboAvg >= 2.3) score += 60; if (comboAvg >= 2.5) score += 30; if (comboAvg < 2.3) score -= 80; if (comboAvg < 2.0) score -= 200; }
        if (s === 6) { if (comboAvg >= 2.3) score += 80; if (comboAvg >= 2.5) score += 40; if (comboAvg < 2.3) score -= 150; }

        for (const p of combo) {
          const shifts = pShiftsGame[p.name];
          const pv = GRADE_VAL[p.grade] || 0;
          const cap = pv >= 3 ? 5 : 4;
          if (shifts >= cap) score -= 2000;
          score -= shifts * 20;
          const proj = totalShifts[p.name] + 1;
          const expG = allGKShifts[p.name] || 0;
          const activeGames = 4 - gamesExcludedCount[p.name];
          const baseT = pv >= 3 ? 16 : pv >= 2.35 ? 15 : 14;
          const scaledT = Math.round(baseT * (activeGames / 4));
          const target = expG >= 6 ? Math.min(scaledT, Math.round(15 * activeGames / 4)) : scaledT;
          if (pv >= 3 && expG === 0) { if (proj <= target) score += 12; if (g >= 2 && totalShifts[p.name] < (target / activeGames) * (g + 1)) score += 20; }
          if (proj > 17) score -= 2000;
          const pace13 = (Math.round(13 * activeGames / 4) / activeGames) * (g + 1);
          if (totalShifts[p.name] < pace13) score += 30;
          if (g === 3 && totalShifts[p.name] < Math.round(13 * activeGames / 4)) score += (Math.round(13 * activeGames / 4) - totalShifts[p.name]) * 20;
          if (proj > target) score -= (proj - target) * 15;
          if (pv >= 3 && proj <= target) score += 15;
          if (pv >= 2.35 && pv < 3 && proj <= target) score += 8;
          if (pv < 2.35 && totalShifts[p.name] >= target) score -= 25;
        }

        const notSel = available.filter(p => !combo.includes(p));
        for (const p of notSel) {
          const hist = pHistory[p.name] || [];
          if (hist.length >= 2 && hist[hist.length - 1] === 'sit' && hist[hist.length - 2] === 'sit') score -= 800;
          else if (hist.length >= 1 && hist[hist.length - 1] === 'sit') score -= 150;
          const futGK = goalieShifts.slice(s + 1).filter(gk => gk === p.name).length;
          const totalExp = pShiftsGame[p.name] + futGK;
          const sLeft = 8 - (s + 1); const needed = 3 - totalExp; const fieldOpp = sLeft - futGK;
          if (needed > 0 && needed >= fieldOpp) score -= 500;
          else if (needed > 0 && needed >= fieldOpp - 1) score -= 100;
          const pv2 = GRADE_VAL[p.grade] || 0;
          const expG2 = allGKShifts[p.name] || 0;
          const activeG2 = 4 - gamesExcludedCount[p.name];
          const baseT2 = pv2 >= 3 ? 16 : pv2 >= 2.35 ? 15 : 14;
          const pTarget = expG2 >= 6 ? Math.min(Math.round(baseT2 * activeG2 / 4), Math.round(15 * activeG2 / 4)) : Math.round(baseT2 * activeG2 / 4);
          const remOpps = sLeft + (4 - (g + 1)) * 4;
          const twg = totalShifts[p.name] + futGK;
          if (twg + remOpps <= pTarget) score -= 300;
          else if (totalShifts[p.name] < pTarget - 6) score -= 40;
          if (twg + remOpps <= Math.round(13 * activeG2 / 4)) score -= 600;
          if (totalShifts[p.name] < (Math.round(13 * activeG2 / 4) / activeG2) * (g + 1) - 1) score -= 80;
        }
        score += rand() * 5;
        if (score > bestScore) { bestScore = score; bestCombo = combo; }
      }
      const shift = assignPositions(bestCombo || available.slice(0, fieldSize), goalie, totalPositions, rand, pinnedPositions);
      updateState(shift, goalie, gamePlayers, pShiftsGame, pHistory, totalShifts, totalPositions);
      game.push(shift);
    }
    games.push(game);
  }
  return { games, totalShifts, totalPositions };
}
