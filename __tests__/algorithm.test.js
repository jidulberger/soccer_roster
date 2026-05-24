import { generateRotation, INITIAL_PLAYERS, ALL_GRADES, GRADE_VAL } from '@/lib/algorithm'

const players = INITIAL_PLAYERS
const goalies = players.filter(p => p.canGoalie).map(p => p.name)
const nonGoalies = players.filter(p => !p.canGoalie).map(p => p.name)
const allNames = new Set(players.map(p => p.name))

// ── Grade constants ──────────────────────────────────────────────────────────

describe('grade constants', () => {
  test('ALL_GRADES has 12 entries from A+ to D-', () => {
    expect(ALL_GRADES).toHaveLength(12)
    expect(ALL_GRADES[0]).toBe('A+')
    expect(ALL_GRADES[ALL_GRADES.length - 1]).toBe('D-')
  })

  test('every grade in ALL_GRADES has a GRADE_VAL entry', () => {
    ALL_GRADES.forEach(g => expect(GRADE_VAL[g]).toBeDefined())
  })

  test('grades are in strictly descending order of value', () => {
    for (let i = 0; i < ALL_GRADES.length - 1; i++) {
      expect(GRADE_VAL[ALL_GRADES[i]]).toBeGreaterThan(GRADE_VAL[ALL_GRADES[i + 1]])
    }
  })

  test('A+ is the highest value', () => {
    const max = Math.max(...Object.values(GRADE_VAL))
    expect(GRADE_VAL['A+']).toBe(max)
  })

  test('D- is the lowest value', () => {
    const min = Math.min(...Object.values(GRADE_VAL))
    expect(GRADE_VAL['D-']).toBe(min)
  })
})

// ── Output structure ─────────────────────────────────────────────────────────

describe('generateRotation — output structure', () => {
  let result

  beforeAll(() => { result = generateRotation(0, players) })

  test('returns 4 games', () => {
    expect(result.games).toHaveLength(4)
  })

  test('each game has 8 shifts', () => {
    result.games.forEach(game => expect(game).toHaveLength(8))
  })

  test('each shift has G, D, R1, R2, O keys', () => {
    result.games.forEach(game => {
      game.forEach(shift => {
        expect(shift).toHaveProperty('G')
        expect(shift).toHaveProperty('D')
        expect(shift).toHaveProperty('R1')
        expect(shift).toHaveProperty('R2')
        expect(shift).toHaveProperty('O')
      })
    })
  })

  test('each shift has exactly one goalie from the canGoalie list', () => {
    result.games.forEach(game => {
      game.forEach(shift => {
        expect(shift.G).toBeTruthy()
        expect(goalies).toContain(shift.G)
      })
    })
  })

  test('each shift has 4 field players', () => {
    result.games.forEach(game => {
      game.forEach(shift => {
        const field = [shift.D, shift.R1, shift.R2, shift.O].filter(Boolean)
        expect(field).toHaveLength(4)
      })
    })
  })

  test('no player appears twice in the same shift', () => {
    result.games.forEach(game => {
      game.forEach(shift => {
        const all = [shift.G, shift.D, shift.R1, shift.R2, shift.O].filter(Boolean)
        expect(new Set(all).size).toBe(all.length)
      })
    })
  })

  test('all names in shifts belong to the player list', () => {
    result.games.forEach(game => {
      game.forEach(shift => {
        [shift.G, shift.D, shift.R1, shift.R2, shift.O].filter(Boolean).forEach(name => {
          expect(allNames).toContain(name)
        })
      })
    })
  })

  test('totalShifts has an entry for every player', () => {
    players.forEach(p => {
      expect(result.totalShifts[p.name]).toBeDefined()
    })
  })

  test('totalPositions has an entry for every player with D/R/O/G counts', () => {
    players.forEach(p => {
      const pos = result.totalPositions[p.name]
      expect(pos).toBeDefined()
      expect(typeof pos.D).toBe('number')
      expect(typeof pos.R).toBe('number')
      expect(typeof pos.O).toBe('number')
      expect(typeof pos.G).toBe('number')
    })
  })

  test('totalShifts equals sum of all position counts per player', () => {
    players.forEach(p => {
      const { D, R, O, G } = result.totalPositions[p.name]
      expect(D + R + O + G).toBe(result.totalShifts[p.name])
    })
  })
})

// ── Determinism ──────────────────────────────────────────────────────────────

describe('generateRotation — determinism', () => {
  test('same seed produces identical output', () => {
    const r1 = generateRotation(42, players)
    const r2 = generateRotation(42, players)
    expect(r1.totalShifts).toEqual(r2.totalShifts)
    expect(r1.games).toEqual(r2.games)
  })

  test('different seeds produce different rotations', () => {
    const r1 = generateRotation(1, players)
    const r2 = generateRotation(2, players)
    // Comparing game arrays — extremely unlikely to match by chance
    expect(r1.games[0][0]).not.toEqual(r2.games[0][0])
  })
})

// ── Hard constraints ─────────────────────────────────────────────────────────

describe('generateRotation — game exclusions', () => {
  test('excluded player does not appear in any shift of the excluded game', () => {
    const { games } = generateRotation(0, players, {}, { 0: ['Thea'] })
    games[0].forEach(shift => {
      const all = [shift.G, shift.D, shift.R1, shift.R2, shift.O].filter(Boolean)
      expect(all).not.toContain('Thea')
    })
  })

  test('excluded player still appears in other games', () => {
    const { games } = generateRotation(0, players, {}, { 0: ['Thea'] })
    const inOtherGames = games.slice(1).some(game =>
      game.some(shift => [shift.G, shift.D, shift.R1, shift.R2, shift.O].includes('Thea'))
    )
    expect(inOtherGames).toBe(true)
  })

  test('multiple players can be excluded from the same game', () => {
    const { games } = generateRotation(0, players, {}, { 2: ['Thea', 'Mae Mae'] })
    games[2].forEach(shift => {
      const all = [shift.G, shift.D, shift.R1, shift.R2, shift.O].filter(Boolean)
      expect(all).not.toContain('Thea')
      expect(all).not.toContain('Mae Mae')
    })
  })
})

describe('generateRotation — shift exclusions', () => {
  test('excluded player does not appear in that specific shift', () => {
    const { games } = generateRotation(0, players, { '1-3': ['Ona'] })
    const shift = games[1][3]
    const all = [shift.G, shift.D, shift.R1, shift.R2, shift.O].filter(Boolean)
    expect(all).not.toContain('Ona')
  })

  test('shift exclusion does not affect the same player in other shifts', () => {
    const { games } = generateRotation(0, players, { '0-0': ['Thea'] })
    // Thea should still appear somewhere across shifts 1–7 of game 0
    const appearsElsewhere = games[0].slice(1).some(shift =>
      [shift.G, shift.D, shift.R1, shift.R2, shift.O].includes('Thea')
    )
    expect(appearsElsewhere).toBe(true)
  })

  test('shift exclusion does not affect other games', () => {
    const { games } = generateRotation(0, players, { '0-0': ['Thea'] })
    const appearsInOtherGames = games.slice(1).some(game =>
      game.some(shift => [shift.G, shift.D, shift.R1, shift.R2, shift.O].includes('Thea'))
    )
    expect(appearsInOtherGames).toBe(true)
  })
})

describe('generateRotation — force-ins', () => {
  test('forced non-goalie player appears in the specified shift', () => {
    // Maddie cannot be goalie, so she must land on a field position
    const { games } = generateRotation(0, players, {}, {}, { '0-5': ['Maddie'] })
    const shift = games[0][5]
    const all = [shift.G, shift.D, shift.R1, shift.R2, shift.O].filter(Boolean)
    expect(all).toContain('Maddie')
  })

  test('forcing a player into a shift they would not normally play', () => {
    // Use a different seed to ensure we pick a shift where Mae Mae sits
    const base = generateRotation(7, players)
    const sittingShift = base.games[0].findIndex(shift =>
      ![shift.G, shift.D, shift.R1, shift.R2, shift.O].includes('Mae Mae')
    )
    if (sittingShift === -1) return // Mae Mae plays every shift — nothing to force

    const key = `0-${sittingShift}`
    const { games } = generateRotation(7, players, {}, {}, { [key]: ['Mae Mae'] })
    const shift = games[0][sittingShift]
    const all = [shift.G, shift.D, shift.R1, shift.R2, shift.O].filter(Boolean)
    expect(all).toContain('Mae Mae')
  })
})

describe('generateRotation — locked shifts', () => {
  test('locked shift is preserved exactly when regenerating with a different seed', () => {
    const { games: first } = generateRotation(0, players)
    const locked = { ...first[2][4] }
    const { games: second } = generateRotation(99, players, {}, {}, {}, { '2-4': locked })
    expect(second[2][4]).toEqual(locked)
  })

  test('non-locked shifts are still free to change with a new seed', () => {
    const { games: first } = generateRotation(0, players)
    const locked = { ...first[0][0] }
    const { games: second } = generateRotation(99, players, {}, {}, {}, { '0-0': locked })
    // Very likely that at least one other shift differs
    const otherShiftsDiffer = first[0].slice(1).some((shift, i) =>
      JSON.stringify(shift) !== JSON.stringify(second[0][i + 1])
    )
    expect(otherShiftsDiffer).toBe(true)
  })
})

// ── Fairness / shift distribution ───────────────────────────────────────────

describe('generateRotation — shift distribution', () => {
  test('every player gets at least 12 total shifts', () => {
    const { totalShifts } = generateRotation(0, players)
    players.forEach(p => {
      expect(totalShifts[p.name]).toBeGreaterThanOrEqual(12)
    })
  })

  test('no player exceeds 20 total shifts', () => {
    const { totalShifts } = generateRotation(0, players)
    players.forEach(p => {
      expect(totalShifts[p.name]).toBeLessThanOrEqual(20)
    })
  })

  test('all players get some field time (D + R + O > 0)', () => {
    const { totalPositions } = generateRotation(0, players)
    players.forEach(p => {
      const { D, R, O } = totalPositions[p.name]
      expect(D + R + O).toBeGreaterThan(0)
    })
  })

  test('higher-grade players average more shifts than the lowest-grade player', () => {
    const { totalShifts } = generateRotation(0, players)
    const topPlayers = players.filter(p => (GRADE_VAL[p.grade] || 0) >= 3)
    const bottomPlayer = players.find(p => p.grade === 'D')
    if (!topPlayers.length || !bottomPlayer) return

    const topAvg = topPlayers.reduce((s, p) => s + totalShifts[p.name], 0) / topPlayers.length
    expect(topAvg).toBeGreaterThanOrEqual(totalShifts[bottomPlayer.name])
  })

  test('shift distribution is consistent across multiple seeds', () => {
    for (const seed of [0, 1, 5, 10, 42]) {
      const { totalShifts } = generateRotation(seed, players)
      players.forEach(p => {
        expect(totalShifts[p.name]).toBeGreaterThanOrEqual(10)
        expect(totalShifts[p.name]).toBeLessThanOrEqual(22)
      })
    }
  })
})

// ── Scheduling constraints ───────────────────────────────────────────────────

describe('generateRotation — pre-goalie rest (hard constraint)', () => {
  test('the incoming goalie never plays a field shift immediately before their goalie shift', () => {
    for (const seed of [0, 1, 5, 42, 99]) {
      const { games } = generateRotation(seed, players)
      for (let g = 0; g < 4; g++) {
        const game = games[g]
        for (let s = 1; s < game.length; s++) {
          const incomingGoalie = game[s].G
          if (!incomingGoalie) continue
          // incomingGoalie must not appear in any field slot of the previous shift
          const prevShift = game[s - 1]
          const prevField = [prevShift.D, prevShift.R1, prevShift.R2, prevShift.O].filter(Boolean)
          expect(prevField).not.toContain(incomingGoalie)
        }
      }
    }
  })
})

describe('generateRotation — consecutive field shifts (soft constraint)', () => {
  test('back-to-back field shifts are uncommon across a full rotation', () => {
    for (const seed of [0, 1, 5, 42, 99]) {
      const { games } = generateRotation(seed, players)
      for (let g = 0; g < 4; g++) {
        const game = games[g]
        let consecutive = 0
        for (const p of players) {
          for (let s = 1; s < game.length; s++) {
            const inPrev = [game[s-1].G, game[s-1].D, game[s-1].R1, game[s-1].R2, game[s-1].O].includes(p.name)
            const inCurr = [game[s].G, game[s].D, game[s].R1, game[s].R2, game[s].O].includes(p.name)
            if (inPrev && inCurr) consecutive++
          }
        }
        // With 11 players and 5 playing per shift, some overlap is unavoidable,
        // but the penalty should keep it well under half of all possible transitions.
        const maxTransitions = players.length * (game.length - 1)
        expect(consecutive).toBeLessThan(maxTransitions * 0.4)
      }
    }
  })
})

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('generateRotation — edge cases', () => {
  test('works when a player is excluded from all games', () => {
    const { totalShifts } = generateRotation(0, players, {}, { 0: ['Maron'], 1: ['Maron'], 2: ['Maron'], 3: ['Maron'] })
    expect(totalShifts['Maron']).toBe(0)
  })

  test('remaining players still fill shifts when one player is fully excluded', () => {
    const { games } = generateRotation(0, players, {}, { 0: ['Maron'], 1: ['Maron'], 2: ['Maron'], 3: ['Maron'] })
    games.forEach(game => {
      game.forEach(shift => {
        const all = [shift.G, shift.D, shift.R1, shift.R2, shift.O].filter(Boolean)
        expect(all).not.toContain('Maron')
        expect(all.length).toBe(5) // still 5 players per shift
      })
    })
  })

  test('handles a player list with only the minimum viable players', () => {
    // 5 players: enough to fill one shift (1 goalie + 4 field)
    const small = [
      { name: 'P1', grade: 'B', canGoalie: true, prefD: false, prefO: false },
      { name: 'P2', grade: 'B', canGoalie: false, prefD: false, prefO: false },
      { name: 'P3', grade: 'B', canGoalie: false, prefD: false, prefO: false },
      { name: 'P4', grade: 'B', canGoalie: false, prefD: false, prefO: false },
      { name: 'P5', grade: 'B', canGoalie: false, prefD: false, prefO: false },
    ]
    const { games } = generateRotation(0, small)
    expect(games).toHaveLength(4)
    games.forEach(game => {
      game.forEach(shift => {
        const all = [shift.G, shift.D, shift.R1, shift.R2, shift.O].filter(Boolean)
        expect(all.length).toBeGreaterThan(0)
        expect(new Set(all).size).toBe(all.length) // no duplicates
      })
    })
  })
})
