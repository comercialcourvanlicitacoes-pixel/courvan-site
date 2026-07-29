/* ==========================================================================
   COURVAN LICITAÇÕES - GERENCIADOR DE TEMAS (PERSISTÊNCIA E INTERAÇÃO)
   ========================================================================== */

(function () {
  function getSavedTheme() {
    return localStorage.getItem('courvan_theme') || 'dark';
  }

  function applyTheme(theme) {
    const isLight = theme === 'light';
    
    if (isLight) {
      document.documentElement.classList.add('light-mode');
      if (document.body) document.body.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
      if (document.body) document.body.classList.remove('light-mode');
    }

    localStorage.setItem('courvan_theme', theme);
    updateToggleButtons(isLight);
  }

  function updateToggleButtons(isLight) {
    const buttons = document.querySelectorAll('.theme-toggle-btn, [data-theme-toggle]');
    buttons.forEach((btn) => {
      if (btn) {
        btn.innerHTML = isLight ? '🌙 Modo Escuro' : '☀️ Modo Claro';
        btn.setAttribute('title', isLight ? 'Alternar para Modo Escuro' : 'Alternar para Modo Claro');
      }
    });
  }

  window.toggleTheme = function () {
    const current = getSavedTheme();
    const nextTheme = current === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
  };

  window.applyTheme = applyTheme;

  // Aplicação instantânea antes da renderização do DOM para evitar flickering
  const initialTheme = getSavedTheme();
  if (initialTheme === 'light') {
    document.documentElement.classList.add('light-mode');
  }

  // Atualização dos botões após o DOM carregar
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getSavedTheme());
  });
})();
