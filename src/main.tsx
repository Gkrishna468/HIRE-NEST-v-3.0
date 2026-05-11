import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Handle Auth callbacks and clean URLs for HashRouter
const pathname = window.location.pathname;
const search = window.location.search;
const hash = window.location.hash;

if (pathname !== '/' && pathname !== '/index.html') {
  // If we have a path like /auth/callback, we want it to become #/auth/callback
  // preservation of search/hash is critical for OAuth fragments
  window.history.replaceState(null, '', '/');
  
  if (pathname === '/auth/callback') {
    // Standardize OAuth callback for HashRouter
    // We preserve search (?code=...) and fragment (#access_token=...)
    window.location.hash = `#/auth/callback${search}${hash}`;
  } else {
    window.location.hash = `#${pathname}${search}${hash}`;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

