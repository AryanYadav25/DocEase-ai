import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProviders } from '@/app/providers';
import { AppRouter } from '@/app/router';
import { applyTheme } from '@/hooks/useTheme';
import '@/styles/index.css';

// Apply the saved theme before first paint to avoid a flash.
try {
  const saved = localStorage.getItem('docuease:theme');
  applyTheme(saved === 'dark' || saved === 'system' ? saved : 'light');
} catch {
  /* ignore */
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </React.StrictMode>,
);
