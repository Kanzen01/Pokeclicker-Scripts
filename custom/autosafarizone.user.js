/* eslint-disable no-use-before-define */
/* eslint-disable max-len */
/* eslint-disable no-undef */
// ==UserScript==
// @name          [Pokeclicker] Auto Safari Zone
// @namespace     Pokeclicker Scripts
// @author        Kanzen01 (Credit: Ephenia, Optimatum)
// @description   Adds in toggable options to move/catch pokemons/pick up items and have fast animations on both safari zones
// @copyright     https://github.com/Kanzen01
// @license       GPL-3.0 License
// @version       1.0

// @homepageURL   https://github.com/Ephenia/Pokeclicker-Scripts/
// @supportURL    https://github.com/Ephenia/Pokeclicker-Scripts/issues
// @downloadURL   https://raw.githubusercontent.com/Ephenia/Pokeclicker-Scripts/master/custom/autosafarizone.user.js
// @updateURL     https://raw.githubusercontent.com/Ephenia/Pokeclicker-Scripts/master/custom/autosafarizone.user.js

// @match         https://www.pokeclicker.com/
// @icon          https://www.google.com/s2/favicons?domain=pokeclicker.com
// @grant         none
// @run-at        document-idle
// ==/UserScript==

var scriptName = 'autosafarizone';

function initAutoSafari() {
  var autoSafariState = false;
  var autoSafariPickItemsState = loadSetting('autoSafariPickItemsState', true);
  var autoSafariThrowBaitsState = loadSetting('autoSafariThrowBaitsState', false);
  var autoSafariCatchAllState = loadSetting('autoSafariCatchAllState', false);
  var autoSafariPrioritizeUncaught = loadSetting('autoSafariPrioritizeUncaught', false);
  var autoSafariPrioritizeContagious = loadSetting('autoSafariPrioritizeContagious', false);
  var autoSafariFastAnimationsState = loadSetting('autoSafariFastAnimationsState', false);

  var cachedPath = [];
  // Tells when we try to pick items and skip fights or run away when only 1 ball left
  var gettingItems = false;
  // To skip items if they are generated in buggy sections of the grid
  var forceSkipItems = false;

  var autoSafariProcessId;
  var skipTicks = 0;

  const CACHED_ANIM_SPEEDS = Object.assign({}, SafariBattle.Speed);
  const CACHED_MOVE_SPEED = Safari.moveSpeed;
  // Faux enum
  const DIRECTIONS = {
    up: 0,
    down: 1,
    left: 2,
    right: 3,
    0: 'up',
    1: 'down',
    2: 'left',
    3: 'right',
  };

  createHTML();

  function startAutoSafari() {
    gettingItems = false;
    forceSkipItems = false;
    cachedPath.length = 0;
    // Interval slightly longer than movement speed (0.25s by default) to avoid graphical glitches
    autoSafariProcessId = setInterval(doSafariTick, tickSpeed());
  }

  function doSafariTick() {
    if (skipTicks) {
      skipTicks--;
    } else if (!Safari.inProgress() || modalUtils.observableState.safariModal !== 'show') {
      enterSafari();
    } else if (Safari.inBattle()) {
      fightSafariPokemon();
    } else {
      processSafari();
    }
  }

  function tickSpeed() {
    return Safari.moveSpeed + 25;
  }

  function enterSafari() {
    if (!(Safari.canAccess() && !player.route() && ['Safari Zone', 'Friend Safari'].includes(player.town().name))) {
      toggleAutoSafari();
      return;
    }
    if (modalUtils.observableState.safariModal !== 'show') {
      Safari.openModal();
      skipTicks = 1;
    } else if (!Safari.inProgress() && Safari.canPay()) {
      Safari.payEntranceFee();
      forceSkipItems = false;
      cachedPath.length = 0;
    } else {
      toggleAutoSafari();
    }
  }

  function processSafari() {
    // Performs actions within the Safari: picking items, moving
    if (autoSafariPickItemsState && Safari.itemGrid().length > 0 && Safari.balls() == 1 && !forceSkipItems) {
      if (!gettingItems) {
        cachedPath.length = 0;
        gettingItems = true; // trying to pick up items, set to skip fights
      }
      if (!cachedPath.length) {
        cachedPath = findShortestPathToItems();
      }
      if (cachedPath.length) {
        moveCharacter(cachedPath);
      } else {
        forceSkipItems = true;
      }
    } else {
      if (gettingItems) {
        cachedPath.length = 0;
        gettingItems = false;
      }
      if (!cachedPath.length) {
        cachedPath = findShortestPathToEncounters();
      }
      if (cachedPath.length) {
        moveCharacter(cachedPath);
      } else {
        // Hopefully never possible
        toggleAutoSafari();
      }
    }
  }

  function moveCharacter(path) {
    if (!Safari.isMoving) {
      let dir = path.shift();
      Safari.step(DIRECTIONS[dir]);
    }
  }

  function findShortestPathToItems() {
    const itemLocations = new Set(Safari.itemGrid().map(({ x, y }) => `${y}-${x}`));
    return findShortestPathToTiles((row, col) => (itemLocations.has(`${row}-${col}`)));
  }

  function findShortestPathToEncounters() {
    // If prioritizing uncaught/contagious, check if water and grass encounters have any
    function isPriority(mon) {
      return (autoSafariPrioritizeUncaught && !App.game.party.alreadyCaughtPokemonByName(mon)) ||
        (autoSafariPrioritizeContagious && App.game.party.getPokemonByName(mon)?.pokerus === GameConstants.Pokerus.Contagious);
    }

    let needGrass = false;
    let needWater = false;

    if (autoSafariPrioritizeUncaught || autoSafariPrioritizeContagious) {
      needGrass = SafariPokemonList.list[player.region].some((p) => p.environments.includes(SafariEnvironments.Grass) && isPriority(p.name));
      needWater = SafariPokemonList.list[player.region].some((p) => p.environments.includes(SafariEnvironments.Water) && isPriority(p.name));
    }
    
    let chosenTiles = [];
    if (needGrass) {
      chosenTiles.push(GameConstants.SafariTile.grass);
    }
    if (needWater) {
      chosenTiles.push(...GameConstants.SAFARI_WATER_BLOCKS);
    }
    if (!needGrass && !needWater) {
      // No priority, either 
      chosenTiles.push(GameConstants.SafariTile.grass, ...GameConstants.SAFARI_WATER_BLOCKS);
    }

    const encounterTiles = new Set(chosenTiles);
    return findShortestPathToTiles((row, col) => (encounterTiles.has(Safari.grid[row][col])) && !isIsolatedTile(row, col));
  }

  function isIsolatedTile(row, col) {
    const adjacentTiles = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ];

    for (const [adjRow, adjCol] of adjacentTiles) {
      if (isValidPosition(adjRow, adjCol) && Safari.grid[adjRow][adjCol] === Safari.grid[row][col]) {
        return false; // Found an adjacent tile with the same value
      }
    }

    return true; // No adjacent tile with the same value found
  }

  function isValidPosition(row, col) {
    const numRows = Safari.grid.length;
    const numCols = Safari.grid[0].length;
    return row >= 0 && row < numRows && col >= 0 && col < numCols;
  }

  // Takes a test function and returns a path to the closest tile that satisfies it
  function findShortestPathToTiles(isPositionTarget) {
    const visited = new Set();
    const queue = [[Safari.playerXY.y, Safari.playerXY.x, []]];

    while (queue.length > 0) {
      const [currentRow, currentCol, currentPath] = queue.shift();
      visited.add(`${currentRow}-${currentCol}`);

      if (currentPath.length > 0 && isPositionTarget(currentRow, currentCol)) {
        // Found the closest target, return the path
        return currentPath;
      }

      const adjacent = [
        [currentRow - 1, currentCol, DIRECTIONS.up],
        [currentRow + 1, currentCol, DIRECTIONS.down],
        [currentRow, currentCol - 1, DIRECTIONS.left],
        [currentRow, currentCol + 1, DIRECTIONS.right],
      ];

      for (const [nextRow, nextCol, direction] of adjacent) {
        const nextPosStr = `${nextRow}-${nextCol}`;

        // TODO remove SAFARI_WATER_BLOCKS after game update makes it redundant
        if (isValidPosition(nextRow, nextCol) && !visited.has(nextPosStr)
          && (GameConstants.SAFARI_LEGAL_WALK_BLOCKS.includes(Safari.grid[nextRow][nextCol])
            || GameConstants.SAFARI_WATER_BLOCKS.includes(Safari.grid[nextRow][nextCol]))
        ) {
          {
            const nextPath = currentPath.concat([direction]);
            queue.push([nextRow, nextCol, nextPath]);
            visited.add(nextPosStr);
          }
        }
      }
    }
    return [];
  }

  function fightSafariPokemon(forceRunAway = gettingItems) {
    // TODO skip ticks proportional to animation speed
    if (autoSafariThrowBaitsState && App.game.statistics.safariBaitThrown() <= 1000) {
      SafariBattle.throwBait();
    } else if (!forceRunAway
      && (autoSafariCatchAllState
        || App.game.party.getPokemon(SafariBattle.enemy.id)?.pokerus === GameConstants.Pokerus.Contagious
        || SafariBattle.enemy.shiny
        || !App.game.party.alreadyCaughtPokemon(SafariBattle.enemy.id))
      // to not skip lots of items if we use multiple pokeballs on the last fight
      && !(Safari.balls() == 1 && Safari.itemGrid().length > 0 && !forceSkipItems)
    ) {
      if (SafariBattle.enemy.angry === 0) {
        SafariBattle.throwRock();
      } else {
        SafariBattle.throwBall();
      }
    } else {
      SafariBattle.run();
    }
  }

  function createHTML() {
    const safariModal = document.getElementById('safariModal');
    const modalHeader = safariModal.querySelector('.modal-header');

    const buttonsContainer = document.createElement('div');

    const createButton = (name, state, func) => {
      var button = document.createElement('button');
      button.setAttribute('id', `auto-${name}-toggle`);
      button.classList.add('btn', 'btn-block', 'btn-' + (state ? 'success' : 'danger'));
      button.setAttribute('style', 'font-size: 8pt; display: flex; align-items: center; justify-content: center; margin: 0px !important;')
      button.textContent = `Auto ${name[0].toUpperCase() + name.slice(1)}\n[${state ? 'ON' : 'OFF'}]`;
      button.onclick = function () { func(); };

      buttonsContainer.appendChild(button);
    }

    createButton('safari', autoSafariState, toggleAutoSafari)
    createButton('pick-items', autoSafariPickItemsState, toggleAutoPickItems)
    createButton('fast-anim', autoSafariFastAnimationsState, toggleFastAnimations)
    createButton('throw-baits', autoSafariThrowBaitsState, toggleThrowBaits)
    createButton('catch-all', autoSafariCatchAllState, toggleCatchAll)

    buttonsContainer.setAttribute('style', 'display: flex; height: 24px;')
    buttonsContainer.style.display = 'flex';
    modalHeader.after(buttonsContainer);

    const safariQuitBtn = safariModal.querySelector('button[onclick="Safari.closeModal()"]');
    safariQuitBtn.addEventListener('click', () => {
      if (autoSafariState) {
        toggleAutoSafari();
      }
    });

    if (autoSafariFastAnimationsState) {
      autoSafariFastAnimations();
    }
  }

  function toggleAutoSafari() {
    autoSafariState = !autoSafariState;
    const toggleButton = document.getElementById('auto-safari-toggle');
    toggleButton.classList.toggle('btn-danger', !autoSafariState);
    toggleButton.classList.toggle('btn-success', autoSafariState);
    localStorage.setItem('autoSafariState', autoSafariState);
    document.getElementById('auto-safari-toggle').innerHTML = `Auto Safari [${autoSafariState ? 'ON' : 'OFF'}]`;

    if (autoSafariState) {
      startAutoSafari();
    } else {
      clearInterval(autoSafariProcessId);
    }
  }

  function toggleAutoPickItems() {
    autoSafariPickItemsState = !autoSafariPickItemsState;
    const toggleButton = document.getElementById('auto-pick-items-toggle');
    toggleButton.classList.toggle('btn-danger', !autoSafariPickItemsState);
    toggleButton.classList.toggle('btn-success', autoSafariPickItemsState);
    localStorage.setItem('autoSafariPickItemsState', autoSafariPickItemsState);
    document.getElementById('auto-pick-items-toggle').innerHTML = `Auto Pick-items [${autoSafariPickItemsState ? 'ON' : 'OFF'}]`;
  }

  function toggleFastAnimations() {
    autoSafariFastAnimationsState = !autoSafariFastAnimationsState;
    const toggleButton = document.getElementById('auto-fast-anim-toggle');
    toggleButton.classList.toggle('btn-danger', !autoSafariFastAnimationsState);
    toggleButton.classList.toggle('btn-success', autoSafariFastAnimationsState);
    localStorage.setItem('autoSafariFastAnimationsState', autoSafariFastAnimationsState);
    document.getElementById('auto-fast-anim-toggle').innerHTML = `Auto Fast-anim [${autoSafariFastAnimationsState ? 'ON' : 'OFF'}]`;

    autoSafariFastAnimations();
  }

  function autoSafariFastAnimations() {
    for (const anim of Object.keys(SafariBattle.Speed)) {
      if (['enemyFlee', 'enemyCaught', 'turnLength', 'gameOver'].includes(anim)) {
        SafariBattle.Speed[anim] = autoSafariFastAnimationsState ? CACHED_ANIM_SPEEDS[anim] / 2 : CACHED_ANIM_SPEEDS[anim];
      } else {
        SafariBattle.Speed[anim] = autoSafariFastAnimationsState ? 0 : CACHED_ANIM_SPEEDS[anim];
      }
    }
    Safari.moveSpeed = autoSafariFastAnimationsState ? CACHED_MOVE_SPEED / 2 : CACHED_MOVE_SPEED;
    if (autoSafariState) {
      clearInterval(autoSafariProcessId);
      startAutoSafari();
    }
  }

  function toggleThrowBaits() {
    autoSafariThrowBaitsState = !autoSafariThrowBaitsState;
    const toggleButton = document.getElementById('auto-throw-baits-toggle');
    toggleButton.classList.toggle('btn-danger', !autoSafariThrowBaitsState);
    toggleButton.classList.toggle('btn-success', autoSafariThrowBaitsState);
    localStorage.setItem('autoSafariThrowBaitsState', autoSafariThrowBaitsState);
    document.getElementById('auto-throw-baits-toggle').innerHTML = `Auto Throw-baits [${autoSafariThrowBaitsState ? 'ON' : 'OFF'}]`;
  }
  function toggleCatchAll() {
    autoSafariCatchAllState = !autoSafariCatchAllState;
    const toggleButton = document.getElementById('auto-catch-all-toggle');
    toggleButton.classList.toggle('btn-danger', !autoSafariCatchAllState);
    toggleButton.classList.toggle('btn-success', autoSafariCatchAllState);
    localStorage.setItem('autoSafariCatchAllState', autoSafariCatchAllState);
    document.getElementById('auto-catch-all-toggle').innerHTML = `Auto Catch-all [${autoSafariCatchAllState ? 'ON' : 'OFF'}]`;
  }
}

function loadSetting(key, defaultVal) {
    var val;
    try {
        val = JSON.parse(localStorage.getItem(key));
        if (val == null || typeof val !== typeof defaultVal) {
            throw new Error;
        }
    } catch {
        val = defaultVal;
        localStorage.setItem(key, defaultVal);
    }
    return val;
}

function loadScript() {
  const oldInit = Preload.hideSplashScreen;
  var hasInitialized = false;

  Preload.hideSplashScreen = function (...args) {
    const result = oldInit.apply(this, args);
    if (App.game && !hasInitialized) {
      initAutoSafari();
      hasInitialized = true;
    }
    return result;
  };
}

if (!App.isUsingClient || localStorage.getItem(scriptName) === 'true') {
  loadScript();
}
