import { subscribeToPush } from '../src/web-push.js';

const apiUrl = 'https://YOUR-API.example';
const apiKey = 'YOUR_PUBLIC_PROJECT_KEY';
const publicKey = 'YOUR_VAPID_PUBLIC_KEY';

// Call this handler only after the visitor actively clicks the subscribe button.
document.querySelector('#subscribe').addEventListener('click', async () => {
  try {
    const serviceWorkerRegistration = await navigator.serviceWorker.ready;
    const result = await subscribeToPush({
      apiUrl,
      apiKey,
      publicKey,
      serviceWorkerRegistration,
      requestPermission: true
    });
    document.querySelector('#msg').textContent = 'Subscribed ' + result.subscriberId;
  } catch (error) {
    document.querySelector('#msg').textContent = error.message;
  }
});
