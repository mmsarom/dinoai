const fs = require('fs');
const path = require('path');
const { parse } = require('json2csv');

// Define the input and output file paths
const inputFilePath = path.join(__dirname, 'models', 'training-records.json');
const outputFilePath = path.join(__dirname, 'models', 'training-records.csv');

// Read the JSON file
fs.readFile(inputFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading the JSON file:', err);
        return;
    }

    try {
        // Parse the JSON data
        const jsonData = JSON.parse(data);

        // Define the fields for the CSV
        const fields = ['generation', 'score', 'lastStepReward', 'finalReward', 'timestamp'];

        // Convert JSON to CSV
        const csv = parse(jsonData, { fields });

        // Write the CSV to a file
        fs.writeFile(outputFilePath, csv, (err) => {
            if (err) {
                console.error('Error writing the CSV file:', err);
                return;
            }
            console.log('CSV file has been created successfully:', outputFilePath);
        });
    } catch (parseError) {
        console.error('Error parsing the JSON data:', parseError);
    }
});