import './fonts.css';
import '@jetbrains/int-ui-kit/styles.css';
import * as React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

// The library calls React.createElement without importing React by that name,
// so we expose it as a global before the first render.
window.React = React;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
