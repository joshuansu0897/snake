const canvas = document.getElementById('game')
const context = canvas.getContext('2d')

// create neuronal network
const network = new brain.NeuralNetwork({
  hiddenLayers: [2]
})

// create training data array
const trainingData = []

// create global variables
let count = 0
let score = 0
let highScore = 0
let training_count = 0
let game = 1
let historyScore = []
let human_is_playing = true
let first_time = true
const grid = 16

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

// game loop
function loop() {
  requestAnimationFrame(loop)

  // slow game loop to 15 fps instead of 60 (60/15 = 4)
  if (++count < 4) {
    return
  }

  count = 0
  context.clearRect(0, 0, canvas.width, canvas.height)

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

  // draw apple
  context.fillStyle = apple.color
  context.fillRect(apple.x, apple.y, grid - 1, grid - 1)

  if (!human_is_playing) {

    let perfect_input = {
      input: {
        apple_x: apple.x / canvas.width,
        apple_y: apple.y / canvas.height,
        snake_x: snake.x / canvas.width,
        snake_y: snake.y / canvas.height,
        left: snake.dx === -grid ? 1 : 0,
        right: snake.dx === grid ? 1 : 0,
        up: snake.dy === -grid ? 1 : 0,
        down: snake.dy === grid ? 1 : 0,
        tail_left: (snake.cells[0].x - grid) / canvas.width,
        tail_right: (snake.cells[0].x + grid) / canvas.width,
        tail_up: (snake.cells[0].y - grid) / canvas.height,
        tail_down: (snake.cells[0].y + grid) / canvas.height
      },
      output: {
        up: snake.x === apple.x && snake.y > apple.y ? 1 : 0,
        down: snake.x === apple.x && snake.y < apple.y ? 1 : 0,
        left: snake.y === apple.y && snake.x > apple.x ? 1 : 0,
        right: snake.y === apple.y && snake.x < apple.x ? 1 : 0
      }
    }

    if (first_time) {
      trainingData.push(perfect_input)
    } else {
      if (
        snake.x === apple.x && snake.y > apple.y ||
        snake.x === apple.x && snake.y < apple.y ||
        snake.y === apple.y && snake.x > apple.x ||
        snake.y === apple.y && snake.x < apple.x
      ) {
        trainingData.push(perfect_input)
      } else {

        // random number between 0 and 1
        // if the random number is less than 0.4, add the input to the training data
        if (Math.random() < 0.4) {
          trainingData.push({
            input: {
              apple_x: apple.x / canvas.width,
              apple_y: apple.y / canvas.height,
              snake_x: snake.x / canvas.width,
              snake_y: snake.y / canvas.height,
              left: snake.dx === -grid ? 1 : 0,
              right: snake.dx === grid ? 1 : 0,
              up: snake.dy === -grid ? 1 : 0,
              down: snake.dy === grid ? 1 : 0,
              tail_left: (snake.cells[0].x - grid) / canvas.width,
              tail_right: (snake.cells[0].x + grid) / canvas.width,
              tail_up: (snake.cells[0].y - grid) / canvas.height,
              tail_down: (snake.cells[0].y + grid) / canvas.height
            },
            output: {
              up: 0,
              down: 0,
              left: 0,
              right: 0
            }
          })
        }

      }
    }

    training_count++

    // train the network every  data points
    if (training_count === 30 || first_time) {
      first_time = false
      network.train(trainingData)
      training_count = 0
    }

    // get the output from the network
    const output = network.run({
      apple_x: apple.x / canvas.width,
      apple_y: apple.y / canvas.height,
      snake_x: snake.x / canvas.width,
      snake_y: snake.y / canvas.height,
      left: snake.dx === -grid ? 1 : 0,
      right: snake.dx === grid ? 1 : 0,
      up: snake.dy === -grid ? 1 : 0,
      down: snake.dy === grid ? 1 : 0,
      tail_left: (snake.cells[0].x - grid) / canvas.width,
      tail_right: (snake.cells[0].x + grid) / canvas.width,
      tail_up: (snake.cells[0].y - grid) / canvas.height,
      tail_down: (snake.cells[0].y + grid) / canvas.height
    })

    // get the direction with the highest output value
    const direction = Object.keys(output).reduce((a, b) => output[a] > output[b] ? a : b)

    // set the direction based on the output
    if (direction === 'left' && snake.dx === 0) {
      snake.dx = -grid
      snake.dy = 0
    } else if (direction === 'right' && snake.dx === 0) {
      snake.dx = grid
      snake.dy = 0
    } else if (direction === 'up' && snake.dy === 0) {
      snake.dy = -grid
      snake.dx = 0
    } else if (direction === 'down' && snake.dy === 0) {
      snake.dy = grid
      snake.dx = 0
    }
  }

  // draw snake one cell at a time
  context.fillStyle = snake.color
  snake.cells.forEach(function (cell, index) {

    // drawing 1 px smaller than the grid creates a grid effect in the snake body so you can see how long it is
    context.fillRect(cell.x, cell.y, grid - 1, grid - 1)

    // snake ate apple
    if (cell.x === apple.x && cell.y === apple.y) {
      snake.maxCells++

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

        // reset the score
        score = 0
        document.getElementById('score').innerHTML = `Score: ${score}`

        apple.x = getRandomInt(0, 25) * grid
        apple.y = getRandomInt(0, 25) * grid
      }
    }
  })
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
document.getElementById('toggle').addEventListener('click', function () {
  human_is_playing = !human_is_playing

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

// start the game
requestAnimationFrame(loop)
