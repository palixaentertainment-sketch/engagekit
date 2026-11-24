## Website integration

1. Fetch `GET /v1/push/public-key` to obtain the VAPID public key.
2. Call `subscribeToPush` only inside a visitor-initiated click handler. Set `requestPermission: true` when you want the SDK to request permission. Without that option, the SDK never opens a permission prompt; it proceeds only if permission is already granted.
3. If your website already has a service worker, wait for `navigator.serviceWorker.ready` and pass that registration as `serviceWorkerRegistration`. EngageKit reuses it and does not register a second worker. Add EngageKit's `push` and `notificationclick` event handlers to that existing worker; do not overwrite your existing worker or its handlers.
4. If your website has no service worker, omit `serviceWorkerRegistration` and the SDK will reuse an existing registration if present, otherwise register `/engagekit-sw.js`. Deploy `public/engagekit-sw.js` at the website root for this fallback.
5. HTTPS is required except on localhost.

For Palixia, use its existing root `/sw.js` registration and merge the EngageKit push and notification-click handlers into that file. Do not register `/engagekit-sw.js` on Palixia.
