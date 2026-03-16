import { Actor } from 'apify';
import axios from 'axios';
import { google } from 'googleapis';

await Actor.init();

// Get input from the actor
const input = await Actor.getInput();
console.log('Input received:', input);

const { inputMode, linkedinUrls = [], csvFileUrl, customerName } = input;

// Setup Google Auth
const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets'
    ]
});

const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });

// Function to create or find a folder in Google Drive
async function createFolder(name, parentId = null) {
    console.log(`Creating folder: ${name}`);
    
    const fileMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId && { parents: [parentId] })
    };

    const response = await drive.files.create({
        resource: fileMetadata,
        fields: 'id, name'
    });

    console.log(`Folder created: ${name} with ID: ${response.data.id}`);
    return response.data.id;
}

// Function to create a Google Sheet
async function createGoogleSheet(name, parentId) {
    console.log(`Creating Google Sheet: ${name}`);
    
    const fileMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: [parentId]
    };

    const response = await drive.files.create({
        resource: fileMetadata,
        fields: 'id, name'
    });

    console.log(`Google Sheet created: ${name} with ID: ${response.data.id}`);
    return response.data.id;
}

// Function to save LinkedIn URLs to Google Sheet
async function saveUrlsToSheet(sheetId, urls) {
    console.log(`Saving ${urls.length} URLs to Google Sheet...`);
    
    // Add header row
    const values = [
        ['LinkedIn URL', 'Status', 'Date Added'],
        ...urls.map(url => [url, 'Pending', new Date().toISOString()])
    ];

    await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        resource: { values }
    });

    console.log('URLs saved to Google Sheet successfully!');
}

// Get LinkedIn URLs based on input mode
let allLinkedinUrls = [];

if (inputMode === 'manual') {
    console.log('Processing manual LinkedIn URLs...');
    allLinkedinUrls = linkedinUrls;
    console.log(`Found ${allLinkedinUrls.length} URLs from manual input`);

} else if (inputMode === 'bulk') {
    console.log('Processing bulk CSV file...');
    
    if (!csvFileUrl) {
        throw new Error('CSV File URL is required for bulk mode!');
    }

    try {
        const response = await axios.get(csvFileUrl);
        const csvContent = response.data;
        
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

console.log('Total LinkedIn URLs:', allLinkedinUrls.length);

// Create Google Drive folder structure
console.log('Setting up Google Drive folder structure...');

// Create main folder
const mainFolderId = await createFolder('LinkedIn Scraper Data');

// Create customer folder inside main folder
const customerFolderId = await createFolder(customerName, mainFolderId);

// Create Google Sheet inside customer folder
const sheetId = await createGoogleSheet(`${customerName} - LinkedIn URLs`, customerFolderId);

// Save URLs to Google Sheet
await saveUrlsToSheet(sheetId, allLinkedinUrls);

const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}`;
console.log(`✅ Google Sheet created: ${sheetUrl}`);

// Save results to actor output
await Actor.setValue('OUTPUT', {
    customerName,
    inputMode,
    totalUrls: allLinkedinUrls.length,
    linkedinUrls: allLinkedinUrls,
    googleSheetUrl: sheetUrl,
    mainFolderId,
    customerFolderId
});

console.log('✅ All done successfully!');

await Actor.exit();
