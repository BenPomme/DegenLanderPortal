"use strict"; // Enable strict mode for better error handling

// Set TensorFlow backend for ML
tf.setBackend('webgl');

// Helper function to play sound safely
function playSound(id) {
    try {
        const audio = document.getElementById(id);
        if (audio) {
            audio.play();
        }
    } catch (err) {
        console.error("Error playing sound", id, err);
    }
}

// Get canvas and context
const canvas = document.getElementById("simulation");
const ctx = canvas.getContext("2d");

// Off-screen canvas for pheromone visualization
const pheromoneCanvas = document.createElement('canvas');
pheromoneCanvas.width = window.innerWidth - 400; // Adjusted later in resizeCanvas()
pheromoneCanvas.height = window.innerHeight;
const pheromoneCtx = pheromoneCanvas.getContext('2d');

// Global constants and variables
const antRadius = 3;
const workerAntRadius = 4;
const soldierAntRadius = 5;
const smartySize = 6;
const aggressiveSmartySize = 7;
const defensiveSmartySize = 6;
const superAntSize = 5;
const resourceSize = 5;
const MAX_ANTS = 500; // Limit total ants

let resources = 0;            // Available resources for powers
let collectedResources = 0;   // Resources collected by ants (for score)
const resourceDisplay = document.getElementById("collectedResources");
const antDisplay = document.getElementById("antCount");
const smartyDisplay = document.getElementById("smartyCount");
const smartyLifePointsDisplay = document.getElementById("smartyLifePoints");
const soldierLifePointsDisplay = document.getElementById("soldierLifePoints");
const superAntLifePointsDisplay = document.getElementById("superAntLifePoints");

const slowButton = document.getElementById("slowPower");
const wallButton = document.getElementById("placeWall");
const spawnSmartyButton = document.getElementById("spawnSmarty");
const restartButton = document.getElementById("restartSimulation");

const pauseButton = document.getElementById('pauseSimulation');
const resumeButton = document.getElementById('resumeSimulation');
const simulationSpeedSlider = document.getElementById('simulationSpeed');
let simulationSpeed = 1; // Default simulation speed

let isPlacingWall = false;
let isPaused = false;
let wallStartPoint = null; // For wall placement

let entities = [];
let permanentWalls = [];
let obstacles = [];
let resourceDrops = [];
let bullets = []; // For bullet objects
let animationFrame;

const antBase = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    size: 15
};

let smartyIdCounter = 1; // Counter for smarty IDs

// Booths (for attribute enhancements)
let booths = [];

// Leaderboards
const leaderboardList = document.getElementById('leaderboardList');
const finalLeaderboardList = document.getElementById('finalLeaderboardList');

// Timer
const timeElapsedDisplay = document.getElementById('timeElapsed');
let simulationStartTime;

// Charts
const resourceChartCtx = document.getElementById('resourceChart').getContext('2d');
const antChartCtx = document.getElementById('antChart').getContext('2d');
const pheromoneChartCtx = document.getElementById('pheromoneChart').getContext('2d');
const bulletChartCtx = document.getElementById('bulletChart').getContext('2d');
let resourceChart, antChart, pheromoneChart, bulletChart;

// Pheromone Map settings
const pheromoneMap = [];
const pheromoneDecay = 0.995;
const pheromoneIncrease = 1.0;
const pheromoneThreshold = 0.1;
const pheromoneResolution = 50; // Grid resolution for pheromones

// Final Score (computed at simulation end)
let finalScore = 0;

// Start button event listener
const startButton = document.getElementById('startButton');
startButton.addEventListener('click', () => {
    startButton.style.display = 'none';
    initializeEntities();
    simulationStartTime = Date.now();
    animate();
});

// Initialize pheromone map
for (let i = 0; i < pheromoneResolution; i++) {
    pheromoneMap[i] = [];
    for (let j = 0; j < pheromoneResolution; j++) {
        pheromoneMap[i][j] = 0;
    }
}

// Spatial Grid for optimization
class SpatialGrid {
    constructor(width, height, cellSize) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.grid = new Array(this.cols);
        for (let i = 0; i < this.cols; i++) {
            this.grid[i] = new Array(this.rows).fill(null).map(() => []);
        }
    }
    clear() {
        for (let i = 0; i < this.cols; i++) {
            for (let j = 0; j < this.rows; j++) {
                this.grid[i][j] = [];
            }
        }
    }
    addEntity(entity) {
        const col = Math.floor(entity.x / this.cellSize);
        const row = Math.floor(entity.y / this.cellSize);
        if (col >= 0 && col < this.cols && row >= 0 && row < this.rows) {
            this.grid[col][row].push(entity);
        }
    }
    getNearbyEntities(entity) {
        const col = Math.floor(entity.x / this.cellSize);
        const row = Math.floor(entity.y / this.cellSize);
        let nearby = [];
        for (let i = col - 1; i <= col + 1; i++) {
            for (let j = row - 1; j <= row + 1; j++) {
                if (i >= 0 && i < this.cols && j >= 0 && j < this.rows) {
                    nearby = nearby.concat(this.grid[i][j]);
                }
            }
        }
        return nearby;
    }
}
let spatialGrid = new SpatialGrid(window.innerWidth - 400, window.innerHeight, 100);

// Resize canvas and related elements
function resizeCanvas() {
    const simulationContainer = document.getElementById('simulationContainer');
    canvas.width = simulationContainer.clientWidth;
    canvas.height = simulationContainer.clientHeight;
    antBase.x = canvas.width / 2;
    antBase.y = canvas.height / 2;
    // Resize off-screen pheromone canvas
    pheromoneCanvas.width = canvas.width;
    pheromoneCanvas.height = canvas.height;
    // Initialize booth positions (for attribute upgrades)
    booths = [
        { x: 60, y: 60, attribute: 'size', color: '#6f42c1' },
        { x: canvas.width - 60, y: 60, attribute: 'speed', color: '#fd7e14' },
        { x: canvas.width / 2, y: canvas.height - 60, attribute: 'intelligence', color: '#28a745' }
    ];
    // Reinitialize pheromone map
    for (let i = 0; i < pheromoneResolution; i++) {
        for (let j = 0; j < pheromoneResolution; j++) {
            pheromoneMap[i][j] = 0;
        }
    }
    spatialGrid = new SpatialGrid(canvas.width, canvas.height, 100);
    // Resize charts if needed
    if (resourceChart) resourceChart.resize();
    if (antChart) antChart.resize();
    if (pheromoneChart) pheromoneChart.resize();
    if (bulletChart) bulletChart.resize();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Initialize Charts
function initializeCharts() {
    resourceChart = new Chart(resourceChartCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Resources Collected',
                data: [],
                borderColor: '#28a745',
                backgroundColor: 'rgba(40, 167, 69, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { display: false }, y: { beginAtZero: true } },
            plugins: { legend: { display: false } }
        }
    });
    antChart = new Chart(antChartCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Ants',
                data: [],
                borderColor: '#dc3545',
                backgroundColor: 'rgba(220,53,69,0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { display: false }, y: { beginAtZero: true, max: MAX_ANTS } },
            plugins: { legend: { display: false } }
        }
    });
    pheromoneChart = new Chart(pheromoneChartCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Average Pheromone Density',
                data: [],
                borderColor: '#ffc107',
                backgroundColor: 'rgba(255, 193, 7, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { display: false }, y: { beginAtZero: true, max: 100 } },
            plugins: { legend: { display: false } }
        }
    });
    bulletChart = new Chart(bulletChartCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Bullets in Air',
                data: [],
                borderColor: '#17a2b8',
                backgroundColor: 'rgba(23, 162, 184, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { display: false }, y: { beginAtZero: true, max: 1000 } },
            plugins: { legend: { display: false } }
        }
    });
}
initializeCharts();

// --------------------------
// Entity Classes and Methods (unchanged)
// --------------------------
class Entity {
    constructor(x, y, dx, dy, type = "ant") {
        this.x = x;
        this.y = y;
        this.dx = dx;
        this.dy = dy;
        this.type = type;
        this.size = type === "smarty" ? smartySize : (type === "superAnt" ? superAntSize : antRadius);
        this.baseSpeed = type === "smarty" ? 2.5 : (type === "superAnt" ? 3 : 2);
        this.speed = this.baseSpeed;
        if (this.type === "ant") { this.lifePoints = 3; }
        else if (this.type === "soldierAnt" || this.type === "superAnt") { this.lifePoints = 5; }
        this.state = "searching";
        this.hasResource = false;
        if (this.type === "smarty" || this.type === "aggressiveSmarty" || this.type === "defensiveSmarty") {
            this.detectionRadius = (this.type === "aggressiveSmarty") ? 200 : (this.type === "defensiveSmarty" ? 100 : 200);
            this.id = smartyIdCounter++;
            this.kills = 0;
            this.lifePoints = 10;
            this.attributes = { size: this.size, speed: this.speed, intelligence: this.detectionRadius };
            this.Q = {};
            this.alpha = 0.1;
            this.gamma = 0.9;
            this.epsilon = 0.1;
            this.lastState = null;
            this.lastAction = null;
            this.capturedAnt = false;
            this.hasCapturedAnt = false;
            this.targetBooth = null;
        }
        if (this.type === "superAnt") {
            this.speed = this.baseSpeed * 1.2;
            this.size = superAntSize;
            this.detectionRadius = 150;
            this.color = "#007bff";
            this.originalColor = this.color;
            this.Q = {};
            this.alpha = 0.1;
            this.gamma = 0.9;
            this.epsilon = 0.1;
            this.lastState = null;
            this.lastAction = null;
            this.stepCount = 0;
            this.prevCollectedResources = collectedResources;
            this.prevRedAntCount = this.getRedAntCount();
        }
    }
    draw() {
        if (this.type === "smarty") { ctx.drawImage(smartyImage, this.x - this.size, this.y - this.size, this.size * 2, this.size * 2); }
        else if (this.type === "ant" || this.type === "workerAnt" || this.type === "soldierAnt") { ctx.drawImage(antImage, this.x - this.size, this.y - this.size, this.size * 2, this.size * 2); }
        else if (this.type === "superAnt") {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
        if (this.type === "smarty" || this.type === "aggressiveSmarty" || this.type === "defensiveSmarty") {
            ctx.fillStyle = "#fff";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(this.id, this.x, this.y);
        }
        if (this.type === "smarty" || this.type === "aggressiveSmarty" || this.type === "defensiveSmarty") {
            ctx.strokeStyle = "#6c757d";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.detectionRadius, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (this.type === "superAnt") {
            ctx.strokeStyle = "#17a2b8";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.detectionRadius, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    update() {
        this.x += this.dx * this.speed;
        this.y += this.dy * this.speed;
        if (this.x - this.size < 0 || this.x + this.size > canvas.width) this.dx = -this.dx;
        if (this.y - this.size < 0 || this.y + this.size > canvas.height) this.dy = -this.dy;
        permanentWalls.forEach(wall => { if (wall.collidesWith(this)) { this.dx = -this.dx; this.dy = -this.dy; } });
        obstacles.forEach(obstacle => { if (obstacle.collidesWith(this)) { this.dx = -this.dx; this.dy = -this.dy; } });
        if (this.type === "ant" || this.type === "workerAnt" || this.type === "soldierAnt") {
            const pheromoneStrength = this.getPheromoneStrength();
            if (pheromoneStrength > 0) { this.adjustTrajectoryToward({x: this.x + this.dx * pheromoneStrength, y: this.y + this.dy * pheromoneStrength}, 0.05); }
        }
        const nearbyEntities = spatialGrid.getNearbyEntities(this);
        nearbyEntities.forEach(other => {
            if (other !== this) {
                const dist = this.distanceTo(other);
                if (dist < this.size + other.size) {
                    if (this.type === "smarty" && other.type === "smarty") {
                        const angle = Math.atan2(this.y - other.y, this.x - other.x);
                        this.dx = Math.cos(angle);
                        this.dy = Math.sin(angle);
                    }
                    if (this.type === "superAnt" && other.type === "smarty") {
                        const angle = Math.atan2(other.y - this.y, other.x - this.x);
                        other.dx = Math.cos(angle);
                        other.dy = Math.sin(angle);
                    }
                }
            }
        });
        if (this.type === "ant") {
            if (this.state === "searching") { this.searchForResources(); }
            else if (this.state === "returning") { this.returnToBase(); }
        } else if (this.type === "workerAnt" || this.type === "soldierAnt") { this.specialAntBehavior(); }
        else if (this.type === "smarty" || this.type === "aggressiveSmarty" || this.type === "defensiveSmarty") { this.smartyBehavior(); }
        else if (this.type === "superAnt") { this.superAntBehavior(); }
        this.normalizeVelocity();
    }
    distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y); }
    adjustTrajectoryToward(target, strength = 0.02) {
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.dx += Math.cos(angle) * strength;
        this.dy += Math.sin(angle) * strength;
    }
    adjustTrajectoryAwayFrom(target, strength = 0.02) {
        const angle = Math.atan2(this.y - target.y, this.x - target.x);
        this.dx += Math.cos(angle) * strength;
        this.dy += Math.sin(angle) * strength;
    }
    normalizeVelocity() {
        const magnitude = Math.hypot(this.dx, this.dy);
        if (magnitude > 0) { this.dx /= magnitude; this.dy /= magnitude; }
        else { this.dx = Math.random() - 0.5; this.dy = Math.random() - 0.5; this.normalizeVelocity(); }
    }
    searchForResources() {
        let nearestResource = null, minDist = Infinity;
        resourceDrops.forEach(resource => {
            const dist = this.distanceTo(resource);
            if (dist < minDist) { minDist = dist; nearestResource = resource; }
        });
        if (nearestResource && minDist < 200) {
            this.adjustTrajectoryToward(nearestResource, 0.05);
            if (minDist < this.size + resourceSize) {
                this.hasResource = true;
                this.state = "returning";
                resourceDrops.splice(resourceDrops.indexOf(nearestResource), 1);
                playSound('collectSound');
                this.depositPheromone();
            }
        }
        this.avoidSmarties();
        this.attractedBySuperAnt();
        this.followPheromones();
    }
    returnToBase() {
        this.adjustTrajectoryToward(antBase, 0.05);
        if (this.distanceTo(antBase) < this.size + antBase.size) {
            this.hasResource = false;
            this.state = "searching";
            collectedResources++;
            resources++;
            updateStats();
            playSound('collectSound');
            if (collectedResources % 10 === 0) { generateNewAnts(10); }
        }
        this.avoidSmarties();
        this.attractedBySuperAnt();
    }
    depositPheromone() {
        const gridX = Math.floor(this.x / (canvas.width / pheromoneResolution));
        const gridY = Math.floor(this.y / (canvas.height / pheromoneResolution));
        if (gridX >= 0 && gridX < pheromoneResolution && gridY >= 0 && gridY < pheromoneResolution) {
            pheromoneMap[gridX][gridY] += pheromoneIncrease;
        }
    }
    followPheromones() {
        const gridSizeX = canvas.width / pheromoneResolution;
        const gridSizeY = canvas.height / pheromoneResolution;
        const gridX = Math.floor(this.x / gridSizeX);
        const gridY = Math.floor(this.y / gridSizeY);
        let maxPheromone = 0, target = null;
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const nx = gridX + i, ny = gridY + j;
                if (nx >= 0 && nx < pheromoneResolution && ny >= 0 && ny < pheromoneResolution) {
                    if (pheromoneMap[nx][ny] > maxPheromone && pheromoneMap[nx][ny] > pheromoneThreshold) {
                        maxPheromone = pheromoneMap[nx][ny];
                        target = { x: nx * gridSizeX + gridSizeX / 2, y: ny * gridSizeY + gridSizeY / 2 };
                    }
                }
            }
        }
        if (target) { this.adjustTrajectoryToward(target, 0.02); }
    }
    avoidSmarties() {
        const smartiesArr = entities.filter(e => e.type === "smarty" || e.type === "aggressiveSmarty" || e.type === "defensiveSmarty");
        if (smartiesArr.length > 0) {
            const nearestSmarty = smartiesArr.reduce((nearest, smarty) => {
                return this.distanceTo(smarty) < this.distanceTo(nearest) ? smarty : nearest;
            }, smartiesArr[0]);
            if (this.distanceTo(nearestSmarty) < 100) { this.adjustTrajectoryAwayFrom(nearestSmarty, 0.05); }
        }
    }
    attractedBySuperAnt() {
        const superAnt = entities.find(e => e.type === "superAnt");
        if (superAnt && this.distanceTo(superAnt) < superAnt.detectionRadius) { this.adjustTrajectoryToward(superAnt, 0.05); }
    }
    specialAntBehavior() {
        if (this.type === "workerAnt") {
            if (this.state === "searching") { this.searchForResources(); }
            else if (this.state === "returning") { this.returnToBase(); }
        } else if (this.type === "soldierAnt") { this.defendBase(); }
    }
    defendBase() {
        const smartiesArr = entities.filter(e => e.type === "smarty" || e.type === "aggressiveSmarty" || e.type === "defensiveSmarty");
        if (smartiesArr.length > 0) {
            const nearestSmarty = smartiesArr.reduce((nearest, smarty) => {
                return this.distanceTo(smarty) < this.distanceTo(nearest) ? smarty : nearest;
            }, smartiesArr[0]);
            if (this.distanceTo(nearestSmarty) < this.detectionRadius) {
                this.adjustTrajectoryToward(nearestSmarty, 0.1);
                if (this.distanceTo(nearestSmarty) < this.size + nearestSmarty.size) {
                    const index = entities.indexOf(nearestSmarty);
                    if (index > -1) { entities.splice(index, 1); playSound('captureSound'); }
                }
            } else { this.patrolBase(); }
        } else { this.patrolBase(); }
    }
    patrolBase() {
        const angle = Date.now() / 1000;
        const patrolDistance = 100;
        const targetX = antBase.x + patrolDistance * Math.cos(angle);
        const targetY = antBase.y + patrolDistance * Math.sin(angle);
        this.adjustTrajectoryToward({ x: targetX, y: targetY }, 0.02);
    }
    superAntBehavior() {
        this.stepCount++;
        const state = this.getStateSuperAnt();
        const action = this.chooseActionSuperAnt(state);
        this.applyActionSuperAnt(action);
        if (this.lastState !== null && this.lastAction !== null) {
            const reward = this.getRewardSuperAnt();
            this.updateQTableSuperAnt(this.lastState, this.lastAction, reward, state);
        }
        this.lastState = state;
        this.lastAction = action;
    }
    getStateSuperAnt() {
        let resourceInfo = this.getNearestResourceInfo();
        let smartyInfo = this.getNearestSmartyInfo();
        let antGroupInfo = this.getNearestAntGroupInfo();
        return `${resourceInfo.direction}_${resourceInfo.distance}_${smartyInfo.direction}_${smartyInfo.distance}_${antGroupInfo.direction}_${antGroupInfo.distance}`;
    }
    chooseActionSuperAnt(state) {
        const actions = ['move_to_resource', 'move_to_ants', 'move_away_from_smartie'];
        if (Math.random() < this.epsilon || !this.Q[state]) {
            return actions[Math.floor(Math.random() * actions.length)];
        } else {
            const stateActions = this.Q[state];
            let maxQ = -Infinity, bestAction = actions[0];
            for (let action of actions) {
                const qValue = stateActions[action] || 0;
                if (qValue > maxQ) { maxQ = qValue; bestAction = action; }
            }
            return bestAction;
        }
    }
    applyActionSuperAnt(action) {
        if (action === 'move_to_resource') {
            const nearestResource = this.getNearestResource();
            if (nearestResource) { this.adjustTrajectoryToward(nearestResource, 0.1); }
        } else if (action === 'move_to_ants') {
            const antGroup = this.getNearestAntGroup();
            if (antGroup) { this.adjustTrajectoryToward(antGroup, 0.1); }
        } else if (action === 'move_away_from_smartie') {
            const nearestSmarty = this.getNearestSmarty();
            if (nearestSmarty) { this.adjustTrajectoryAwayFrom(nearestSmarty, 0.1); }
        }
        this.influenceRedAnts();
    }
    getRewardSuperAnt() {
        let reward = 0;
        if (collectedResources > this.prevCollectedResources) {
            reward += (collectedResources - this.prevCollectedResources) * 10;
        }
        const redAntsLost = this.prevRedAntCount - this.getRedAntCount();
        if (redAntsLost > 0) { reward -= redAntsLost * 20; }
        this.prevCollectedResources = collectedResources;
        this.prevRedAntCount = this.getRedAntCount();
        return reward;
    }
    updateQTableSuperAnt(prevState, action, reward, nextState) {
        if (!this.Q[prevState]) { this.Q[prevState] = {}; }
        if (!this.Q[prevState][action]) { this.Q[prevState][action] = 0; }
        const actions = Object.keys(this.Q[nextState] || {});
        let maxQNext = 0;
        if (actions.length > 0) { maxQNext = Math.max(...actions.map(a => this.Q[nextState][a] || 0)); }
        this.Q[prevState][action] += this.alpha * (reward + this.gamma * maxQNext - this.Q[prevState][action]);
    }
    smartyBehavior() {
        const state = this.getStateSmarty();
        const action = this.chooseActionSmarty(state);
        this.applyActionSmarty(action);
        if (this.lastState !== null && this.lastAction !== null) {
            const reward = this.getRewardSmarty();
            this.updateQTableSmarty(this.lastState, this.lastAction, reward, state);
        }
        this.lastState = state;
        this.lastAction = action;
    }
    getStateSmarty() {
        const nearestAnt = this.getNearestAnt();
        let antDirection = 0, antDistance = 5;
        if (nearestAnt) {
            const dx = nearestAnt.x - this.x;
            const dy = nearestAnt.y - this.y;
            const angle = Math.atan2(dy, dx);
            antDirection = Math.round(((angle + Math.PI) / (2 * Math.PI)) * 8) % 8;
            antDistance = Math.min(Math.floor(this.distanceTo(nearestAnt) / 100), 5);
        }
        return `${antDirection}_${antDistance}_${this.hasCapturedAnt ? 1 : 0}`;
    }
    chooseActionSmarty(state) {
        const actions = this.hasCapturedAnt ? ['go_to_booth'] : ['wander', 'chase_ant'];
        if (Math.random() < this.epsilon || !this.Q[state]) {
            return actions[Math.floor(Math.random() * actions.length)];
        } else {
            const stateActions = this.Q[state];
            let maxQ = -Infinity, bestAction = actions[0];
            for (let action of actions) {
                const qValue = stateActions[action] || 0;
                if (qValue > maxQ) { maxQ = qValue; bestAction = action; }
            }
            return bestAction;
        }
    }
    applyActionSmarty(action) {
        if (this.hasCapturedAnt) {
            if (action === 'go_to_booth') {
                if (!this.targetBooth) {
                    const randomBooth = booths[Math.floor(Math.random() * booths.length)];
                    this.targetBooth = randomBooth;
                }
                if (this.targetBooth) {
                    this.adjustTrajectoryToward(this.targetBooth, 0.1);
                    if (this.distanceTo(this.targetBooth) < this.size + 10) {
                        this.enhanceAttribute(this.targetBooth.attribute);
                        this.hasCapturedAnt = false;
                        this.targetBooth = null;
                        this.attributes.size = this.size;
                        this.attributes.speed = this.speed;
                        this.attributes.intelligence = this.detectionRadius;
                        playSound('collectSound');
                    }
                }
            }
        } else {
            if (action === 'chase_ant') {
                const nearestAnt = this.getNearestAnt();
                if (nearestAnt) { this.adjustTrajectoryToward(nearestAnt, 0.05); }
            } else if (action === 'wander') {
                this.dx += (Math.random() - 0.5) * 0.1;
                this.dy += (Math.random() - 0.5) * 0.1;
            }
        }
    }
    getRewardSmarty() {
        let reward = 0;
        if (this.capturedAnt) {
            reward += 10;
            this.capturedAnt = false;
            playSound('captureSound');
            this.collectLifePoints();
        }
        if (!this.hasCapturedAnt) {
            const nearestAnt = this.getNearestAnt();
            if (nearestAnt) {
                const distance = this.distanceTo(nearestAnt);
                reward -= distance * 0.005;
            } else { reward -= 1; }
        }
        const highestScore = Math.max(...entities.filter(e => e.type === 'smarty' || e.type === 'aggressiveSmarty' || e.type === 'defensiveSmarty').map(e => e.kills));
        if (this.kills >= highestScore) { reward += 5; }
        return reward;
    }
    updateQTableSmarty(prevState, action, reward, nextState) {
        if (!this.Q[prevState]) { this.Q[prevState] = {}; }
        if (!this.Q[prevState][action]) { this.Q[prevState][action] = 0; }
        const actions = Object.keys(this.Q[nextState] || {});
        let maxQNext = 0;
        if (actions.length > 0) { maxQNext = Math.max(...actions.map(a => this.Q[nextState][a] || 0)); }
        this.Q[prevState][action] += this.alpha * (reward + this.gamma * maxQNext - this.Q[prevState][action]);
    }
    collectLifePoints() {
        this.lifePoints += 2;
        updateStats();
    }
    getNearestAnt() {
        const antsArr = entities.filter(e => e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt");
        if (antsArr.length > 0) {
            return antsArr.reduce((nearest, ant) => {
                return this.distanceTo(ant) < this.distanceTo(nearest) ? ant : nearest;
            }, antsArr[0]);
        }
        return null;
    }
    enhanceAttribute(attribute) {
        if (attribute === 'size') { this.size *= 1.1; }
        else if (attribute === 'speed') { this.speed *= 1.1; }
        else if (attribute === 'intelligence') { this.detectionRadius *= 1.1; }
    }
    getNearestResource() {
        let nearestResource = null, minDist = Infinity;
        resourceDrops.forEach(resource => {
            const dist = this.distanceTo(resource);
            if (dist < minDist) { minDist = dist; nearestResource = resource; }
        });
        return nearestResource;
    }
    getNearestResourceInfo() {
        const nearestResource = this.getNearestResource();
        if (nearestResource) {
            const dx = nearestResource.x - this.x;
            const dy = nearestResource.y - this.y;
            const angle = Math.atan2(dy, dx);
            const direction = Math.round(((angle + Math.PI) / (2 * Math.PI)) * 8) % 8;
            const distance = Math.min(Math.floor(this.distanceTo(nearestResource) / 100), 5);
            return { direction, distance };
        }
        return { direction: 0, distance: 5 };
    }
    getNearestSmartyInfo() {
        const nearestSmarty = this.getNearestSmarty();
        if (nearestSmarty) {
            const dx = nearestSmarty.x - this.x;
            const dy = nearestSmarty.y - this.y;
            const angle = Math.atan2(dy, dx);
            const direction = Math.round(((angle + Math.PI) / (2 * Math.PI)) * 8) % 8;
            const distance = Math.min(Math.floor(this.distanceTo(nearestSmarty) / 100), 5);
            return { direction, distance };
        }
        return { direction: 0, distance: 5 };
    }
    getNearestAntGroup() {
        const redAnts = entities.filter(e => e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt");
        if (redAnts.length > 0) {
            let centerX = 0, centerY = 0;
            redAnts.forEach(ant => { centerX += ant.x; centerY += ant.y; });
            centerX /= redAnts.length;
            centerY /= redAnts.length;
            return { x: centerX, y: centerY };
        }
        return null;
    }
    getNearestAntGroupInfo() {
        const antGroup = this.getNearestAntGroup();
        if (antGroup) {
            const dx = antGroup.x - this.x;
            const dy = antGroup.y - this.y;
            const angle = Math.atan2(dy, dx);
            const direction = Math.round(((angle + Math.PI) / (2 * Math.PI)) * 8) % 8;
            const distance = Math.min(Math.floor(this.distanceTo(antGroup) / 100), 5);
            return { direction, distance };
        }
        return { direction: 0, distance: 5 };
    }
    influenceRedAnts() {
        const nearbyAnts = entities.filter(e => (e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt") && this.distanceTo(e) < this.detectionRadius);
        nearbyAnts.forEach(ant => { if (ant.state === "searching") { ant.adjustTrajectoryToward(this, 0.05); } });
    }
    getRedAntCount() {
        return entities.filter(e => e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt").length;
    }
    getNearestSmarty() {
        const smartiesArr = entities.filter(e => e.type === "smarty" || e.type === "aggressiveSmarty" || e.type === "defensiveSmarty");
        if (smartiesArr.length > 0) {
            return smartiesArr.reduce((nearest, smarty) => {
                return this.distanceTo(smarty) < this.distanceTo(nearest) ? smarty : nearest;
            }, smartiesArr[0]);
        }
        return null;
    }
    getPheromoneStrength() {
        const gridSizeX = canvas.width / pheromoneResolution;
        const gridSizeY = canvas.height / pheromoneResolution;
        const gridX = Math.floor(this.x / gridSizeX);
        const gridY = Math.floor(this.y / gridSizeY);
        if (gridX >= 0 && gridX < pheromoneResolution && gridY >= 0 && gridY < pheromoneResolution) {
            return pheromoneMap[gridX][gridY];
        }
        return 0;
    }
}

class WorkerAnt extends Entity {
    constructor(x, y, dx, dy) {
        super(x, y, dx, dy, "workerAnt");
        this.size = workerAntRadius;
        this.speed = this.baseSpeed * 1.2;
        this.lifePoints = 5;
    }
    draw() { ctx.drawImage(workerAntImage, this.x - this.size, this.y - this.size, this.size * 2, this.size * 2); }
    update() { super.update(); }
}

class SoldierAnt extends Entity {
    constructor(x, y, dx, dy) {
        super(x, y, dx, dy, "soldierAnt");
        this.size = soldierAntRadius;
        this.speed = this.baseSpeed * 1.5;
        this.lifePoints = 5;
    }
    draw() { ctx.drawImage(soldierAntImage, this.x - this.size, this.y - this.size, this.size * 2, this.size * 2); }
    update() { super.update(); this.defendBase(); }
    defendBase() {
        const smartiesArr = entities.filter(e => e.type === "smarty" || e.type === "aggressiveSmarty" || e.type === "defensiveSmarty");
        if (smartiesArr.length > 0) {
            const nearestSmarty = smartiesArr.reduce((nearest, smarty) => {
                return this.distanceTo(smarty) < this.distanceTo(nearest) ? smarty : nearest;
            }, smartiesArr[0]);
            if (this.distanceTo(nearestSmarty) < this.detectionRadius) {
                this.adjustTrajectoryToward(nearestSmarty, 0.1);
                if (this.distanceTo(nearestSmarty) < this.size + nearestSmarty.size) {
                    const index = entities.indexOf(nearestSmarty);
                    if (index > -1) { entities.splice(index, 1); playSound('captureSound'); }
                }
            } else { this.patrolBase(); }
        } else { this.patrolBase(); }
    }
    patrolBase() {
        const angle = Date.now() / 1000;
        const patrolDistance = 100;
        const targetX = antBase.x + patrolDistance * Math.cos(angle);
        const targetY = antBase.y + patrolDistance * Math.sin(angle);
        this.adjustTrajectoryToward({ x: targetX, y: targetY }, 0.02);
    }
}

class AggressiveSmarty extends Entity {
    constructor(x, y, dx, dy) {
        super(x, y, dx, dy, "aggressiveSmarty");
        this.size = aggressiveSmartySize;
        this.speed = this.baseSpeed * 1.2;
    }
    draw() {
        ctx.drawImage(aggressiveSmartyImage, this.x - this.size, this.y - this.size, this.size * 2, this.size * 2);
        ctx.fillStyle = "#fff";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.id, this.x, this.y);
    }
    update() { super.update(); this.chaseAnts(); }
    chaseAnts() {
        const antsArr = entities.filter(e => e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt");
        if (antsArr.length > 0) {
            const nearestAnt = antsArr.reduce((nearest, ant) => {
                return this.distanceTo(ant) < this.distanceTo(nearest) ? ant : nearest;
            }, antsArr[0]);
            if (this.distanceTo(nearestAnt) < this.detectionRadius) { this.adjustTrajectoryToward(nearestAnt, 0.05); }
        }
    }
}

class DefensiveSmarty extends Entity {
    constructor(x, y, dx, dy) {
        super(x, y, dx, dy, "defensiveSmarty");
        this.size = defensiveSmartySize;
        this.speed = this.baseSpeed * 0.8;
        this.defenseRadius = 100;
    }
    draw() {
        ctx.drawImage(defensiveSmartyImage, this.x - this.size, this.y - this.size, this.size * 2, this.size * 2);
        ctx.fillStyle = "#fff";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.id, this.x, this.y);
        ctx.strokeStyle = "#4caf50";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.defenseRadius, 0, Math.PI * 2);
        ctx.stroke();
    }
    update() { super.update(); this.repelAnts(); }
    repelAnts() {
        const antsArr = entities.filter(e => e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt");
        antsArr.forEach(ant => { if (this.distanceTo(ant) < this.defenseRadius) { this.adjustTrajectoryAwayFrom(ant, 0.05); } });
    }
}

class PermanentWall {
    constructor(x1, y1, x2, y2) { this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2; }
    draw() {
        ctx.strokeStyle = "#0f0";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.x1, this.y1);
        ctx.lineTo(this.x2, this.y2);
        ctx.stroke();
    }
    collidesWith(entity) {
        const distToLine =
            Math.abs((this.y2 - this.y1) * entity.x - (this.x2 - this.x1) * entity.y + this.x2 * this.y1 - this.y2 * this.x1) /
            Math.hypot(this.y2 - this.y1, this.x2 - this.x1);
        return distToLine < entity.size;
    }
}

class Obstacle {
    constructor(x, y, radius) { this.x = x; this.y = y; this.radius = radius; }
    draw() { ctx.drawImage(obstacleImage, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2); }
    collidesWith(entity) {
        const dist = Math.hypot(this.x - entity.x, this.y - entity.y);
        return dist < this.radius + entity.size;
    }
}

class Bullet {
    constructor(x, y, dx, dy, owner) { this.x = x; this.y = y; this.dx = dx; this.dy = dy; this.size = 4; this.speed = 5; this.owner = owner; }
    draw() {
        ctx.fillStyle = "#ff0000";
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
    update() { this.x += this.dx * this.speed; this.y += this.dy * this.speed; }
    isOutOfBounds() { return this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height; }
    distanceTo(entity) { return Math.hypot(this.x - entity.x, this.y - entity.y); }
}

// Load Images using verified working placeholder URLs
const antImage = new Image(); 
antImage.src = 'https://via.placeholder.com/50/00ff00/000000?text=Ant';
const workerAntImage = new Image(); 
workerAntImage.src = 'https://via.placeholder.com/50/ff00ff/000000?text=Worker+Ant';
const soldierAntImage = new Image(); 
soldierAntImage.src = 'https://via.placeholder.com/50/ff0000/000000?text=Soldier+Ant';
const smartyImage = new Image(); 
smartyImage.src = 'https://via.placeholder.com/50/0000ff/ffffff?text=Smarty';
const aggressiveSmartyImage = new Image(); 
aggressiveSmartyImage.src = 'https://via.placeholder.com/50/ffa500/000000?text=Agg+Smarty';
const defensiveSmartyImage = new Image(); 
defensiveSmartyImage.src = 'https://via.placeholder.com/50/00ffff/000000?text=Def+Smarty';
const obstacleImage = new Image(); 
obstacleImage.src = 'https://via.placeholder.com/50/cccccc/000000?text=Obs';

// Initialize Entities, Obstacles, Resources
function initializeEntities() {
    entities = []; permanentWalls = []; obstacles = []; resourceDrops = []; bullets = [];
    collectedResources = 0; resources = 0; smartyIdCounter = 1;
    updateStats(); resetCharts();
    generateNewAnts(20);
    for (let i = 0; i < 5; i++) { entities.push(new WorkerAnt(antBase.x, antBase.y, Math.random() - 0.5, Math.random() - 0.5)); }
    for (let i = 0; i < 3; i++) { entities.push(new SoldierAnt(antBase.x, antBase.y, Math.random() - 0.5, Math.random() - 0.5)); }
    for (let i = 0; i < 7; i++) {
        const smartyType = Math.random() < 0.5 ? "smarty" : (Math.random() < 0.5 ? "aggressiveSmarty" : "defensiveSmarty");
        let x, y;
        if (Math.random() < 0.5) { x = Math.random() * canvas.width; y = Math.random() < 0.5 ? 0 : canvas.height; }
        else { x = Math.random() < 0.5 ? 0 : canvas.width; y = Math.random() * canvas.height; }
        if (smartyType === "aggressiveSmarty") { entities.push(new AggressiveSmarty(x, y, Math.random() - 0.5, Math.random() - 0.5)); }
        else if (smartyType === "defensiveSmarty") { entities.push(new DefensiveSmarty(x, y, Math.random() - 0.5, Math.random() - 0.5)); }
        else { entities.push(new Entity(x, y, Math.random() - 0.5, Math.random() - 0.5, "smarty")); }
    }
    entities.push(new Entity(antBase.x, antBase.y, 0, 0, "superAnt"));
    generateObstacles();
    generateResources();
}
function generateObstacles() {
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * canvas.width, y = Math.random() * canvas.height, radius = Math.random() * 20 + 10;
        obstacles.push(new Obstacle(x, y, radius));
    }
}
function generateResources() {
    for (let i = 0; i < 25; i++) {
        resourceDrops.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: resourceSize,
            amount: Math.floor(Math.random() * 3) + 1,
            creationTime: Date.now(),
            lifetime: 30000
        });
    }
}
function generateNewAnts(number) {
    const currentAntCount = entities.filter(e => e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt").length;
    const antsToAdd = Math.min(number, MAX_ANTS - currentAntCount);
    for (let i = 0; i < antsToAdd; i++) {
        const antTypeRand = Math.random();
        if (antTypeRand < 0.7) { entities.push(new Entity(antBase.x, antBase.y, Math.random() - 0.5, Math.random() - 0.5, "ant")); }
        else if (antTypeRand < 0.85) { entities.push(new WorkerAnt(antBase.x, antBase.y, Math.random() - 0.5, Math.random() - 0.5)); }
        else { entities.push(new SoldierAnt(antBase.x, antBase.y, Math.random() - 0.5, Math.random() - 0.5)); }
    }
}
function updateStats() {
    const antCount = entities.filter(e => e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt").length;
    const smartyCount = entities.filter(e => e.type === "smarty" || e.type === "aggressiveSmarty" || e.type === "defensiveSmarty").length;
    antDisplay.textContent = antCount;
    smartyDisplay.textContent = smartyCount;
    resourceDisplay.textContent = collectedResources;
    const smartiesArr = entities.filter(e => e.type === "smarty" || e.type === "aggressiveSmarty" || e.type === "defensiveSmarty");
    let totalSmartyLifePoints = smartiesArr.reduce((sum, smarty) => sum + smarty.lifePoints, 0);
    smartyLifePointsDisplay.textContent = totalSmartyLifePoints;
    const soldiers = entities.filter(e => e.type === "soldierAnt");
    let totalSoldierLifePoints = soldiers.reduce((sum, soldier) => sum + soldier.lifePoints, 0);
    soldierLifePointsDisplay.textContent = totalSoldierLifePoints;
    const superAnts = entities.filter(e => e.type === "superAnt");
    let totalSuperAntLifePoints = superAnts.reduce((sum, superAnt) => sum + superAnt.lifePoints, 0);
    superAntLifePointsDisplay.textContent = totalSuperAntLifePoints;
    updateSmartyStats();
    updateLeaderboard();
    const elapsedSeconds = Math.floor((Date.now() - simulationStartTime) / 1000);
    timeElapsedDisplay.textContent = elapsedSeconds;
    updateCharts(elapsedSeconds, collectedResources, antCount, bullets.length);
}
function updateSmartyStats() {
    const smartyStatsDiv = document.getElementById('smartyStats');
    smartyStatsDiv.innerHTML = '';
    const smartiesArr = entities.filter(e => e.type === 'smarty' || e.type === 'aggressiveSmarty' || e.type === 'defensiveSmarty');
    smartiesArr.forEach(smarty => {
        const statDiv = document.createElement('div');
        statDiv.className = 'smartyStat';
        statDiv.innerHTML = `
            <strong>${smarty.type === 'smarty' ? 'Smarty' : smarty.type === 'aggressiveSmarty' ? 'Aggressive Smarty' : 'Defensive Smarty'} ${smarty.id}</strong><br>
            Size: ${smarty.size.toFixed(2)}<br>
            Speed: ${smarty.speed.toFixed(2)}<br>
            Intelligence: ${smarty.detectionRadius.toFixed(2)}<br>
            Ants Captured: ${smarty.kills}<br>
            Life Points: ${smarty.lifePoints}
        `;
        smartyStatsDiv.appendChild(statDiv);
    });
}
function updateLeaderboard() {
    const smartiesArr = entities.filter(e => e.type === 'smarty' || e.type === 'aggressiveSmarty' || e.type === 'defensiveSmarty');
    smartiesArr.sort((a, b) => b.kills - a.kills);
    leaderboardList.innerHTML = '';
    smartiesArr.forEach(smarty => {
        const li = document.createElement('li');
        li.textContent = `${smarty.type === 'smarty' ? 'Smarty' : smarty.type === 'aggressiveSmarty' ? 'Aggressive Smarty' : 'Defensive Smarty'} ${smarty.id}: ${smarty.kills} ants`;
        leaderboardList.appendChild(li);
    });
}
// Final Score Leaderboard Functions
function submitScore(name, score) {
    let finalScores = JSON.parse(localStorage.getItem('finalScoreLeaderboard') || '[]');
    finalScores.push({ name, score });
    finalScores.sort((a, b) => b.score - a.score);
    localStorage.setItem('finalScoreLeaderboard', JSON.stringify(finalScores));
    updateFinalLeaderboard();
}
function updateFinalLeaderboard() {
    let finalScores = JSON.parse(localStorage.getItem('finalScoreLeaderboard') || '[]');
    finalLeaderboardList.innerHTML = '';
    finalScores.forEach(entry => {
        const li = document.createElement('li');
        li.textContent = `${entry.name}: ${entry.score}`;
        finalLeaderboardList.appendChild(li);
    });
}
// Charts Functions
function resetCharts() {
    resourceChart.data.labels = [];
    resourceChart.data.datasets[0].data = [];
    resourceChart.update();
    antChart.data.labels = [];
    antChart.data.datasets[0].data = [];
    antChart.update();
    pheromoneChart.data.labels = [];
    pheromoneChart.data.datasets[0].data = [];
    pheromoneChart.update();
    bulletChart.data.labels = [];
    bulletChart.data.datasets[0].data = [];
    bulletChart.update();
}
function updateCharts(elapsed, resourcesCollected, antsCount, bulletsInAir) {
    resourceChart.data.labels.push(elapsed);
    resourceChart.data.datasets[0].data.push(resourcesCollected);
    if (resourceChart.data.labels.length > 20) {
        resourceChart.data.labels.shift();
        resourceChart.data.datasets[0].data.shift();
    }
    resourceChart.update();
    antChart.data.labels.push(elapsed);
    antChart.data.datasets[0].data.push(antsCount);
    if (antChart.data.labels.length > 20) {
        antChart.data.labels.shift();
        antChart.data.datasets[0].data.shift();
    }
    antChart.update();
    let totalPheromone = 0;
    for (let i = 0; i < pheromoneResolution; i++) {
        for (let j = 0; j < pheromoneResolution; j++) {
            totalPheromone += pheromoneMap[i][j];
        }
    }
    const avgPheromone = (totalPheromone / (pheromoneResolution * pheromoneResolution)).toFixed(2);
    pheromoneChart.data.labels.push(elapsed);
    pheromoneChart.data.datasets[0].data.push(avgPheromone);
    if (pheromoneChart.data.labels.length > 20) {
        pheromoneChart.data.labels.shift();
        pheromoneChart.data.datasets[0].data.shift();
    }
    pheromoneChart.update();
    bulletChart.data.labels.push(elapsed);
    bulletChart.data.datasets[0].data.push(bulletsInAir);
    if (bulletChart.data.labels.length > 20) {
        bulletChart.data.labels.shift();
        bulletChart.data.datasets[0].data.shift();
    }
    bulletChart.update();
}
// Panzoom initialization
const panzoomInstance = Panzoom(canvas, { maxScale: 3, minScale: 0.5, contain: 'outside' });
canvas.parentElement.addEventListener('wheel', panzoomInstance.zoomWithWheel);
// End Summary Modal and Score Submission
function displayEndSummary() {
    cancelAnimationFrame(animationFrame);
    const endSummaryDiv = document.getElementById('endSummary');
    const summaryContentDiv = document.getElementById('summaryContent');
    const elapsedSeconds = Math.floor((Date.now() - simulationStartTime) / 1000);
    const remainingAnts = entities.filter(e => e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt").length;
    finalScore = collectedResources + (remainingAnts * 10) + elapsedSeconds;
    summaryContentDiv.innerHTML = `
        <p>Your Score: ${finalScore}</p>
        <p>Collected Resources: ${collectedResources}</p>
        <p>Remaining Ants: ${remainingAnts}</p>
        <p>Time Elapsed: ${elapsedSeconds} seconds</p>
        <p>${remainingAnts > 0 ? "You survived! Fuck yeah!" : "Game over, you degen!"}</p>
    `;
    document.getElementById('scoreSubmission').style.display = 'block';
    endSummaryDiv.style.display = 'flex';
    document.getElementById('submitScore').addEventListener('click', () => {
        const playerName = document.getElementById('playerName').value.trim();
        if (playerName) { submitScore(playerName, finalScore); endSummaryDiv.style.display = 'none'; }
        else { alert("Enter your name, you degenerate!"); }
    });
}
document.getElementById('closeSummary').addEventListener('click', () => {
    document.getElementById('endSummary').style.display = 'none';
});
// Bullet shooting functionality for smarties
function shootBullet(smarty) {
    const antsArr = entities.filter(e => e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt");
    if (antsArr.length === 0) return;
    const nearestAnt = antsArr.reduce((nearest, ant) => {
        return smarty.distanceTo(ant) < smarty.distanceTo(nearest) ? ant : nearest;
    }, antsArr[0]);
    const dx = nearestAnt.x - smarty.x;
    const dy = nearestAnt.y - smarty.y;
    const angle = Math.atan2(dy, dx);
    const bullet = new Bullet(smarty.x, smarty.y, Math.cos(angle), Math.sin(angle), smarty);
    bullets.push(bullet);
    playSound('shootSound');
}
// Function to spawn a new smarty
function spawnNewSmarty() {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const dx = Math.random() - 0.5;
    const dy = Math.random() - 0.5;
    const smartyTypeRand = Math.random();
    let smarty;
    if (smartyTypeRand < 0.33) { smarty = new Entity(x, y, dx, dy, "smarty"); }
    else if (smartyTypeRand < 0.66) { smarty = new AggressiveSmarty(x, y, dx, dy); }
    else { smarty = new DefensiveSmarty(x, y, dx, dy); }
    entities.push(smarty);
}
// Animation Loop
function animate() {
    if (isPaused) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pheromoneResolution; i++) {
        for (let j = 0; j < pheromoneResolution; j++) {
            pheromoneMap[i][j] *= pheromoneDecay;
            if (pheromoneMap[i][j] < 0.01) { pheromoneMap[i][j] = 0; }
        }
    }
    drawPheromones();
    const baseGradient = ctx.createRadialGradient(antBase.x, antBase.y, antBase.size, antBase.x, antBase.y, antBase.size + 20);
    baseGradient.addColorStop(0, "#6c757d");
    baseGradient.addColorStop(1, "#343a40");
    ctx.fillStyle = baseGradient;
    ctx.beginPath();
    ctx.arc(antBase.x, antBase.y, antBase.size + 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6c757d";
    ctx.beginPath();
    ctx.arc(antBase.x, antBase.y, antBase.size, 0, Math.PI * 2);
    ctx.fill();
    booths.forEach(booth => {
        ctx.fillStyle = booth.color;
        ctx.beginPath();
        ctx.arc(booth.x, booth.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(booth.attribute.charAt(0).toUpperCase(), booth.x, booth.y + 1);
    });
    for (let index = resourceDrops.length - 1; index >= 0; index--) {
        const resource = resourceDrops[index];
        if (Date.now() - resource.creationTime > resource.lifetime) { resourceDrops.splice(index, 1); continue; }
        const pulse = Math.sin(Date.now() / 200) * 2;
        ctx.fillStyle = "#28a745";
        ctx.beginPath();
        ctx.arc(resource.x, resource.y, resource.size + pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "10px Arial";
        const timeLeft = Math.ceil((resource.lifetime - (Date.now() - resource.creationTime)) / 1000);
        ctx.fillText(timeLeft, resource.x, resource.y + 4);
    }
    if (resourceDrops.length < 15) { generateResources(); }
    obstacles.forEach(obstacle => obstacle.draw());
    permanentWalls.forEach(wall => wall.draw());
    handleSmartiesShooting();
    spatialGrid.clear();
    entities.forEach(entity => spatialGrid.addEntity(entity));
    for (let index = entities.length - 1; index >= 0; index--) {
        const entity = entities[index];
        entity.update();
        entity.draw();
    }
    for (let index = bullets.length - 1; index >= 0; index--) {
        const bullet = bullets[index];
        bullet.update();
        bullet.draw();
        const antsArr = entities.filter(e => e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt");
        antsArr.forEach(ant => {
            if (bullet.distanceTo(ant) < bullet.size + ant.size) {
                ant.lifePoints -= 1;
                playSound('hitSound');
                bullets.splice(index, 1);
                if (ant.lifePoints <= 0) {
                    const antIndex = entities.indexOf(ant);
                    if (antIndex > -1) { entities.splice(antIndex, 1); collectedResources += 1; updateStats(); playSound('captureSound'); }
                }
            }
        });
        if (bullet.isOutOfBounds()) { bullets.splice(index, 1); }
    }
    let antsToRemove = [];
    entities.forEach(entity => {
        if (entity.type === "smarty" || entity.type === "aggressiveSmarty" || entity.type === "defensiveSmarty") {
            const nearbyEntities = spatialGrid.getNearbyEntities(entity);
            nearbyEntities.forEach(otherEntity => {
                if (otherEntity.type === "ant" || otherEntity.type === "workerAnt" || otherEntity.type === "soldierAnt") {
                    if (entity.distanceTo(otherEntity) < entity.size + otherEntity.size) {
                        if (!antsToRemove.includes(otherEntity)) {
                            antsToRemove.push(otherEntity);
                            entity.kills++;
                            entity.capturedAnt = true;
                            entity.hasCapturedAnt = true;
                            entity.collectLifePoints();
                        }
                    }
                }
            });
        }
    });
    antsToRemove.forEach(ant => {
        const index = entities.indexOf(ant);
        if (index > -1) { entities.splice(index, 1); }
    });
    const antsRemaining = entities.some(e => e.type === "ant" || e.type === "workerAnt" || e.type === "soldierAnt");
    if (!antsRemaining) {
        cancelAnimationFrame(animationFrame);
        displayEndSummary();
        return;
    }
    updateStats();
    setTimeout(() => { animationFrame = requestAnimationFrame(animate); }, 1000 / (60 * simulationSpeed));
}
// Draw pheromones onto the main canvas
function drawPheromones() {
    pheromoneCtx.clearRect(0, 0, pheromoneCanvas.width, pheromoneCanvas.height);
    for (let i = 0; i < pheromoneResolution; i++) {
        for (let j = 0; j < pheromoneResolution; j++) {
            const pheromoneLevel = pheromoneMap[i][j];
            if (pheromoneLevel > pheromoneThreshold) {
                const x = i * (canvas.width / pheromoneResolution) + (canvas.width / pheromoneResolution) / 2;
                const y = j * (canvas.height / pheromoneResolution) + (canvas.height / pheromoneResolution) / 2;
                const radius = 10;
                pheromoneCtx.beginPath();
                pheromoneCtx.arc(x, y, radius, 0, Math.PI * 2);
                pheromoneCtx.fillStyle = `rgba(40, 167, 69, ${pheromoneLevel / 100})`;
                pheromoneCtx.fill();
            }
        }
    }
    ctx.drawImage(pheromoneCanvas, 0, 0);
}
function handleSmartiesShooting() {
    entities.forEach(entity => {
        if (entity.type === "smarty" || entity.type === "aggressiveSmarty" || entity.type === "defensiveSmarty") {
            if (!entity.lastShotTime) { entity.lastShotTime = Date.now(); }
            if (Date.now() - entity.lastShotTime > 2000) {
                shootBullet(entity);
                entity.lastShotTime = Date.now();
            }
        }
    });
}
// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() === 'input') return;
    switch(e.key.toLowerCase()) {
        case 's': slowButton.click(); break;
        case 'w': wallButton.click(); break;
        case 'r': restartButton.click(); break;
        case 'p':
            if (!isPaused) { pauseButton.click(); }
            else { resumeButton.click(); }
            break;
        default: break;
    }
});
canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (isPlacingWall) {
        if (!wallStartPoint) { wallStartPoint = { x, y }; }
        else {
            permanentWalls.push(new PermanentWall(wallStartPoint.x, wallStartPoint.y, x, y));
            wallStartPoint = null;
            resources -= 15;
            playSound('wallSound');
            isPlacingWall = false;
            wallButton.disabled = false;
            slowButton.disabled = false;
            spawnSmartyButton.disabled = false;
            restartButton.disabled = false;
            updateStats();
        }
    }
});
slowButton.addEventListener("click", () => {
    if (resources >= 10) {
        resources -= 10;
        entities.forEach(entity => {
            if (entity.type === "smarty" || entity.type === "aggressiveSmarty" || entity.type === "defensiveSmarty") {
                entity.speed *= 0.5;
                setTimeout(() => { entity.speed = entity.baseSpeed; }, 5000);
            }
        });
        updateStats();
    }
});
wallButton.addEventListener("click", () => {
    if (resources >= 15) {
        isPlacingWall = true;
        wallButton.disabled = true;
        slowButton.disabled = true;
        spawnSmartyButton.disabled = true;
        restartButton.disabled = true;
    }
});
spawnSmartyButton.addEventListener("click", () => {
    if (resources >= 20) {
        spawnNewSmarty();
        resources -= 20;
        updateStats();
    }
});
restartButton.addEventListener("click", () => {
    cancelAnimationFrame(animationFrame);
    initializeEntities();
    simulationStartTime = Date.now();
    animate();
});
pauseButton.addEventListener('click', () => {
    isPaused = true;
    pauseButton.disabled = true;
    resumeButton.disabled = false;
    cancelAnimationFrame(animationFrame);
});
resumeButton.addEventListener('click', () => {
    isPaused = false;
    pauseButton.disabled = false;
    resumeButton.disabled = true;
    animate();
});
simulationSpeedSlider.addEventListener('input', (e) => { simulationSpeed = parseFloat(e.target.value); });
const themeSelect = document.getElementById('themeSelect');
const antSpeedSlider = document.getElementById('antSpeed');
const smartyIntelligenceSlider = document.getElementById('smartyIntelligence');
themeSelect.addEventListener('change', (e) => {
    const selectedTheme = e.target.value;
    if (selectedTheme === 'light') {
        document.body.classList.remove('theme-dark');
        document.body.classList.add('theme-light');
        document.querySelector('.ui').classList.remove('theme-dark');
        document.querySelector('.ui').classList.add('theme-light');
    } else {
        document.body.classList.remove('theme-light');
        document.body.classList.add('theme-dark');
        document.querySelector('.ui').classList.remove('theme-light');
        document.querySelector('.ui').classList.add('theme-dark');
    }
});
antSpeedSlider.addEventListener('input', (e) => {
    const speedFactor = parseFloat(e.target.value);
    entities.forEach(entity => {
        if (entity.type === "ant" || entity.type === "workerAnt" || entity.type === "soldierAnt") {
            entity.speed = entity.baseSpeed * speedFactor;
        }
    });
});
smartyIntelligenceSlider.addEventListener('input', (e) => {
    const intelligence = parseInt(e.target.value);
    entities.forEach(entity => {
        if (entity.type === "smarty" || entity.type === "aggressiveSmarty" || entity.type === "defensiveSmarty") {
            entity.detectionRadius = intelligence;
        }
    });
});
document.getElementById('closeSummary').addEventListener('click', () => {
    document.getElementById('endSummary').style.display = 'none';
});
// Image loading and simulation start (auto-start disabled; rely on Start button)
const images = [antImage, workerAntImage, soldierAntImage, smartyImage, aggressiveSmartyImage, defensiveSmartyImage, obstacleImage];
let imagesLoaded = 0;
images.forEach(img => {
    img.onload = () => {
        imagesLoaded++;
        // Auto-start is disabled; use the Start button instead.
    };
});