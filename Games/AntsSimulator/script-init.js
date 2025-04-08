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

// Initialize the final leaderboard
updateFinalLeaderboard();

// Preload ant images
function preloadImages() {
    // Create image elements for preloading
    const imageUrls = [
        './ant.png',
        './worker_ant.png',
        './soldier_ant.png',
        './smarty.png',
        './aggressive_smarty.png',
        './defensive_smarty.png',
        './obstacle.png'
    ];
    
    // Create a counter to track when all images are loaded
    let loadedImages = 0;
    
    // Create image elements and set onload handlers
    imageUrls.forEach(url => {
        const img = new Image();
        img.onload = function() {
            loadedImages++;
            // When all images are loaded, the game is ready to start
            if (loadedImages === imageUrls.length) {
                console.log("All ant images preloaded successfully");
                document.getElementById('startButton').disabled = false;
            }
        };
        
        img.onerror = function() {
            console.warn(`Failed to load image: ${url}`);
            loadedImages++;
            // Even if an image fails to load, we should still enable the start button
            if (loadedImages === imageUrls.length) {
                console.log("All ant images preloaded (some with fallbacks)");
                document.getElementById('startButton').disabled = false;
            }
        };
        
        // Set the source to trigger loading
        img.src = url;
    });
}

// Disable start button until images are loaded
document.getElementById('startButton').disabled = true;

// Initialize DegenSound with game sound effects
document.addEventListener('DOMContentLoaded', function() {
    // Check if DegenSound exists
    if (typeof DegenSound \!== 'undefined') {
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

// Preload ant images before the user starts the game
preloadImages();

// Start with canvas resized properly
resizeCanvas();

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
