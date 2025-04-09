// Export functions for page evaluations

// Function to update generation on the page
async function updateGeneration(page, generation) {
    await page.evaluate((generation) => {
        const generationElement = document.getElementById('generation');
        if (generationElement) {
            generationElement.textContent = `Generation: ${generation}`;
        }
    }, generation);
}

// Function to update highscore on the page
async function updateHighscore(page, highscore) {
    await page.evaluate((highscore) => {
        const highscoreElement = document.getElementById('highscore');
        if (highscoreElement) {
            highscoreElement.textContent = `Highscore: ${highscore}`;
        }
    }, highscore);
}

// Function to update reward on the page
async function updateReward(page, reward) {
    await page.evaluate((reward) => {
        const rewardElement = document.getElementById('reward');
        if (rewardElement) {
            rewardElement.textContent = `Reward: ${reward}`;
        }
    }, reward);
}

// Function to update Q-values on the page
async function updateQValues(page, qValues) {
    await page.evaluate((qValues) => {
        const qvalueElement = document.getElementById('qvalues');
        if (qvalueElement) {
            const truncatedQValues = Object.entries(qValues).map(([key, value]) => [key, Math.round(value * 100) / 100]);
            qvalueElement.textContent = `Q-values: ${JSON.stringify(truncatedQValues)}`;
        }
    }, qValues);
}

// Update the qAction function to handle the last 5 actions
const actionHistory = []; // Maintain a history of the last 5 actions

async function updateAction(page, action) {
    actionHistory.push(action === 0 ? 'Jump' : 'No Action');
    if (actionHistory.length > 5) {
        actionHistory.shift(); // Keep only the last 5 actions
    }

    await page.evaluate((actionHistory) => {
        const actionElement = document.getElementById('qaction');
        if (actionElement) {
            actionElement.textContent = `Last 5 Actions: ${actionHistory.join(', ')}`;
        }
    }, actionHistory);
}

export { updateGeneration, updateHighscore, updateReward, updateQValues, updateAction };