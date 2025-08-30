// Game State
let gameState = {
  teams: {
    teamA: { name: "Team A", players: [], score: 0, wickets: 0, overs: 0, balls: 0 },
    teamB: { name: "Team B", players: [], score: 0, wickets: 0, overs: 0, balls: 0 },
  },
  match: {
    totalOvers: 6,
    currentInnings: 1,
    battingTeam: null,
    bowlingTeam: null,
    tossWinner: null,
    tossDecision: null,
  },
  currentBatsmen: {
    striker: { player: null, runs: 0, balls: 0 },
    nonStriker: { player: null, runs: 0, balls: 0 },
  },
  ballHistory: [],
  isFreehit: false,
  matchComplete: false,
  previousStates: [], // For undo functionality
}

// Performance optimization: Track last rendered history index
let lastRenderedHistoryIndex = -1

// DOM Elements
const screens = {
  teamSetup: document.getElementById("team-setup"),
  tossScreen: document.getElementById("toss-screen"),
  scoringScreen: document.getElementById("scoring-screen"),
  summaryScreen: document.getElementById("summary-screen"),
}

// Initialize the app
document.addEventListener("DOMContentLoaded", () => {
  initializeTeamInputs()
  setupEventListeners()
})

function initializeTeamInputs() {
  // Create player input fields for both teams
  const teamAContainer = document.getElementById("team-a-players")
  const teamBContainer = document.getElementById("team-b-players")

  for (let i = 1; i <= 10; i++) {
    // Team A players
    const playerInputA = document.createElement("input")
    playerInputA.type = "text"
    playerInputA.className = "player-input"
    playerInputA.placeholder = `Player ${i}`
    playerInputA.value = `Player ${i}`
    playerInputA.dataset.team = "teamA"
    playerInputA.dataset.index = i - 1
    teamAContainer.appendChild(playerInputA)

    // Team B players
    const playerInputB = document.createElement("input")
    playerInputB.type = "text"
    playerInputB.className = "player-input"
    playerInputB.placeholder = `Player ${i}`
    playerInputB.value = `Player ${i}`
    playerInputB.dataset.team = "teamB"
    playerInputB.dataset.index = i - 1
    teamBContainer.appendChild(playerInputB)
  }
}

function setupEventListeners() {
  // Team setup to toss
  document.getElementById("proceed-to-toss").addEventListener("click", proceedToToss)

  // Start match
  document.getElementById("start-match").addEventListener("click", startMatch)

  // Scoring buttons
  document.querySelectorAll(".score-btn").forEach((btn) => {
    btn.addEventListener("click", () => scoreRun(Number.parseInt(btn.dataset.runs)))
  })

  document.getElementById("wicket-btn").addEventListener("click", scoreWicket)
  document.getElementById("wide-btn").addEventListener("click", scoreWide)
  document.getElementById("noball-btn").addEventListener("click", scoreNoball)

  // Control buttons
  document.getElementById("undo-btn").addEventListener("click", undoLastAction)
  document.getElementById("end-innings-btn").addEventListener("click", endInnings)

  // Export and new match
  document.getElementById("export-csv").addEventListener("click", exportCSV)
  document.getElementById("new-match").addEventListener("click", newMatch)
}

// This prevents exponential snapshot growth and eliminates the lag after ~20 balls.
function saveGameState() {
  // Exclude previousStates from the snapshot source to avoid nesting the undo history inside each snapshot
  const { previousStates, ...rest } = gameState

  // Deep clone only the necessary game state (without previousStates)
  const stateCopy = JSON.parse(JSON.stringify(rest))

  // Ensure snapshots don't carry their own undo stacks
  stateCopy.previousStates = []

  // Push to the current undo stack and keep at most 10 entries
  gameState.previousStates.push(stateCopy)
  if (gameState.previousStates.length > 10) {
    gameState.previousStates.shift()
  }
}

function undoLastAction() {
  if (gameState.matchComplete || gameState.previousStates.length === 0) return

  // Restore previous state
  const previousState = gameState.previousStates.pop()
  if (previousState) {
    // Keep the previousStates array from current state
    const currentPreviousStates = gameState.previousStates
    gameState = previousState
    gameState.previousStates = currentPreviousStates

    // Reset the last rendered index to force full re-render
    lastRenderedHistoryIndex = -1

    updateScoringDisplay()
    updateBallHistoryOptimized()
  }
}

function proceedToToss() {
  // Save team names and players
  gameState.teams.teamA.name = document.getElementById("team-a-name").value || "Team A"
  gameState.teams.teamB.name = document.getElementById("team-b-name").value || "Team B"

  // Save players
  const teamAInputs = document.querySelectorAll('[data-team="teamA"]')
  const teamBInputs = document.querySelectorAll('[data-team="teamB"]')

  gameState.teams.teamA.players = Array.from(teamAInputs).map((input) => input.value || input.placeholder)
  gameState.teams.teamB.players = Array.from(teamBInputs).map((input) => input.value || input.placeholder)

  // Update toss screen options
  document.getElementById("toss-winner").innerHTML = `
        <option value="teamA">${gameState.teams.teamA.name}</option>
        <option value="teamB">${gameState.teams.teamB.name}</option>
    `

  switchScreen("toss-screen")
}

function startMatch() {
  // Get match settings
  gameState.match.totalOvers = Number.parseInt(document.getElementById("match-overs").value)
  gameState.match.tossWinner = document.getElementById("toss-winner").value
  gameState.match.tossDecision = document.getElementById("toss-decision").value

  // Determine batting order
  if (gameState.match.tossDecision === "bat") {
    gameState.match.battingTeam = gameState.match.tossWinner
    gameState.match.bowlingTeam = gameState.match.tossWinner === "teamA" ? "teamB" : "teamA"
  } else {
    gameState.match.bowlingTeam = gameState.match.tossWinner
    gameState.match.battingTeam = gameState.match.tossWinner === "teamA" ? "teamB" : "teamA"
  }

  // Initialize batting lineup
  initializeBatsmen()

  switchScreen("scoring-screen")
  updateScoringDisplay()
}

function initializeBatsmen() {
  const battingTeam = gameState.teams[gameState.match.battingTeam]
  gameState.currentBatsmen.striker = {
    player: battingTeam.players[0],
    runs: 0,
    balls: 0,
  }
  gameState.currentBatsmen.nonStriker = {
    player: battingTeam.players[1],
    runs: 0,
    balls: 0,
  }
}

function switchScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"))
  document.getElementById(screenId).classList.add("active")
}

function scoreRun(runs) {
  if (gameState.matchComplete) return

  saveGameState() // Save state before making changes

  const battingTeam = gameState.teams[gameState.match.battingTeam]

  // Add runs to team total
  battingTeam.score += runs

  // Add runs to striker
  gameState.currentBatsmen.striker.runs += runs
  gameState.currentBatsmen.striker.balls++

  // Add to ball count
  battingTeam.balls++

  // Create ball history entry
  const ballEntry = {
    over: battingTeam.overs + 1,
    ball: battingTeam.balls % 6 || 6,
    batsman: gameState.currentBatsmen.striker.player,
    runs: runs,
    type: "normal",
    isFreehit: gameState.isFreehit,
    total: battingTeam.score,
    wickets: battingTeam.wickets,
  }

  if (runs === 4 || runs === 6) {
    ballEntry.type = "boundary"
  }

  gameState.ballHistory.push(ballEntry)

  // Clear free hit after ball
  gameState.isFreehit = false

  // Change strike on odd runs (1 or 3 runs)
  if (runs === 1 || runs === 3) {
    changeStrike()
  }

  // Check if over is complete
  if (battingTeam.balls % 6 === 0) {
    battingTeam.overs++
    // Change strike at end of over (regardless of runs scored on last ball)
    changeStrike()

    // Check if innings is complete
    if (battingTeam.overs >= gameState.match.totalOvers) {
      endInnings()
      return
    }
  }

  updateScoringDisplay()
  updateBallHistoryOptimized()

  // Check if target is chased in second innings
  if (gameState.match.currentInnings === 2) {
    const target = gameState.teams[gameState.match.bowlingTeam].score + 1
    if (battingTeam.score >= target) {
      endMatch()
    }
  }
}

function scoreWicket() {
  if (gameState.matchComplete || gameState.isFreehit) return

  saveGameState() // Save state before making changes

  const battingTeam = gameState.teams[gameState.match.battingTeam]

  // Add wicket
  battingTeam.wickets++
  battingTeam.balls++
  gameState.currentBatsmen.striker.balls++

  // Create ball history entry
  const ballEntry = {
    over: battingTeam.overs + 1,
    ball: battingTeam.balls % 6 || 6,
    batsman: gameState.currentBatsmen.striker.player,
    runs: 0,
    type: "wicket",
    isFreehit: false,
    total: battingTeam.score,
    wickets: battingTeam.wickets,
  }

  gameState.ballHistory.push(ballEntry)

  // Clear free hit
  gameState.isFreehit = false

  // Check if all out
  if (battingTeam.wickets >= 10 || battingTeam.wickets >= battingTeam.players.length - 1) {
    endInnings()
    return
  }

  // Bring in new batsman (replace the striker)
  const nextBatsmanIndex = battingTeam.wickets + 1
  if (nextBatsmanIndex < battingTeam.players.length) {
    gameState.currentBatsmen.striker = {
      player: battingTeam.players[nextBatsmanIndex],
      runs: 0,
      balls: 0,
    }
  }

  // Check if over is complete
  if (battingTeam.balls % 6 === 0) {
    battingTeam.overs++
    // Change strike at end of over
    changeStrike()

    // Check if innings is complete
    if (battingTeam.overs >= gameState.match.totalOvers) {
      endInnings()
      return
    }
  }

  updateScoringDisplay()
  updateBallHistoryOptimized()
}

function scoreWide() {
  if (gameState.matchComplete) return

  saveGameState() // Save state before making changes

  const battingTeam = gameState.teams[gameState.match.battingTeam]

  // Add 1 run for wide to team total
  battingTeam.score += 1

  // Wide doesn't count as a ball faced by batsman
  // Wide doesn't increment the legal ball count

  // Create ball history entry
  const ballEntry = {
    over: battingTeam.overs + 1,
    ball: (battingTeam.balls % 6) + 1,
    batsman: gameState.currentBatsmen.striker.player,
    runs: 1,
    type: "wide",
    isFreehit: gameState.isFreehit,
    total: battingTeam.score,
    wickets: battingTeam.wickets,
  }

  gameState.ballHistory.push(ballEntry)

  updateScoringDisplay()
  updateBallHistoryOptimized()

  // Check if target is chased in second innings
  if (gameState.match.currentInnings === 2) {
    const target = gameState.teams[gameState.match.bowlingTeam].score + 1
    if (battingTeam.score >= target) {
      endMatch()
    }
  }
}

function scoreNoball() {
  if (gameState.matchComplete) return

  saveGameState() // Save state before making changes

  const battingTeam = gameState.teams[gameState.match.battingTeam]
  const noBallRuns = Number.parseInt(document.getElementById("noball-runs-select").value)

  // Total runs = 1 (no ball extra) + runs off the bat
  const totalRuns = 1 + noBallRuns

  // Add total runs to team score
  battingTeam.score += totalRuns

  // Add batsman runs to striker (only runs off the bat, not the no ball extra)
  if (noBallRuns > 0) {
    gameState.currentBatsmen.striker.runs += noBallRuns
    gameState.currentBatsmen.striker.balls++ // Batsman faces the ball even on no ball
  }

  // No ball doesn't count as a legal delivery, so don't increment battingTeam.balls

  // Create ball history entry
  const ballEntry = {
    over: battingTeam.overs + 1,
    ball: (battingTeam.balls % 6) + 1,
    batsman: gameState.currentBatsmen.striker.player,
    runs: totalRuns,
    type: "noball",
    batRuns: noBallRuns,
    isFreehit: false,
    total: battingTeam.score,
    wickets: battingTeam.wickets,
  }

  gameState.ballHistory.push(ballEntry)

  // Set free hit for next ball
  gameState.isFreehit = true

  // Change strike on odd runs off the bat (1 or 3 runs)
  if (noBallRuns === 1 || noBallRuns === 3) {
    changeStrike()
  }

  updateScoringDisplay()
  updateBallHistoryOptimized()

  // Check if target is chased in second innings
  if (gameState.match.currentInnings === 2) {
    const target = gameState.teams[gameState.match.bowlingTeam].score + 1
    if (battingTeam.score >= target) {
      endMatch()
    }
  }
}

function changeStrike() {
  const temp = gameState.currentBatsmen.striker
  gameState.currentBatsmen.striker = gameState.currentBatsmen.nonStriker
  gameState.currentBatsmen.nonStriker = temp
}

function endInnings() {
  if (gameState.match.currentInnings === 1) {
    // Start second innings
    gameState.match.currentInnings = 2

    // Swap batting and bowling teams
    const temp = gameState.match.battingTeam
    gameState.match.battingTeam = gameState.match.bowlingTeam
    gameState.match.bowlingTeam = temp

    // Initialize new batsmen
    initializeBatsmen()

    // Clear free hit
    gameState.isFreehit = false

    updateScoringDisplay()
  } else {
    // Match complete
    endMatch()
  }
}

function endMatch() {
  gameState.matchComplete = true
  showMatchSummary()
  switchScreen("summary-screen")
}

function updateScoringDisplay() {
  const battingTeam = gameState.teams[gameState.match.battingTeam]
  const bowlingTeam = gameState.teams[gameState.match.bowlingTeam]

  // Update team name display
  document.getElementById("current-team").textContent = `${battingTeam.name} Batting`

  // Update innings display
  const inningsText = gameState.match.currentInnings === 1 ? "1st Innings" : "2nd Innings"
  document.getElementById("innings-display").textContent = inningsText
  document.getElementById("match-format").textContent = `${gameState.match.totalOvers} Overs Match`

  // Show/hide second innings chase info
  const chaseInfo = document.getElementById("chase-info")
  const requiredRateElement = document.getElementById("required-rate")
  if (gameState.match.currentInnings === 2) {
    chaseInfo.style.display = "block"
    requiredRateElement.style.display = "block"
    updateChaseInfo()
  } else {
    chaseInfo.style.display = "none"
    requiredRateElement.style.display = "none"
  }

  // Update score display
  document.getElementById("total-score").textContent = battingTeam.score
  document.getElementById("total-wickets").textContent = battingTeam.wickets
  document.getElementById("current-overs").textContent = battingTeam.overs
  document.getElementById("current-balls").textContent = battingTeam.balls % 6

  // Calculate and update run rate
  const totalBalls = battingTeam.overs * 6 + (battingTeam.balls % 6)
  const runRate = totalBalls > 0 ? (battingTeam.score * 6) / totalBalls : 0
  document.getElementById("run-rate").textContent = runRate.toFixed(2)

  // Update batsmen info
  document.getElementById("striker-name").textContent = gameState.currentBatsmen.striker.player
  document.getElementById("striker-runs").textContent = gameState.currentBatsmen.striker.runs
  document.getElementById("striker-balls").textContent = gameState.currentBatsmen.striker.balls
  const strikerSR =
    gameState.currentBatsmen.striker.balls > 0
      ? (gameState.currentBatsmen.striker.runs * 100) / gameState.currentBatsmen.striker.balls
      : 0
  document.getElementById("striker-sr").textContent = strikerSR.toFixed(2)

  document.getElementById("non-striker-name").textContent = gameState.currentBatsmen.nonStriker.player
  document.getElementById("non-striker-runs").textContent = gameState.currentBatsmen.nonStriker.runs
  document.getElementById("non-striker-balls").textContent = gameState.currentBatsmen.nonStriker.balls
  const nonStrikerSR =
    gameState.currentBatsmen.nonStriker.balls > 0
      ? (gameState.currentBatsmen.nonStriker.runs * 100) / gameState.currentBatsmen.nonStriker.balls
      : 0
  document.getElementById("non-striker-sr").textContent = nonStrikerSR.toFixed(2)

  // Update free hit indicator
  const freeHitIndicator = document.getElementById("free-hit-indicator")
  if (gameState.isFreehit) {
    freeHitIndicator.classList.add("active")
  } else {
    freeHitIndicator.classList.remove("active")
  }

  // Disable wicket button during free hit
  document.getElementById("wicket-btn").disabled = gameState.isFreehit

  // Enable/disable undo button
  document.getElementById("undo-btn").disabled = gameState.previousStates.length === 0 || gameState.matchComplete

  // Enable/disable end innings button
  document.getElementById("end-innings-btn").disabled = gameState.matchComplete
}

function updateChaseInfo() {
  const battingTeam = gameState.teams[gameState.match.battingTeam]
  const bowlingTeam = gameState.teams[gameState.match.bowlingTeam]

  // Target
  const target = bowlingTeam.score + 1
  document.getElementById("target-runs").textContent = target

  // Runs to win
  const runsToWin = Math.max(0, target - battingTeam.score)
  document.getElementById("runs-to-win").textContent = runsToWin

  // Balls left
  const totalBallsInInnings = gameState.match.totalOvers * 6
  const ballsFaced = battingTeam.overs * 6 + (battingTeam.balls % 6)
  const ballsLeft = totalBallsInInnings - ballsFaced
  document.getElementById("balls-left").textContent = ballsLeft

  // Required run rate
  const requiredRR = ballsLeft > 0 ? (runsToWin * 6) / ballsLeft : 0
  document.getElementById("required-rr").textContent = requiredRR.toFixed(2)
}

// Optimized ball history update - only append new entries instead of rebuilding entire list
function updateBallHistoryOptimized() {
  const container = document.getElementById("history-container")

  // Only render new entries since last render
  const newEntries = gameState.ballHistory.slice(lastRenderedHistoryIndex + 1)

  newEntries.forEach((ball) => {
    const ballDiv = document.createElement("div")
    ballDiv.className = "ball-entry"

    // Add specific classes based on ball type
    if (ball.type === "wicket") {
      ballDiv.classList.add("wicket")
    } else if (ball.type === "boundary") {
      ballDiv.classList.add("boundary")
    } else if (ball.type === "wide" || ball.type === "noball") {
      ballDiv.classList.add("extra")
    }

    let ballText = `${ball.over}.${ball.ball}: ${ball.batsman} - `

    if (ball.type === "wicket") {
      ballText += "WICKET"
    } else if (ball.type === "wide") {
      ballText += `Wide (${ball.runs})`
    } else if (ball.type === "noball") {
      ballText += `No Ball (${ball.runs} total, ${ball.batRuns || 0} off bat)`
    } else {
      ballText += `${ball.runs} run${ball.runs !== 1 ? "s" : ""}`
    }

    if (ball.isFreehit) {
      ballText += " (Free Hit)"
    }

    ballText += ` | Score: ${ball.total}/${ball.wickets}`

    ballDiv.textContent = ballText
    container.appendChild(ballDiv)
  })

  // Update last rendered index
  lastRenderedHistoryIndex = gameState.ballHistory.length - 1

  // Keep only last 20 entries in DOM for performance
  const entries = container.querySelectorAll(".ball-entry")
  if (entries.length > 20) {
    const entriesToRemove = entries.length - 20
    for (let i = 0; i < entriesToRemove; i++) {
      container.removeChild(entries[i])
    }
  }

  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight
}

function showMatchSummary() {
  const teamA = gameState.teams.teamA
  const teamB = gameState.teams.teamB

  // Update team names
  document.getElementById("summary-team-a").textContent = teamA.name
  document.getElementById("summary-team-b").textContent = teamB.name

  // Update final scores
  const teamAOvers = teamA.overs + (teamA.balls % 6) / 10
  const teamBOvers = teamB.overs + (teamB.balls % 6) / 10

  document.getElementById("team-a-final").textContent =
    `${teamA.score}/${teamA.wickets} (${teamAOvers.toFixed(1)} overs)`
  document.getElementById("team-b-final").textContent =
    `${teamB.score}/${teamB.wickets} (${teamBOvers.toFixed(1)} overs)`

  // Determine match result
  let resultText = ""
  if (teamA.score > teamB.score) {
    const margin = teamA.score - teamB.score
    resultText = `${teamA.name} won by ${margin} runs`
  } else if (teamB.score > teamA.score) {
    const margin = teamB.score - teamA.score
    const wicketsRemaining = 10 - teamB.wickets
    resultText = `${teamB.name} won by ${wicketsRemaining} wickets`
  } else {
    resultText = "Match Tied"
  }

  document.getElementById("match-result-text").textContent = resultText
}

function exportCSV() {
  const headers = ["Over", "Ball", "Batsman", "Runs", "Type", "Bat Runs", "Free Hit", "Total", "Wickets"]
  const csvContent = [headers.join(",")]

  gameState.ballHistory.forEach((ball) => {
    const row = [
      ball.over,
      ball.ball,
      `"${ball.batsman}"`,
      ball.runs,
      ball.type,
      ball.batRuns || (ball.type === "noball" ? 0 : ball.runs),
      ball.isFreehit ? "Yes" : "No",
      ball.total,
      ball.wickets,
    ]
    csvContent.push(row.join(","))
  })

  const csvString = csvContent.join("\n")
  const blob = new Blob([csvString], { type: "text/csv" })
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = `cricket-match-${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function newMatch() {
  // Reset game state
  gameState = {
    teams: {
      teamA: { name: "Team A", players: [], score: 0, wickets: 0, overs: 0, balls: 0 },
      teamB: { name: "Team B", players: [], score: 0, wickets: 0, overs: 0, balls: 0 },
    },
    match: {
      totalOvers: 6,
      currentInnings: 1,
      battingTeam: null,
      bowlingTeam: null,
      tossWinner: null,
      tossDecision: null,
    },
    currentBatsmen: {
      striker: { player: null, runs: 0, balls: 0 },
      nonStriker: { player: null, runs: 0, balls: 0 },
    },
    ballHistory: [],
    isFreehit: false,
    matchComplete: false,
    previousStates: [],
  }

  // Reset performance optimization tracker
  lastRenderedHistoryIndex = -1

  // Clear history container
  document.getElementById("history-container").innerHTML = ""

  // Reset form values
  document.getElementById("team-a-name").value = "Team A"
  document.getElementById("team-b-name").value = "Team B"
  document.getElementById("match-overs").value = "6"
  document.getElementById("noball-runs-select").value = "0"

  // Reset player inputs
  document.querySelectorAll(".player-input").forEach((input, index) => {
    const playerNumber = (index % 10) + 1
    input.value = `Player ${playerNumber}`
  })

  // Go back to team setup
  switchScreen("team-setup")
}
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker 
      .register("/sw.js")
      .then(reg => console.log("Service Worker registered:", reg))
      .catch(err => console.error("Service Worker failed:", err));
  });
}
