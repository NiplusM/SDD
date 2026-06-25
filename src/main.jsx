import './fonts.css';
import '@jetbrains/int-ui-kit/styles.css';
import * as React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AIUXLayoutScreen from './AIUXLayoutScreen.jsx';
import PlanDiffPage from './PlanDiffPage.jsx';
import { isPlanDiffPagePath } from './planDiffPageState.js';

// The library calls React.createElement without importing React by that name in
// some bundled paths. Expose it when the host window allows globals, but do not
// block rendering in locked-down browser contexts.
try {
  window.React = React;
} catch {
  // Rendering can continue when the bundle already resolves React normally.
}

const RootComponent = isPlanDiffPagePath(window.location.pathname) ? PlanDiffPage : AIUXLayoutScreen;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootComponent />
  </StrictMode>
);
