export const THEME_KEY = 'nexez-theme'

export type ThemeChoice = 'light' | 'dark' | 'system'

// Runs synchronously in <head> before paint so the correct theme class is on
// <html> before the first render — no flash. Default is dark.
export const THEME_NO_FLASH_SCRIPT = `(function(){try{var k='${THEME_KEY}';var t=localStorage.getItem(k)||'dark';var r=t==='system'?(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;var c=document.documentElement.classList;c.remove('light','dark');c.add(r);}catch(e){}})();`
