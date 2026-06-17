export const THEME_KEY = 'nexez-theme'

export type ThemeChoice = 'light' | 'dark' | 'system'

// Runs synchronously in <head> before paint so the correct theme class is on
// <html> before the first render — no flash. Default is LIGHT (the palette reads best
// in light); users can still pick dark/system via ThemeToggle (persists to localStorage).
export const THEME_NO_FLASH_SCRIPT = `(function(){try{var k='${THEME_KEY}';var t=localStorage.getItem(k)||'light';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;var c=document.documentElement.classList;c.remove('light','dark');c.add(r);}catch(e){}})();`
