## Website integration

1. Fetch `GET /v1/push/public-key` to obtain the VAPID public key.
2. Call `subscribeToPush` only inside a visitor-initiated click handler. Set `requestPermission: true` if the SDK should request permission. Without that option, it never opens a permission prompt and proceeds only when permission is already granted.
3. If your website already has a service worker, wait for `navigator.serviceWorker.ready` and pass that registration as `serviceWorkerRegistration`. EngageKit reuses it and does not register a second worker. Merge EngageKit's `push` and `notificationclick` event handlers into that existing worker; do not overwrite existing handlers.
4. If the website has no service worker, omit `serviceWorkerRegistration`; the SDK reuses an existing registration if available, otherwise registers `/engagekit-sw.js`. Deploy `public/engagekit-sw.js` at the website root for this fallback.
5. HTTPS is required except on localhost.

For Palixia, use its existing root `/sw.js` registration and merge the EngageKit push and notification-click handlers into that file. Do not register `/engagekit-sw.js` on Palixia.
