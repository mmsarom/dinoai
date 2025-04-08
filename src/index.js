const tf = require('@tensorflow/tfjs');
const puppeteer = require('puppeteer');
const fs = require('fs');
const tfvis = require('@tensorflow/tfjs-vis');

console.log('TensorFlow.js version:', tf.version.tfjs);

const NUM_OBSTACLES = 10; // Number of obstacles to consider in the state
const STATE_SIZE = NUM_OBSTACLES * 8 + 5; // 5 features per obstacle + 3 Dino parameters (total 20)

// Define the RL model
const rlModel = tf.sequential();
rlModel.add(tf.layers.dense({ inputShape: [STATE_SIZE], units: 24, activation: 'relu' })); // Adjust input shape to match STATE_SIZE
rlModel.add(tf.layers.dense({ units: 24, activation: 'relu' }));
rlModel.add(tf.layers.dense({ units: 32, activation: 'relu' })); // Additional layer for better decision-making
rlModel.add(tf.layers.dense({ units: 16, activation: 'relu' })); // Another layer for handling complex actions
rlModel.add(tf.layers.dense({ units: 2, activation: 'linear' })); // Output: Q-values for single jump and no action

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

async function appendGenerationAndScore(generation, score, stepReward, finalReward) {
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
    records.push({ generation, score, lastStepReward: stepReward, finalReward, timestamp: new Date().toISOString() });

    // Save the updated records back to the file
    try {
        fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
        console.log(`Appended generation ${generation}, score ${score}, last generation step ${stepReward} and final reward ${finalReward} to training records.`);
    } catch (error) {
        console.error('Error writing to training records file:', error);
    }
}

// Utility function to add a delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Attempted visualisation
async function setupTensorBoard() {
    const logDir = 'h:/dino-ai/logs';
    console.log(`TensorBoard logs will be saved to: ${logDir}`);

    // Visualize the model
    tfvis.show.modelSummary({ name: 'Model Summary' }, rlModel);

    // Add a callback for TensorBoard logging
    const tensorBoardCallback = tf.node.tensorBoard(logDir);

    return tensorBoardCallback;
}

async function trainRLModel() {
    //const tensorBoardCallback = await setupTensorBoard();

    await loadModelWeights(); // Load model weights at the start of training
    await loadGeneration(); // Load generation at the start of training
    await loadHighscore(); // Load highscore at the start of training

    const browser = await puppeteer.launch({ headless: false }); // Run Puppeteer in headless mode
    const page = await browser.newPage();

    // Navigate to the locally hosted Dino game in the public folder
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });

    console.log('Game started!');

    // Wait for the required elements to be available
    await page.waitForSelector('#score');
    await page.waitForSelector('#highscore');
    await page.waitForSelector('#generation');
    await page.waitForSelector('#reward');
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

    const dino = {
        isGrounded: true, // Indicates if the Dino is on the ground
        dy: 0, // Vertical speed
        timeSinceLastJump: 0 // Time since the last jump
    };

    // RL training loop
    for (generation; generation < 9000; generation++) {
        console.log(`Generation ${generation + 1}`);
        let state = Array(STATE_SIZE).fill(0); // Initialize state with the correct size
        let done = false;
        let survivalTime = 0; // Initialize survival time
        let currentScore = 0; // Initialize current score
        let totalReward = 0; // Initialize total reward for the generation
        let stepReward = 0; // Initialize step reward for the generation
        let jumpCount = 0; // Initialize jump count to track consecutive jumps

        // Start the game by simulating an Enter key press
        await page.keyboard.press('Enter');

        let loopStartTime = performance.now(); // Track the start time of the loop

        while (!done) {
            survivalTime++; // Increment survival time for each iteration of the loop

            // Predict Q-values for all actions (single jump, no action)
            const qValues = rlModel.predict(tf.tensor2d([state], [1, STATE_SIZE])).dataSync();

            // Ensure exploration by adding epsilon-greedy action selection
            const epsilon = 0.1; // Exploration rate (10%)
            let action;
            if (Math.random() < epsilon) {
                action = Math.floor(Math.random() * 2); // Randomly select between 0 (jump) and 1 (no action)
            } else {
                action = qValues.indexOf(Math.max(...qValues)); // Select the action with the highest Q-value
            }

            // Perform the selected action
            if (action === 0 && dino.isGrounded) { // Single jump only if grounded
                await page.keyboard.down('Space');
                await page.keyboard.up('Space');
                await delay(35);
            } else if (action === 1) { // No action
                // Do nothing
            }

            // Reset jumpCount and isGrounded when Dino lands
            if (dino.isGrounded && jumpCount > 0) {
                jumpCount = 0;
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

            // Calculate reward for the current step
            stepReward = 0;

            // Reward based on survival time
            stepReward += survivalTime * 0.005; // Reduced reward scaling for survival time

            // Penalize heavily for losing the game
            if (done) {
                stepReward -= 20; // Reduced penalty for losing the game

                // Reward for matching or beating the highscore only when the game is over
                if (currentScore >= highscore) {
                    stepReward += 30; // Reduced reward for matching or beating the highscore
                    if (currentScore > highscore) {
                        highscore = currentScore;
                        await saveHighscore(); // Save the updated highscore

                        await page.evaluate((highscore) => {
                            const highscoreElement = document.getElementById('highscore');
                            if (highscoreElement) {
                                highscoreElement.textContent = `Highscore: ${highscore}`;
                            }
                        }, highscore);
                    }
                }
            }

            // Exploration incentive
            if (Math.random() < 0.01) {
                stepReward += 0.5; // Reduced random reward to encourage exploration
            }

            // Accumulate the total reward for the generation
            totalReward += stepReward;

            // Train the RL model - with epsilon-greedy action selection
            const targetQValues = qValues.slice(); // Copy the current Q-values
            const maxNextQValue = Math.max(...rlModel.predict(tf.tensor2d([nextStateArray], [1, STATE_SIZE])).dataSync());
            targetQValues[action] = stepReward + 0.95 * maxNextQValue; // Update the Q-value for the selected action

            const targetTensor = tf.tensor2d([targetQValues], [1, 2]); // Update to match the 2 Q-values
            const stateTensor = tf.tensor2d([state], [1, STATE_SIZE]);

            await rlModel.fit(stateTensor, targetTensor, { 
                epochs: 1, 
                verbose: 0, 
                callbacks: [tensorBoardCallback] 
            });

            stateTensor.dispose();
            targetTensor.dispose();

            state = nextStateArray; // Update state

            // Update the reward on the HTML page
            await page.evaluate((stepReward) => {
                const rewardElement = document.getElementById('reward');
                if (rewardElement) {
                    rewardElement.textContent = `Reward: ${stepReward}`;
                }
            }, stepReward); // Pass the step reward to the browser context

            // Update the qvalue on the HTML page
            await page.evaluate((qValues) => {
                const qvalueElement = document.getElementById('qvalues');
                if (qvalueElement) {
                    // truncate the qValues to 2 decimal places with actions as keys
                    // {"0":-48.352806091308594,"1":-144.5240020751953}
                    const key = {
                        0: 'Single Jump',
                        1: 'No Action'
                    };
                    // Truncate the Q-values to 2 decimal places
                    // const truncatedQValues = Object.entries(qValues).map(([key, value]) => [key, Math.round(value * 100) / 100]);
                    // Convert the Q-values to a string with keys and values
                    const truncatedQValues = Object.entries(qValues).map(([key, value]) => [key, Math.round(value * 100) / 100]);
                    qvalueElement.textContent = `Q-values: ${JSON.stringify(truncatedQValues)}`;
                }
            }, qValues); // Pass the Q-values to the browser context

            const loopEndTime = performance.now();
            //console.log(`While loop iteration time: ${loopEndTime - loopStartTime} ms`);
            loopStartTime = loopEndTime; // Update the start time for the next iteration
        }
        console.log(`totalReward: ${totalReward}`);

        console.log(`Game over! Generation ${generation + 1} completed.`);

        // Save model weights and generation after each generation
        await saveModelWeights();
        await saveGeneration();
        await appendGenerationAndScore(generation, currentScore, stepReward, totalReward); // Append generation, score, and total reward to the file

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
