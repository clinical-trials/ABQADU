import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global font reset
document.documentElement.style.cssText = `
  font-family: 'DM Sans', system-ui, sans-serif;
  background: #FAF7F2;
`;

const link = document.createElement('link');
link.href = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap';
link.rel = 'stylesheet';
document.head.appendChild(link);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
