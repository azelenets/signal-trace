import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@azelenets/aegis-design-system/globals.css';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
