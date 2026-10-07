// Online pages follow the app's appearance settings (accent, TV layout) before first paint.
try {
  document.documentElement.dataset.accent = localStorage.getItem('retrooasis.accent') === 'ps' ? 'ps' : 'sega'
  if (localStorage.getItem('retrooasis.layout') === 'tv') document.documentElement.dataset.layout = 'tv'
} catch { document.documentElement.dataset.accent = 'sega' }
