const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const levelElement = document.getElementById('level');
const gameOverElement = document.getElementById('gameOver');
const generationElement = document.getElementById('generation');
const obstacleElement = document.getElementById('obstacles');
//const fs = require('fs');

//let generation = 0; // Initialize generation variable
/* async function loadGeneration() {
  if (fs.existsSync('h:/dino-ai/models/generation.json')) {
    generation = JSON.parse(fs.readFileSync('h:/dino-ai/models/generation.json', 'utf8'));
    console.log(`Generation loaded: ${generation}`);
  }
} */

// Game variables
let dino = {
    x: 50, // Fixed horizontal position
    y: canvas.height - 160,
    width: 20,
    height: 20,
    dy: 0, // Vertical speed
    jumping: false,
    isGrounded: true, // Whether the Dino is on the ground
    timeSinceLastJump: 0 // Time since the last jump
};

let obstacles = [];
let score = 0;
let highscore = 0;
let gameOver = false;
let lastObstacleTime = 1000; // Track the last obstacle spawn time
const obstacleSpawnDelay = Math.floor(Math.random() * 500) + 500; // Minimum delay between obstacle spawns in milliseconds

let jumpCount = 0; // Track the number of consecutive jumps
const maxJumps = 3; // Maximum number of consecutive jumps
const jumpStrength = -3.3; // Fixed jump strength
let notStarted = true;

let resetInProgress = false; // Flag to prevent multiple resets

// Gravity and jump settings
const gravity = 0.075;
let jumpStartTime = 0; // Track when the space bar is pressed

// Track the number of consecutive walls generated
let consecutiveWalls = 0;

// Track the number of iterations since the last wall was generated
let iterationsSinceLastWall = 3; // Start with a value greater than 2 to allow initial wall generation

// Add toggles for wall and high object obstacles
let enableNormalObstacles = true; // Toggle for enabling/disabling normal obstacles
let enableWallObstacles = true; // Toggle for enabling/disabling wall obstacles
let enableHighObjectObstacles = true; // Toggle for enabling/disabling high object obstacles

// Ensure the first obstacle spawns within 100ms
let firstObstacleSpawned = false;

// Load the sprite image
const spriteImage = new Image();

function spawnFirstObstacle() {
    if (!firstObstacleSpawned) {
        obstacles.push({ x: canvas.width, y: canvas.height - 150, width: 20, height: 20 });
        firstObstacleSpawned = true;
    }
}

window.onload = function () {
    spriteImage.src = 'assets/sprite.png'; // Replace with the actual path to your sprite image
}

// Key event listeners
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && jumpCount < maxJumps) {
        dino.dy = jumpStrength; // Apply jump strength
        dino.jumping = true; // Set jumping state
        jumpCount++; // Increment jump count
        dino.isGrounded = false; // Ensure grounded state is false during jumps
    }

    if (e.code === 'Enter' && gameOver && !resetInProgress) { // Change to 'Enter' key for resetting the game
        resetInProgress = true; // Set flag to prevent multiple resets
        reset(); // Call reset when the game is over and Enter is pressed
    }

    if (e.code === 'Enter' && notStarted) { // Change to 'Enter' key for starting the game
        // Start the game
        gameLoop();
        notStarted = false; // Set notStarted to false to prevent multiple starts
    }
});

function reset() {
    dino = { x: 50, y: canvas.height - 160, width: 20, height: 20, dy: 0, jumping: false, isGrounded: true, timeSinceLastJump: 0 }; // Reset Dino's position and state
    obstacles = []; // Clear all obstacles
    score = 0; // Reset score
    gameOver = false; // Reset game-over state
    resetInProgress = false; // Ensure reset flag is cleared
    gameOverElement.style.display = 'none'; // Hide the game-over message
    scoreElement.textContent = `Score: ${score}`; // Reset the score display
    // generationElement.textContent = `Generation: ${generation}`; // Update generation display
    notStarted = true; // Set notStarted to true to wait for the next spacebar press
    firstObstacleSpawned = false; // Reset the first obstacle spawn flag
}

function gameLoop() {
    setTimeout(spawnFirstObstacle, 50); // Spawn the first obstacle within 50ms
    if (gameOver) {
        gameOverElement.style.display = 'block';

        // Prevent immediate reset by adding a delay
        if (!resetInProgress) {
            resetInProgress = true; // Set flag to prevent multiple resets
            setTimeout(() => {
                reset(); // Call reset after the delay
            }, 1000); // 1-second delay
        }

        return; // Halt the game loop when gameOver is true
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw jump height lines
    drawJumpHeightLines();

    // Draw Dino using the sprite image
    ctx.drawImage(spriteImage, 1514, 0, 88, 94, dino.x, dino.y, dino.width, dino.height);

    // Apply gravity
    dino.y += dino.dy;
    dino.dy += gravity;

    // Prevent Dino from moving horizontally by keeping x constant
    dino.x = 50;

    // Prevent Dino from falling below the ground
    if (dino.y > canvas.height - 150) {
        dino.y = canvas.height - 150;
        dino.dy = 0;
        dino.jumping = false;
        jumpCount = 0; // Reset jump count when Dino lands
        dino.isGrounded = true; // Ensure grounded state is true when Dino lands
    }

    // Update Dino's grounded state and time since last jump
    if (dino.y >= canvas.height - 150) {
        dino.isGrounded = true;
        dino.timeSinceLastJump = 0; // Reset time since last jump
    } else {
        dino.isGrounded = false;
        dino.timeSinceLastJump++; // Increment time since last jump
    }

    // Spawn obstacles with delay
    const highObject = Math.floor(Math.random() * 10) > (10 - (Math.ceil(score / 100)));
    const currentTime = performance.now();
    if (currentTime - lastObstacleTime > obstacleSpawnDelay) {
        const numObjs = Math.floor(Math.random() * 2 + Math.floor(score / 1000));
        const wall = enableWallObstacles && Math.floor(Math.random() * 10) > (10 - (Math.ceil(score / 1000) / 2)) && iterationsSinceLastWall >= 2;
        if (wall) {
            iterationsSinceLastWall = 0; // Reset the counter when a wall is generated
            const tall = Math.floor(Math.random() * 10) > 7;
            obstacles.push({ x: canvas.width, y: canvas.height - (tall ? 300 : 250), width: 20, height: (tall ? 200 : 150) });
        } else {
            iterationsSinceLastWall++; // Increment the counter if no wall is generated
        }
        for (let i = 0; i < numObjs; i++) {
            if (enableHighObjectObstacles && highObject) {
                // add an wait of 20ms between each object
                setTimeout(() => {
                    obstacles.push({ sx: 260, sy: 0, sw: 83, sh: 94, x: canvas.width, y: canvas.height - (highObject ? 150 + Math.floor(Math.random() * 200) : 150), width: 20, height: 20 });
                }, i * Math.floor(Math.random() * 100) + 50); // Delay each object spawn by 20ms
            }
            if (enableNormalObstacles) {
                setTimeout(() => {
                    obstacles.push({ sx: 652, sy: 0, sw: 55, sh: 94, x: canvas.width, y: canvas.height - (150), width: 20, height: 20 });
                }, i * Math.floor(Math.random() * 100) + 50); // Delay each object spawn by 20ms
            }
        }
        lastObstacleTime = currentTime;
    }

    // Move and draw obstacles
    ctx.fillStyle = 'black';
    for (let i = 0; i < obstacles.length; i++) {
        obstacles[i].x -= 5;
        ctx.drawImage(
            spriteImage,
            obstacles[i].sx,
            obstacles[i].sy,
            obstacles[i].sw,
            obstacles[i].sh,
            obstacles[i].x, // Destination x-coordinate
            obstacles[i].y, // Destination y-coordinate
            obstacles[i].width, // Destination width
            obstacles[i].height // Destination height
        );

        // Check for collision
        if (
            dino.x < obstacles[i].x + obstacles[i].width &&
            dino.x + dino.width > obstacles[i].x &&
            dino.y < obstacles[i].y + obstacles[i].height &&
            dino.y + dino.height > obstacles[i].y
        ) {
            gameOver = true;
        }
    }

    // Remove off-screen obstacles
    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > 0);

    // Update score
    score++;
    scoreElement.textContent = `Score: ${score}`;
    levelElement.textContent = `Difficulty Level: ${Math.ceil(score / 1000)}`; // Update difficulty level
    // generationElement.textContent = `Generation: ${generation}`; // Update generation display

    // Define the speed of obstacle movement
    const obstacleSpeed = 5; // Obstacles move 5 units per frame

    // Update obstacles JSON array to include additional parameters
    const obstaclesData = obstacles.map(obstacle => ({
        x: obstacle.x, // X position of the obstacle
        y: obstacle.y, // Y position of the obstacle
        width: obstacle.width, // Width of the obstacle
        height: obstacle.height, // Height of the obstacle
        distance: obstacle.x - dino.x, // Distance from Dino to the obstacle
        yDifference: dino.y - obstacle.y, // Vertical difference between Dino and the obstacle
        futureX: obstacle.x - obstacleSpeed * (dino.timeSinceLastJump || 1), // Predicted future X position of the obstacle
        type: obstacle.height > 100 ? 1 : 0 // Example: 1 for wall, 0 for small object
    }));

    obstacleElement.textContent = JSON.stringify({
        obstacles: obstaclesData,
        dino: {
            dy: dino.dy,
            gravity: gravity,
            isGrounded: dino.isGrounded,
            maxJumpHeight: dino.height * maxJumps, // Maximum height Dino can jump
            maxJumpDistance: dino.width * maxJumps // Maximum horizontal distance Dino can clear
        }
    });
    // Loop
    requestAnimationFrame(gameLoop);
}

// Draw jump height lines even when the game is not started
function drawJumpHeightLines() {
    ctx.setLineDash([5, 5]); // Set line style to dotted
    ctx.strokeStyle = 'blue'; // Set line color to blue

    const jumpHeight1 = Math.abs(jumpStrength / gravity); // Calculate height for 1st jump
    const jumpHeight2 = 2 * jumpHeight1; // Calculate height for 2nd jump
    const jumpHeight3 = 3 * jumpHeight1; // Calculate height for 3rd jump

    // Draw 1st jump height line
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 150 - jumpHeight1);
    ctx.lineTo(canvas.width, canvas.height - 150 - jumpHeight1);
    ctx.stroke();

    // Draw 2nd jump height line
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 150 - jumpHeight2);
    ctx.lineTo(canvas.width, canvas.height - 150 - jumpHeight2);
    ctx.stroke();

    // Draw 3rd jump height line
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 150 - jumpHeight3);
    ctx.lineTo(canvas.width, canvas.height - 150 - jumpHeight3);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line style
}

