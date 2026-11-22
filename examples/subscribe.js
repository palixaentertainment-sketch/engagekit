import { subscribeToPush } from '../src/web-push.js';

const apiUrl = 'https://YOUR-API.example';
const apiKey = 'YOUR_PROJECT_API_KEY';
const publicKey = 'YOUR_VAPID_PUBLIC_KEY';

document.querySelector('#subscribe').onclick = async () => {
  try {
    const subscription = await subscribeToPush({ apiUrl, apiKey, publicKey });
    document.querySelector('#msg').textContent = 'Subscribed ' + subscription.subscriberId;
  } catch (error) {
    document.querySelector('#msg').textContent = error.message;
  }
};
