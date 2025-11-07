import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import * as Sentry from "@sentry/react";

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

Sentry.init({
  dsn: "https://84233d687db1d4dace08a2098982dfcf@o4510314912219136.ingest.us.sentry.io/4510314913857536",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(), // opcional: permite grabar sesiones
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1, // opcional
  replaysOnErrorSampleRate: 1.0, // opcional
});
