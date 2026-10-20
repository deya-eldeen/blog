async function copySnippet(code, button, status) {
  button.disabled = true;
  try {
    await navigator.clipboard.writeText(code.textContent);
    button.textContent = 'Copied!';
    status.textContent = 'Code copied to clipboard.';
  } catch (_) {
    button.textContent = 'Copy failed';
    status.textContent = 'Could not copy. Select the snippet and copy it manually.';
  }
  window.setTimeout(() => {
    button.textContent = 'Copy';
    button.disabled = false;
    status.textContent = '';
  }, 2000);
}

function addSnippetCopyButtons() {
  document.querySelectorAll('.post-content pre').forEach(pre => {
    if (pre.closest('.code-snippet, .language-mermaid, .mermaid')) return;
    const snippet = document.createElement('div');
    snippet.className = 'code-snippet';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'snippet-copy';
    button.textContent = 'Copy';
    button.setAttribute('aria-label', 'Copy code snippet');
    const status = document.createElement('span');
    status.className = 'sr-only';
    status.setAttribute('role', 'status');
    button.addEventListener('click', () => copySnippet(pre.querySelector('code') || pre, button, status));
    pre.replaceWith(snippet);
    snippet.append(pre, button, status);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const menuButton = document.getElementById('menu-toggle');
  const navigation = document.getElementById('primary-nav');
  const themeButtons = document.querySelectorAll('[data-theme-toggle]');

  const closeMenu = () => {
    navigation.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
  };

  menuButton.addEventListener('click', () => {
    const isOpen = navigation.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuButton.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    if (isOpen) navigation.querySelector('a').focus();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.site-header')) closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navigation.classList.contains('is-open')) {
      closeMenu();
      menuButton.focus();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      window.location.href = document.querySelector('.header-search').href;
    }
  });

  const updateThemeButton = () => {
    const isDark = document.documentElement.dataset.theme === 'dark';
    themeButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
    });
  };

  themeButtons.forEach(button => button.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch (_) { /* Storage may be disabled. */ }
    updateThemeButton();
  }));
  updateThemeButton();
  addSnippetCopyButtons();

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    try {
      const response = await fetch(searchInput.dataset.index);
      if (!response.ok) throw new Error('Search index unavailable');
      const search = SimpleJekyllSearch({
        searchInput,
        resultsContainer: document.getElementById('results-container'),
        json: await response.json(),
        searchResultTemplate: '<li class="search-result"><a href="{url}"><h2>{title}</h2></a><p class="search-result-meta">{date}</p><p>{excerpt}</p></li>',
        noResultsText: '<li class="search-empty">No articles found. Try another keyword or topic.</li>',
        limit: 20,
        fuzzy: false,
        exclude: []
      });
      // A reader may start typing before the index finishes downloading.
      search.search(searchInput.value);
    } catch (_) {
      document.getElementById('results-container').innerHTML = '<li class="search-empty">Search is unavailable right now. Please try again or browse Articles.</li>';
    }
  }
});
