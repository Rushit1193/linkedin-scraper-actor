import { Actor } from 'apify';
import axios from 'axios';

await Actor.init();

// Get input from the actor
const input = await Actor.getInput();
console.log('Input received:', input);

const { linkedinUrls = [] } = input;

console.log('LinkedIn URLs to process:', linkedinUrls);

await Actor.exit();
