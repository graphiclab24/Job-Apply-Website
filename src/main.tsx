import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// সার্ভিস ওয়ার্কার শুধু প্রোডাকশনে (লাইভ সাইটে), যাতে অফলাইন ও ইনস্টল কাজ করে
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker register failed:', err);
    });
  });
}
