document.addEventListener('DOMContentLoaded', () => {
  /*
  =========================================================
  CONFIG
  =========================================================
  */
  const API_BASE = 'https://suitmedia-backend.suitdev.com/api/ideas';

  
    if (!window.location.pathname.includes('ideas.html')) {
    // Jangan jalankan logika Ideas jika bukan di ideas.html
    console.log('Bukan halaman Ideas. Lewati fetch data.');
    return;
  }

  /*
  /*
  =========================================================
  DOM HOOKS
  =========================================================
  */
  const header         = document.querySelector('header');
  const paginationNav  = document.querySelector('.pagination');
  const cardsContainer = document.getElementById('cards-container');
  const sortSelect     = document.getElementById('sort-by');
  const perPageSelect  = document.getElementById('show-per-page');
  const showingLabelEl = document.querySelector('[data-showing-label]') 
                       || document.querySelector('.showing-label-wrapper') 
                       || document.querySelector('main > div:first-child > div:first-child'); // fallback: elemen teks "Showing X - Y of total"
  const parallaxBg     = document.getElementById('parallax-bg'); // optional

  /*
  =========================================================
  STATE (persisted)
  =========================================================
  */
  let currentPage  = parseInt(localStorage.getItem('currentPage')  || '1', 10);
  let currentSort  = localStorage.getItem('sortBy')      || 'newest'; // 'newest' | 'oldest'
  let currentSize  = parseInt(localStorage.getItem('showPerPage') || '10', 10);

  // Sink restored state into the form controls (if they exist)
  if (sortSelect)    sortSelect.value    = currentSort;
  if (perPageSelect) perPageSelect.value = currentSize;

  /*
  =========================================================
  HELPERS
  =========================================================
  // */
  function buildApiUrl(page, size, sortUiValue) {
    const sortParam = sortUiValue === 'newest' ? '-published_at' : 'published_at';
    const params = new URLSearchParams();
    params.set('page[number]', page);
    params.set('page[size]', size);
    params.append('append[]', 'small_image');
    params.append('append[]', 'medium_image');
    params.set('sort', sortParam);
    return `${API_BASE}?${params.toString()}`;
  }

//   function buildApiUrl(page, size, sortUiValue) {
//   const sortParam = sortUiValue === 'newest' ? '-published_at' : 'published_at';
//   const params = new URLSearchParams();
//   params.set('page[number]', page);
//   params.set('page[size]', size);
//   params.append('append[]', 'small_image');
//   params.append('append[]', 'medium_image');
//   params.set('sort', sortParam);

//   return `/api/ideas?${params.toString()}`;
// }


  // Format tanggal ke bahasa Indonesia (fallback ke ISO kalau error)
  function formatDate(idate) {
    try {
      const d = new Date(idate);
      return d.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
    } catch {
      return idate;
    }
  }

  // Mendapatkan image URL dari struktur API yang bisa bervariasi
  function getImageUrl(item) {
    // JSON:API style? coba cek di beberapa path umum
    // 1. Langsung item.small_image
    if (item.small_image) return item.small_image;
    // 2. item.attributes.small_image
    if (item.attributes?.small_image) return item.attributes.small_image;
    // fallback medium_image
    if (item.medium_image) return item.medium_image;
    if (item.attributes?.medium_image) return item.attributes.medium_image;
    // fallback placeholder
    return 'https://placehold.co/600x336?text=No+Image';
  }

  function getTitle(item) {
    return item.title || item.attributes?.title || 'Untitled';
  }

  function getPublishedAt(item) {
    return item.published_at || item.attributes?.published_at || null;
  }

  // Update teks "Showing X - Y of T"
  function updateShowingLabel(page, size, total) {
    if (!showingLabelEl) return;
    const start = (page - 1) * size + 1;
    const end   = Math.min(page * size, total);
    showingLabelEl.textContent = `Showing ${start} - ${end} of ${total}`;
  }

  /*
  =========================================================
  PAGINATION BUTTONS
  (We rebuild numeric buttons each update; first/prev/next/last captured once)
  =========================================================
  */
  // Capture arrow buttons (assume order: ««, «, [numbers], », »»)
  const firstBtn = paginationNav?.querySelector('button[aria-label="First page"]') 
                || paginationNav?.querySelector('button[title="First page"]');
  const prevBtn  = paginationNav?.querySelector('button[aria-label="Previous page"]');
  const nextBtn  = paginationNav?.querySelector('button[aria-label="Next page"]');
  const lastBtn  = paginationNav?.querySelector('button[aria-label="Last page"]');

  // We'll track totalPages from API response
  let totalPages = 1;
  let totalItems = 0;

  function clearNumberButtons() {
    if (!paginationNav) return;
    [...paginationNav.querySelectorAll('button')]
      .filter(btn => ![firstBtn, prevBtn, nextBtn, lastBtn].includes(btn))
      .forEach(btn => btn.remove());
  }

  function renderNumberButtons() {
    if (!paginationNav) return;
    clearNumberButtons();

    // Insert numeric buttons before nextBtn
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.textContent = i;
      btn.className = 'px-3 py-1 rounded border border-gray-300 hover:bg-gray-200';
      btn.setAttribute('aria-label', `Page ${i}`);
      btn.setAttribute('title',     `Page ${i}`);
      if (i === currentPage) {
        btn.classList.add('active');
        btn.setAttribute('aria-current', 'page');
      }
      btn.addEventListener('click', () => {
        if (i === currentPage) return;
        currentPage = i;
        localStorage.setItem('currentPage', String(currentPage));
        fetchAndRender(); // re-fetch this page
      });

      // Insert before nextBtn (if exists) else before lastBtn, else append
      if (nextBtn && paginationNav.contains(nextBtn)) {
        paginationNav.insertBefore(btn, nextBtn);
      } else if (lastBtn && paginationNav.contains(lastBtn)) {
        paginationNav.insertBefore(btn, lastBtn);
      } else {
        paginationNav.appendChild(btn);
      }
    }
  }

  function updateArrowStates() {
    if (firstBtn) firstBtn.disabled = currentPage <= 1;
    if (prevBtn)  prevBtn.disabled  = currentPage <= 1;
    if (nextBtn)  nextBtn.disabled  = currentPage >= totalPages;
    if (lastBtn)  lastBtn.disabled  = currentPage >= totalPages;
  }

  function attachArrowEvents() {
    if (firstBtn) firstBtn.addEventListener('click', () => {
      if (currentPage === 1) return;
      currentPage = 1;
      localStorage.setItem('currentPage', String(currentPage));
      fetchAndRender();
    });

    if (prevBtn) prevBtn.addEventListener('click', () => {
      if (currentPage <= 1) return;
      currentPage -= 1;
      localStorage.setItem('currentPage', String(currentPage));
      fetchAndRender();
    });

    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (currentPage >= totalPages) return;
      currentPage += 1;
      localStorage.setItem('currentPage', String(currentPage));
      fetchAndRender();
    });

    if (lastBtn) lastBtn.addEventListener('click', () => {
      if (currentPage === totalPages) return;
      currentPage = totalPages;
      localStorage.setItem('currentPage', String(currentPage));
      fetchAndRender();
    });
  }
  attachArrowEvents(); // run once

  /*
  =========================================================
  FETCH + RENDER
  =========================================================
  */
  async function fetchAndRender() {
    // Sink current form control -> state (in case user changed DOM manually)
    if (sortSelect) currentSort = sortSelect.value;
    if (perPageSelect) currentSize = parseInt(perPageSelect.value, 10) || 10;

    // Persist
    localStorage.setItem('sortBy', currentSort);
    localStorage.setItem('showPerPage', String(currentSize));
    localStorage.setItem('currentPage', String(currentPage));

    // Build URL
    const url = buildApiUrl(currentPage, currentSize, currentSort);
    // (Jika butuh proxy: fetch('/proxy?url=' + encodeURIComponent(url)) ... 
    // Untuk sekarang direct fetch.)
    showLoadingState(true);
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // Expected structure (defensif)
      // json.data = array items
      // json.meta.total atau json.meta.pagination.total
      const ideas = Array.isArray(json.data) ? json.data : [];
      totalItems = (
        json.meta?.total ??
        json.meta?.pagination?.total ??
        ideas.length
      );
      totalPages = Math.max(1, Math.ceil(totalItems / currentSize));

      // Render cards
      renderCardsFromApi(ideas);

      // Update showing label
      updateShowingLabel(currentPage, currentSize, totalItems);

      // Update pagination UI
      renderNumberButtons();
      updateArrowStates();
    } catch (err) {
      console.error('Fetch error:', err);
      showErrorState();
    } finally {
      showLoadingState(false);
    }
  }

  function renderCardsFromApi(items) {
    if (!cardsContainer) return;
    cardsContainer.innerHTML = '';

    items.forEach(item => {
      const title = getTitle(item);
      const publishedAtRaw = getPublishedAt(item);
      const dateHuman = publishedAtRaw ? formatDate(publishedAtRaw) : '';
      const imgUrl = getImageUrl(item);

      const card = document.createElement('article');
      card.className = 'bg-white rounded-lg p-3 shadow-sm card-shadow overflow-hidden flex flex-col cursor-pointer hover:shadow-lg transition-shadow duration-300';

      card.innerHTML = `
        <time datetime="${publishedAtRaw ?? ''}" class="text-xs text-gray-400 mb-1 select-none">${dateHuman}</time>
        <img
          class="w-full rounded-md mb-2 aspect-video object-cover"
          src="${imgUrl}"
          alt="${escapeHtml(title)}"
          loading="lazy"
        />
        <h2 class="text-gray-900 font-semibold text-sm leading-snug">${escapeHtml(title)}</h2>
      `;
      cardsContainer.appendChild(card);
    });
  }


  /*
  =========================================================
  LOADING / ERROR STATES (optional UI tweaks)
  =========================================================
  */
  function showLoadingState(on) {
    if (!cardsContainer) return;
    if (on) {
      cardsContainer.setAttribute('aria-busy', 'true');
      cardsContainer.classList.add('opacity-60', 'pointer-events-none');
    } else {
      cardsContainer.removeAttribute('aria-busy');
      cardsContainer.classList.remove('opacity-60', 'pointer-events-none');
    }
  }

  function showErrorState() {
    if (!cardsContainer) return;
    cardsContainer.innerHTML = `
      <div class="col-span-full text-center text-red-500 py-10">
        Failed to load data. Please try again.
      </div>
    `;
  }

  /*
  =========================================================
  EVENT: SORT & PER-PAGE SELECT
  =========================================================
  */
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      currentSort = sortSelect.value;
      currentPage = 1; // reset page
      fetchAndRender();
    });
  }

  if (perPageSelect) {
    perPageSelect.addEventListener('change', () => {
      currentSize = parseInt(perPageSelect.value, 10) || 10;
      currentPage = 1; // reset page
      fetchAndRender();
    });
  }

  /*
  =========================================================
  ACTIVE MENU STATE
  =========================================================
  */
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  const menuLinks = document.querySelectorAll('nav ul li a');
  menuLinks.forEach(link => {
    const href = link.getAttribute('href');
    // Jika href '#' anggap bukan page
    if (!href || href === '#') return;
    if (href === currentPath) {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    }
  });

  /*
  =========================================================
  HEADER HIDE/SHOW ON SCROLL + TRANSPARENT BG
  =========================================================
  */
  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    if (currentScrollY > lastScrollY && currentScrollY > 80) {
      // scroll down → hide
      header.style.top = '-80px';
    } else {
      // scroll up → show
      header.style.top = '0';
      header.classList.add('transparent');
    }
    if (currentScrollY === 0) {
      // at top: full solid
      header.classList.remove('transparent');
    }
    lastScrollY = currentScrollY;
  });

  /*
  =========================================================
  PARALLAX BANNER (optional, only if #parallax-bg exists)
  =========================================================
  */
  if (parallaxBg) {
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      // adjust multiplier sesuai rasa
      parallaxBg.style.transform = `translateY(${scrollY * 0.3}px)`;
    });
  }

  /*
  =========================================================
  HTML ESCAPE (simple)
  =========================================================
  */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /*
  =========================================================
  INIT FIRST LOAD
  =========================================================
  */
  fetchAndRender();
});
