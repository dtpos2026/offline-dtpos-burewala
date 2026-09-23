import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Verify from './Verify';

// An invoice QR opens this panel with ?verify=<code>: show the public
// verification view, which needs no sign-in.
const verifyCode = new URLSearchParams(window.location.search).get('verify');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{verifyCode ? <Verify code={verifyCode} /> : <App />}</React.StrictMode>
);
