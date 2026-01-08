const canvas = document.getElementById('game')
const context = canvas.getContext('2d')

// Q-Learning variables
const qTable = {}
const alpha = 0.2 // Learning rate
const gamma = 0.9 // Discount factor
let epsilon = 1.0 // Exploration rate
const epsilonDecay = 0.99 // Decay factor
const epsilonMin = 0.01 // Minimum exploration
let lastState = null
let lastAction = null
const actions = ['left', 'up', 'right', 'down']

// create global variables
let score = 0
let highScore = 0
let game = 1
let historyScore = []
let human_is_playing = true
let perception_on = false
const grid = 16
let fps = 15
let fpsInterval = 1000 / fps
let then = performance.now()

// create snake
const snake = {
  // snake start position
  x: 160,
  y: 160,

  // snake velocity. moves one grid length every frame in either the x or y direction
  dx: grid,
  dy: 0,

  // keep track of all grids the snake body occupies
  cells: [],

  // length of the snake. grows when eating an apple
  maxCells: 4,

  // snake color
  color: 'green'
}

// create apple
const apple = {
  x: 320,
  y: 320,

  // apple color
  color: 'red'
}

// get random whole numbers in a specific range
// @see https://stackoverflow.com/a/1527820/2124254
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min
}

// Q-Learning Helper Functions
function getState() {
  const head = { x: snake.x, y: snake.y }
  
  // Determine relative apple position
  const appleX = apple.x < head.x ? 'left' : (apple.x > head.x ? 'right' : 'same')
  const appleY = apple.y < head.y ? 'up' : (apple.y > head.y ? 'down' : 'same')

  // Check for obstacles in each direction
  // We must account for screen wrapping in the collision check
  const checkCollision = (x, y) => {
    if (x < 0) x = canvas.width - grid
    else if (x >= canvas.width) x = 0
    if (y < 0) y = canvas.height - grid
    else if (y >= canvas.height) y = 0
    
    // Check if coordinate collides with snake body
    return snake.cells.some(cell => cell.x === x && cell.y === y)
  }

  const obsLeft = checkCollision(head.x - grid, head.y) ? 1 : 0
  const obsRight = checkCollision(head.x + grid, head.y) ? 1 : 0
  const obsUp = checkCollision(head.x, head.y - grid) ? 1 : 0
  const obsDown = checkCollision(head.x, head.y + grid) ? 1 : 0

  return `${appleX}_${appleY}_${obsLeft}${obsRight}${obsUp}${obsDown}`
}

function getQ(state, action) {
  if (!qTable[state]) return 0
  return qTable[state][action] || 0
}

function setQ(state, action, value) {
  if (!qTable[state]) qTable[state] = {}
  qTable[state][action] = value
}

function getMaxQ(state) {
  if (!qTable[state]) return 0
  const values = actions.map(a => qTable[state][a] || 0)
  return Math.max(...values)
}

function chooseAction(state) {
  if (Math.random() < epsilon) {
    return actions[Math.floor(Math.random() * actions.length)]
  }
  // Sort actions randomly to break ties
  const shuffled = actions.slice().sort(() => 0.5 - Math.random())
  return shuffled.reduce((a, b) => getQ(state, a) > getQ(state, b) ? a : b)
}

// game loop
function loop(timestamp) {
  requestAnimationFrame(loop)

  if (!timestamp) timestamp = performance.now()
  const elapsed = timestamp - then
  if (elapsed < fpsInterval) return
  then = timestamp - (elapsed % fpsInterval)

  context.clearRect(0, 0, canvas.width, canvas.height)

  // Calculate distance to apple before moving
  const distBefore = Math.abs(snake.x - apple.x) + Math.abs(snake.y - apple.y)

  // move snake by it's velocity
  snake.x += snake.dx
  snake.y += snake.dy

  // wrap snake position horizontally on edge of screen
  if (snake.x < 0) {
    snake.x = canvas.width - grid
  } else if (snake.x >= canvas.width) {
    snake.x = 0
  }

  // wrap snake position vertically on edge of screen
  if (snake.y < 0) {
    snake.y = canvas.height - grid
  } else if (snake.y >= canvas.height) {
    snake.y = 0
  }

  // keep track of where snake has been. front of the array is always the head
  snake.cells.unshift({ x: snake.x, y: snake.y })

  // remove cells as we move away from them
  if (snake.cells.length > snake.maxCells) {
    snake.cells.pop()
  }

  // Calculate distance to apple after moving
  const distAfter = Math.abs(snake.x - apple.x) + Math.abs(snake.y - apple.y)

  let reward = -0.1 // Small penalty for each step to encourage efficiency

  // Modify reward based on distance change
  if (distAfter > distBefore) {
    reward -= 0.5 // Penalize moving away
  }

  // draw apple
  context.fillStyle = apple.color
  context.fillRect(apple.x, apple.y, grid - 1, grid - 1)

  // draw snake one cell at a time
  context.fillStyle = snake.color
  snake.cells.forEach(function (cell, index) {

    // drawing 1 px smaller than the grid creates a grid effect in the snake body so you can see how long it is
    context.fillRect(cell.x, cell.y, grid - 1, grid - 1)

    // snake ate apple
    if (cell.x === apple.x && cell.y === apple.y) {
      snake.maxCells++
      reward = 10 // Reward for eating

      // increase score
      score++
      document.getElementById('score').innerHTML = `Score: ${score}`

      // canvas is 400x400 which is 25x25 grids
      apple.x = getRandomInt(0, 25) * grid
      apple.y = getRandomInt(0, 25) * grid
    }

    // check collision with all cells after this one (modified bubble sort)
    for (var i = index + 1; i < snake.cells.length; i++) {

      // snake occupies same space as a body part. reset game
      if (cell.x === snake.cells[i].x && cell.y === snake.cells[i].y) {
        reward = -100 // Penalty for dying
        snake.x = 160
        snake.y = 160
        snake.cells = []
        snake.maxCells = 4
        snake.dx = grid
        snake.dy = 0

        // verify if the score is higher than the high score
        if (score > highScore) {
          highScore = score
          historyScore.push(highScore)
          document.getElementById('high-score').innerHTML = `High Score: ${highScore}`
        }

        // add the score to the history
        const li = document.createElement('li')
        li.innerHTML = `Game ${game}: ${score}`
        document.getElementById('history-score').prepend(li)
        game++

        // Decay epsilon
        if (epsilon > epsilonMin) {
          epsilon *= epsilonDecay
        }

        // if history-score has more than 20 entries, remove the last one
        if (document.getElementById('history-score').children.length > 20) {
          document.getElementById('history-score').removeChild(document.getElementById('history-score').lastChild)
        }

        // reset the score
        score = 0
        document.getElementById('score').innerHTML = `Score: ${score}`

        apple.x = getRandomInt(0, 25) * grid
        apple.y = getRandomInt(0, 25) * grid
      }
    }
  })

  // AI Logic
  if (!human_is_playing) {
    const currentState = getState()

    // Visualize AI perception
    if (perception_on) {
      const qVals = qTable[currentState]
      if (qVals) {
        const headCx = snake.x + grid / 2
        const headCy = snake.y + grid / 2

        actions.forEach(a => {
          const q = qVals[a] || 0
          context.beginPath()
          context.lineWidth = 2
          if (q > 0.5) context.strokeStyle = '#00FF00' // Green (Safe/Good)
          else if (q < -10) context.strokeStyle = '#FF0000' // Red (Danger)
          else context.strokeStyle = '#FFFF00' // Yellow (Neutral)

          context.moveTo(headCx, headCy)
          if (a === 'left') context.lineTo(headCx - grid, headCy)
          else if (a === 'right') context.lineTo(headCx + grid, headCy)
          else if (a === 'up') context.lineTo(headCx, headCy - grid)
          else if (a === 'down') context.lineTo(headCx, headCy + grid)
          context.stroke()
        })
      }
    }

    // Update Q-Table based on the result of the PREVIOUS action
    if (lastState !== null && lastAction !== null) {
      const oldQ = getQ(lastState, lastAction)
      const maxFutureQ = reward === -100 ? 0 : getMaxQ(currentState)
      const newQ = oldQ + alpha * (reward + gamma * maxFutureQ - oldQ)
      setQ(lastState, lastAction, newQ)
    }

    if (reward === -100) {
      // If died, reset state tracking
      lastState = null
      lastAction = null
    } else {
      // Choose next action
      const action = chooseAction(currentState)
      lastState = currentState
      lastAction = action

      // Apply action
      if (action === 'left' && snake.dx === 0) {
        snake.dx = -grid
        snake.dy = 0
      } else if (action === 'right' && snake.dx === 0) {
        snake.dx = grid
        snake.dy = 0
      } else if (action === 'up' && snake.dy === 0) {
        snake.dy = -grid
        snake.dx = 0
      } else if (action === 'down' && snake.dy === 0) {
        snake.dy = grid
        snake.dx = 0
      }
    }
  }
}

// listen to keyboard events to move the snake
document.addEventListener('keydown', function (e) {
  // prevent snake from backtracking on itself by checking that it's
  // not already moving on the same axis (pressing left while moving
  // left won't do anything, and pressing right while moving left
  // shouldn't let you collide with your own body)

  if (!human_is_playing) {
    return
  }

  if (e.code === 'ArrowLeft' && snake.dx === 0) {
    snake.dx = -grid
    snake.dy = 0
  }

  else if (e.code === 'ArrowRight' && snake.dx === 0) {
    snake.dx = grid
    snake.dy = 0
  }

  else if (e.code === 'ArrowUp' && snake.dy === 0) {
    snake.dy = -grid
    snake.dx = 0
  }

  else if (e.code === 'ArrowDown' && snake.dy === 0) {
    snake.dy = grid
    snake.dx = 0
  }
})

// listen toggle input to change the player mode
document.getElementById('ia_toggle').addEventListener('click', function () {
  human_is_playing = !human_is_playing
  lastState = null
  lastAction = null
  epsilon = 1.0

  // reset the game
  snake.x = 160
  snake.y = 160
  snake.cells = []
  snake.maxCells = 4
  snake.dx = grid
  snake.dy = 0
  score = 0

  // reset the score
  document.getElementById('score').innerHTML = `Score: ${score}`
  document.getElementById('history-score').innerHTML = ''
  game = 1
  historyScore = []
  document.getElementById('high-score').innerHTML = `High Score: ${highScore}`

  // reset the apple position
  apple.x = getRandomInt(0, 25) * grid
  apple.y = getRandomInt(0, 25) * grid

})


document.getElementById('eyes_toggle').addEventListener('click', function () {
  perception_on = !perception_on
})

// start the game
requestAnimationFrame(loop)

// Q-Table Visualization
function renderQTable() {
  const container = document.getElementById('q-table-container')
  const states = Object.keys(qTable).sort()
  
  let html = '<table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: center;">'
  html += '<thead><tr><th style="border: 1px solid white; padding: 4px;">State</th><th style="border: 1px solid white; padding: 4px;">Left</th><th style="border: 1px solid white; padding: 4px;">Up</th><th style="border: 1px solid white; padding: 4px;">Right</th><th style="border: 1px solid white; padding: 4px;">Down</th></tr></thead><tbody>'
  
  if (states.length === 0) {
    html += '<tr><td colspan="5" style="padding: 10px;">No data yet. Switch to AI mode.</td></tr>'
  }

  states.forEach(state => {
    const actions = qTable[state]
    const vals = [actions.left || 0, actions.up || 0, actions.right || 0, actions.down || 0]
    const maxVal = Math.max(...vals)
    
    const getCell = (val) => {
      const style = (val === maxVal && val !== 0) ? 'color: #00ff00; font-weight: bold;' : ''
      return `<td style="border: 1px solid white; padding: 4px; ${style}">${val.toFixed(2)}</td>`
    }
    
    html += `<tr><td style="border: 1px solid white; padding: 4px;">${state}</td>${getCell(actions.left || 0)}${getCell(actions.up || 0)}${getCell(actions.right || 0)}${getCell(actions.down || 0)}</tr>`
  })
  html += '</tbody></table>'
  container.innerHTML = html
}

document.getElementById('refresh-qtable').addEventListener('click', renderQTable)

document.getElementById('save-qtable').addEventListener('click', function () {
  localStorage.setItem('snakeQTable', JSON.stringify(qTable))
  alert('Q-Table saved!')
})

document.getElementById('load-qtable').addEventListener('click', function () {
  const data = localStorage.getItem('snakeQTable')
  if (data) {
    const loaded = JSON.parse(data)
    for (let key in qTable) delete qTable[key]
    Object.assign(qTable, loaded)
    alert('Q-Table loaded!')
    renderQTable()
  } else {
    alert('No saved Q-Table found.')
  }
})

// Auto-load Q-Table on startup
const savedData = localStorage.getItem('snakeQTable')
if (savedData) {
  const loaded = JSON.parse(savedData)
  Object.assign(qTable, loaded)
  renderQTable()
}

const speedRange = document.getElementById('speedRange')
const speedValue = document.getElementById('speedValue')
speedRange.addEventListener('input', function() {
  fps = parseInt(this.value)
  speedValue.textContent = fps
  fpsInterval = 1000 / fps
})
