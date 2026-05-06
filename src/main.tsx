import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Handle Auth callbacks and clean URLs for HashRouter
if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
  const cleanPath = window.location.pathname;
  const search = window.location.search;
  const existingHash = window.location.hash;
  
  // Clear the path part, move into hash
  window.history.replaceState(null, '', '/');
  
  if (cleanPath === '/auth/callback') {
    // For Supabase OAuth, preserve the hash data so getSession can find it
    // We convert the fragment to search params so it's easier to parse if needed
    const fragment = existingHash.replace(/^#/, '');
    const connector = fragment.includes('?') ? '&' : '?';
    window.location.hash = `#/auth/callback${connector}${fragment}`;
  } else {
    window.location.hash = `#${cleanPath}${search}${existingHash}`;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
