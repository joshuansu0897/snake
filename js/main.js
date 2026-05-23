(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const context = canvas.getContext('2d');

  // Q-Learning variables
  const qTable = new Map();
  const alpha = 0.1; // Learning rate
  const gamma = 0.9; // Discount factor
  const epsilon = 0.1; // Exploration rate
  let lastState = null;
  let lastAction = null;
  const actions = ['left', 'up', 'right', 'down'];

  // Global variables
  let score = 0;
  let highScore = 0;
  let game = 1;
  let historyScore = [];
  let human_is_playing = true;
  let perception_on = false;
  let changingDirection = false;
  const grid = 16;
  let fps = 15;
  let fpsInterval = 1000 / fps;
  let then = performance.now();
  let framesSinceLastQRender = 0;
  let scoreChartInstance = null;

  // Collaborative Sync Variables
  let syncProvider = localStorage.getItem('snakeSyncProvider') || 'firebase';
  let syncUrl = localStorage.getItem('snakeSyncUrl') || 'https://my-default-project-483019-default-rtdb.firebaseio.com/qtable.json';
  let blendRate = parseFloat(localStorage.getItem('snakeBlendRate') || '0.30');
  let autoSyncEnabled = localStorage.getItem('snakeAutoSync') === 'true';
  let lastSyncTime = localStorage.getItem('snakeLastSync') || 'Never';

  // Overwrite if previously empty/mock
  if (syncUrl === '' || localStorage.getItem('snakeSyncUrl') === '') {
    syncUrl = 'https://my-default-project-483019-default-rtdb.firebaseio.com/qtable.json';
    localStorage.setItem('snakeSyncUrl', syncUrl);
    syncProvider = 'firebase';
    localStorage.setItem('snakeSyncProvider', 'firebase');
  }

  // Create snake
  const snake = {
    x: 160,
    y: 160,
    dx: grid,
    dy: 0,
    cells: [],
    maxCells: 4,
    color: '#00e5ff' // Neon cyan head/body
  };

  // Create apple
  const apple = {
    x: 320,
    y: 320,
    color: '#ff007f' // Neon hot pink
  };

  // get random whole numbers in a specific range
  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  // Helper to restrict AI to physically possible actions (prevent backtracking)
  function getValidActions() {
    const oppositeMap = {
      'left': 'right',
      'right': 'left',
      'up': 'down',
      'down': 'up'
    };
    let currentDir = null;
    if (snake.dx > 0) currentDir = 'right';
    else if (snake.dx < 0) currentDir = 'left';
    else if (snake.dy > 0) currentDir = 'down';
    else if (snake.dy < 0) currentDir = 'up';

    const opposite = oppositeMap[currentDir];
    return actions.filter(a => a !== opposite);
  }

  // Q-Learning Helper Functions
  function getState() {
    const head = { x: snake.x, y: snake.y };
    
    // Determine relative apple position
    const appleX = apple.x < head.x ? 'left' : (apple.x > head.x ? 'right' : 'same');
    const appleY = apple.y < head.y ? 'up' : (apple.y > head.y ? 'down' : 'same');

    // Check for obstacles in each direction
    const checkCollision = (x, y) => {
      if (x < 0) x = canvas.width - grid;
      else if (x >= canvas.width) x = 0;
      if (y < 0) y = canvas.height - grid;
      else if (y >= canvas.height) y = 0;
      
      // Check if coordinate collides with snake body
      return snake.cells.some(cell => cell.x === x && cell.y === y);
    };

    const obsLeft = checkCollision(head.x - grid, head.y) ? 1 : 0;
    const obsRight = checkCollision(head.x + grid, head.y) ? 1 : 0;
    const obsUp = checkCollision(head.x, head.y - grid) ? 1 : 0;
    const obsDown = checkCollision(head.x, head.y + grid) ? 1 : 0;

    return `${appleX}_${appleY}_${obsLeft}${obsRight}${obsUp}${obsDown}`;
  }

  function isValidState(state) {
    return typeof state === 'string' && /^(left|right|same)_(up|down|same)_[01]{4}$/.test(state);
  }

  function isValidAction(action) {
    return actions.includes(action);
  }

  function mapToObj(map) {
    const obj = {};
    if (map && map instanceof Map) {
      for (let [state, actionsMap] of map.entries()) {
        obj[state] = {};
        if (actionsMap && actionsMap instanceof Map) {
          for (let [action, val] of actionsMap.entries()) {
            obj[state][action] = val;
          }
        }
      }
    }
    return obj;
  }

  function loadQTableFromObj(obj) {
    qTable.clear();
    if (obj && typeof obj === 'object') {
      for (const state in obj) {
        if (isValidState(state) && Object.prototype.hasOwnProperty.call(obj, state)) {
          const actionsMap = new Map();
          const actionsObj = obj[state];
          if (actionsObj && typeof actionsObj === 'object') {
            for (const action in actionsObj) {
              if (isValidAction(action) && Object.prototype.hasOwnProperty.call(actionsObj, action)) {
                actionsMap.set(action, actionsObj[action] || 0);
              }
            }
          }
          qTable.set(state, actionsMap);
        }
      }
    }
  }

  function getQ(state, action) {
    if (!isValidState(state) || !isValidAction(action)) return 0;
    const actionsMap = qTable.get(state);
    if (!actionsMap) return 0;
    return actionsMap.get(action) || 0;
  }

  function setQ(state, action, value) {
    if (!isValidState(state) || !isValidAction(action)) return;
    let actionsMap = qTable.get(state);
    if (!actionsMap) {
      actionsMap = new Map();
      qTable.set(state, actionsMap);
    }
    actionsMap.set(action, value);
  }

  function getMaxQ(state) {
    if (!isValidState(state)) return 0;
    const actionsMap = qTable.get(state);
    if (!actionsMap) return 0;
    const values = actions.map(a => actionsMap.get(a) || 0);
    return Math.max(...values);
  }

  function chooseAction(state) {
    const validActions = getValidActions();
    if (Math.random() < epsilon) {
      return validActions[Math.floor(Math.random() * validActions.length)];
    }
    // Sort actions randomly to break ties
    const shuffled = validActions.slice().sort(() => 0.5 - Math.random());
    return shuffled.reduce((a, b) => getQ(state, a) > getQ(state, b) ? a : b);
  }

  // Toast notification utility
  function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // Collaborative Sync / Merge Logic
  function mergeQTables(localTable, globalTable, rate) {
    const blended = new Map();

    function importTable(table, isLocal) {
      if (!table) return;
      const entries = (table instanceof Map) ? table.entries() : Object.entries(table);
      for (const [state, actionsObj] of entries) {
        if (!isValidState(state)) continue;
        
        let targetMap = blended.get(state);
        if (!targetMap) {
          targetMap = new Map();
          blended.set(state, targetMap);
        }

        const actionEntries = (actionsObj instanceof Map) ? actionsObj.entries() : Object.entries(actionsObj);
        for (const [action, val] of actionEntries) {
          if (!isValidAction(action)) continue;
          
          if (isLocal) {
            const localQ = val || 0;
            if (targetMap.has(action)) {
              const globalQ = targetMap.get(action) || 0;
              targetMap.set(action, globalQ * (1 - rate) + localQ * rate);
            } else {
              targetMap.set(action, localQ);
            }
          } else {
            targetMap.set(action, val || 0);
          }
        }
      }
    }

    importTable(globalTable, false);
    importTable(localTable, true);

    return blended;
  }

  async function syncWithCloud(silent = false) {
    if (!silent) showNotification('Starting model sync...', 'info');
    updateSyncStatusUI('Syncing...', 'syncing');

    let globalQTable = {};

    // 1. Fetch Shared Global Model
    try {
      if (syncProvider === 'mock') {
        const mockData = localStorage.getItem('snakeGlobalQTableMock') || '{}';
        globalQTable = JSON.parse(mockData);
      } else {
        if (!syncUrl) {
          throw new Error('Database endpoint URL is empty.');
        }
        const response = await fetch(syncUrl);
        if (!response.ok) {
          throw new Error(`Fetch failed: HTTP ${response.status}`);
        }
        const data = await response.json();
        globalQTable = data || {};
      }
    } catch (e) {
      console.error('Fetch Error:', e);
      updateSyncStatusUI(syncProvider === 'mock' ? 'Sandbox Mock' : 'Disconnected', syncProvider === 'mock' ? 'mock' : 'disconnected');
      if (!silent) showNotification(`Fetch Failed: ${e.message}`, 'danger');
      return;
    }

    // 2. Perform Federated Blend Merge
    const mergedQTable = mergeQTables(qTable, globalQTable, blendRate);

    // 3. Push Merged Model Back to Cloud
    try {
      const mergedObj = mapToObj(mergedQTable);
      if (syncProvider === 'mock') {
        localStorage.setItem('snakeGlobalQTableMock', JSON.stringify(mergedObj));
      } else {
        const response = await fetch(syncUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mergedObj)
        });
        if (!response.ok) {
          throw new Error(`Upload failed: HTTP ${response.status}`);
        }
      }
    } catch (e) {
      console.error('Upload Error:', e);
      updateSyncStatusUI('Disconnected', 'disconnected');
      if (!silent) showNotification(`Upload Failed: ${e.message}`, 'danger');
      return;
    }

    // 4. Overwrite Local Memory Q-Table with Merged Result
    qTable.clear();
    for (let [state, actionsMap] of mergedQTable.entries()) {
      qTable.set(state, actionsMap);
    }

    // Write backup to standard local storage
    try {
      localStorage.setItem('snakeQTable', JSON.stringify(mapToObj(qTable)));
    } catch (e) {}

    // 5. Update UI Indicators
    const stateCount = qTable.size;
    document.getElementById('sync-states').textContent = stateCount;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    lastSyncTime = timeStr;
    localStorage.setItem('snakeLastSync', lastSyncTime);
    document.getElementById('sync-time').textContent = lastSyncTime;

    updateSyncStatusUI(syncProvider === 'mock' ? 'Sandbox Mock' : 'Connected', syncProvider === 'mock' ? 'mock' : 'connected');
    renderQTable();

    if (!silent) showNotification(`Sync Complete! Shared model now has ${stateCount} states.`, 'success');
  }

  function updateSyncStatusUI(statusText, stateClass) {
    const badge = document.getElementById('sync-status');
    if (!badge) return;
    badge.textContent = statusText;
    badge.className = `status-indicator ${stateClass}`;
  }

  // Chart.js initialization
  function initChart() {
    const chartCtx = document.getElementById('scoreChart');
    if (!chartCtx) return;
    
    scoreChartInstance = new Chart(chartCtx.getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Score',
          data: [],
          borderColor: '#00ff88', // Emerald green line
          backgroundColor: 'rgba(0, 255, 136, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          pointBackgroundColor: '#00ff88',
          pointBorderColor: '#0f0d22',
          pointRadius: 3,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#a4a0ba', font: { family: 'Plus Jakarta Sans', size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.04)' },
            ticks: { color: '#a4a0ba', font: { family: 'Plus Jakarta Sans', size: 10 } },
            suggestedMin: 0
          }
        }
      }
    });
  }

  function updateChart(gameNum, finalScore) {
    if (!scoreChartInstance) return;

    scoreChartInstance.data.labels.push(`G${gameNum}`);
    scoreChartInstance.data.datasets[0].data.push(finalScore);

    if (scoreChartInstance.data.labels.length > 20) {
      scoreChartInstance.data.labels.shift();
      scoreChartInstance.data.datasets[0].data.shift();
    }

    scoreChartInstance.update('none');
  }

  // game loop
  function loop(timestamp) {
    requestAnimationFrame(loop);

    if (!timestamp) timestamp = performance.now();
    const elapsed = timestamp - then;
    if (elapsed < fpsInterval) return;
    then = timestamp - (elapsed % fpsInterval);

    changingDirection = false;

    context.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate distance to apple before moving
    const distBefore = Math.abs(snake.x - apple.x) + Math.abs(snake.y - apple.y);

    // move snake by its velocity
    snake.x += snake.dx;
    snake.y += snake.dy;

    // wrap snake position horizontally on edge of screen
    if (snake.x < 0) {
      snake.x = canvas.width - grid;
    } else if (snake.x >= canvas.width) {
      snake.x = 0;
    }

    // wrap snake position vertically on edge of screen
    if (snake.y < 0) {
      snake.y = canvas.height - grid;
    } else if (snake.y >= canvas.height) {
      snake.y = 0;
    }

    // keep track of where snake has been. front of the array is always the head
    snake.cells.unshift({ x: snake.x, y: snake.y });

    // remove cells as we move away from them
    if (snake.cells.length > snake.maxCells) {
      snake.cells.pop();
    }

    // Calculate distance to apple after moving
    const distAfter = Math.abs(snake.x - apple.x) + Math.abs(snake.y - apple.y);

    let reward = -0.1; // Small penalty for each step to encourage efficiency

    // Modify reward based on distance change
    if (distAfter > distBefore) {
      reward -= 0.5; // Penalize moving away
    }

    // draw apple
    context.fillStyle = apple.color;
    context.beginPath();
    // Rounded shiny apple styling
    const radius = grid / 2;
    context.arc(apple.x + radius, apple.y + radius, radius - 1, 0, 2 * Math.PI);
    context.fill();

    // draw snake one cell at a time
    snake.cells.forEach(function (cell, index) {
      // Different color for head vs body
      if (index === 0) {
        context.fillStyle = snake.color; // Neon Cyan
      } else {
        context.fillStyle = 'rgba(0, 229, 255, 0.7)'; // Translucent Neon Cyan for body
      }
      
      // Draw rounded rects for snake cells for a more modern appearance
      const pad = 1;
      context.beginPath();
      context.roundRect(cell.x + pad, cell.y + pad, grid - 2 * pad, grid - 2 * pad, 4);
      context.fill();

      // snake ate apple (check only head for clean physics logic)
      if (index === 0 && cell.x === apple.x && cell.y === apple.y) {
        snake.maxCells++;
        reward = 10; // Reward for eating

        // increase score
        score++;
        document.getElementById('score').textContent = score;

        // canvas is 400x400 which is 25x25 grids
        apple.x = getRandomInt(0, 25) * grid;
        apple.y = getRandomInt(0, 25) * grid;
      }
    });

    // Check self-collision (head collides with any body part) - Optimized O(N)
    let collided = false;
    if (snake.cells.length > 1) {
      const head = snake.cells.at(0);
      for (let i = 1; i < snake.cells.length; i++) {
        if (head.x === snake.cells.at(i).x && head.y === snake.cells.at(i).y) {
          collided = true;
          break;
        }
      }
    }

    if (collided) {
      reward = -100; // Penalty for dying
      
      // Update high score
      if (score > highScore) {
        highScore = score;
        historyScore.push(highScore);
        document.getElementById('high-score').textContent = highScore;
      }

      // Add run log entry
      const li = document.createElement('li');
      li.className = 'history-item';
      const spanIndex = document.createElement('span');
      spanIndex.className = 'run-index';
      spanIndex.textContent = `Game ${game}`;
      const spanScore = document.createElement('span');
      spanScore.className = 'run-score';
      spanScore.textContent = score.toString();
      li.appendChild(spanIndex);
      li.appendChild(spanScore);
      document.getElementById('history-score').prepend(li);
      
      // Add data to score chart
      updateChart(game, score);

      game++;
      document.getElementById('game-counter').textContent = game;

      // Limit run log list to 50 entries
      const historyList = document.getElementById('history-score');
      if (historyList.children.length > 50) {
        historyList.removeChild(historyList.lastChild);
      }

      // Sync local model with Cloud Model if autoSync is active (run in background asynchronously)
      if (autoSyncEnabled && !human_is_playing) {
        syncWithCloud(true);
      }

      // Reset game parameters
      snake.x = 160;
      snake.y = 160;
      snake.cells = [];
      snake.maxCells = 4;
      snake.dx = grid;
      snake.dy = 0;
      score = 0;
      document.getElementById('score').textContent = score;

      apple.x = getRandomInt(0, 25) * grid;
      apple.y = getRandomInt(0, 25) * grid;
    }

    // AI Logic
    if (!human_is_playing) {
      const currentState = getState();

      // Visualize AI perception
      if (perception_on) {
        const qVals = qTable.get(currentState);
        if (qVals) {
          const headCx = snake.x + grid / 2;
          const headCy = snake.y + grid / 2;

          actions.forEach(a => {
            const q = qVals.get(a) || 0;
            context.beginPath();
            context.lineWidth = 2;
            if (q > 0.5) context.strokeStyle = '#00ff88'; // Neon Green (Safe/Good)
            else if (q < -10) context.strokeStyle = '#ff007f'; // Neon Hot Pink (Danger)
            else context.strokeStyle = '#ffcc00'; // Neon Gold (Neutral)

            context.moveTo(headCx, headCy);
            if (a === 'left') context.lineTo(headCx - grid, headCy);
            else if (a === 'right') context.lineTo(headCx + grid, headCy);
            else if (a === 'up') context.lineTo(headCx, headCy - grid);
            else if (a === 'down') context.lineTo(headCx, headCy + grid);
            context.stroke();
          });
        }
      }

      // Update Q-Table based on the result of the PREVIOUS action
      if (lastState !== null && lastAction !== null) {
        const oldQ = getQ(lastState, lastAction);
        const maxFutureQ = (collided || reward === -100) ? 0 : getMaxQ(currentState);
        const newQ = oldQ + alpha * (reward + gamma * maxFutureQ - oldQ);
        setQ(lastState, lastAction, newQ);
      }

      if (collided || reward === -100) {
        // Reset tracking if died
        lastState = null;
        lastAction = null;
      } else {
        // Choose next valid action
        const action = chooseAction(currentState);
        lastState = currentState;
        lastAction = action;

        // Apply action (direction locks are handled automatically by choosing only validActions)
        if (action === 'left') {
          snake.dx = -grid;
          snake.dy = 0;
        } else if (action === 'right') {
          snake.dx = grid;
          snake.dy = 0;
        } else if (action === 'up') {
          snake.dy = -grid;
          snake.dx = 0;
        } else if (action === 'down') {
          snake.dy = grid;
          snake.dx = 0;
        }
      }

      // Throttled Q-table auto-rendering (every 60 frames to optimize repaint performance)
      framesSinceLastQRender++;
      if (framesSinceLastQRender >= 60) {
        framesSinceLastQRender = 0;
        renderQTable();
      }
    }
  }

  // listen to keyboard events to move the snake
  document.addEventListener('keydown', function (e) {
    if (!human_is_playing) return;
    if (changingDirection) return;

    if (e.code === 'ArrowLeft' && snake.dx === 0) {
      snake.dx = -grid;
      snake.dy = 0;
      changingDirection = true;
    } else if (e.code === 'ArrowRight' && snake.dx === 0) {
      snake.dx = grid;
      snake.dy = 0;
      changingDirection = true;
    } else if (e.code === 'ArrowUp' && snake.dy === 0) {
      snake.dy = -grid;
      snake.dx = 0;
      changingDirection = true;
    } else if (e.code === 'ArrowDown' && snake.dy === 0) {
      snake.dy = grid;
      snake.dx = 0;
      changingDirection = true;
    }
  });

  // Mode toggling
  document.getElementById('ia_toggle').addEventListener('change', function () {
    human_is_playing = !this.checked;
    lastState = null;
    lastAction = null;

    // Update status badge
    const statusBadg = document.getElementById('game-status');
    if (human_is_playing) {
      statusBadg.textContent = 'Human Mode';
      statusBadg.className = 'status-indicator';
    } else {
      statusBadg.textContent = 'AI Learning Mode';
      statusBadg.className = 'status-indicator ai-active';
    }

    // reset the game state
    snake.x = 160;
    snake.y = 160;
    snake.cells = [];
    snake.maxCells = 4;
    snake.dx = grid;
    snake.dy = 0;
    score = 0;

    document.getElementById('score').textContent = score;
    document.getElementById('history-score').innerHTML = '';
    game = 1;
    document.getElementById('game-counter').textContent = game;
    historyScore = [];

    // Clear chart
    if (scoreChartInstance) {
      scoreChartInstance.data.labels = [];
      scoreChartInstance.data.datasets[0].data = [];
      scoreChartInstance.update();
    }

    apple.x = getRandomInt(0, 25) * grid;
    apple.y = getRandomInt(0, 25) * grid;
  });

  document.getElementById('eyes_toggle').addEventListener('change', function () {
    perception_on = this.checked;
  });

  // Q-Table Visualization
  function renderQTable() {
    const container = document.getElementById('q-table-container');
    if (!container) return;

    const states = Array.from(qTable.keys()).sort();
    
    if (states.length === 0) {
      container.innerHTML = '';
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'qtable-empty';
      emptyDiv.textContent = 'No states learned yet. Switch to AI Mode to train.';
      container.appendChild(emptyDiv);
      return;
    }

    const table = document.createElement('table');
    table.className = 'qtable-grid';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['State Representation', 'Left', 'Up', 'Right', 'Down'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    states.forEach(state => {
      if (!isValidState(state)) return;
      const actionsMap = qTable.get(state);
      const leftVal = actionsMap ? (actionsMap.get('left') || 0) : 0;
      const upVal = actionsMap ? (actionsMap.get('up') || 0) : 0;
      const rightVal = actionsMap ? (actionsMap.get('right') || 0) : 0;
      const downVal = actionsMap ? (actionsMap.get('down') || 0) : 0;

      const vals = [leftVal, upVal, rightVal, downVal];
      const maxVal = Math.max(...vals);
      
      const getCellClass = (val) => {
        if (val === maxVal && val !== 0) return 'q-cell q-cell-best';
        if (val < -10) return 'q-cell q-cell-danger';
        return 'q-cell';
      };

      const tr = document.createElement('tr');

      const tdState = document.createElement('td');
      tdState.className = 'q-state-cell';

      const parts = state.split('_');
      if (parts.length >= 3) {
        const [apX, apY, obs] = parts;
        let foodDir = '';
        if (apX === 'same' && apY === 'same') {
          foodDir = 'On Target';
        } else {
          const xChar = apX !== 'same' ? apX[0].toUpperCase() : '';
          const yChar = apY !== 'same' ? apY[0].toUpperCase() : '';
          foodDir = `${xChar}${yChar}`;
        }

        const obsList = [];
        if (obs[0] === '1') obsList.push('L');
        if (obs[1] === '1') obsList.push('R');
        if (obs[2] === '1') obsList.push('U');
        if (obs[3] === '1') obsList.push('D');
        const obsStr = obsList.length > 0 ? `🚨 ${obsList.join(',')}` : '🟢 Clear';

        const card = document.createElement('div');
        card.className = 'state-card';
        const spanFood = document.createElement('span');
        spanFood.className = 'state-food';
        spanFood.textContent = `🍎 ${foodDir}`;
        const spanObs = document.createElement('span');
        spanObs.className = 'state-obs';
        spanObs.textContent = obsStr;
        card.appendChild(spanFood);
        card.appendChild(spanObs);
        tdState.appendChild(card);
      } else {
        tdState.textContent = state;
      }
      tr.appendChild(tdState);

      [leftVal, upVal, rightVal, downVal].forEach(val => {
        const td = document.createElement('td');
        td.className = getCellClass(val);
        td.textContent = val.toFixed(2);
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    container.innerHTML = '';
    container.appendChild(table);
  }

  document.getElementById('refresh-qtable').addEventListener('click', renderQTable);

  document.getElementById('save-qtable').addEventListener('click', function () {
    try {
      localStorage.setItem('snakeQTable', JSON.stringify(mapToObj(qTable)));
      showNotification('Q-Table model saved!', 'success');
    } catch (e) {
      console.error('Local Storage Save Error:', e);
      showNotification('Failed to save Q-Table. Storage limit exceeded.', 'danger');
    }
  });

  document.getElementById('load-qtable').addEventListener('click', function () {
    try {
      const data = localStorage.getItem('snakeQTable');
      if (data) {
        const loaded = JSON.parse(data);
        if (loaded && typeof loaded === 'object') {
          loadQTableFromObj(loaded);
          showNotification('Q-Table model loaded!', 'success');
          renderQTable();
        } else {
          showNotification('Saved Q-Table is invalid.', 'danger');
        }
      } else {
        showNotification('No saved Q-Table found in local storage.', 'warning');
      }
    } catch (e) {
      console.error('Local Storage Load Error:', e);
      showNotification('Failed to load Q-Table. Corrupted local storage.', 'danger');
    }
  });

  // Setup speed slider listener
  const speedRange = document.getElementById('speedRange');
  const speedValue = document.getElementById('speedValue');
  speedRange.addEventListener('input', function () {
    fps = parseInt(this.value);
    speedValue.textContent = fps;
    fpsInterval = 1000 / fps;
  });

  // Auto-load on startup
  try {
    const savedData = localStorage.getItem('snakeQTable');
    if (savedData) {
      const loaded = JSON.parse(savedData);
      if (loaded && typeof loaded === 'object') {
        loadQTableFromObj(loaded);
      }
    }
  } catch (e) {
    console.error('Auto-load Error:', e);
  }

  // Setup Federated Sync UI Elements and Bindings
  const providerSelect = document.getElementById('sync-provider');
  const urlInput = document.getElementById('sync-url');
  const urlGroup = document.getElementById('url-group');
  const syncBlendRange = document.getElementById('syncBlendRange');
  const blendValue = document.getElementById('blendValue');
  const syncAutoToggle = document.getElementById('sync_auto_toggle');
  const syncNowBtn = document.getElementById('sync-now');

  // Bind initial settings values to UI
  providerSelect.value = syncProvider;
  urlInput.value = syncUrl;
  syncBlendRange.value = Math.round(blendRate * 100);
  blendValue.textContent = Math.round(blendRate * 100);
  syncAutoToggle.checked = autoSyncEnabled;
  document.getElementById('sync-time').textContent = lastSyncTime;
  document.getElementById('sync-states').textContent = qTable.size;

  // Toggle visibility of Endpoint URL based on provider
  if (syncProvider === 'mock') {
    urlGroup.style.display = 'none';
    updateSyncStatusUI('Sandbox Mock', 'mock');
  } else {
    urlGroup.style.display = 'block';
    updateSyncStatusUI('Disconnected', 'disconnected');
  }

  providerSelect.addEventListener('change', function () {
    syncProvider = this.value;
    localStorage.setItem('snakeSyncProvider', syncProvider);
    if (syncProvider === 'mock') {
      urlGroup.style.display = 'none';
      updateSyncStatusUI('Sandbox Mock', 'mock');
    } else {
      urlGroup.style.display = 'block';
      updateSyncStatusUI('Disconnected', 'disconnected');
    }
  });

  urlInput.addEventListener('input', function () {
    syncUrl = this.value;
    localStorage.setItem('snakeSyncUrl', syncUrl);
  });

  syncBlendRange.addEventListener('input', function () {
    blendRate = parseFloat(this.value) / 100;
    blendValue.textContent = this.value;
    localStorage.setItem('snakeBlendRate', blendRate);
  });

  syncAutoToggle.addEventListener('change', function () {
    autoSyncEnabled = this.checked;
    localStorage.setItem('snakeAutoSync', autoSyncEnabled);
  });

  syncNowBtn.addEventListener('click', function () {
    syncWithCloud(false);
  });

  // Initialize and run
  initChart();
  renderQTable();
  requestAnimationFrame(loop);

})();
