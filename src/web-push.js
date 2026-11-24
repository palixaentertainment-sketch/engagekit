export async function subscribeToPush({
  apiUrl, apiKey, serviceWorkerPath = '/engagekit-sw.js',
  serviceWorkerRegistration, publicKey, subscriberId, requestPermission = false
} = {}) {
  if (!apiUrl || !apiKey || !publicKey) throw TypeError('apiUrl, apiKey and publicKey required');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    throw Error('Push unsupported');

  let permission = Notification.permission;
  if (permission === 'default' && requestPermission === true) {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw Error(permission === 'denied'
      ? 'Notification permission is blocked in browser settings'
      : 'Notification permission not granted. Call from a user click with requestPermission: true');
  }

  // Reuse an explicitly supplied registration (recommended for existing workers).
  let registration = serviceWorkerRegistration;
  if (registration && !registration.pushManager) {
    throw TypeError('serviceWorkerRegistration must be a ServiceWorkerRegistration');
  }
  if (!registration) registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    if (!serviceWorkerPath) throw Error('No service worker registration available');
    registration = await navigator.serviceWorker.register(serviceWorkerPath);
  }

  const subscription = await registration.pushManager.getSubscription() ||
    await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
  const response = await fetch(apiUrl.replace(/\/$/, '') + '/v1/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-engagekit-key': apiKey },
    body: JSON.stringify({ subscription, subscriberId })
  });
  if (!response.ok) throw Error('Subscribe failed (' + response.status + ')');
  const result = await response.json();
  return { registration, subscription, subscriberId: result.subscriberId };
}

export async function unsubscribeFromPush({apiUrl,apiKey,serviceWorkerRegistration}={}) {
  if (!apiUrl || !apiKey) throw TypeError('apiUrl and apiKey required');
  if (!('serviceWorker' in navigator)) return false;
  const registration = serviceWorkerRegistration || await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const response = await fetch(apiUrl.replace(/\/$/, '') + '/v1/push/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-engagekit-key': apiKey },
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });
  if (!response.ok) throw Error('Unsubscribe failed (' + response.status + ')');
  return subscription.unsubscribe();
}

function decodeKey(key) {
  const value = key.replace(/-/g, '+').replace(/_/g, '/');
  const padded = value.padEnd(value.length + ((4 - value.length % 4) % 4), '=');
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}
