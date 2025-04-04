const tf = require('@tensorflow/tfjs');
const puppeteer = require('puppeteer');
const fs = require('fs');
//const tfvis = require('@tensorflow/tfjs-vis'); // Import TensorFlow.js Vis

console.log('TensorFlow.js version:', tf.version.tfjs);

const NUM_OBSTACLES = 10; // Number of obstacles to consider in the state
const STATE_SIZE = NUM_OBSTACLES * 8 + 5; // 5 features per obstacle + 3 Dino parameters (total 20)

// Define the RL model
const rlModel = tf.sequential();
rlModel.add(tf.layers.dense({ inputShape: [STATE_SIZE], units: 24, activation: 'relu' })); // Adjust input shape to match STATE_SIZE
rlModel.add(tf.layers.dense({ units: 24, activation: 'relu' }));
rlModel.add(tf.layers.dense({ units: 4, activation: 'linear' })); // Output: Q-values for single jump, double jump, triple jump, and no action

rlModel.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });

// Generation
let generation = 1;
let highscore = 0; // Initialize highscore variable

async function loadModelWeights() {
    if (fs.existsSync('h:/dino-ai/models/model-weights.json')) {
        try {
            const weights = JSON.parse(fs.readFileSync('h:/dino-ai/models/model-weights.json', 'utf8'));
            if (weights.length !== rlModel.getWeights().length) {
                throw new Error('Saved weights are incompatible with the current model architecture.');
            }
            rlModel.setWeights(weights.map(w => tf.tensor(w.data, w.shape)));
            console.log('Model weights loaded.');
        } catch (error) {
            console.error('Error loading model weights:', error.message);
            console.log('Starting training with a fresh model.');
        }
    }
}

async function saveModelWeights() {
    const weights = rlModel.getWeights().map(w => w.arraySync());
    const serializedWeights = weights.map(w => ({ data: w, shape: w.shape }));
    fs.writeFileSync('h:/dino-ai/models/model-weights.json', JSON.stringify(serializedWeights));

    console.log('Model weights saved.');
}

async function loadGeneration() {
    if (fs.existsSync('h:/dino-ai/models/generation.json')) {
        generation = JSON.parse(fs.readFileSync('h:/dino-ai/models/generation.json', 'utf8'));
        console.log(`Generation loaded: ${generation}`);
    }
}

async function saveGeneration() {
    fs.writeFileSync('h:/dino-ai/models/generation.json', JSON.stringify(generation));
    console.log(`Generation saved: ${generation}`);
}

async function loadHighscore() {
    if (fs.existsSync('h:/dino-ai/models/highscore.json')) {
        highscore = JSON.parse(fs.readFileSync('h:/dino-ai/models/highscore.json', 'utf8'));
        console.log(`Highscore loaded: ${highscore}`);
    }
}

async function saveHighscore() {
    fs.writeFileSync('h:/dino-ai/models/highscore.json', JSON.stringify(highscore));
    console.log(`Highscore saved: ${highscore}`);
}

async function appendGenerationAndScore(generation, score) {
    const filePath = 'h:/dino-ai/models/training-records.json';
    let records = [];

    // Load existing records if the file exists
    if (fs.existsSync(filePath)) {
        try {
            records = await JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            console.error('Error reading training records file:', error);
        }
    }

    // Append the new record
    records.push({ generation, score, timestamp: new Date().toISOString() });

    // Save the updated records back to the file
    try {
        fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
        console.log(`Appended generation ${generation} and score ${score} to training records.`);
    } catch (error) {
        console.error('Error writing to training records file:', error);
    }
}

// Utility function to add a delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function trainRLModel() {
    await loadModelWeights(); // Load model weights at the start of training
    await loadGeneration(); // Load generation at the start of training
    await loadHighscore(); // Load highscore at the start of training

    const browser = await puppeteer.launch({ headless: true }); // Run Puppeteer in headless mode
    const page = await browser.newPage();

    // Navigate to the locally hosted Dino game in the public folder
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });

    console.log('Game started!');

    // Wait for the required elements to be available
    await page.waitForSelector('#score');
    await page.waitForSelector('#highscore');
    await page.waitForSelector('#generation');
    await page.waitForSelector('#obstacles');
    await page.waitForSelector('#gameOver');

    await page.evaluate((generation) => {
        const generationElement = document.getElementById('generation');
        if (generationElement) {
            generationElement.textContent = `Generation: ${generation}`;
        }
    }, generation); // Pass the current generation to the browser context

    await page.evaluate((highscore) => {
        const highscoreElement = document.getElementById('highscore');
        if (highscoreElement) {
            highscoreElement.textContent = `Highscore: ${highscore}`;
        }
    }, highscore); // Pass the current highscore to the browser context

    // RL training loop
    for (generation; generation < 100000; generation++) {
        console.log(`Generation ${generation + 1}`);
        let state = Array(STATE_SIZE).fill(0); // Initialize state with the correct size
        let done = false;
        let survivalTime = 0; // Initialize survival time
        let currentScore = 0; // Initialize current score

        // Start the game by simulating an Enter key press
        await page.keyboard.press('Enter');

        while (!done) {
            survivalTime++; // Increment survival time for each iteration of the loop

            // Add survival time to the reward
            let reward = survivalTime * 0.01; // Reward increases with survival time

            // Predict Q-values for all actions (single, double, triple jump, no action)
            const qValues = rlModel.predict(tf.tensor2d([state], [1, STATE_SIZE])).dataSync();

            // console.log(`Q-values: ${qValues}`); // Log the Q-values for debugging

            // Select the action with the highest Q-value
            const action = qValues.indexOf(Math.max(...qValues));

            // Perform the selected action
            if (action === 0) { // Single jump
                await page.keyboard.press('Space');
                reward -= 1;
            } else if (action === 1) { // Double jump
                await page.keyboard.press('Space');
                await delay(200); // Add a delay between jumps
                await page.keyboard.press('Space');
                reward -= 2;
            } else if (action === 2) { // Triple jump
                await page.keyboard.press('Space');
                await delay(200); // Add a delay between jumps
                await page.keyboard.press('Space');
                await delay(200); // Add another delay for the third jump
                await page.keyboard.press('Space');
                reward -= 4;
            } else if (action === 3) { // No action
                // Do nothing
            }

            // Extract the next state and reward from the game
            const nextState = await page.evaluate((numObstacles) => {
                const data = JSON.parse(document.getElementById('obstacles').innerText) || {};
                const obstaclesData = data.obstacles || [];
                const dinoData = data.dino || {
                    dy: 0,
                    gravity: 0,
                    isGrounded: true,
                    timeSinceLastJump: 0,
                    jumpCount: 0
                };
                const state = [];

                // Define the speed of obstacle movement
                const obstacleSpeed = 5; // Obstacles move 5 units per frame

                // Add obstacle data to the state
                for (let i = 0; i < numObstacles; i++) {
                    if (obstaclesData[i]) {
                        state.push(
                            obstaclesData[i].distance,
                            obstaclesData[i].yDifference,
                            obstaclesData[i].type,
                            obstaclesData[i].width,
                            obstaclesData[i].height,
                            obstaclesData[i].x,
                            obstaclesData[i].y,
                            obstaclesData[i].x - obstacleSpeed * (dinoData.timeSinceLastJump || 1) // futureX
                        );
                    } else {
                        state.push(0, 0, 0, 0, 0, 0, 0, 0); // Fill with zeros if fewer obstacles are present
                    }
                }

                // Add Dino's parameters to the state
                state.push(
                    dinoData.dy,
                    dinoData.gravity,
                    dinoData.isGrounded ? 1 : 0, // Convert boolean to 1 or 0
                    dinoData.maxJumpHeight || 0, // Add max jump height to the state
                    dinoData.timeSinceLastJump || 0 // Add time since last jump to the state
                );

                return { state, nearestObstacle: obstaclesData[0] || null };
            }, NUM_OBSTACLES);

            const { state: nextStateArray, nearestObstacle } = nextState;

            

            // Encourage jumping when an obstacle is near
            if (nearestObstacle) {
                const futureDistance = nearestObstacle.futureX - 50; // Predicted distance from Dino to the obstacle
                if (futureDistance > 0 && futureDistance < 100) {
                    reward += 2; // Reward for being proactive when an obstacle is predicted to be near
                }
            }

            // Check if the game is over by reading the `gameOver` div's visibility
            done = await page.evaluate(() => {
                const gameOverElement = document.getElementById('gameOver');
                return gameOverElement && gameOverElement.style.display === 'block'; // Game over if the div is visible
            });

            // Get Current score
            currentScore = await page.evaluate(() => {
                const scoreText = document.getElementById('score').innerText || "Score: 0";
                return parseInt(scoreText.replace(/\D/g, ''), 10) || 0;
            });

            // Penalize for collision
            if (done) {
                reward -= 50; // Apply a penalty for colliding with an obstacle

                if (currentScore > highscore) {
                    highscore = currentScore;
                    reward += 100; // Bonus for achieving a new highscore
                    await saveHighscore(); // Save the updated highscore

                    await page.evaluate((highscore) => {
                        const highscoreElement = document.getElementById('highscore');
                        if (highscoreElement) {
                            highscoreElement.textContent = `Highscore: ${highscore}`;
                        }
                    }, highscore);
                }
            }

            // Train the RL model
            const targetQValues = qValues.slice(); // Copy the current Q-values
            targetQValues[action] = reward + 0.95 * Math.max(...rlModel.predict(tf.tensor2d([nextStateArray], [1, STATE_SIZE])).dataSync()); // Update the Q-value for the selected action

            const targetTensor = tf.tensor2d([targetQValues], [1, 4]); // Update to match the 4 Q-values
            const stateTensor = tf.tensor2d([state], [1, STATE_SIZE]);

            await rlModel.fit(stateTensor, targetTensor, { epochs: 1, verbose: 0 });

            stateTensor.dispose();
            targetTensor.dispose();

            state = nextStateArray; // Update state
        }

        console.log(`Game over! Generation ${generation + 1} completed.`);

        // Save model weights and generation after each generation
        await saveModelWeights();
        await saveGeneration();
        await appendGenerationAndScore(generation, currentScore); // Append generation and score to the file

        // Update the generation on the HTML page
        await page.evaluate((currentGeneration) => {
            const generationElement = document.getElementById('generation');
            if (generationElement) {
                generationElement.textContent = `Generation: ${currentGeneration}`;
            }
        }, generation + 1); // Pass the current generation to the browser context

        // Reset the game by simulating an Enter key press
        await page.keyboard.press('Enter');

        // Add a wait of 1 second between generations
        await delay(1000);
    }

    await browser.close();
    console.log('Training completed!');
}

trainRLModel();
