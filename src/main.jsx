import './fonts.css';
import '@jetbrains/int-ui-kit/styles.css';
import * as React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The library calls React.createElement without importing React by that name,
// so we expose it as a global before the first render.
window.React = React;

async function bootstrap() {
  const [{ default: App }, { default: PlanDiffPage }, { isPlanDiffPagePath }] = await Promise.all([
    import('./App.jsx'),
    import('./PlanDiffPage.jsx'),
    import('./planDiffPageState.js'),
  ]);

  const RootComponent = isPlanDiffPagePath(window.location.pathname) ? PlanDiffPage : App;

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <RootComponent />
    </StrictMode>
  );
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap app', error);
});
