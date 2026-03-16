import { Actor } from 'apify';
import axios from 'axios';

await Actor.init();

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyWJN1kcwtomVHzCtdXSsW3ScEYsea7C3bPRVyWJbCifCr77TNXDZLAVUhodib8rESOwA/exec';
const WEBHOOK_INPUT_URL = 'https://n8n-main.chitlangia.co/webhook/private-profiles-scraper-request';
const WEBHOOK_STATUS_URL = 'https://n8n-main.chitlangia.co/webhook/private-profile-export-request-stats';

const input = await Actor.getInput();
console.log('Input received:', input);

const { inputMode, linkedinUrls = [], csvFileUrl, customerName, serviceName, serviceRequestTagName } = input;

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

// Step 1: Save to Google Drive via Apps Script
console.log('Saving to Google Drive...');
const driveResponse = await axios.post(APPS_SCRIPT_URL, {
    customerName,
    linkedinUrls: allLinkedinUrls
}, {
    headers: { 'Content-Type': 'application/json' },
    maxRedirects: 5
});

if (!driveResponse.data.success) {
    throw new Error(`Apps Script error: ${driveResponse.data.error}`);
}

const sheetUrl = driveResponse.data.sheetUrl;
console.log(`✅ Google Sheet created: ${sheetUrl}`);

// Step 2: Send each URL to Webhook Input
console.log('Sending URLs to Webhook Input...');
const requestIds = [];

for (const url of allLinkedinUrls) {
    console.log(`Sending URL to webhook: ${url}`);
    
   const webhookResponse = await axios.post(WEBHOOK_INPUT_URL, {
    service_name: serviceName || 'LinkedIn Scraper',
    service_request_tag_name: serviceRequestTagName || customerName,
    service_request_url: url,
    source: 'Dev name : Assignment'
}, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000
});

    console.log('Webhook response:', webhookResponse.data);
    
    if (webhookResponse.data.request_id) {
        requestIds.push({
            url: url,
            requestId: webhookResponse.data.request_id
        });
        console.log(`✅ Request ID received: ${webhookResponse.data.request_id}`);
    }
}

console.log('All request IDs:', requestIds);

// Step 3: Poll Status Webhook every 3 minutes
console.log('Polling status webhook...');
const completedResults = [];

for (const item of requestIds) {
    console.log(`Checking status for request ID: ${item.requestId}`);
    
    let status = 'processing';
    let attempts = 0;
    let resultData = null;

    while (status !== 'completed' && attempts < 10) {
        attempts++;
        console.log(`Attempt ${attempts} for request ID: ${item.requestId}`);

        const statusResponse = await axios.post(WEBHOOK_STATUS_URL, {
            request_id: item.requestId
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log('Status response:', statusResponse.data);
        status = statusResponse.data.status;

        if (status === 'completed') {
            console.log(`✅ Request ${item.requestId} completed!`);
            resultData = statusResponse.data;
            break;
        }

        console.log(`Status is ${status}, waiting 3 minutes...`);
        await new Promise(resolve => setTimeout(resolve, 3 * 60 * 1000));
    }

    completedResults.push({
        url: item.url,
        requestId: item.requestId,
        status: status,
        result: resultData
    });
}

// Save final output
await Actor.setValue('OUTPUT', {
    customerName,
    inputMode,
    totalUrls: allLinkedinUrls.length,
    linkedinUrls: allLinkedinUrls,
    googleSheetUrl: sheetUrl,
    requestIds,
    completedResults
});

console.log('✅ All done!');
await Actor.exit();
