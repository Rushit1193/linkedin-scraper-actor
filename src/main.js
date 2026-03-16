import { Actor } from 'apify';
import axios from 'axios';
import { google } from 'googleapis';

await Actor.init();

const MAIN_FOLDER_ID = '1YOZsHQGrJgXVl_cMFdSWzZE7XgvE8SIW';
const OWNER_EMAIL = 'rushitsangani11@gmail.com';

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

// Create folder
async function createFolder(name, parentId) {
    console.log(`Creating folder: ${name}`);
    const response = await drive.files.create({
        requestBody: {
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        },
        fields: 'id'
    });
    console.log(`Folder created with ID: ${response.data.id}`);
    
    // Transfer ownership to personal account
    await drive.permissions.create({
        fileId: response.data.id,
        transferOwnership: true,
        requestBody: {
            role: 'owner',
            type: 'user',
            emailAddress: OWNER_EMAIL
        }
    });
    console.log(`Folder ownership transferred to ${OWNER_EMAIL}`);
    
    return response.data.id;
}

// Create Google Sheet
async function createGoogleSheet(name, parentId) {
    console.log(`Creating Google Sheet: ${name}`);
    const response = await drive.files.create({
        requestBody: {
            name: name,
            mimeType: 'application/vnd.google-apps.spreadsheet',
            parents: [parentId]
        },
        fields: 'id'
    });
    console.log(`Google Sheet created with ID: ${response.data.id}`);

    // Transfer ownership to personal account
    await drive.permissions.create({
        fileId: response.data.id,
        transferOwnership: true,
        requestBody: {
            role: 'owner',
            type: 'user',
            emailAddress: OWNER_EMAIL
        }
    });
    console.log(`Sheet ownership transferred to ${OWNER_EMAIL}`);

    return response.data.id;
}

// Save URLs to sheet
async function saveUrlsToSheet(sheetId, urls) {
    console.log(`Saving ${urls.length} URLs to sheet...`);
    const values = [
        ['LinkedIn URL', 'Status', 'Date Added'],
        ...urls.map(url => [url, 'Pending', new Date().toISOString()])
    ];
    await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: 'Sheet1!A1',
        valueInputOption: 'RAW',
        requestBody: { values }
    });
    console.log('URLs saved successfully!');
}

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
console.log('Setting up Google Drive structure...');

// Create customer folder
const customerFolderId = await createFolder(customerName, MAIN_FOLDER_ID);

// Create sheet in customer folder
const sheetId = await createGoogleSheet(`${customerName} - LinkedIn URLs`, customerFolderId);

// Save URLs
await saveUrlsToSheet(sheetId, allLinkedinUrls);

const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}`;
console.log(`✅ Sheet URL: ${sheetUrl}`);

await Actor.setValue('OUTPUT', {
    customerName,
    inputMode,
    totalUrls: allLinkedinUrls.length,
    linkedinUrls: allLinkedinUrls,
    googleSheetUrl: sheetUrl,
    customerFolderId
});

console.log('✅ All done!');
await Actor.exit();
