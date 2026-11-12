import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme } from './lib/theme';
import { handleStaleChunks, registerServiceWorker } from './lib/pwa';
import './styles/index.css';

applyTheme();
handleStaleChunks();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
