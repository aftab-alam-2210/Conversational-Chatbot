/**
 * VVnT SeQuor AI Chatbot - Enterprise Embed Script
 * Embed this script into any external website (HTML, WordPress, Webflow, Shopify)
 *
 * Usage:
 * <script 
 *   src="https://your-bot-domain.com/embed.js" 
 *   data-server="https://api.your-bot-domain.com"
 *   data-position="bottom-right"
 *   defer>
 * </script>
 */

(function () {
  const currentScript = document.currentScript || document.querySelector('script[src*="embed.js"]');
  const serverUrl = currentScript?.getAttribute('data-server') || 'http://localhost:5003';
  const localWidgetUrl = serverUrl.replace(/:5003(?=\/|$)/, ':5173');
  const widgetUrl = currentScript?.getAttribute('data-widget-url') ||
    (localWidgetUrl !== serverUrl ? localWidgetUrl : new URL('./', currentScript?.src || window.location.href).href);
  const position = currentScript?.getAttribute('data-position') || 'bottom-right';

  if (document.getElementById('vvnt-sequor-widget-container')) return;

  const container = document.createElement('div');
  container.id = 'vvnt-sequor-widget-container';
  container.style.position = 'fixed';
  container.style.zIndex = '999999';
  container.style.bottom = '20px';
  container.style.right = '20px';
  container.style.border = 'none';

  const iframe = document.createElement('iframe');
  iframe.src = widgetUrl;
  iframe.title = 'VVnT SeQuor AI Chatbot';
  iframe.style.width = '440px';
  iframe.style.height = '620px';
  iframe.style.border = 'none';
  iframe.style.background = 'transparent';
  iframe.allow = 'clipboard-write; microphone; autoplay';
  container.appendChild(iframe);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(container));
  } else {
    document.body.appendChild(container);
  }
})();
