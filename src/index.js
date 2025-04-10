import tf from '@tensorflow/tfjs-node';
import puppeteer from 'puppeteer';
import { delay } from './utils/saveUtils.js';
import { loadModelWeights, saveModelWeights, loadGeneration, saveGeneration, appendGenerationAndScore, loadHighscore, saveHighscore } from './utils/modelUtils.js';
import { updateGeneration, updateHighscore, updateReward, updateQValues, updateAction } from './utils/pageUtils.js';

console.log('TensorFlow.js version:', tf.version.tfjs);

const NUM_OBSTACLES = 10; // Number of obstacles to consider in the state
const STATE_SIZE = NUM_OBSTACLES * 7 + 5; // 7 features per obstacle + 5 Dino parameters (total 75)

// Game static values for physics
const jumpStrength = -3.3; // Jump strength
const gravity = 0.075; // Gravity value

// Function to initialize the RL model
/**
 * Initializes and returns a reinforcement learning model using TensorFlow.js.
 * ReLU --- Rectified Linear Unit Activation Functionn
 * 
 * The model is a sequential neural network with the following architecture:
 * - Input layer: Dense layer with `STATE_SIZE` input shape and 24 units, using ReLU activation.
 * - Hidden layers: Three dense layers with 24, 32, and 16 units respectively, all using ReLU activation.
 * - Output layer: Dense layer with 2 units and a linear activation function.
 * 
 * The model is compiled with the Adam optimizer (learning rate: 0.001) and mean squared error as the loss function.
 * 
 * @returns {tf.Sequential} The compiled TensorFlow.js sequential model.
 */
function initializeRLModel() {
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [STATE_SIZE], units: 24, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 24, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 2, activation: 'linear' }));
    model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
    return model;
}

async function trainRLModel() {

    // Initialize RL model
    const rlModel =  initializeRLModel();
    await loadModelWeights(rlModel); // Load model weights from file

    // Generation
    let generation = await loadGeneration();
    let highscore = await loadHighscore(); // Initialize highscore variable

    const browser = await puppeteer.launch({ headless: true }); // Run Puppeteer in headless mode
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

    await updateGeneration(page, generation); // Update generation on the HTML page
    await updateHighscore(page, highscore); // Update highscore on the HTML page

    const dino = {
        isGrounded: true, // Indicates if the Dino is on the ground
        dy: 0, // Vertical speed
        timeSinceLastJump: 0 // Time since the last jump
    };

    console.log(`generation ${generation}`);

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

        // Retrieve canvas dimensions dynamically from the browser context
        const { canvasWidth, canvasHeight } = await page.evaluate(() => {
            const canvas = document.getElementById('gameCanvas');
            return { canvasWidth: canvas.width, canvasHeight: canvas.height };
        });

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
            const nextState = await page.evaluate((canvasWidth, canvasHeight, jumpStrength, gravity, numObstacles) => {
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

                // Add obstacle data to the state
                for (let i = 0; i < numObstacles; i++) {
                    if (obstaclesData[i]) {
                        state.push(
                            obstaclesData[i].distance / canvasWidth, // Normalize distance by canvas width
                            obstaclesData[i].yDifference / canvasHeight, // Normalize yDifference by canvas height
                            obstaclesData[i].type, // No normalization needed for type
                            obstaclesData[i].width / canvasWidth, // Normalize width by canvas width
                            obstaclesData[i].height / canvasHeight, // Normalize height by canvas height
                            obstaclesData[i].x / canvasWidth, // Normalize x by canvas width
                            obstaclesData[i].y / canvasHeight // Normalize y by canvas height
                        );
                    } else {
                        state.push(0, 0, 0, 0, 0, 0, 0); // Fill with zeros if fewer obstacles are present
                    }
                }

                // Add Dino's parameters to the state
                state.push(
                    dinoData.dy / jumpStrength, // Normalize dy by jump strength
                    dinoData.gravity / gravity, // Normalize gravity by its defined value
                    dinoData.isGrounded ? 1 : 0, // Convert boolean to 1 or 0
                    dinoData.maxJumpHeight / canvasHeight, // Normalize max jump height by canvas height
                    dinoData.timeSinceLastJump / 100 // Normalize time since last jump
                );

                return { state, nearestObstacle: obstaclesData[0] || null };
            }, canvasWidth, canvasHeight, jumpStrength, gravity, NUM_OBSTACLES);

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
                        await saveHighscore(highscore); // Save the updated highscore
                        await updateHighscore(page, highscore); // Update highscore on the HTML page
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

            await rlModel.fit(stateTensor, targetTensor, { verbose: 0 });

            stateTensor.dispose();
            targetTensor.dispose();

            state = nextStateArray; // Update state

            await updateReward(page, stepReward); // Update reward on the HTML page
            await updateQValues(page, qValues); // Update Q-values on the HTML page
            await updateAction(page, action); // Update action on the HTML page

            const loopEndTime = performance.now();
            loopStartTime = loopEndTime; // Update the start time for the next iteration


        }
        console.log(`totalReward: ${totalReward}`);

        console.log(`Game over! Generation ${generation + 1} completed.`);

        // Save model weights and generation after each generation
        await saveModelWeights(rlModel);
        await saveGeneration(generation);
        await appendGenerationAndScore(generation, currentScore, stepReward, totalReward); // Append generation, score, and total reward to the file

        await updateGeneration(page, generation + 1); // Update generation on the HTML page

        // Save the model in TensorFlow.js format for visualization in TensorBoard
        await rlModel.save('file://./model');

        // Add a wait of 1 second between generations
        await delay(1000);

        // Reset the game by simulating an Enter key press
        await page.keyboard.press('Enter');
    }

    await browser.close();
    console.log('Training completed!');
}

trainRLModel();
