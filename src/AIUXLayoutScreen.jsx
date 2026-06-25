import './AIUXLayoutScreen.css';
import App from './App.jsx';

export default function AIUXLayoutScreen() {
  return (
    <App
      initialScreen="ide"
      initialEditorTabId="aiux-new-session"
      initialOpenToolWindows={['project']}
    />
  );
}
