export async function subscribeToPush({apiUrl,apiKey,serviceWorkerPath='/engagekit-sw.js',publicKey,subscriberId}={}) {
  if (!apiUrl || !apiKey || !publicKey) throw TypeError('apiUrl, apiKey and publicKey required');
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window))
    throw Error('Push unsupported');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw Error('Permission denied');
  const registration = await navigator.serviceWorker.register(serviceWorkerPath);
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

export async function unsubscribeFromPush({apiUrl,apiKey}={}) {
  if (!apiUrl || !apiKey) throw TypeError('apiUrl and apiKey required');
  if (!('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
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
