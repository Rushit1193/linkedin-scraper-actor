import { Actor } from 'apify';
import axios from 'axios';

await Actor.init();

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyWJN1kcwtomVHzCtdXSsW3ScEYsea7C3bPRVyWJbCifCr77TNXDZLAVUhodib8rESOwA/exec';

const input = await Actor.getInput();
console.log('Input received:', input);

const { inputMode, linkedinUrls = [], csvFileUrl, customerName } = input;

// Get LinkedIn URLs
let allLinkedinUrls = [];

if (inputMode === 'manual') {
    console.log('Processing manual LinkedIn URLs...');
    allLinkedinUrls = linkedinUrls;
    console.log(`Found ${allLinkedinUrls.length} URLs`);
} else if (inputMode === 'bulk') {
    console.log('Processing bulk CSV...');
    if (!csvFileUrl) throw new Error('CSV File URL is required!');
    try {
        const response = await axios.get(csvFileUrl);
        const lines = response.data.split('\n');
        for (const line of lines) {
            const url = line.trim();
            if (url && url.includes('linkedin.com')) {
                allLinkedinUrls.push(url);
            }
        }
        console.log(`Found ${allLinkedinUrls.length} URLs from CSV`);
    } catch (error) {
        throw new Error(`Failed to download CSV: ${error.message}`);
    }
}

console.log('Total URLs:', allLinkedinUrls.length);
console.log('Sending data to Google Apps Script...');

// Send data to Google Apps Script
const response = await axios.post(APPS_SCRIPT_URL, {
    customerName,
    linkedinUrls: allLinkedinUrls
}, {
    headers: {
        'Content-Type': 'application/json'
    },
    maxRedirects: 5
});

console.log('Apps Script response:', response.data);

if (!response.data.success) {
    throw new Error(`Apps Script error: ${response.data.error}`);
}

const sheetUrl = response.data.sheetUrl;
console.log(`✅ Google Sheet created: ${sheetUrl}`);

await Actor.setValue('OUTPUT', {
    customerName,
    inputMode,
    totalUrls: allLinkedinUrls.length,
    linkedinUrls: allLinkedinUrls,
    googleSheetUrl: sheetUrl,
    customerFolderId: response.data.customerFolderId
});

console.log('✅ All done!');
await Actor.exit();
