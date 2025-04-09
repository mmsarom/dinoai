import fs from 'fs';

// Export loadJSON function
function loadJSON(filePath) {
    if (fs.existsSync(filePath)) {
        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
            console.error(`Error reading ${filePath}:`, error);
        }
    }
    return null;
}

// Export saveJSON function
function saveJSON(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`${filePath} saved.`);
    } catch (error) {
        console.error(`Error writing to ${filePath}:`, error);
    }
}

// Utility function to add a delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export { loadJSON, saveJSON, delay };