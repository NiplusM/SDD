import './fonts.css';
import '@jetbrains/int-ui-kit/styles.css';
import * as React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import PlanDiffPage from './PlanDiffPage.jsx';
import { isPlanDiffPagePath } from './planDiffPageState.js';

// The library calls React.createElement without importing React by that name,
// so we expose it as a global before the first render.
window.React = React;

const RootComponent = isPlanDiffPagePath(window.location.pathname) ? PlanDiffPage : App;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>
);
