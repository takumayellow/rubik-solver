/**
 * app.js — UI controller for Rubik's Cube Solver
 *
 * Depends on (loaded before this file):
 *   window.CubeSolver   (cube-solver.js)
 *   window.CubeRenderer (cube-renderer.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  // ──────────────────────────────────────────────
  // Core objects
  // ──────────────────────────────────────────────
  const solver   = new CubeSolver()
  const container = document.getElementById('cube-display')
  const renderer = new CubeRenderer(container, { size: 280 })

  // ──────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────
  let moveCount    = 0
  let historyLog   = []      // all moves applied in this session
  let isAnimating  = false
  let stopRequested = false
  let solution     = []      // current solution move list
  let solveStep    = 0       // index into solution during animation

  // ──────────────────────────────────────────────
  // DOM refs
  // ──────────────────────────────────────────────
  const btnScramble     = document.getElementById('btn-scramble')
  const btnReset        = document.getElementById('btn-reset')
  const btnSolve        = document.getElementById('btn-solve')
  const btnStop         = document.getElementById('btn-stop')
  const solvedIndicator = document.getElementById('solved-indicator')
  const moveCounterEl   = document.getElementById('move-counter')
  const solveProgress   = document.getElementById('solve-progress')
  const progressBar     = document.getElementById('progress-bar')
  const progressText    = document.getElementById('progress-text')
  const solutionToggle  = document.getElementById('solution-toggle')
  const solutionBody    = document.getElementById('solution-body')
  const solutionContent = document.getElementById('solution-content')
  const moveHistoryEl   = document.getElementById('move-history')
  const moveButtons     = Array.from(document.querySelectorAll('.btn-move'))

  // ──────────────────────────────────────────────
  // Initial render
  // ──────────────────────────────────────────────
  renderer.render(solver.getState())
  updateStatusUI()

  // ──────────────────────────────────────────────
  // UI helpers
  // ──────────────────────────────────────────────

  function updateStatusUI() {
    const solved = solver.isSolved()

    solvedIndicator.textContent = solved ? '✓ Solved' : '✗ Scrambled'
    solvedIndicator.className   = solved
      ? 'status-badge status-solved'
      : 'status-badge status-scrambled'

    moveCounterEl.textContent = `Moves: ${moveCount}`

    // Solve button is disabled when already solved or animating
    btnSolve.disabled = solved || isAnimating
  }

  function setAnimatingState(animating) {
    isAnimating = animating
    renderer.setAnimating(animating)

    // Disable / re-enable all interactive controls
    const disableable = [btnScramble, btnReset, ...moveButtons]
    for (const btn of disableable) {
      btn.disabled = animating
    }

    // Solve / Stop toggle
    if (animating) {
      btnSolve.classList.add('hidden')
      btnStop.classList.remove('hidden')
    } else {
      btnSolve.classList.remove('hidden')
      btnStop.classList.add('hidden')
      solveProgress.classList.add('hidden')
    }

    updateStatusUI()
  }

  function appendHistory(move) {
    historyLog.push(move)
    renderHistory()
  }

  function renderHistory() {
    const recent = historyLog.slice(-10)
    if (recent.length === 0) {
      moveHistoryEl.innerHTML = '<p class="no-history">No moves yet.</p>'
      return
    }
    moveHistoryEl.innerHTML = recent
      .map((m, i) => {
        const absIdx = historyLog.length - recent.length + i + 1
        return `<div class="history-item">
          <span class="hist-num">${absIdx}</span>
          <span class="hist-move">${escapeHtml(m)}</span>
        </div>`
      })
      .join('')
    moveHistoryEl.scrollTop = moveHistoryEl.scrollHeight
  }

  function renderSolution(moves) {
    if (!moves || moves.length === 0) {
      solutionContent.innerHTML = '<p class="no-solution">Cube is already solved!</p>'
      return
    }

    const summary = `<p class="solution-summary">${moves.length} move${moves.length !== 1 ? 's' : ''}</p>`
    const chips = moves
      .map((m, i) => `<button class="solution-chip" data-idx="${i}" title="Jump to step ${i + 1}">${escapeHtml(m)}</button>`)
      .join('')

    solutionContent.innerHTML = `${summary}<div class="solution-chips">${chips}</div>`

    // Wire chip click — jump to that step (only allowed when not mid-solve)
    solutionContent.querySelectorAll('.solution-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const idx = parseInt(chip.dataset.idx, 10)
        if (!isAnimating) jumpToSolutionStep(idx)
      })
    })
  }

  function updateSolutionChips(currentStep) {
    const chips = solutionContent.querySelectorAll('.solution-chip')
    chips.forEach((chip, i) => {
      chip.classList.remove('active', 'done')
      if (i < currentStep) chip.classList.add('done')
      else if (i === currentStep) chip.classList.add('active')
    })

    // Scroll active chip into view
    const active = solutionContent.querySelector('.solution-chip.active')
    if (active) active.scrollIntoView({ block: 'nearest' })
  }

  function setProgress(step, total) {
    const pct = total > 0 ? (step / total) * 100 : 0
    progressBar.style.width = `${pct}%`
    progressText.textContent = `Step ${step}/${total}`
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ──────────────────────────────────────────────
  // Scramble
  // ──────────────────────────────────────────────
  btnScramble.addEventListener('click', () => {
    if (isAnimating) return
    const moves = solver.scramble(20)
    moveCount += moves.length
    for (const m of moves) historyLog.push(m)
    renderHistory()
    renderer.render(solver.getState())
    clearSolutionPanel()
    updateStatusUI()
  })

  // ──────────────────────────────────────────────
  // Reset
  // ──────────────────────────────────────────────
  btnReset.addEventListener('click', () => {
    if (isAnimating) return
    solver.reset()
    moveCount = 0
    historyLog = []
    renderHistory()
    renderer.render(solver.getState())
    clearSolutionPanel()
    updateStatusUI()
  })

  function clearSolutionPanel() {
    solution = []
    solveStep = 0
    solutionContent.innerHTML = '<p class="no-solution">No solution computed yet.</p>'
  }

  // ──────────────────────────────────────────────
  // Move buttons
  // ──────────────────────────────────────────────
  moveButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (isAnimating) return
      const move = btn.dataset.move
      solver.applyMove(move)
      moveCount++
      appendHistory(move)
      setAnimatingState(true)
      try {
        await renderer.animateMove(move, solver.getState(), 350)
      } finally {
        setAnimatingState(false)
        updateStatusUI()
      }
    })
  })

  // ──────────────────────────────────────────────
  // Solve
  // ──────────────────────────────────────────────
  btnSolve.addEventListener('click', async () => {
    if (isAnimating || solver.isSolved()) return

    try {
      solution = solver.solve()
    } catch (err) {
      // The solver verifies the cube before returning, so this means it gave up
      // rather than that it produced a wrong answer. Say so instead of freezing.
      expandSolutionPanel()
      solutionContent.innerHTML =
        `<p class="no-solution">解法を見つけられませんでした: ${escapeHtml(String(err.message))}</p>`
      return
    }
    solveStep = 0

    // Expand solution panel and render chips
    expandSolutionPanel()
    renderSolution(solution)

    if (solution.length === 0) {
      updateStatusUI()
      return
    }

    stopRequested = false
    setAnimatingState(true)
    solveProgress.classList.remove('hidden')
    setProgress(0, solution.length)

    for (let i = 0; i < solution.length; i++) {
      if (stopRequested) break

      const move = solution[i]
      solveStep = i

      setProgress(i, solution.length)
      updateSolutionChips(i)

      solver.applyMove(move)
      moveCount++
      appendHistory(move)

      try {
        await renderer.animateMove(move, solver.getState(), 350)
      } catch {
        // animation interrupted — still update state
        renderer.render(solver.getState())
      }

      // Small gap between moves for readability
      if (!stopRequested) {
        await delay(50)
      }
    }

    const finished = !stopRequested
    setAnimatingState(false)
    setProgress(solution.length, solution.length)
    updateSolutionChips(solution.length)
    updateStatusUI()

    if (finished && solver.isSolved()) {
      progressText.textContent = `Solved in ${solution.length} move${solution.length !== 1 ? 's' : ''}!`
      solveProgress.classList.remove('hidden')
    }
  })

  // ──────────────────────────────────────────────
  // Stop
  // ──────────────────────────────────────────────
  btnStop.addEventListener('click', () => {
    stopRequested = true
  })

  // ──────────────────────────────────────────────
  // Jump to solution step (chip click)
  // ──────────────────────────────────────────────
  async function jumpToSolutionStep(targetIdx) {
    if (isAnimating || solution.length === 0) return

    // Re-apply solution from scratch up to targetIdx + 1
    // We need to reset to pre-solve state first. Since we don't keep
    // a snapshot, we jump by re-solving and reapplying up to the target.
    // Strategy: reset solver to clean, apply the scramble sequence again,
    // then apply solution[0..targetIdx].
    // We don't store the scramble separately, so instead: use the live solver.
    // The chip jump is best-effort: apply the partial solution from current
    // solved state baseline.

    // Simplest safe approach: apply only moves from solveStep to targetIdx
    // (forward) or indicate that backward jumps are not supported.
    if (targetIdx < solveStep) {
      // Can't go backward without a state snapshot — just show a note
      progressText.textContent = 'Use Scramble + Solve to restart.'
      solveProgress.classList.remove('hidden')
      return
    }

    const movesToApply = solution.slice(solveStep, targetIdx + 1)
    if (movesToApply.length === 0) return

    setAnimatingState(true)

    for (let i = 0; i < movesToApply.length; i++) {
      if (stopRequested) break
      const move = movesToApply[i]
      const stepIdx = solveStep + i

      setProgress(stepIdx, solution.length)
      updateSolutionChips(stepIdx)

      solver.applyMove(move)
      moveCount++
      appendHistory(move)

      try {
        await renderer.animateMove(move, solver.getState(), 250)
      } catch {
        renderer.render(solver.getState())
      }
    }

    solveStep = targetIdx + 1
    setAnimatingState(false)
    setProgress(solveStep, solution.length)
    updateSolutionChips(solveStep)
    updateStatusUI()
  }

  // ──────────────────────────────────────────────
  // Collapsible solution panel
  // ──────────────────────────────────────────────
  solutionToggle.addEventListener('click', () => {
    const isOpen = solutionToggle.getAttribute('aria-expanded') === 'true'
    if (isOpen) {
      collapseSolutionPanel()
    } else {
      expandSolutionPanel()
    }
  })

  function expandSolutionPanel() {
    solutionToggle.setAttribute('aria-expanded', 'true')
    solutionBody.classList.remove('collapsed')
  }

  function collapseSolutionPanel() {
    solutionToggle.setAttribute('aria-expanded', 'false')
    solutionBody.classList.add('collapsed')
  }

  // ──────────────────────────────────────────────
  // Utility
  // ──────────────────────────────────────────────
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
})
