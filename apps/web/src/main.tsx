import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { useTwinStore } from './state/store';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// A small handle for end-to-end tests and debugging in the console.
declare global {
  interface Window {
    __factoryTwin?: typeof useTwinStore;
  }
}
window.__factoryTwin = useTwinStore;
