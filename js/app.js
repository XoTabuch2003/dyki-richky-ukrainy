/* Дикі річки України — main application */
(function () {
  'use strict';

  // ---------- State & Storage ----------
  const STORAGE_KEY = 'wild-rivers-data-v1';
  let state = {
    themes: [...DEFAULT_THEMES],
    articles: [...DEFAULT_ARTICLES],
    settings: { ...DEFAULT_SETTINGS },
    currentPage: 'home',
    currentArticleId: null,
    filters: { theme: '', type: '', search: '' },
    maps: {}
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.themes = parsed.themes || state.themes;
        state.articles = parsed.articles || state.articles;
        state.settings = { ...state.settings, ...(parsed.settings || {}) };
      }
    } catch (e) {
      console.warn('Load state failed', e);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        themes: state.themes,
        articles: state.articles,
        settings: state.settings
      }));
    } catch (e) {
      console.warn('Save failed', e);
    }
  }

  // Load shared data from data.json (for friends to see curator updates)
  // ----- Shared cloud (JSONBin) + GitHub data.json fallback -----
  function getCloudConfig() {
    const pub = (typeof window !== 'undefined' && window.CLOUD_CONFIG) ? window.CLOUD_CONFIG : {};
    return {
      binId: (state.settings.cloudBinId || pub.binId || '').trim(),
      apiKey: (state.settings.cloudApiKey || '').trim(),
      accessKey: (state.settings.cloudAccessKey || pub.accessKey || '').trim()
    };
  }

  async function loadSharedData() {
    const { binId } = getCloudConfig();

    // 1) JSONBin cloud (preferred — friends always see latest)
    if (binId) {
      try {
        const { accessKey, apiKey } = getCloudConfig();
        const headers = { 'X-Bin-Meta': 'false' };
        // Private bins need a key to read
        if (accessKey) headers['X-Access-Key'] = accessKey;
        else if (apiKey) headers['X-Master-Key'] = apiKey;
        const res = await fetch('https://api.jsonbin.io/v3/b/' + binId + '/latest', {
          headers,
          cache: 'no-store'
        });
        if (res.ok) {
          const body = await res.json();
          const data = body.record || body;
          if (data && Array.isArray(data.articles) && data.articles.length > 0) {
            state.articles = data.articles;
            if (Array.isArray(data.themes) && data.themes.length > 0) state.themes = data.themes;
            console.log('Loaded from JSONBin:', data.articles.length, 'articles');
            return true;
          }
        }
      } catch (e) {
        console.warn('JSONBin load failed', e);
      }
    }

    // 2) Fallback: data.json in the same repo (GitHub Pages)
    try {
      const res = await fetch('./data.json?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.articles) && data.articles.length > 0) {
          state.articles = data.articles;
          if (Array.isArray(data.themes) && data.themes.length > 0) state.themes = data.themes;
          console.log('Loaded data.json:', data.articles.length, 'articles');
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  async function saveToCloud() {
    const { binId, apiKey } = getCloudConfig();
    if (!binId) {
      alert('Спочатку вкажи Bin ID у Налаштуваннях (див. інструкцію нижче).');
      return false;
    }
    if (!apiKey) {
      alert('Для збереження потрібен API Key (Master Key) з jsonbin.io. Встав його в Налаштуваннях.');
      return false;
    }
    const payload = {
      themes: state.themes,
      articles: state.articles,
      exportedAt: new Date().toISOString()
    };
    try {
      const res = await fetch('https://api.jsonbin.io/v3/b/' + binId, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Master-Key': apiKey,
          'X-Bin-Versioning': 'false'
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(res.status + ' ' + t);
      }
      alert('✅ Опубліковано! Друзі після оновлення сторінки побачать свіжі статті.');
      return true;
    } catch (e) {
      alert('Помилка публікації: ' + e.message);
      return false;
    }
  }

  function downloadDataJson() {
    const payload = {
      themes: state.themes,
      articles: state.articles,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------- Routing ----------
  function getRoute() {
    const hash = location.hash.slice(1) || '/';
    const parts = hash.split('/').filter(Boolean);
    return { page: parts[0] || 'home', id: parts[1] || null };
  }

  function navigate(page, id) {
    location.hash = id ? `#/${page}/${id}` : `#/${page}`;
  }

  window.addEventListener('hashchange', render);
  window.addEventListener('load', async () => {
    loadState();                 // local curator edits first
    await loadSharedData();      // then overwrite with published data.json if present
    render();
  });

  // ---------- Helpers ----------
  function $(sel, ctx = document) { return ctx.querySelector(sel); }
  function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') e.className = v;
      else if (k === 'innerHTML') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    children.forEach(c => {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    });
    return e;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('uk-UA', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return iso; }
  }

  function getTheme(id) {
    return state.themes.find(t => t.id === id);
  }

  function getArticle(id) {
    return state.articles.find(a => a.id === id);
  }

  // ---------- Render ----------
  function render() {
    const route = getRoute();
    state.currentPage = route.page;
    state.currentArticleId = route.id;

    // Nav active
    $$('#main-nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.page === route.page);
    });

    const main = $('#main-content');
    main.innerHTML = '';

    switch (route.page) {
      case 'home': renderHome(main); break;
      case 'articles': renderArticles(main); break;
      case 'article': renderArticleDetail(main, route.id); break;
      case 'settings': renderSettings(main); break;
      case 'support': renderSupport(main); break;
      case 'create': renderCreateEdit(main, null); break;
      case 'edit': renderCreateEdit(main, route.id); break;
      default: renderHome(main);
    }

    // Close mobile menu
    $('#main-nav')?.classList.remove('open');
  }

  // ---------- Home ----------
  function renderHome(container) {
    // Hero
    const bannerUrl = state.settings.banner || 'img/hero.jpg';
    const hero = el('section', { className: 'hero', style: `background: linear-gradient(135deg, rgba(10,47,31,0.85), rgba(13,59,46,0.7)), url('${bannerUrl}') center/cover` }, [
      el('div', { className: 'hero-content' }, [
        el('h1', {}, ['Вітаю на «Диких річках України»']),
        el('p', {}, ['Авторський простір, присвячений життю українських водойм, таємницям їхніх глибин та дивовижній різноманітності підводного світу. Польові спостереження, нотатки з риболовлі, дослідження малих і великих річок.']),
        el('div', { className: 'hero-actions' }, [
          el('a', { href: '#/articles', className: 'btn btn-primary' }, ['Усі статті']),
          state.settings.curatorMode
            ? el('a', { href: '#/create', className: 'btn btn-accent' }, ['+ Нова стаття'])
            : null,
          el('a', { href: '#/support', className: 'btn btn-outline' }, ['Підтримати проєкт'])
        ])
      ])
    ]);
    container.appendChild(hero);

    // Themes quick
    const themesBar = el('div', { className: 'themes-bar' });
    state.themes.forEach(t => {
      themesBar.appendChild(el('button', {
        className: 'theme-chip',
        onClick: () => {
          state.filters.theme = t.id;
          navigate('articles');
        }
      }, [
        el('img', { src: t.icon, alt: '' }),
        t.name
      ]));
    });
    container.appendChild(el('h2', { className: 'section-title' }, ['Тематики']));
    container.appendChild(themesBar);

    // Map
    container.appendChild(el('h2', { className: 'section-title' }, ['Мапа досліджень']));
    const mapWrap = el('div', { className: 'map-container', id: 'home-map-wrap' });
    mapWrap.appendChild(el('div', { id: 'home-map' }));
    container.appendChild(mapWrap);

    // Carousel recent
    container.appendChild(el('h2', { className: 'section-title' }, ['Останні статті']));
    const carousel = el('div', { className: 'carousel' });
    const recent = [...state.articles].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 8);
    if (recent.length === 0) {
      carousel.appendChild(el('div', { className: 'empty' }, ['Ще немає статей']));
    } else {
      recent.forEach(a => {
        const item = el('div', {
          className: 'carousel-item',
          onClick: () => navigate('article', a.id)
        }, [
          el('img', { src: a.cover || 'img/hero.jpg', alt: a.title }),
          el('div', { className: 'body' }, [
            el('h3', {}, [a.title]),
            el('p', {}, [a.summary || ''])
          ])
        ]);
        carousel.appendChild(item);
      });
    }
    container.appendChild(carousel);

    // Featured cards (first 3 fish)
    container.appendChild(el('h2', { className: 'section-title' }, ['Види риб']));
    const grid = el('div', { className: 'grid-cards' });
    state.articles.filter(a => a.type === 'fish').slice(0, 6).forEach(a => {
      grid.appendChild(el('div', {
        className: 'species-card',
        onClick: () => navigate('article', a.id)
      }, [
        el('img', { src: a.cover || 'img/gobie.jpg', alt: a.title }),
        el('div', { className: 'body' }, [
          el('h3', {}, [a.title]),
          el('p', {}, [a.summary || ''])
        ])
      ]));
    });
    container.appendChild(grid);

    // Init map after DOM
    setTimeout(() => initHomeMap(), 50);
  }

  function initHomeMap() {
    const mapEl = $('#home-map');
    if (!mapEl || mapEl._leaflet_id) return;
    const map = L.map('home-map').setView([48.5, 31.5], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    state.articles.forEach(a => {
      if (!a.location || !a.location.lat) return;
      const theme = getTheme(a.themeIds?.[0]);
      const iconUrl = theme?.icon || 'img/free-icon-location-2776063.png';
      const icon = L.icon({
        iconUrl,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28]
      });
      L.marker([a.location.lat, a.location.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${a.title}</b><br>${a.location.name || ''}<br><a href="#/article/${a.id}">Читати →</a>`);
    });
    state.maps.home = map;
    setTimeout(() => map.invalidateSize(), 100);
  }

  // ---------- Articles list ----------
  function renderArticles(container) {
    container.appendChild(el('h1', { className: 'section-title' }, ['Усі статті']));

    // Filters
    const filters = el('div', { className: 'filters' });
    const themeSelect = el('select', {
      onChange: (e) => { state.filters.theme = e.target.value; renderArticlesList(); }
    }, [
      el('option', { value: '' }, ['Усі тематики']),
      ...state.themes.map(t => el('option', { value: t.id, selected: state.filters.theme === t.id }, [t.name]))
    ]);
    const typeSelect = el('select', {
      onChange: (e) => { state.filters.type = e.target.value; renderArticlesList(); }
    }, [
      el('option', { value: '' }, ['Усі типи']),
      el('option', { value: 'fish', selected: state.filters.type === 'fish' }, ['Риби']),
      el('option', { value: 'river', selected: state.filters.type === 'river' }, ['Річки']),
      el('option', { value: 'vegetation', selected: state.filters.type === 'vegetation' }, ['Рослинність']),
      el('option', { value: 'animals', selected: state.filters.type === 'animals' }, ['Інші тварини'])
    ]);
    const searchInput = el('input', {
      type: 'search',
      placeholder: 'Пошук...',
      value: state.filters.search,
      onInput: (e) => { state.filters.search = e.target.value; renderArticlesList(); }
    });
    filters.append(themeSelect, typeSelect, searchInput);
    if (state.settings.curatorMode) {
      filters.appendChild(el('a', { href: '#/create', className: 'btn btn-accent btn-sm' }, ['+ Створити']));
    }
    container.appendChild(filters);

    const listWrap = el('div', { id: 'articles-list', className: 'article-list' });
    container.appendChild(listWrap);
    renderArticlesList();
  }

  function renderArticlesList() {
    const list = $('#articles-list');
    if (!list) return;
    list.innerHTML = '';

    let items = [...state.articles];
    if (state.filters.theme) {
      items = items.filter(a => (a.themeIds || []).includes(state.filters.theme));
    }
    if (state.filters.type) {
      items = items.filter(a => a.type === state.filters.type);
    }
    if (state.filters.search) {
      const q = state.filters.search.toLowerCase();
      items = items.filter(a =>
        a.title.toLowerCase().includes(q) ||
        (a.latin || '').toLowerCase().includes(q) ||
        (a.summary || '').toLowerCase().includes(q) ||
        (a.waterResource || '').toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    if (items.length === 0) {
      list.appendChild(el('div', { className: 'empty' }, ['Нічого не знайдено']));
      return;
    }

    items.forEach(a => {
      const themes = (a.themeIds || []).map(id => getTheme(id)?.name).filter(Boolean).join(', ');
      list.appendChild(el('div', {
        className: 'article-row',
        onClick: () => navigate('article', a.id)
      }, [
        el('img', { src: a.cover || 'img/hero.jpg', alt: a.title }),
        el('div', { className: 'body' }, [
          el('h3', {}, [a.title]),
          el('div', { className: 'meta' }, [
            formatDate(a.updatedAt),
            themes ? ` · ${themes}` : '',
            a.waterResource ? ` · ${a.waterResource}` : ''
          ]),
          el('p', {}, [a.summary || ''])
        ])
      ]));
    });
  }

  // ---------- Article detail ----------
  function renderArticleDetail(container, id) {
    const a = getArticle(id);
    if (!a) {
      container.appendChild(el('div', { className: 'empty' }, ['Статтю не знайдено']));
      return;
    }

    // Header
    const header = el('div', { className: 'article-header' });
    header.appendChild(el('div', { className: 'article-photo' }, [
      el('img', { src: a.cover || 'img/gobie.jpg', alt: a.title })
    ]));
    const meta = el('div', { className: 'article-meta' });
    meta.appendChild(el('h1', {}, [a.title]));
    if (a.latin) meta.appendChild(el('div', { className: 'latin' }, [a.latin]));
    const dl = el('dl', { className: 'meta-grid' });
    if (a.waterResource) {
      dl.append(el('dt', {}, ['Водний ресурс:']), el('dd', {}, [a.waterResource]));
    }
    if (a.period) dl.append(el('dt', {}, ['Період:']), el('dd', {}, [a.period]));
    if (a.weather) dl.append(el('dt', {}, ['Погода / умови:']), el('dd', {}, [a.weather]));
    if (a.location?.name) dl.append(el('dt', {}, ['Локація:']), el('dd', {}, [a.location.name]));
    if (a.location?.lat) dl.append(el('dt', {}, ['Координати:']), el('dd', {}, [`${a.location.lat.toFixed(5)}, ${a.location.lng.toFixed(5)}`]));
    meta.appendChild(dl);
    if (state.settings.curatorMode) {
      meta.appendChild(el('div', { className: 'mt-2 flex gap-1' }, [
        el('a', { href: `#/edit/${a.id}`, className: 'btn btn-primary btn-sm' }, ['Редагувати']),
        el('button', {
          className: 'btn btn-danger btn-sm',
          onClick: () => {
            if (confirm('Видалити статтю?')) {
              state.articles = state.articles.filter(x => x.id !== a.id);
              saveState();
              navigate('articles');
            }
          }
        }, ['Видалити'])
      ]));
    }
    header.appendChild(meta);
    container.appendChild(header);

    // Side: map + themes
    const side = el('div', { className: 'article-side' });
    if (a.location?.lat) {
      const mapBox = el('div', { className: 'map-container', style: 'height:220px' });
      mapBox.appendChild(el('div', { id: 'article-map' }));
      side.appendChild(mapBox);
    }
    const themesBox = el('div', { className: 'card', style: 'padding:1rem' });
    themesBox.appendChild(el('strong', {}, ['Тематики: ']));
    (a.themeIds || []).forEach(tid => {
      const t = getTheme(tid);
      if (t) {
        themesBox.appendChild(el('span', { className: 'badge badge-theme', style: 'margin:0.2rem' }, [
          el('img', { src: t.icon, alt: '', style: 'width:14px;height:14px;vertical-align:middle;margin-right:4px' }),
          t.name
        ]));
      }
    });
    side.appendChild(themesBox);
    container.appendChild(side);

    // Body sections
    const body = el('div', { className: 'article-body' });
    const secs = a.sections || {};
    if (secs.intro) {
      body.appendChild(el('p', {}, [secs.intro]));
    }
    const sectionTitles = {
      morphology: '1. Морфологічні ознаки',
      ecology: '2. Спосіб життя та екологія (Біотоп)',
      nutrition: '3. Живлення',
      reproduction: '4. Розмноження та нерест',
      description: 'Опис',
      ecosystem: 'Екосистема',
      observations: 'Спостереження'
    };
    Object.entries(sectionTitles).forEach(([key, title]) => {
      if (secs[key]) {
        body.appendChild(el('h2', {}, [title]));
        secs[key].split('\n\n').forEach(para => {
          if (para.trim()) body.appendChild(el('p', {}, [para.trim()]));
        });
      }
    });
    // Extra custom sections
    Object.keys(secs).forEach(k => {
      if (!['intro', ...Object.keys(sectionTitles)].includes(k) && secs[k]) {
        body.appendChild(el('h2', {}, [k]));
        body.appendChild(el('p', {}, [secs[k]]));
      }
    });
    container.appendChild(body);

    // Links
    if (a.links && a.links.length) {
      const links = el('div', { className: 'card', style: 'padding:1rem;margin-bottom:1rem' });
      links.appendChild(el('strong', {}, ['Посилання:']));
      a.links.forEach(l => {
        links.appendChild(el('div', {}, [el('a', { href: l.url, target: '_blank' }, [l.title || l.url])]));
      });
      container.appendChild(links);
    }

    setTimeout(() => {
      if (a.location?.lat && $('#article-map')) {
        const map = L.map('article-map').setView([a.location.lat, a.location.lng], 10);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '© OSM © CARTO', subdomains: 'abcd', maxZoom: 20 }).addTo(map);
        L.marker([a.location.lat, a.location.lng]).addTo(map)
          .bindPopup(a.location.name || a.title);
        setTimeout(() => map.invalidateSize(), 100);
      }
    }, 50);
  }

  // ---------- Settings ----------
  function renderSettings(container) {
    container.appendChild(el('h1', { className: 'section-title' }, ['Налаштування']));

    // Curator mode
    const curatorSec = el('div', { className: 'settings-section' });
    curatorSec.appendChild(el('h2', {}, ['Режим куратора']));
    if (state.settings.curatorMode) {
      curatorSec.appendChild(el('p', { className: 'text-muted mb-2' }, ['Ви в режимі куратора. Можете створювати, редагувати статті, теми та обкладинку.']));
      curatorSec.appendChild(el('button', {
        className: 'btn btn-outline',
        onClick: () => {
          state.settings.curatorMode = false;
          saveState();
          render();
        }
      }, ['Вийти з режиму куратора']));
    } else {
      curatorSec.appendChild(el('p', { className: 'text-muted mb-2' }, ['Щоб керувати контентом, увімкніть режим куратора (PIN за замовчуванням: 1234).']));
      const pinInput = el('input', { type: 'password', placeholder: 'PIN', style: 'max-width:160px;margin-right:0.5rem' });
      curatorSec.appendChild(el('div', { className: 'flex items-center gap-1' }, [
        pinInput,
        el('button', {
          className: 'btn btn-primary btn-sm',
          onClick: () => {
            if (pinInput.value === state.settings.curatorPin) {
              state.settings.curatorMode = true;
              saveState();
              render();
            } else {
              alert('Невірний PIN');
            }
          }
        }, ['Увійти'])
      ]));
    }
    container.appendChild(curatorSec);

    // Themes
    const themesSec = el('div', { className: 'settings-section' });
    themesSec.appendChild(el('h2', {}, ['Теми статей']));
    const ul = el('ul', { className: 'theme-list' });
    state.themes.forEach(t => {
      const li = el('li', {}, [
        el('img', { src: t.icon, alt: '' }),
        el('span', { style: 'flex:1' }, [t.name]),
        state.settings.curatorMode ? el('button', {
          className: 'btn btn-outline btn-sm',
          onClick: () => {
            const name = prompt('Нова назва теми', t.name);
            if (name) {
              t.name = name;
              saveState();
              render();
            }
          }
        }, ['Змінити']) : null,
        state.settings.curatorMode ? el('button', {
          className: 'btn btn-danger btn-sm',
          onClick: () => {
            if (confirm('Видалити тему?')) {
              state.themes = state.themes.filter(x => x.id !== t.id);
              saveState();
              render();
            }
          }
        }, ['×']) : null
      ]);
      ul.appendChild(li);
    });
    themesSec.appendChild(ul);
    if (state.settings.curatorMode) {
      themesSec.appendChild(el('button', {
        className: 'btn btn-accent btn-sm mt-2',
        onClick: () => openAddThemeModal()
      }, ['+ Додати тему']));
    }
    container.appendChild(themesSec);

    // Banner
    const bannerSec = el('div', { className: 'settings-section' });
    bannerSec.appendChild(el('h2', {}, ['Банер сайту']));
    bannerSec.appendChild(el('img', {
      src: state.settings.banner || DEFAULT_BANNER,
      alt: 'Banner',
      style: 'max-width:100%;max-height:160px;border-radius:8px;margin-bottom:0.75rem;object-fit:cover'
    }));
    if (state.settings.curatorMode) {
      const fileInput = el('input', { type: 'file', accept: 'image/*', className: 'hidden', id: 'banner-file' });
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          state.settings.banner = reader.result;
          saveState();
          render();
        };
        reader.readAsDataURL(file);
      });
      bannerSec.appendChild(fileInput);
      bannerSec.appendChild(el('button', {
        className: 'btn btn-primary btn-sm',
        onClick: () => fileInput.click()
      }, ['Завантажити фото']));
    }
    container.appendChild(bannerSec);

    // Cloud publish (JSONBin) — friends always see latest
    const pubSec = el('div', { className: 'settings-section' });
    pubSec.appendChild(el('h2', {}, ['☁️ Хмара — свіжі статті для друзів']));
    pubSec.appendChild(el('p', { className: 'text-muted mb-2' }, [
      'Заповни поля нижче один раз. Після цього натискай «Опублікувати зараз» — і всі друзі побачать нові статті.'
    ]));

    const binInput = el('input', {
      id: 'f-bin-id',
      placeholder: 'Bin ID',
      value: state.settings.cloudBinId || ''
    });
    const keyInput = el('input', {
      id: 'f-api-key',
      type: 'password',
      placeholder: 'Master Key (для публікації)',
      value: state.settings.cloudApiKey || ''
    });
    const accessInput = el('input', {
      id: 'f-access-key',
      type: 'password',
      placeholder: 'Access Key (для читання, Read-only)',
      value: state.settings.cloudAccessKey || ''
    });
    pubSec.appendChild(el('div', { className: 'form-group' }, [el('label', {}, ['Bin ID']), binInput]));
    pubSec.appendChild(el('div', { className: 'form-group' }, [el('label', {}, ['Master Key']), keyInput]));
    pubSec.appendChild(el('div', { className: 'form-group' }, [el('label', {}, ['Access Key (Read)']), accessInput]));

    pubSec.appendChild(el('div', { className: 'flex gap-1 mb-2', style: 'flex-wrap:wrap' }, [
      el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => {
          state.settings.cloudBinId = binInput.value.trim();
          state.settings.cloudApiKey = keyInput.value.trim();
          state.settings.cloudAccessKey = accessInput.value.trim();
          saveState();
          alert('Ключі збережено на цьому пристрої');
        }
      }, ['Зберегти ключі']),
      el('button', {
        className: 'btn btn-accent',
        onClick: async () => {
          state.settings.cloudBinId = binInput.value.trim();
          state.settings.cloudApiKey = keyInput.value.trim();
          state.settings.cloudAccessKey = accessInput.value.trim();
          saveState();
          await saveToCloud();
        }
      }, ['☁️ Опублікувати зараз'])
    ]));

    pubSec.appendChild(el('details', { style: 'margin-top:0.75rem' }, [
      el('summary', { style: 'cursor:pointer;color:#7ab8ff' }, ['Інструкція JSONBin (якщо ще не зробив)']),
      el('div', { className: 'text-muted', style: 'margin-top:0.75rem;font-size:0.9rem;line-height:1.55' }, [
        el('p', {}, ['1. На jsonbin.io створи Bin з вмістом {"themes":[],"articles":[]}']),
        el('p', {}, ['2. Скопіюй Bin ID (у тебе: 6af4cb57ac6210605a809105)']),
        el('p', {}, ['3. API KEYS → скопіюй Master Key']),
        el('p', {}, ['4. API KEYS → Create Access Key → тільки право Read → скопіюй Access Key']),
        el('p', {}, ['5. Встав усі три поля вище → Зберегти ключі → Опублікувати зараз'])
      ])
    ]));

    pubSec.appendChild(el('hr', { style: 'border-color:var(--border);margin:1rem 0' }));
    pubSec.appendChild(el('button', {
      className: 'btn btn-outline btn-sm',
      onClick: () => {
        downloadDataJson();
        alert('Завантажено data.json. Можна закинути в GitHub як запасний варіант.');
      }
    }, ['⬇️ Запасний варіант: data.json для GitHub']));
    container.appendChild(pubSec);

    // Data export/import (backup)
    const dataSec = el('div', { className: 'settings-section' });
    dataSec.appendChild(el('h2', {}, ['Резервна копія']));
    dataSec.appendChild(el('p', { className: 'text-muted mb-2' }, ['Збережи копію на телефон/ноутбук або перенеси між пристроями.']));
    dataSec.appendChild(el('div', { className: 'flex gap-1' }, [
      el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => {
          const blob = new Blob([JSON.stringify({ themes: state.themes, articles: state.articles, settings: state.settings }, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `dyki-richky-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }, ['Експорт JSON']),
      el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'application/json';
          input.onchange = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const data = JSON.parse(reader.result);
                if (data.themes) state.themes = data.themes;
                if (data.articles) state.articles = data.articles;
                if (data.settings) state.settings = { ...state.settings, ...data.settings };
                saveState();
                alert('Дані імпортовано');
                render();
              } catch (err) {
                alert('Помилка імпорту: ' + err.message);
              }
            };
            reader.readAsText(file);
          };
          input.click();
        }
      }, ['Імпорт JSON'])
    ]));
    container.appendChild(dataSec);

    // Auto translate placeholder
    const transSec = el('div', { className: 'settings-section' });
    transSec.appendChild(el('h2', {}, ['Автоперекладач статей']));
    transSec.appendChild(el('p', { className: 'text-muted' }, ['Мова інтерфейсу: Українська. (Переклад статей можна додати пізніше через API.)']));
    const langBtn = el('button', {
      className: 'btn btn-outline',
      onClick: () => alert('Поки що інтерфейс українською. Для англійської версії можна додати i18n.')
    }, ['Англійська']);
    transSec.appendChild(langBtn);
    container.appendChild(transSec);
  }

  function openAddThemeModal() {
    const overlay = $('#modal-overlay');
    const modal = $('#modal-content');
    modal.innerHTML = '';
    modal.appendChild(el('button', { className: 'modal-close', onClick: closeModal }, ['×']));
    modal.appendChild(el('h2', {}, ['Додати тему']));
    const nameInput = el('input', { placeholder: 'Назва теми', className: 'w-full' });
    const iconSelect = el('select', { className: 'w-full' }, [
      el('option', { value: 'img/free-icon-fishing-float-1833972.png' }, ['Поплавок (рибалка)']),
      el('option', { value: 'img/free-icon-fish-2929546.png' }, ['Риба']),
      el('option', { value: 'img/free-icon-river-15726726.png' }, ['Річка']),
      el('option', { value: 'img/free-icon-location-2776063.png' }, ['Локація'])
    ]);
    modal.appendChild(el('div', { className: 'form-group' }, [el('label', {}, ['Назва']), nameInput]));
    modal.appendChild(el('div', { className: 'form-group' }, [el('label', {}, ['Іконка']), iconSelect]));
    modal.appendChild(el('button', {
      className: 'btn btn-accent w-full',
      onClick: () => {
        const name = nameInput.value.trim();
        if (!name) return alert('Введіть назву');
        const id = 'theme-' + Date.now();
        state.themes.push({ id, name, icon: iconSelect.value });
        saveState();
        closeModal();
        render();
      }
    }, ['Зберегти']));
    overlay.classList.remove('hidden');
  }

  function closeModal() {
    $('#modal-overlay').classList.add('hidden');
  }

  // ---------- Create / Edit ----------
  function renderCreateEdit(container, editId) {
    if (!state.settings.curatorMode) {
      container.appendChild(el('div', { className: 'empty' }, ['Увімкніть режим куратора в Налаштуваннях']));
      return;
    }
    const isEdit = !!editId;
    const existing = isEdit ? getArticle(editId) : null;

    container.appendChild(el('h1', { className: 'section-title' }, [isEdit ? 'Редагувати статтю' : 'Нова стаття']));

    const form = el('div', { className: 'settings-section' });

    // Type template
    const typeSelect = el('select', { id: 'f-type' }, [
      el('option', { value: 'fish', selected: existing?.type === 'fish' }, ['Стаття про вид риб']),
      el('option', { value: 'river', selected: existing?.type === 'river' }, ['Стаття про річку']),
      el('option', { value: 'vegetation', selected: existing?.type === 'vegetation' }, ['Про рослинність']),
      el('option', { value: 'animals', selected: existing?.type === 'animals' }, ['Про інші тварини'])
    ]);
    form.appendChild(el('div', { className: 'form-group' }, [el('label', {}, ['Шаблон статті']), typeSelect]));

    // Title, latin
    form.appendChild(el('div', { className: 'form-row' }, [
      el('div', { className: 'form-group' }, [
        el('label', {}, ['Назва *']),
        el('input', { id: 'f-title', value: existing?.title || '', required: true })
      ]),
      el('div', { className: 'form-group' }, [
        el('label', {}, ['Латинська назва']),
        el('input', { id: 'f-latin', value: existing?.latin || '' })
      ])
    ]));

    // Summary
    form.appendChild(el('div', { className: 'form-group' }, [
      el('label', {}, ['Короткий опис (для списку)']),
      el('textarea', { id: 'f-summary' }, [existing?.summary || ''])
    ]));

    // Water, period, weather
    form.appendChild(el('div', { className: 'form-row' }, [
      el('div', { className: 'form-group' }, [
        el('label', {}, ['Водний ресурс дослідження']),
        el('input', { id: 'f-water', value: existing?.waterResource || '', placeholder: 'напр. р. Сула, Дніпровське водосховище' })
      ]),
      el('div', { className: 'form-group' }, [
        el('label', {}, ['Період спостережень']),
        el('input', { id: 'f-period', value: existing?.period || '', placeholder: '2024–2026' })
      ])
    ]));
    form.appendChild(el('div', { className: 'form-group' }, [
      el('label', {}, ['Погода / умови']),
      el('input', { id: 'f-weather', value: existing?.weather || '' })
    ]));

    // Themes multi
    form.appendChild(el('div', { className: 'form-group' }, [
      el('label', {}, ['Тематики (можна кілька)']),
      el('div', { id: 'f-themes', className: 'themes-bar' })
    ]));
    const themesContainer = form.querySelector('#f-themes');
    const selectedThemes = new Set(existing?.themeIds || []);
    state.themes.forEach(t => {
      const chip = el('button', {
        type: 'button',
        className: 'theme-chip' + (selectedThemes.has(t.id) ? ' active' : ''),
        onClick: (e) => {
          e.preventDefault();
          if (selectedThemes.has(t.id)) selectedThemes.delete(t.id);
          else selectedThemes.add(t.id);
          chip.classList.toggle('active');
        }
      }, [el('img', { src: t.icon, alt: '' }), t.name]);
      themesContainer.appendChild(chip);
    });

    // Cover
    form.appendChild(el('div', { className: 'form-group' }, [
      el('label', {}, ['Обкладинка (фото)']),
      el('input', { type: 'file', id: 'f-cover', accept: 'image/*' }),
      existing?.cover ? el('img', { src: existing.cover, style: 'max-height:100px;margin-top:0.5rem;border-radius:6px' }) : null
    ]));

    // Geo
    form.appendChild(el('div', { className: 'form-group' }, [
      el('label', {}, ['Геолокація дослідження']),
      el('div', { className: 'geo-picker', id: 'geo-picker-map' }),
      el('div', { className: 'geo-coords', id: 'geo-coords' }, [
        existing?.location ? `${existing.location.lat.toFixed(5)}, ${existing.location.lng.toFixed(5)} — ${existing.location.name || ''}` : 'Не обрано'
      ]),
      el('div', { className: 'flex gap-1 mt-1' }, [
        el('button', { type: 'button', className: 'btn btn-outline btn-sm', id: 'btn-my-loc' }, ['Моє місце']),
        el('input', { type: 'text', id: 'geo-search', placeholder: 'Пошук місця (напр. Полтава)', style: 'flex:1' }),
        el('button', { type: 'button', className: 'btn btn-primary btn-sm', id: 'btn-geo-search' }, ['Знайти'])
      ]),
      el('input', { type: 'text', id: 'f-loc-name', placeholder: 'Назва локації', value: existing?.location?.name || '', className: 'mt-1' })
    ]));

    // Sections depending on type (fish template from notepad)
    const sectionsWrap = el('div', { id: 'sections-wrap' });
    form.appendChild(sectionsWrap);

    function buildSections() {
      sectionsWrap.innerHTML = '';
      const type = typeSelect.value;
      const secs = existing?.sections || {};
      if (type === 'fish') {
        [
          ['intro', 'Вступ / загальний опис'],
          ['morphology', '1. Морфологічні ознаки'],
          ['ecology', '2. Спосіб життя та екологія (Біотоп)'],
          ['nutrition', '3. Живлення'],
          ['reproduction', '4. Розмноження та нерест']
        ].forEach(([key, label]) => {
          sectionsWrap.appendChild(el('div', { className: 'form-group' }, [
            el('label', {}, [label]),
            el('textarea', { id: `f-sec-${key}`, style: 'min-height:120px' }, [secs[key] || ''])
          ]));
        });
      } else if (type === 'river') {
        [
          ['intro', 'Опис річки'],
          ['ecosystem', 'Екосистема'],
          ['observations', 'Спостереження та дослідження']
        ].forEach(([key, label]) => {
          sectionsWrap.appendChild(el('div', { className: 'form-group' }, [
            el('label', {}, [label]),
            el('textarea', { id: `f-sec-${key}`, style: 'min-height:100px' }, [secs[key] || ''])
          ]));
        });
      } else {
        sectionsWrap.appendChild(el('div', { className: 'form-group' }, [
          el('label', {}, ['Опис']),
          el('textarea', { id: 'f-sec-description', style: 'min-height:160px' }, [secs.description || secs.intro || ''])
        ]));
      }
    }
    typeSelect.addEventListener('change', buildSections);
    buildSections();

    // Save
    form.appendChild(el('div', { className: 'flex gap-2 mt-2' }, [
      el('button', {
        className: 'btn btn-accent',
        onClick: () => saveArticle(existing, selectedThemes, typeSelect)
      }, [isEdit ? 'Зберегти зміни' : 'Створити статтю']),
      el('a', { href: '#/articles', className: 'btn btn-outline' }, ['Скасувати'])
    ]));

    container.appendChild(form);

    // Init geo map
    setTimeout(() => initGeoPicker(existing?.location), 80);
  }

  let geoPicker = { map: null, marker: null, lat: null, lng: null };

  function initGeoPicker(existingLoc) {
    const elMap = $('#geo-picker-map');
    if (!elMap || elMap._leaflet_id) return;
    const center = existingLoc ? [existingLoc.lat, existingLoc.lng] : [49.0, 32.0];
    geoPicker.map = L.map('geo-picker-map').setView(center, existingLoc ? 11 : 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '© OSM © CARTO', subdomains: 'abcd', maxZoom: 20 }).addTo(geoPicker.map);
    if (existingLoc) {
      geoPicker.marker = L.marker(center).addTo(geoPicker.map);
      geoPicker.lat = existingLoc.lat;
      geoPicker.lng = existingLoc.lng;
    }
    geoPicker.map.on('click', (e) => {
      setGeoMarker(e.latlng.lat, e.latlng.lng);
    });
    setTimeout(() => geoPicker.map.invalidateSize(), 100);

    $('#btn-my-loc')?.addEventListener('click', () => {
      if (!navigator.geolocation) return alert('Геолокація недоступна');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoMarker(pos.coords.latitude, pos.coords.longitude);
          geoPicker.map.setView([pos.coords.latitude, pos.coords.longitude], 13);
        },
        () => alert('Не вдалося отримати місце розташування')
      );
    });

    $('#btn-geo-search')?.addEventListener('click', async () => {
      const q = $('#geo-search')?.value?.trim();
      if (!q) return;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ', Ukraine')}&limit=1`);
        const data = await res.json();
        if (data[0]) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          setGeoMarker(lat, lng);
          geoPicker.map.setView([lat, lng], 12);
          if ($('#f-loc-name') && !$('#f-loc-name').value) {
            $('#f-loc-name').value = data[0].display_name.split(',').slice(0, 2).join(',');
          }
        } else {
          alert('Місце не знайдено');
        }
      } catch (e) {
        alert('Помилка пошуку');
      }
    });
  }

  function setGeoMarker(lat, lng) {
    geoPicker.lat = lat;
    geoPicker.lng = lng;
    if (geoPicker.marker) {
      geoPicker.marker.setLatLng([lat, lng]);
    } else {
      geoPicker.marker = L.marker([lat, lng]).addTo(geoPicker.map);
    }
    $('#geo-coords').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  function saveArticle(existing, selectedThemes, typeSelect) {
    const title = $('#f-title')?.value?.trim();
    if (!title) return alert('Вкажіть назву');

    let cover = existing?.cover || 'img/hero.jpg';
    const fileInput = $('#f-cover');
    const finish = (coverData) => {
      const type = typeSelect.value;
      const sections = {};
      if (type === 'fish') {
        ['intro', 'morphology', 'ecology', 'nutrition', 'reproduction'].forEach(k => {
          const v = $(`#f-sec-${k}`)?.value?.trim();
          if (v) sections[k] = v;
        });
      } else if (type === 'river') {
        ['intro', 'ecosystem', 'observations'].forEach(k => {
          const v = $(`#f-sec-${k}`)?.value?.trim();
          if (v) sections[k] = v;
        });
      } else {
        const v = $('#f-sec-description')?.value?.trim();
        if (v) sections.description = v;
      }

      const article = {
        id: existing?.id || ('art-' + Date.now()),
        type,
        themeIds: [...selectedThemes],
        title,
        latin: $('#f-latin')?.value?.trim() || '',
        cover: coverData || cover,
        waterResource: $('#f-water')?.value?.trim() || '',
        period: $('#f-period')?.value?.trim() || '',
        weather: $('#f-weather')?.value?.trim() || '',
        location: geoPicker.lat != null ? {
          lat: geoPicker.lat,
          lng: geoPicker.lng,
          name: $('#f-loc-name')?.value?.trim() || ''
        } : (existing?.location || null),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        summary: $('#f-summary')?.value?.trim() || '',
        sections,
        links: existing?.links || []
      };

      if (existing) {
        const idx = state.articles.findIndex(a => a.id === existing.id);
        if (idx >= 0) state.articles[idx] = article;
      } else {
        state.articles.unshift(article);
      }
      saveState();
      navigate('article', article.id);
    };

    if (fileInput?.files?.[0]) {
      const reader = new FileReader();
      reader.onload = () => finish(reader.result);
      reader.readAsDataURL(fileInput.files[0]);
    } else {
      finish(cover);
    }
  }

  // ---------- Support ----------
  function renderSupport(container) {
    container.appendChild(el('h1', { className: 'section-title' }, ['Підтримка проєкту']));
    container.appendChild(el('p', { className: 'mb-2 text-muted' }, [
      'Проєкт можна підтримати за посиланням на банку mono банк. Кожна гривня допомагає продовжувати польові дослідження та наповнення енциклопедії.'
    ]));
    const box = el('div', { className: 'support-box' });
    box.appendChild(el('div', {}, [
      el('p', {}, ['Посилання на банку:']),
      el('a', {
        href: 'https://send.monobank.ua/jar/34676inLSV',
        target: '_blank'
      }, ['https://send.monobank.ua/jar/34676inLSV']),
      el('p', { className: 'mt-2' }, [
        el('a', { href: 'https://t.me/rubakcccccc', target: '_blank', className: 'tg-link' }, [
          el('img', { src: 'img/free-icon-telegram-11400813.png', width: 20, alt: '' }),
          ' Telegram: rubakcccccc'
        ])
      ])
    ]));
    box.appendChild(el('img', { src: 'img/qr.png', alt: 'QR', className: 'qr-img' }));
    container.appendChild(box);
  }

  // ---------- Menu toggle ----------
  document.addEventListener('click', (e) => {
    if (e.target.id === 'menu-toggle') {
      $('#main-nav')?.classList.toggle('open');
    }
  });

  // Close modal on overlay click
  $('#modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
})();
