import React from 'react';
import ReactDOM from 'react-dom/client';
// Bundled locally so the panel looks the same with or without internet.
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
// ONE set of design tokens for the POS and this panel.
import '@pos/styles/ui-tokens.css';
import './index.css';
import App from './App';
import Verify from './Verify';

// An invoice QR opens this panel with ?verify=<code>: show the public
// verification view, which needs no sign-in.
const verifyCode = new URLSearchParams(window.location.search).get('verify');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{verifyCode ? <Verify code={verifyCode} /> : <App />}</React.StrictMode>
);
