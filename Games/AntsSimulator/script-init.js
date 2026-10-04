/**
 * AntsSimulator - Initialization script
 * This script handles the initialization of the Ants Simulator game.
 * It sets up the initial game state and prepares the UI.
 */

"use strict";

// Tutorial handling
document.addEventListener('DOMContentLoaded', function() {
    const tutorial = document.getElementById('tutorial');
    const closeTutorialBtn = document.getElementById('closeTutorial');
    
    // Show tutorial on load
    tutorial.style.display = 'flex';
    
    // Close tutorial when button is clicked
    closeTutorialBtn.addEventListener('click', function() {
        tutorial.style.display = 'none';
    });
});

// Zoom control buttons
document.getElementById('zoomIn').addEventListener('click', function() {
    panzoomInstance.zoomIn();
});

document.getElementById('zoomOut').addEventListener('click', function() {
    panzoomInstance.zoomOut();
});

document.getElementById('zoomReset').addEventListener('click', function() {
    panzoomInstance.reset();
});

// Day/Night toggle
const dayNightToggle = document.getElementById('dayNightToggle');
dayNightToggle.addEventListener('click', function() {
    const simulation = document.getElementById('simulation');
    const toggleText = dayNightToggle.querySelector('span');
    
    if (simulation.classList.contains('night-mode')) {
        simulation.classList.remove('night-mode');
        toggleText.textContent = 'DAY';
    } else {
        simulation.classList.add('night-mode');
        toggleText.textContent = 'NIGHT';
    }
});

// NOTE: the old code here called updateFinalLeaderboard() and resizeCanvas() at parse
// time, but both are defined in script.js, which is loaded *after* this file. That threw
// "updateFinalLeaderboard is not defined" and killed the rest of this script.
// It also ran a preloadImages() routine that waited on 7 local PNGs that do not exist in
// this repo, keeping the Start button disabled until every one of them 404'd.
// The ant sprites are now drawn procedurally in script.js, so there is nothing to preload.
// Everything that needs script.js is therefore deferred until the page has fully loaded.

// Initialize DegenSound with game sound effects
document.addEventListener('DOMContentLoaded', function() {
    // Check if DegenSound exists
    if (typeof DegenSound !== 'undefined') {
        DegenSound.init({
            groups: {
                'game': {
                    'collect': { url: '/sounds/collect.mp3', volume: 0.4 },
                    'powerUp': { url: '/sounds/power-up.mp3', volume: 0.4 },
                    'land': { url: '/sounds/land.mp3', volume: 0.4 },
                    'shoot': { url: '/sounds/shoot.mp3', volume: 0.3 },
                    'explosion': { url: '/sounds/explosion.mp3', volume: 0.4 }
                }
            }
        });
    } else {
        console.warn("DegenSound not available, sound effects will be disabled");
    }
});

// Enable the start button immediately: sprites are generated, not downloaded.
document.getElementById('startButton').disabled = false;

// Call apply theme function on load to ensure proper styling
document.addEventListener('DOMContentLoaded', function() {
    // Apply theme from degen-theme.js if available
    if (typeof applyTheme === 'function') {
        applyTheme('dark');
    }
    
    // Initialize ants when the start button is clicked
    document.getElementById('startButton').addEventListener('click', function() {
        console.log("Starting ant simulation...");
    });
});

// Now that every script (including script.js) has been parsed, it is safe to touch
// functions that live in the other file.
window.addEventListener('load', function() {
    if (typeof resizeCanvas === 'function') resizeCanvas();
    if (typeof updateFinalLeaderboard === 'function') updateFinalLeaderboard();
});
