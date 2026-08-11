/**
 * utils/mapHtml.ts
 *
 * The Leaflet map page we load into the location-picker WebView.
 *
 * Pure and dependency-free so it can be unit-tested and opened in a plain
 * browser, which is the only way to exercise the map without a native build.
 *
 * Only finite, range-checked numbers are interpolated — callers must pass
 * coordinates through `isUsableCoord` first. No hospital- or user-controlled
 * string reaches this HTML, which is the risk `utils/webviewSafe` guards.
 *
 * Protocol with React Native:
 *   WebView → RN  postMessage {type:'movestart'}
 *                 postMessage {type:'move', lat, lng, zoom}
 *                 postMessage {type:'error', message}
 *   RN → WebView  window.__fly(lat, lng, zoom)
 */

const LEAFLET_VERSION = '1.9.4';

export function mapHtml(lat: number, lng: number, zoom: number): string {
  // Belt and braces: the caller validates, but this string becomes executable
  // code, so never emit anything that is not a plain number.
  const n = (v: number, fallback: number) => (Number.isFinite(v) ? Number(v) : fallback);
  const safeLat  = n(lat, 16.5);
  const safeLng  = n(lng, 79.5);
  const safeZoom = n(zoom, 6);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css">
<style>
  html, body, #m { height: 100%; margin: 0; padding: 0; background: #E2E8F0; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="m"></div>
<script src="https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js"></script>
<script>
  (function () {
    function post(o) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o));
    }
    try {
      var map = L.map('m', { zoomControl: true, attributionControl: true })
                 .setView([${safeLat}, ${safeLng}], ${safeZoom});
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      function send() {
        var c = map.getCenter();
        post({ type: 'move', lat: c.lat, lng: c.lng, zoom: map.getZoom() });
      }
      map.on('movestart', function () { post({ type: 'movestart' }); });
      map.on('moveend', send);
      map.whenReady(send);

      window.__fly = function (la, ln, z) { map.flyTo([la, ln], z, { duration: 0.8 }); };
    } catch (e) {
      post({ type: 'error', message: String(e && e.message ? e.message : e) });
    }
  })();
  true;
</script>
</body>
</html>`;
}
