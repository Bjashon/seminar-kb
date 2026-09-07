import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// No StrictMode: its dev-only mount->unmount->remount cycle races with
// MathJax's async typesetPromise() calls in useMathJax, leaving the first
// (detached) render's math untypeset and the final DOM with raw $...$ text.
createRoot(document.getElementById('root')!).render(<App />)
