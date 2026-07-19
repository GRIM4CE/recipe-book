import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// iOS Safari ignores maximum-scale/user-scalable in the viewport meta for
// pinch gestures, so block them explicitly to keep the view fixed.
document.addEventListener('gesturestart', (e) => e.preventDefault());

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the service worker so the app is installable and works offline.
// Only in production builds — a caching worker would fight Vite's dev HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
