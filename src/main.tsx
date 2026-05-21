
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

if (window.location.pathname === '/join') {
  import('./pages/JoinTeam').then(({ default: JoinTeam }) => {
    root.render(
      <React.StrictMode>
        <JoinTeam />
      </React.StrictMode>
    );
  }).catch((err) => {
    console.error('Failed to load JoinTeam page:', err);
    root.render(
      <React.StrictMode>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '1rem' }}>
          <div>
            <p style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>Couldn’t load the invite page</p>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>Please check your connection and refresh, or open the link again.</p>
          </div>
        </div>
      </React.StrictMode>
    );
  });
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
