import { Actor } from 'apify';
import axios from 'axios';

await Actor.init();

// Get input from the actor
const input = await Actor.getInput();
console.log('Input received:', input);

const { inputMode, linkedinUrls = [], csvFileUrl, customerName } = input;

console.log('Customer Name:', customerName);
console.log('Input Mode:', inputMode);

let allLinkedinUrls = [];

if (inputMode === 'manual') {
    // Manual mode - use URLs directly from input
    console.log('Processing manual LinkedIn URLs...');
    allLinkedinUrls = linkedinUrls;
    console.log(`Found ${allLinkedinUrls.length} URLs from manual input`);

} else if (inputMode === 'bulk') {
    // Bulk mode - download and parse CSV file
    console.log('Processing bulk CSV file...');
    
    if (!csvFileUrl) {
        throw new Error('CSV File URL is required for bulk mode!');
    }

    try {
        const response = await axios.get(csvFileUrl);
        const csvContent = response.data;
        
        // Parse CSV - each line is a LinkedIn URL
        const lines = csvContent.split('\n');
        for (const line of lines) {
            const url = line.trim();
            if (url && url.includes('linkedin.com')) {
                allLinkedinUrls.push(url);
            }
        }
        console.log(`Found ${allLinkedinUrls.length} URLs from CSV file`);
    } catch (error) {
        throw new Error(`Failed to download CSV file: ${error.message}`);
    }
}

console.log('All LinkedIn URLs to process:', allLinkedinUrls);
console.log('Total URLs:', allLinkedinUrls.length);

// Save results to actor output
await Actor.setValue('OUTPUT', {
    customerName,
    inputMode,
    totalUrls: allLinkedinUrls.length,
    linkedinUrls: allLinkedinUrls
});

console.log('✅ Input processing completed successfully!');

await Actor.exit();
