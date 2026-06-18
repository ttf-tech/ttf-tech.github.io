(function () {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  function active(href) {
    return page === href ? ' style="color:#fbbf24;"' : '';
  }
  const html = `
  <footer class="site-footer">
    <div class="site-footer-inner">
      <div class="site-footer-brand">
        <strong>🇹🇼 Taiwan Tech France</strong>
        <span>在法臺灣科技社群 · Communauté tech taïwanaise en France</span>
      </div>
      <div class="site-footer-copy">
        &copy; 2026 Taiwan Tech France
        <em>Association Loi 1901 · RNA W061018695 · Fait avec ❤️ par la communauté · 由社群共同打造</em>
      </div>
      <div class="site-footer-links">
        <a href="https://chat.whatsapp.com/KHbrXiHLP9D5GdN6rgqlxy" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> WhatsApp</a>
        <a href="https://github.com/ttf-tech/ttf-tech.github.io" target="_blank" rel="noopener"><i class="fab fa-github"></i> GitHub</a>
        <a href="https://www.linkedin.com/company/taiwan-tech-france-association" target="_blank" rel="noopener"><i class="fab fa-linkedin"></i> LinkedIn</a>
        <a href="association.html"${active('association.html')}><i class="fas fa-landmark"></i> Association</a>
        <a href="legal.html"${active('legal.html')}><i class="fas fa-balance-scale"></i> Mentions légales</a>
        <a href="admin.html"${active('admin.html')}><i class="fas fa-lock"></i> Admin</a>
      </div>
    </div>
  </footer>`;
  const el = document.getElementById('site-footer');
  if (el) el.outerHTML = html;
})();
