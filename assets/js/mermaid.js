(() => {
  if (!window.mermaid) return;

  const preferredTheme = document.currentScript.dataset.theme;
  const lightTheme = ['default', 'neutral', 'forest', 'base'].includes(preferredTheme) ? preferredTheme : 'default';
  const diagrams = Array.from(document.querySelectorAll('.post-content .language-mermaid, .post-content .mermaid'))
    .filter(node => !node.parentElement.closest('.language-mermaid, .mermaid'))
    .map((node, index) => {
      const original = node.matches('code') ? node.closest('pre') || node : node;
      const source = (original.querySelector('code') || original).textContent.trim();
      const figure = document.createElement('figure');
      figure.className = 'mermaid-figure';
      const diagram = document.createElement('div');
      diagram.className = 'mermaid-diagram';
      diagram.tabIndex = 0;
      diagram.setAttribute('role', 'region');
      diagram.setAttribute('aria-label', source.match(/^\s*accTitle:\s*(.+)$/m)?.[1] || `Diagram ${index + 1}`);
      const details = document.createElement('details');
      details.className = 'mermaid-source';
      const summary = document.createElement('summary');
      summary.textContent = 'View diagram source';
      const status = document.createElement('p');
      status.className = 'mermaid-status';
      status.setAttribute('role', 'status');
      status.hidden = true;

      original.replaceWith(figure);
      details.append(summary, original);
      figure.append(diagram, status, details);
      return { source, diagram, details, status, id: `article-diagram-${index}` };
    });

  async function renderDiagrams() {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : lightTheme;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });

    for (const { source, diagram, details, status, id } of diagrams) {
      try {
        await mermaid.parse(source);
        const { svg, bindFunctions } = await mermaid.render(id, source);
        diagram.innerHTML = svg;
        const drawing = diagram.querySelector('svg');
        drawing.style.width = `${drawing.viewBox.baseVal.width}px`;
        drawing.style.maxWidth = 'none';
        diagram.hidden = false;
        status.hidden = true;
        bindFunctions?.(diagram);
      } catch (_) {
        diagram.hidden = true;
        status.textContent = 'This diagram could not be rendered. Its source is shown below.';
        status.hidden = false;
        details.open = true;
      }
    }
  }

  let rendering = renderDiagrams();
  new MutationObserver(() => {
    rendering = rendering.then(renderDiagrams);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
