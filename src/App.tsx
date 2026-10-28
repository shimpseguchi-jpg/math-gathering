import React, { useEffect } from 'react';
// @ts-ignore
import { title } from '../js/ui/app.js';

export function App() {
  useEffect(() => {
    try {
      // Ensure #sheet element exists
      if (!document.getElementById('sheet')) {
        const sheetDiv = document.createElement('div');
        sheetDiv.id = 'sheet';
        sheetDiv.hidden = true;
        document.body.appendChild(sheetDiv);
      }
      title();
    } catch (e) {
      console.error('Failed to initialize Math-the-Gathering:', e);
    }
  }, []);

  return null;
}

export default App;
