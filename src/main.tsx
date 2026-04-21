
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css'

declare global {
  interface Window {
    Paddle: any;
  }
}

const paddleToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
if (paddleToken && window.Paddle) {
  window.Paddle.Setup({ token: paddleToken });
  if (import.meta.env.DEV) {
    window.Paddle.Environment.set('sandbox');
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
