// Export functions for saving and loading model weights, generation, training records, and highscore
import { loadJSON, saveJSON } from './saveUtils.js';
import tf from '@tensorflow/tfjs';

// Function to load model weights
async function loadModelWeights(rlModel) {
    const weightsData = loadJSON('./models/model-weights.json');
    if (weightsData) {
        try {
            if (weightsData.length !== rlModel.getWeights().length) {
                throw new Error('Saved weights are incompatible with the current model architecture.');
            }
            rlModel.setWeights(weightsData.map(w => tf.tensor(w.data, w.shape)));
            console.log('Model weights loaded.');
        } catch (error) {
            console.error('Error loading model weights:', error.message);
            console.log('Starting training with a fresh model.');
        }
    }
}

// Function to save model weights
async function saveModelWeights(rlModel) {
    const weights = rlModel.getWeights().map(w => w.arraySync());
    const serializedWeights = weights.map(w => ({ data: w, shape: w.shape }));
    saveJSON('./models/model-weights.json', serializedWeights);
}

// Function to load generation
async function loadGeneration() {
    const loadedGeneration = loadJSON('./models/generation.json');
    if (loadedGeneration !== null) {
        console.log(`Generation loaded: ${loadedGeneration}`);
        return loadedGeneration;
    }
    return 1; // Default generation
}

// Function to save generation
async function saveGeneration(generation) {
    saveJSON('./models/generation.json', generation);
}

// Function to append generation and score
async function appendGenerationAndScore(generation, score, stepReward, finalReward) {
    const filePath = './models/training-records.json';
    let records = loadJSON(filePath) || [];

    // Append the new record
    records.push({ generation, score, lastStepReward: stepReward, finalReward, timestamp: new Date().toISOString() });

    // Save the updated records back to the file
    saveJSON(filePath, records);
    console.log(`Appended generation ${generation}, score ${score}, last generation step ${stepReward} and final reward ${finalReward} to training records.`);
}

// Function to load highscore
async function loadHighscore() {
    const highscoreData = loadJSON('./models/highscore.json');
    if (highscoreData !== null) {
        console.log(`Highscore loaded: ${highscoreData}`);
        return highscoreData;
    }
    return 0; // Default highscore
}

// Function to save highscore
async function saveHighscore(highscore) {
    saveJSON('./models/highscore.json', highscore);
    console.log(`Highscore saved: ${highscore}`);
}

export { loadModelWeights, saveModelWeights, loadGeneration, saveGeneration, appendGenerationAndScore, loadHighscore, saveHighscore };