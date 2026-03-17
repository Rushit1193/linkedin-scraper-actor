import { Actor } from 'apify';
import axios from 'axios';

await Actor.init();

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyWJN1kcwtomVHzCtdXSsW3ScEYsea7C3bPRVyWJbCifCr77TNXDZLAVUhodib8rESOwA/exec';
const WEBHOOK_INPUT_URL = 'https://s1.boomerangserver.co.in/webhook/private-profiles-scraper';
const WEBHOOK_STATUS_URL = 'https://s1.boomerangserver.co.in/webhook/private-profile-export-request-stats';

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

// Step 1: Save URLs to Apify Key-Value Store
console.log('Saving URLs to Apify Key-Value Store...');
const kvStoreKey = `${customerName.replace(/\s+/g, '-')}-linkedin-urls`;
await Actor.setValue(kvStoreKey, allLinkedinUrls);
const defaultKvStore = await Actor.openKeyValueStore();
const kvStoreId = defaultKvStore.id;
const kvStoreUrl = `https://api.apify.com/v2/key-value-stores/${kvStoreId}/records/${kvStoreKey}`;
console.log(`✅ Key-Value Store URL: ${kvStoreUrl}`);

// Step 2: Save to Google Drive
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

// Step 3: Send to Webhook Input
console.log('Sending to Webhook Input...');

const webhookPayload = {
    service_name: serviceName || 'LinkedIn Scraping',
    service_request_tag_name: serviceRequestTagName || 'linkedin-scraping',
    service_request_url: kvStoreUrl,
    source: 'apify',
    dev_name: 'Assignment'
};

console.log('Webhook payload:', JSON.stringify(webhookPayload));

let requestId = null;

try {
    const webhookResponse = await axios.post(WEBHOOK_INPUT_URL, webhookPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
    });

    console.log('Full webhook response:', JSON.stringify(webhookResponse.data));

    requestId = webhookResponse.data.request_id ||
                webhookResponse.data.requestId ||
                webhookResponse.data.id;

    console.log(`✅ Request ID: ${requestId}`);

} catch (error) {
    console.log(`⚠️ Webhook error: ${error.message}`);
    console.log(`Error status: ${error.response?.status}`);
    console.log(`Error data: ${JSON.stringify(error.response?.data)}`);
    await Actor.setValue('OUTPUT', {
        customerName,
        inputMode,
        totalUrls: allLinkedinUrls.length,
        linkedinUrls: allLinkedinUrls,
        googleSheetUrl: sheetUrl,
        kvStoreUrl,
        webhookError: error.message,
        status: 'webhook_failed'
    });
    await Actor.exit();
}

// Step 4: Poll Status Webhook
if (requestId) {
    console.log('Polling status webhook...');

    let status = 'processing';
    let attempts = 0;
    let resultData = null;

    while (status !== 'completed' && attempts < 10) {
        attempts++;
        console.log(`Attempt ${attempts} - Checking status for: ${requestId}`);

        try {
            const statusResponse = await axios.post(WEBHOOK_STATUS_URL, {
                request_id: requestId
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 60000
            });

            console.log('Status response:', JSON.stringify(statusResponse.data));
            status = statusResponse.data.status ||
                     statusResponse.data.Status ||
                     'processing';

            if (status === 'completed' || status === 'Completed') {
                console.log(`✅ Completed!`);
                resultData = statusResponse.data;
                break;
            }

        } catch (error) {
            console.log(`Status check error: ${error.message}`);
        }

        console.log(`Status: "${status}", waiting 3 minutes...`);
        await new Promise(resolve => setTimeout(resolve, 3 * 60 * 1000));
    }

    await Actor.setValue('OUTPUT', {
        customerName,
        inputMode,
        totalUrls: allLinkedinUrls.length,
        linkedinUrls: allLinkedinUrls,
        googleSheetUrl: sheetUrl,
        kvStoreUrl,
        requestId,
        status,
        result: resultData
    });
}

console.log('✅ All done!');
await Actor.exit();
