
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import JoinFallback from './pages/JoinFallback';
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
    console.error('❌ Failed to load JoinTeam page:', err);
    root.render(
      <React.StrictMode>
        <JoinFallback />
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
