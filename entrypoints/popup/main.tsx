import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/src/styles/globals.css';
import { PopupApp } from '@/src/components/popup/PopupApp';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
