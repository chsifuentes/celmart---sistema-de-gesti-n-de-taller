import {lazy, StrictMode, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import { registerPWA } from './lib/pwa';
import './index.css';

const trackingId = new URLSearchParams(window.location.search).get('track');
const App = lazy(() => import('./App.tsx'));
const PublicOrderTracker = lazy(() => import('./components/PublicOrderTracker').then((module) => ({ default: module.PublicOrderTracker })));

registerPWA();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<p role="status" className="p-6 text-center text-zinc-400">Cargando CelMart…</p>}>
      {trackingId !== null ? <PublicOrderTracker orderId={trackingId} /> : <App />}
    </Suspense>
  </StrictMode>,
);
