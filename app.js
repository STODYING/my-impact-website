const WP_SITE = "impactceo0.wordpress.com";
const HOME_PER_PAGE = 20;
const CATEGORIES = {
  "tech": 318,
  "eat": 123073,
  "style": 2286,
  "culture": 1098,
  "life": 124,
  "editors-pick": 259543
};
const NAV_ORDER = ["TECH","EAT","STYLE","CULTURE","LIFE","EDITORS' PICK"];
const state = {
  homePage: 1,
  homeTotal: 0,
  allPostsCount: 0, // 전체 게시물 수 저장
  categoryPage: 1,
  categoryTotal: 0,
  currentCategory: '',
  postsCache: {},
  editorsList: [],
  editorsLoaded: false,
  lastScrollY: 0,
  scrollingDown: false,
  currentPostId: null,
  isProcessing: false,
  searchDebounce: null,
  homeLoadPromise: null
};

// [IMPACT-LOADING] A. Loading overlay controller (replaces showPageTransition)
let __loadingTimer = null;
let __loadingDelayTimer = null;
let __loadingStartTime = null;

function openLoading(label = '불러오는 중...', delay = 300) {
  const el = document.getElementById('pageTransition');
  if (!el) return;
  
  // 기존 타이머 정리
  clearTimeout(__loadingDelayTimer);
  clearTimeout(__loadingTimer);
  
  // 시작 시간 기록
  __loadingStartTime = Date.now();
  
  // delay 밀리초 후에만 로딩 표시 (기본 300ms)
  __loadingDelayTimer = setTimeout(() => {
    el.textContent = label;
    el.classList.add('active');
    
    // 안전장치: 표시된 후 3초 뒤 강제 해제
    __loadingTimer = setTimeout(() => closeLoading(), 3000);
  }, delay);
}

function closeLoading() {
  const el = document.getElementById('pageTransition');
  if (!el) return;
  
  // 지연 타이머가 아직 실행 안됐으면 취소
  clearTimeout(__loadingDelayTimer);
  clearTimeout(__loadingTimer);
  
  // 로딩이 실제로 표시됐으면 숨김
  el.classList.remove('active');
  
  __loadingDelayTimer = null;
  __loadingTimer = null;
  __loadingStartTime = null;
}

// 스크롤 상단 세팅 헬퍼: 오버레이/페이지 컨테이너 모두 대응
// 수정됨: 모든 페이지 진입 시 즉시 최상단으로 이동
function resetScrollTop(target = 'window') {
  if (target === 'post') {
    const o = document.getElementById('postOverlay');
    if (o) {
      o.scrollTop = 0; // 즉시 상단으로 이동 (애니메이션 없이)
    }
  } else if (target === 'category') {
    const o = document.getElementById('categoryOverlay');
    if (o) {
      o.scrollTop = 0; // 즉시 상단으로 이동
    }
  } else if (target === 'editors') {
    const o = document.getElementById('editorsOverlay');
    if (o) {
      o.scrollTop = 0; // 즉시 상단으로 이동
    }
  } else if (target === 'search') {
    const o = document.getElementById('searchOverlay');
    if (o) {
      o.scrollTop = 0; // 즉시 상단으로 이동
    }
  } else if (target === 'about') {
    const o = document.getElementById('aboutPage');
    if (o) {
      o.scrollTop = 0; // 즉시 상단으로 이동
    }
  } else {
    window.scrollTop = 0; // 즉시 상단으로 이동
  }
}

// 렌더 프레임 동기화를 위한 작은 헬퍼
function nextFrame() {
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

// WordPress API 호출을 위한 두 가지 방법
function api(path, direct = false) {
  const p = path.includes('_embed') ? path : (path + (path.includes('?') ? '&' : '?') + '_embed');
  
  // direct=true면 WordPress API 직접 호출 (CORS 허용 시)
  if(direct) {
    return `https://${WP_SITE}/wp-json/wp/v2/${p}`;
  }
  
  // 기본: Netlify Functions를 통한 프록시
  return `/.netlify/functions/wpProxy?path=${encodeURIComponent(p)}`;
}

// 전체 게시물 수를 직접 계산하는 헬퍼 함수
async function getTotalPostsCount() {
  console.log('getTotalPostsCount 호출...');
  
  try {
    // 방법 1: WordPress API 직접 호출로 개수 확인 (per_page=1로 최소 데이터만)
    const directUrl = `https://${WP_SITE}/wp-json/wp/v2/posts?per_page=1&page=1`;
    console.log('  → 직접 API 호출:', directUrl);
    const res = await fetch(directUrl);
    
    const totalFromHeader = parseInt(res.headers.get('X-WP-Total') || '0');
    const totalPagesFromHeader = parseInt(res.headers.get('X-WP-TotalPages') || '0');
    
    console.log('  → 직접 API 응답 헤더 - Total:', totalFromHeader, 'TotalPages:', totalPagesFromHeader);
    
    if(totalFromHeader > 0) {
      return {
        total: totalFromHeader,
        totalPages: Math.ceil(totalFromHeader / HOME_PER_PAGE)
      };
    }
    
    // 방법 2: 응답 본문 확인
    const data = await res.json();
    console.log('  → 응답 본문 확인:', data);
    
    if(Array.isArray(data) && data.length > 0) {
      console.log('  → 최소 1개 이상의 게시물 존재');
      // 최소한 데이터가 있다는 것은 확인
      return {
        total: 1,
        totalPages: 1
      };
    }
  } catch(e) {
    console.error('  → 직접 API 실패:', e);
  }
  
  try {
    // 방법 3: Netlify Functions를 통한 호출 (헤더 확인)
    console.log('  → Netlify Functions 통한 호출 시도...');
    const proxyUrl = api('posts?per_page=1&page=1');
    const res2 = await fetch(proxyUrl);
    
    const totalFromProxy = parseInt(res2.headers.get('X-WP-Total') || '0');
    const totalPagesFromProxy = parseInt(res2.headers.get('X-WP-TotalPages') || '0');
    
    console.log('  → Proxy 응답 헤더 - Total:', totalFromProxy, 'TotalPages:', totalPagesFromProxy);
    
    if(totalFromProxy > 0) {
      return {
        total: totalFromProxy,
        totalPages: Math.ceil(totalFromProxy / HOME_PER_PAGE)
      };
    }
  } catch(e) {
    console.error('  → Proxy API 실패:', e);
  }
  
  console.log('  → 모든 방법 실패');
  return null;
}
function formatDate(dstr) {
  try {
    const d = new Date(dstr);
    return `${d.getFullYear()}. ${String(d.getMonth()+1).padStart(2,'0')}. ${String(d.getDate()).padStart(2,'0')}.`;
  } catch(e) { return ''; }
}
function placeholderDataURI(w=600,h=400,txt='No Image') {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='#efefef'/><text x='50%' y='50%' fill='#aaa' font-size='20' text-anchor='middle' dominant-baseline='middle'>${txt}</text></svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}
function pickCategoryClass(nameOrSlug) {
  if(!nameOrSlug) return '';
  const s = String(nameOrSlug).toLowerCase();
  if(s.includes('tech') || s.includes('technology')) return 'cat-tech';
  if(s.includes('eat')) return 'cat-eat';
  if(s.includes('style')) return 'cat-style';
  if(s.includes('culture')) return 'cat-culture';
  if(s.includes('life')) return 'cat-life';
  if(s.includes('editor') || s.includes('editors')) return 'cat-editors-pick';
  return '';
}
function stripTags(str='') {
  return str.replace(/<\/?[^>]+(>|$)/g, "");
}
function scrollToTop() {
  window.scrollTo({top: 0, behavior: 'smooth'});
}
function scrollToTopButton() {
  const postOverlay = document.getElementById('postOverlay');
  if(postOverlay.classList.contains('active')) {
    postOverlay.scrollTo({top: 0, behavior: 'smooth'});
  } else {
    window.scrollTo({top: 0, behavior: 'smooth'});
  }
}
function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

function goToHome() {
  const logo = document.getElementById('logoBtn');
  logo.classList.add('clicked');
  setTimeout(() => {
    logo.classList.remove('clicked');
  }, 200);

  // 게시물 오버레이가 열려있는 경우
  if(document.getElementById('postOverlay').classList.contains('active')) {
    const overlay = document.getElementById('postOverlay');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('progressBar').classList.remove('active');
    document.getElementById('postHeaderBar').classList.remove('show');
    document.getElementById('postToTopBtn').classList.remove('show');
    
    // 메인 페이지로 URL 변경
    const newUrl = `${window.location.origin}${window.location.pathname}`;
    history.pushState({page:'home'}, '', newUrl);
    
    // 부드럽게 위로 스크롤
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // 홈 콘텐츠가 비어있으면 다시 로드
    const container = document.getElementById('rowsContainer');
    if(!container || container.children.length === 0) {
      state.homeLoadPromise = null;
      loadHomeChunk(state.homePage || 1);
    }
    return;
  }

  // 카테고리나 다른 오버레이가 열려있는 경우
  const overlays = document.querySelectorAll('.category-overlay, .search-overlay, .about-page, .editors-overlay');
  let anyOverlayActive = false;
  
  overlays.forEach(el => {
    if(el.classList.contains('active')) {
      anyOverlayActive = true;
      el.classList.remove('active');
    }
  });
  
  document.body.style.overflow = '';

  // URL을 홈으로 변경
  const newUrl = `${window.location.origin}${window.location.pathname}`;
  history.pushState({page:'home'}, '', newUrl);

  // 부드럽게 위로 스크롤 (오버레이가 있었든 없었든 항상 실행)
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  // 홈 콘텐츠가 비어있으면 다시 로드
  const container = document.getElementById('rowsContainer');
  if(!container || container.children.length === 0) {
    state.homeLoadPromise = null;
    loadHomeChunk(state.homePage || 1);
  }
}

function handleNavToggle() {
  ui.toggleNav();
}
function handleNavAction(actionCallback) {
  ui.toggleNav(true);

  if(document.getElementById('postOverlay').classList.contains('active')) {
    const overlay = document.getElementById('postOverlay');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('progressBar').classList.remove('active');
    document.getElementById('postHeaderBar').classList.remove('show');
    document.getElementById('postToTopBtn').classList.remove('show');
  }

  actionCallback();
}
if(localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark-mode');
}
let ticking = false;
window.addEventListener('scroll', () => {
  if(!ticking) {
    window.requestAnimationFrame(() => {
      const toTop = document.getElementById('toTopBtn');
      if(window.scrollY > 300) toTop.classList.add('show');
      else toTop.classList.remove('show');

      const header = document.getElementById('siteHeader');
      const currentScrollY = window.scrollY;

      if(currentScrollY > state.lastScrollY && currentScrollY > 100) {
        header.classList.add('hide');
      } else {
        header.classList.remove('hide');
      }

      state.lastScrollY = currentScrollY;

      ticking = false;
    });
    ticking = true;
  }
});
document.getElementById('postOverlay').addEventListener('scroll', () => {
  if(!ticking) {
    window.requestAnimationFrame(() => {
      const progressBar = document.getElementById('progressBar');
      const postOverlay = document.getElementById('postOverlay');
      const postHeaderBar = document.getElementById('postHeaderBar');
      const postToTopBtn = document.getElementById('postToTopBtn');
      const winScroll = postOverlay.scrollTop;
      const height = postOverlay.scrollHeight - postOverlay.clientHeight;
      const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
      progressBar.style.width = scrolled + '%';
      progressBar.classList.add('active');

      if(winScroll > 20) {
        postHeaderBar.classList.add('show');
      } else {
        postHeaderBar.classList.remove('show');
      }

      if(winScroll > 300) {
        postToTopBtn.classList.add('show');
      } else {
        postToTopBtn.classList.remove('show');
      }

      const thumbnail = document.querySelector('.post-thumbnail');
      if(thumbnail && winScroll > 100) {
        thumbnail.classList.add('scrolled');
      } else if(thumbnail) {
        thumbnail.classList.remove('scrolled');
      }

      ticking = false;
    });
    ticking = true;
  }
});
function renderNavList() {
  const navList = document.getElementById('navList');
  navList.innerHTML = '';
  NAV_ORDER.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    li.addEventListener('click', () => {
      const slug = item.toLowerCase().replace(/'/g,'').replace(/\s/g,'-');
      if(CATEGORIES[slug]) {
        handleNavAction(() => router.openCategory(slug));
      }
    });
    navList.appendChild(li);
  });
}
function createCardNode(post) {
  const tpl = document.getElementById('cardTpl');
  const node = tpl.content.firstElementChild.cloneNode(true);
  const imgEl = node.querySelector('.thumb img');
  let thumbUrl = '';
  try {
    thumbUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
  } catch(e) { thumbUrl = ''; }
  imgEl.src = thumbUrl || placeholderDataURI(1200,800,'No Image');
  imgEl.loading = 'lazy'; // Lazy loading 추가
  imgEl.alt = (post.title && post.title.rendered) ? stripTags(post.title.rendered) : 'thumb';
  node.querySelector('.title').innerHTML = post.title && post.title.rendered ? post.title.rendered : '제목 없음';
  const avatarImg = node.querySelector('.author-avatar');
  const authorNameEl = node.querySelector('.author-name');
  const dateEl = node.querySelector('.date');
  if(post._embedded && post._embedded.author && post._embedded.author[0]) {
    const a = post._embedded.author[0];
    const avatarUrl = a.avatar_urls ? (a.avatar_urls['48']||a.avatar_urls['24']||'') : '';
    avatarImg.src = avatarUrl || placeholderDataURI(96,96,'U');
    avatarImg.loading = 'lazy'; // Lazy loading 추가
    avatarImg.alt = a.name || 'author';
    authorNameEl.textContent = a.name || '익명';
  } else {
    avatarImg.src = placeholderDataURI(96,96,'U');
    authorNameEl.textContent = '익명';
  }
  dateEl.textContent = formatDate(post.date);
  const catRow = node.querySelector('.cat-row');
  catRow.innerHTML = '';
  if(post._embedded && post._embedded['wp:term'] && post._embedded['wp:term'][0]) {
    const cats = post._embedded['wp:term'][0];
    cats.forEach(c => {
      if(c && c.name) {
        const span = document.createElement('span');
        span.className = 'cat-badge';
        span.textContent = c.name;
        const cls = pickCategoryClass(c.slug || c.name);
        if(cls) span.classList.add(cls);
        else span.style.background = '#666';
        catRow.appendChild(span);
      }
    });
  }
  let clickTimeout;
  node.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if(state.isProcessing) return;
    // [IMPACT-LOADING] 클릭 즉시 로딩 표시
    openLoading('게시물을 불러오는 중...', 100); // delay 짧게
    clearTimeout(clickTimeout);
    clickTimeout = setTimeout(() => {
      openPostOverlayById(post.id);
    }, 150);
  });

  return node;
}
function renderMobileLayout(posts, container) {
  for(let i = 0; i < posts.length; i += 5) {
    const group = posts.slice(i, i + 5);

    if(group[0]) {
      const largePost = group[0];
      const largeDiv = document.createElement('div');
      largeDiv.className = 'magazine-row mobile-large-post';

      const largeContainer = document.createElement('div');
      largeContainer.className = 'magazine-large';

      let heroUrl = largePost._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
      largeContainer.innerHTML = `
        <img class="hero" src="${heroUrl || placeholderDataURI(1200,800,'No Image')}" alt="hero">
        <div class="hero-overlay">
          <h2 class="hero-title">${largePost.title?.rendered || '제목 없음'}</h2>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="hero-author" style="font-weight:800;color:#fff">${largePost._embedded?.author?.[0]?.name || '익명'}</div>
            <div class="hero-date" style="color:#eee;opacity:.9">${formatDate(largePost.date)}</div>
          </div>
        </div>
      `;

      const catWrap = document.createElement('div');
      catWrap.className = 'hero-cats';
      const firstCat = largePost._embedded?.['wp:term']?.[0]?.[0];
      if(firstCat) {
        const span = document.createElement('span');
        span.className = 'cat-badge ' + pickCategoryClass(firstCat.slug || firstCat.name);
        span.textContent = firstCat.name;
        catWrap.appendChild(span);
      }
      largeContainer.appendChild(catWrap);

      let clickTimeout;
      largeContainer.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if(state.isProcessing) return;
        // [IMPACT-LOADING] 클릭 즉시 로딩 표시
        openLoading('게시물을 불러오는 중...');
        clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => {
          openPostOverlayById(largePost.id);
        }, 150);
      });

      largeDiv.appendChild(largeContainer);
      container.appendChild(largeDiv);
    }

    const smallPosts = group.slice(1, 5);
    if(smallPosts.length > 0) {
      const smallDiv = document.createElement('div');
      smallDiv.className = 'magazine-row mobile-small-grid';

      const smallGrid = document.createElement('div');
      smallGrid.className = 'magazine-small-grid mobile-grid';

      smallPosts.forEach(post => {
        if(post) {
          const card = createCardNode(post);
          smallGrid.appendChild(card);
        }
      });

      smallDiv.appendChild(smallGrid);
      container.appendChild(smallDiv);
    }
  }
}
function renderDesktopLayout(posts, container) {
  for(let i = 0; i < posts.length; i += 5) {
    const group = posts.slice(i, i + 5);
    const row = document.createElement('div');
    row.className = 'magazine-row';

    const isEven = Math.floor(i / 5) % 2 === 0;
    if(!isEven) {
      row.classList.add('reverse');
    }
    if(group[0]) {
      const largePost = group[0];
      const largeDiv = document.createElement('div');
      largeDiv.className = 'magazine-large';

      let heroUrl = largePost._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
      largeDiv.innerHTML = `
        <img class="hero" src="${heroUrl || placeholderDataURI(1200,800,'No Image')}" alt="hero" loading="lazy">
        <div class="hero-overlay">
          <h2 class="hero-title">${largePost.title?.rendered || '제목 없음'}</h2>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="hero-author" style="font-weight:800;color:#fff">${largePost._embedded?.author?.[0]?.name || '익명'}</div>
            <div class="hero-date" style="color:#eee;opacity:.9">${formatDate(largePost.date)}</div>
          </div>
        </div>
      `;

      const catWrap = document.createElement('div');
      catWrap.className = 'hero-cats';
      const firstCat = largePost._embedded?.['wp:term']?.[0]?.[0];
      if(firstCat) {
        const span = document.createElement('span');
        span.className = 'cat-badge ' + pickCategoryClass(firstCat.slug || firstCat.name);
        span.textContent = firstCat.name;
        catWrap.appendChild(span);
      }
      largeDiv.appendChild(catWrap);

      let clickTimeout;
      largeDiv.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if(state.isProcessing) return;
        // [IMPACT-LOADING] 클릭 즉시 로딩 표시
        openLoading('게시물을 불러오는 중...');
        clearTimeout(clickTimeout);
        clickTimeout = setTimeout(() => {
          openPostOverlayById(largePost.id);
        }, 150);
      });

      if(isEven) {
        row.appendChild(largeDiv);
      }
    }
    const smallGrid = document.createElement('div');
    smallGrid.className = 'magazine-small-grid';
    group.slice(1, 5).forEach(post => {
      if(post) {
        const card = createCardNode(post);
        smallGrid.appendChild(card);
      }
    });

    if(isEven) {
      row.appendChild(smallGrid);
    } else {
      row.appendChild(smallGrid);
      if(group[0]) {
        const largePost = group[0];
        const largeDiv = document.createElement('div');
        largeDiv.className = 'magazine-large';

        let heroUrl = largePost._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
        largeDiv.innerHTML = `
          <img class="hero" src="${heroUrl || placeholderDataURI(1200,800,'No Image')}" alt="hero" loading="lazy">
          <div class="hero-overlay">
            <h2 class="hero-title">${largePost.title?.rendered || '제목 없음'}</h2>
            <div style="display:flex;align-items:center;gap:10px">
              <div class="hero-author" style="font-weight:800;color:#fff">${largePost._embedded?.author?.[0]?.name || '익명'}</div>
              <div class="hero-date" style="color:#eee;opacity:.9">${formatDate(largePost.date)}</div>
            </div>
          </div>
        `;

        const catWrap = document.createElement('div');
        catWrap.className = 'hero-cats';
        const firstCat = largePost._embedded?.['wp:term']?.[0]?.[0];
        if(firstCat) {
          const span = document.createElement('span');
          span.className = 'cat-badge ' + pickCategoryClass(firstCat.slug || firstCat.name);
          span.textContent = firstCat.name;
          catWrap.appendChild(span);
        }
        largeDiv.appendChild(catWrap);

        let clickTimeout;
        largeDiv.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          if(state.isProcessing) return;
          clearTimeout(clickTimeout);
          clickTimeout = setTimeout(() => {
            openLoading('게시물을 불러오는 중...');
            setTimeout(() => {
              openPostOverlayById(largePost.id);
            }, 50);
          }, 150);
        });

        row.appendChild(largeDiv);
      }
    }
    container.appendChild(row);
  }
}
async function loadHomeChunk(page = 1) {
  if(state.isProcessing || state.homeLoadPromise) return state.homeLoadPromise;

  state.isProcessing = true;

  const loadingEl = document.getElementById('homeLoading');
  loadingEl.textContent = '로딩 중...';
  state.homeLoadPromise = new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(api(`posts?per_page=${HOME_PER_PAGE}&page=${page}`));
      if(!res.ok) throw new Error('Failed to load');

      // 방법 1: 헤더에서 읽기 시도
      let totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '0');
      let totalPosts = parseInt(res.headers.get('X-WP-Total') || '0');
      
      console.log('=== Page', page, '로딩 시작 ===');
      console.log('Headers - TotalPages:', totalPages, 'TotalPosts:', totalPosts);

      const posts = await res.json();
      console.log('받은 게시물 수:', posts.length);
      
      // 방법 2: 헤더가 없으면 전체 게시물 수로 계산
      if(totalPages === 0 && totalPosts > 0) {
        totalPages = Math.ceil(totalPosts / HOME_PER_PAGE);
        console.log('Calculated totalPages from totalPosts:', totalPages);
      }
      
      // 방법 3: 헤더도 없고 totalPosts도 없으면, WordPress API 직접 호출
      if(totalPages === 0) {
        console.log('헤더 정보 없음 - 직접 API 호출 시도...');
        const directCount = await getTotalPostsCount();
        
        if(directCount && directCount.totalPages > 0) {
          totalPages = directCount.totalPages;
          state.allPostsCount = directCount.total;
          console.log('직접 API 호출 성공 - TotalPages:', totalPages, 'Total:', directCount.total);
        }
      }
      
      // 방법 4: state에 저장된 값 사용
      if(totalPages === 0 && state.homeTotal > 0) {
        totalPages = state.homeTotal;
        console.log('이전에 저장된 totalPages 사용:', totalPages);
      }
      
      // 방법 5: 받은 게시물 개수로 추정 (최후의 수단)
      if(totalPages === 0 && Array.isArray(posts)) {
        if(posts.length === HOME_PER_PAGE) {
          // 20개 받았다면 최소 현재 페이지 + 1
          totalPages = page + 1;
          console.log('게시물 개수로 추정 (20개 = ', page, '페이지 이상):', totalPages);
        } else if(posts.length > 0) {
          // 20개 미만이면 현재가 마지막 페이지
          totalPages = page;
          console.log('현재가 마지막 페이지:', totalPages);
        } else {
          totalPages = Math.max(1, page - 1);
          console.log('게시물 없음, 이전 페이지로:', totalPages);
        }
      }
      
      // 최소값 보장
      if(totalPages === 0) totalPages = 1;
      
      // 현재 페이지가 totalPages보다 크면 조정
      if(page > totalPages) {
        console.warn('현재 페이지가 총 페이지보다 큼. 조정 필요');
        totalPages = page;
      }
      
      state.homeTotal = totalPages;
      console.log('=== 최종 totalPages:', totalPages, '===');

      if(!Array.isArray(posts) || posts.length === 0) {
        console.warn('게시물 없음 - 페이지:', page);
        
        // 페이지가 1이 아니면 1페이지로 리다이렉트
        if(page !== 1) {
          console.log('1페이지로 리다이렉트');
          state.isProcessing = false;
          state.homeLoadPromise = null;
          return loadHomeChunk(1);
        }
        
        loadingEl.textContent = '게시물이 없습니다.';
        
        // 게시물이 없어도 페이지네이션은 표시 (비활성화 상태로)
        renderPagination('homePagination', page, totalPages, (p) => {
          openLoading('페이지를 불러오는 중...');
          state.homePage = p;
          state.homeLoadPromise = null;
          loadHomeChunk(p).then(() => {
            resetScrollTop('window');
            closeLoading();
          }).catch(() => {
            closeLoading();
          });
        });
        
        state.isProcessing = false;
        state.homeLoadPromise = null;
        resolve();
        return;
      }
      
      const uniquePosts = posts.filter((post, index, self) =>
        index === self.findIndex(p => p.id === post.id)
      );

      uniquePosts.forEach(p => state.postsCache[p.id] = p);
      const container = document.getElementById('rowsContainer');

      // 페이지 전환 시 항상 기존 게시물 제거
      container.innerHTML = '';
      
      const isMobile = window.innerWidth <= 680;
      if(isMobile) {
        renderMobileLayout(uniquePosts, container);
      } else {
        renderDesktopLayout(uniquePosts, container);
      }
      
      console.log('페이지네이션 렌더링:', 'page=', page, 'totalPages=', totalPages);
      renderPagination('homePagination', page, totalPages, (p) => {
        // [IMPACT-LOADING] 페이지네이션 클릭 시 로딩 표시
        openLoading('페이지를 불러오는 중...');
        state.homePage = p;
        state.homeLoadPromise = null;
        loadHomeChunk(p).then(() => {
          resetScrollTop('window');
          closeLoading();
        }).catch(() => {
          closeLoading();
        });
      });
      loadingEl.textContent = '';
      resolve();
    } catch(err) {
      console.error('loadHomeChunk 에러:', err);
      loadingEl.textContent = '로딩 실패. 새로고침을 시도해주세요.';
      reject(err);
    } finally {
      state.isProcessing = false;
      state.homeLoadPromise = null;
    }
  });

  return state.homeLoadPromise;
}
function renderPagination(containerId, currentPage, totalPages, onPageClick) {
  const container = document.getElementById(containerId);
  if(!container) {
    console.error('페이지네이션 컨테이너를 찾을 수 없음:', containerId);
    return;
  }

  container.innerHTML = '';
  
  console.log('━━━ renderPagination 호출 ━━━');
  console.log('Container:', containerId);
  console.log('Current Page:', currentPage, '(타입:', typeof currentPage, ')');
  console.log('Total Pages:', totalPages, '(타입:', typeof totalPages, ')');

  if(totalPages <= 0) {
    console.warn('totalPages가 0 이하입니다. 페이지네이션 표시 안함.');
    return;
  }
  
  // 현재 페이지를 숫자로 강제 변환
  currentPage = parseInt(currentPage) || 1;
  totalPages = parseInt(totalPages) || 1;
  
  // 현재 페이지가 범위를 벗어나면 조정
  if(currentPage < 1) currentPage = 1;
  if(currentPage > totalPages) currentPage = totalPages;

  // 이전 버튼
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '«';
  prevBtn.disabled = currentPage === 1;
  if(currentPage > 1) {
    prevBtn.onclick = () => onPageClick(currentPage - 1);
  }
  container.appendChild(prevBtn);

  // 모바일 감지
  const isMobile = window.innerWidth <= 640;
  const maxVisible = isMobile ? 5 : 7;
  
  console.log('모바일:', isMobile, '/ 최대 표시:', maxVisible);

  // 페이지 번호 계산
  const pages = calculatePageNumbers(currentPage, totalPages, maxVisible);
  
  console.log('생성된 페이지 배열:', pages);

  if(!pages || pages.length === 0) {
    console.error('페이지 배열이 비어있습니다!');
    // 최소한 현재 페이지라도 표시
    pages = [currentPage];
  }

  pages.forEach((page, index) => {
    console.log(`  [${index}] 페이지:`, page, '현재:', currentPage, '일치:', page === currentPage);
    
    if(page === '...') {
      const dots = document.createElement('span');
      dots.textContent = '...';
      container.appendChild(dots);
    } else {
      const btn = document.createElement('button');
      btn.textContent = page;
      if(page === currentPage) {
        btn.classList.add('active');
        console.log(`    → ${page}번 버튼에 'active' 클래스 추가됨`);
      }
      btn.onclick = () => onPageClick(page);
      container.appendChild(btn);
    }
  });

  // 다음 버튼
  const nextBtn = document.createElement('button');
  nextBtn.textContent = '»';
  nextBtn.disabled = currentPage === totalPages;
  if(currentPage < totalPages) {
    nextBtn.onclick = () => onPageClick(currentPage + 1);
  }
  container.appendChild(nextBtn);
  
  console.log('━━━ renderPagination 완료 ━━━\n');
}

function calculatePageNumbers(current, total, maxVisible) {
  console.log('  calculatePageNumbers:', 'current=', current, 'total=', total, 'maxVisible=', maxVisible);
  
  const pages = [];
  
  // 입력값 검증
  current = parseInt(current) || 1;
  total = parseInt(total) || 1;
  maxVisible = parseInt(maxVisible) || 7;
  
  if(current < 1) current = 1;
  if(current > total) current = total;

  // 전체 페이지가 maxVisible 이하면 모두 표시
  if(total <= maxVisible) {
    console.log('  → 전체 페이지 표시 (total <= maxVisible)');
    for(let i = 1; i <= total; i++) {
      pages.push(i);
    }
    console.log('  → 결과:', pages);
    return pages;
  }

  // 항상 첫 페이지 표시
  pages.push(1);
  console.log('  → 1 추가');

  // 현재 페이지 기준으로 표시할 범위 계산
  const sidesCount = maxVisible - 3; // 첫 페이지, 마지막 페이지, 현재 페이지를 제외한 개수
  const leftSide = Math.floor(sidesCount / 2);
  const rightSide = Math.ceil(sidesCount / 2);
  
  console.log('  → sidesCount:', sidesCount, 'leftSide:', leftSide, 'rightSide:', rightSide);

  // 현재 페이지가 왼쪽에 치우쳐 있는 경우
  if(current <= leftSide + 2) {
    console.log('  → 왼쪽 치우침 (current <= ', leftSide + 2, ')');
    // 1, 2, 3, 4, 5 ... last 형태
    for(let i = 2; i < Math.min(maxVisible - 1, total); i++) {
      pages.push(i);
      console.log('    → ', i, '추가');
    }
    
    if(total > maxVisible - 1) {
      pages.push('...');
      console.log('    → ... 추가');
    }
  }
  // 현재 페이지가 오른쪽에 치우쳐 있는 경우
  else if(current >= total - rightSide - 1) {
    console.log('  → 오른쪽 치우침 (current >= ', total - rightSide - 1, ')');
    // 1 ... 16, 17, 18, 19, 20 형태
    pages.push('...');
    console.log('    → ... 추가');
    
    for(let i = Math.max(total - maxVisible + 3, 2); i < total; i++) {
      pages.push(i);
      console.log('    → ', i, '추가');
    }
  }
  // 현재 페이지가 중간에 있는 경우
  else {
    console.log('  → 중간 위치');
    // 1 ... 8, 9, 10 ... 20 형태
    pages.push('...');
    console.log('    → ... 추가');
    
    for(let i = current - leftSide; i <= current + rightSide; i++) {
      if(i > 1 && i < total) {
        pages.push(i);
        console.log('    → ', i, '추가');
      }
    }
    
    pages.push('...');
    console.log('    → ... 추가');
  }

  // 항상 마지막 페이지 표시
  if(total > 1) {
    pages.push(total);
    console.log('  → ', total, '(마지막) 추가');
  }
  
  console.log('  → 최종 결과:', pages);

  return pages;
}
async function loadCategory(slug, page = 1) {
  if(state.isProcessing) return;
  state.isProcessing = true;

  // [IMPACT-LOADING] router.openCategory에서 이미 openLoading이 호출되었으므로
  // 페이지네이션에서 직접 호출될 때만 로딩 표시
  const loadingEl = document.getElementById('pageTransition');
  if(!loadingEl || !loadingEl.classList.contains('active')) {
    openLoading('카테고리를 불러오는 중...');
  }

  state.currentCategory = slug;
  state.categoryPage = page;

  const overlay = document.getElementById('categoryOverlay');
  // 수정됨: 카테고리 페이지 열기 전에 먼저 스크롤 리셋
  overlay.scrollTop = 0;
  overlay.classList.add('active');

  // 수정됨: 모바일과 데스크탑 모두에서 메인 홈 스크롤 중단
  document.body.style.overflow = 'hidden';

  document.getElementById('categoryOverlayTitle').textContent = slug.toUpperCase();

  const newUrl = `${window.location.origin}${window.location.pathname}?category=${slug}`;
  history.pushState({page:'category', slug:slug}, '', newUrl);

  const descriptions = {
    'tech': '기술과 혁신에 대한 심층 분석',
    'eat': '음식과 외식 문화 탐구',
    'style': '패션과 라이프스타일 트렌드',
    'culture': '문화와 예술에 대한 인사이트',
    'life': '일상과 삶에 대한 이야기',
    'editors-pick': '에디터가 선정한 추천 콘텐츠'
  };
  document.getElementById('categoryOverlaySubtitle').textContent = descriptions[slug] || '카테고리 설명';

  const grid = document.getElementById('categoryGrid');
  grid.innerHTML = '';
  document.getElementById('categoryLoading').textContent = '로딩 중...';
  
  try {
    const catId = CATEGORIES[slug];
    if(!catId) {
      document.getElementById('categoryLoading').textContent = '알 수 없는 카테고리입니다.';
      state.isProcessing = false;
      closeLoading();
      return;
    }

    const res = await fetch(api(`posts?categories=${catId}&per_page=20&page=${page}`));
    if(!res.ok) throw new Error('Failed');

    let totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '0');
    let totalPosts = parseInt(res.headers.get('X-WP-Total') || '0');
    
    console.log('Category Headers - TotalPages:', totalPages, 'TotalPosts:', totalPosts);
    
    const posts = await res.json();
    
    // 헤더가 없으면 전체 게시물 수로 계산
    if(totalPages === 0 && totalPosts > 0) {
      totalPages = Math.ceil(totalPosts / 20);
      console.log('Category - Calculated totalPages:', totalPages);
    }
    
    // 최소값 보장
    if(totalPages === 0) totalPages = 1;
    
    state.categoryTotal = totalPages;
    console.log('Category - Final totalPages:', totalPages);
    if(Array.isArray(posts)) {
      const uniquePosts = posts.filter((post, index, self) =>
        index === self.findIndex(p => p.id === post.id)
      );

      uniquePosts.forEach(p => {
        state.postsCache[p.id] = p;
        const card = createCardNode(p);
        grid.appendChild(card);
      });
    }

    renderPagination('categoryPagination', page, totalPages, (p) => {
      // [IMPACT-LOADING] 페이지네이션 클릭 시 로딩 표시
      openLoading('페이지를 불러오는 중...');
      loadCategory(slug, p);
    });

    document.getElementById('categoryLoading').textContent = '';
    
    // [IMPACT-LOADING] 완료 후 스크롤 리셋 및 로딩 해제
    resetScrollTop('category');
    await nextFrame();
    closeLoading();
  } catch(e) {
    console.error(e);
    document.getElementById('categoryLoading').textContent = '불러오기 실패';
    // [IMPACT-LOADING] 에러 시에도 로딩 해제
    closeLoading();
  } finally {
    state.isProcessing = false;
  }
}
async function loadEditors() {
  if(state.editorsLoaded) return;
  document.getElementById('editorsLoading').textContent = '로딩 중...';
  try {
    const res = await fetch(api(`users?per_page=100`));
    if(!res.ok) throw new Error('editors api fail ' + res.status);
    const users = await res.json();
    state.editorsList = Array.isArray(users) ? users : [];
    renderEditorsGrid();
    state.editorsLoaded = true;
    document.getElementById('editorsLoading').textContent = '';
  } catch(e) {
    console.error(e);
    document.getElementById('editorsLoading').textContent = '에디터 목록을 불러오지 못했습니다.';
  }
}
function renderEditorsGrid() {
  const wrap = document.getElementById('editorsGrid');
  wrap.innerHTML = '';
  const tpl = document.getElementById('editorTpl');
  state.editorsList.forEach(u => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    const img = node.querySelector('.editor-avatar');
    img.src = (u.avatar_urls && (u.avatar_urls['96']||u.avatar_urls['48']||u.avatar_urls['24'])) ? (u.avatar_urls['96']||u.avatar_urls['48']||u.avatar_urls['24']) : placeholderDataURI(96,96,'U');
    img.alt = u.name || u.slug || 'editor';
    node.querySelector('.editor-name').textContent = u.name || u.slug || 'unknown';
    node.querySelector('.editor-bio').textContent = u.description || '';
    node.addEventListener('click', () => router.openEditorProfile(u));
    wrap.appendChild(node);
  });
}
function showEditorsList() {
  document.getElementById('editorProfileSection').style.display = 'none';
  document.getElementById('editorsGridWrapper').style.display = 'block';
  history.pushState({page:'editors'}, '', '#editors');
}
async function loadRelatedPosts(categories, currentPostId) {
  if(!categories || categories.length === 0) return [];

  try {
    const catId = categories[0].id;
    const res = await fetch(api(`posts?categories=${catId}&per_page=8&exclude=${currentPostId}`));
    if(!res.ok) return [];
    const posts = await res.json();

    const uniquePosts = Array.isArray(posts)
      ? posts.filter((p, index, self) =>
          p.id !== currentPostId && index === self.findIndex(post => post.id === p.id)
        ).slice(0, 4)
      : [];

    return uniquePosts;
  } catch(e) {
    console.error(e);
    return [];
  }
}

function openImageModal(imgSrc) {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImage');
  modalImg.src = imgSrc;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeImageModal() {
  const modal = document.getElementById('imageModal');
  modal.classList.remove('active');
  if(!document.getElementById('postOverlay').classList.contains('active')) {
    document.body.style.overflow = '';
  }
}

async function openPostOverlayById(id, updateURL = true) {
  if(!id || state.isProcessing) return;
  state.isProcessing = true;

  // [IMPACT-LOADING] 출발 즉시 로딩 오버레이 표시
  openLoading('게시물을 불러오는 중...');

  state.currentPostId = id;

  if(updateURL) {
    const currentUrl = window.location.href;
    const currentParams = new URLSearchParams(window.location.search);
    const currentCategory = currentParams.get('category');
    const currentEditor = currentParams.get('editor');
    const currentPage = currentParams.get('page');

    let previousState = {
      url: currentUrl,
      page: 'home',
      scrollPosition: window.scrollY
    };

    if(currentCategory) {
      previousState.page = 'category';
      previousState.category = currentCategory;
    } else if(currentEditor) {
      previousState.page = 'editor';
      previousState.editor = currentEditor;
    } else if(currentPage === 'search') {
      previousState.page = 'search';
      previousState.searchTerm = document.getElementById('searchInput')?.value || '';
    } else if(currentPage === 'about') {
      previousState.page = 'about';
    } else if(currentPage === 'editors') {
      previousState.page = 'editors';
    }

    const newUrl = `${window.location.origin}${window.location.pathname}?post=${id}`;
    history.pushState({page: 'post', id: id, previous: previousState}, '', newUrl);
  }

  const overlay = document.getElementById('postOverlay');
  const article = document.getElementById('postArticle');

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  // 수정됨: 오버레이 열기 전에 먼저 스크롤을 최상단으로 리셋
  overlay.scrollTop = 0;

  const cached = state.postsCache[id];
  if(cached && cached.content && cached.content.rendered) {
    await renderPostOverlay(cached);
    // [IMPACT-LOADING] 렌더 완료 후 스크롤 리셋 및 로딩 해제
    // 수정됨: 캐시된 게시물도 항상 최상단부터 표시
    const postOverlay = document.getElementById('postOverlay');
    postOverlay.scrollTop = 0;
    resetScrollTop('post');
    await nextFrame();
    closeLoading();
    state.isProcessing = false;
    return;
  }

  article.innerHTML = `
    <div class="post-loading-container" style="
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 60vh;
      flex-direction: column;
      gap: 16px;
    ">
      <div class="spinner" style="
        width: 40px;
        height: 40px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #ff6b35;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <p style="color: #666; font-size: 16px;">게시물을 불러오는 중...</p>
    </div>
  `;

  try {
    const res = await fetch(api(`posts/${id}?_embed`));
    if(!res.ok) throw new Error('post fetch failed ' + res.status);
    const post = await res.json();

    state.postsCache[id] = post;

    await renderPostOverlay(post);
    // [IMPACT-LOADING] 렌더 완료 후 스크롤 리셋 및 로딩 해제
    // 수정됨: 새로 로드된 게시물도 항상 최상단부터 표시
    const postOverlay = document.getElementById('postOverlay');
    postOverlay.scrollTop = 0;
    resetScrollTop('post');
    await nextFrame();
    closeLoading();
  } catch(e) {
    console.error(e);
    article.innerHTML = `
      <div class="post-error-container" style="
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 60vh;
        flex-direction: column;
        gap: 16px;
      ">
        <p style="color: #e74c3c; font-size: 18px;">게시물을 불러올 수 없습니다.</p>
        <button onclick="router.closePost()" class="btn" style="padding: 8px 16px;">돌아가기</button>
      </div>
    `;
    // [IMPACT-LOADING] 에러 시에도 로딩 해제
    closeLoading();
  } finally {
    state.isProcessing = false;
  }
}
async function renderPostOverlay(post) {
  const overlay = document.getElementById('postOverlay');
  const article = document.getElementById('postArticle');
  const title = post.title && post.title.rendered ? post.title.rendered : '제목 없음';
  const authorName = (post._embedded && post._embedded.author && post._embedded.author[0] && post._embedded.author[0].name) ? post._embedded.author[0].name : '익명';
  const authorData = post._embedded?.author?.[0] || {};
  const avatar = (post._embedded && post._embedded.author && post._embedded.author[0] && post._embedded.author[0].avatar_urls) ? (post._embedded.author[0].avatar_urls['96'] || post._embedded.author[0].avatar_urls['48']) : '';
  const categories = (post._embedded && post._embedded['wp:term'] && post._embedded['wp:term'][0]) ? post._embedded['wp:term'][0].map(t=>t.name).join(', ') : '-';
  const dateStr = formatDate(post.date);
  const contentHTML = post.content && post.content.rendered ? post.content.rendered : (post.excerpt && post.excerpt.rendered ? post.excerpt.rendered : '');
  const featuredUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
  article.innerHTML = `
    <div class="post-hero-section">
      <div class="post-header">
        ${featuredUrl ? `
          <div class="post-thumbnail-container">
            <div class="post-thumbnail">
              <img src="${featuredUrl}" alt="featured image">
            </div>
          </div>
        ` : ''}
        <div class="post-info-container">
          <div class="post-info">
            <div class="cat-row" style="margin-bottom:16px">
              ${post._embedded?.['wp:term']?.[0]?.map(c => {
                const cls = pickCategoryClass(c.slug || c.name);
                return `<span class="cat-badge ${cls}">${c.name}</span>`;
              }).join('') || ''}
            </div>
            <h1>${title}</h1>
            <div class="post-meta-info">
              <div class="meta-row">
                <img src="${avatar || placeholderDataURI(96,96,'U')}" alt="author" class="author-avatar">
                <strong>${authorName}</strong>
              </div>
              <div class="meta-row">
                <span>📅 ${dateStr}</span>
              </div>
              <div class="meta-row">
                <span>🏷️ ${categories}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="post-content">${contentHTML}</div>
    <div class="author-profile-section" 
         role="link" 
         tabindex="0" 
         data-editor-id="${authorData.id}"
         style="cursor: pointer;">
      <img src="${avatar || placeholderDataURI(96,96,'U')}" alt="${authorName}" class="author-profile-avatar">
      <div class="author-profile-info">
        <div class="author-profile-name">${authorName}</div>
        <div class="author-profile-bio">${authorData.description || '에디터 소개가 없습니다.'}</div>
      </div>
    </div>
    <div class="copyright-notice">
      본 콘텐츠의 모든 저작권 및 지식재산권은 IMPACT에 귀속됩니다. 무단 복제, 전재 등 2차적 저작물 생성 등 일체의 무단 이용을 금합니다. 이를 위반할 경우, 민형사상 강력한 법적 조치가 취해질 수 있습니다.
    </div>
    <div id="relatedPostsContainer"></div>
  `;
  
  article.querySelectorAll('.post-content img').forEach(img=>{
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    img.style.margin = '12px 0';
    img.style.cursor = 'pointer';
    img.style.pointerEvents = 'auto';
    
    img.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openImageModal(img.src);
    });
  });

  try {
    const allNodes = Array.from(article.querySelectorAll('.post-content *'));
    allNodes.forEach(el => {
      if (el && el.textContent && el.textContent.trim().includes('이 글 공유하기')) {
        el.remove();
      }
    });
  } catch(e) { }
  try {
    article.querySelectorAll('.updated, time[itemprop="dateModified"], [data-modified], .post-modified, .modified-date').forEach(el => el.remove());
  } catch(e) { }
  const postCategories = post._embedded?.['wp:term']?.[0] || [];
  if(postCategories.length > 0) {
    const relatedPosts = await loadRelatedPosts(postCategories, post.id);
    if(relatedPosts.length > 0) {
      const relatedContainer = document.getElementById('relatedPostsContainer');
      const relatedSection = document.createElement('div');
      relatedSection.className = 'related-posts';
      relatedSection.innerHTML = '<h3>같은 카테고리의 다른 글</h3><div class="related-grid" id="relatedGrid"></div>';
      relatedContainer.appendChild(relatedSection);

      const relatedGrid = document.getElementById('relatedGrid');
      relatedPosts.forEach(p => {
        state.postsCache[p.id] = p;
        const card = createCardNode(p);
        relatedGrid.appendChild(card);
      });
    }
  }
  
  // [IMPACT-LOADING] C. 에디터 박스 클릭/키보드 이벤트 핸들러
  const editorBox = article.querySelector('.author-profile-section');
  if (editorBox && authorData.id) {
    const handleEditorClick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      // [IMPACT-LOADING] 즉시 로딩 표시
      openLoading('에디터 페이지로 이동 중...');
      
      // 게시물 오버레이 닫기
      const postOverlay = document.getElementById('postOverlay');
      postOverlay.classList.remove('active');
      document.body.style.overflow = '';
      document.getElementById('progressBar').classList.remove('active');
      document.getElementById('postHeaderBar').classList.remove('show');
      document.getElementById('postToTopBtn').classList.remove('show');
      
      // 에디터 프로필로 이동
      try {
        await router.openEditorProfile({
          id: authorData.id,
          name: authorName,
          description: authorData.description || '',
          avatar_urls: authorData.avatar_urls || {},
          slug: authorData.slug || ''
        }, true);
        
        // [IMPACT-LOADING] 완료 후 스크롤 리셋 및 로딩 해제
        resetScrollTop('editors');
        await nextFrame();
        closeLoading();
      } catch (err) {
        console.error('에디터 페이지 이동 실패:', err);
        closeLoading();
      }
    };
    
    editorBox.addEventListener('click', handleEditorClick);
    editorBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleEditorClick(e);
      }
    });
  }
  
  overlay.classList.add('active');
  overlay.scrollTop = 0;
  document.body.style.overflow = 'hidden';

  const progressBar = document.getElementById('progressBar');
  progressBar.classList.add('active');
  progressBar.style.width = '0%';
}
const ui = {
  toggleNav: (forceClose = false) => {
    const nav = document.getElementById('navOverlay');
    if(forceClose) {
      nav.classList.remove('active');
      if(window.innerWidth <= 680) {
        document.body.style.overflow = '';
      }
    } else {
      nav.classList.toggle('active');
      if(window.innerWidth <= 680) {
        if(nav.classList.contains('active')) {
          document.body.style.overflow = 'hidden';
        } else {
          document.body.style.overflow = '';
        }
      }
    }
  }
};
const router = {
  openCategory: (slug, updateURL = true) => {
    // [IMPACT-LOADING] 즉시 로딩 표시
    openLoading('카테고리를 불러오는 중...');
    loadCategory(slug, 1);
    if(updateURL) {
      const newUrl = `${window.location.origin}${window.location.pathname}?category=${slug}`;
      history.pushState({page:'category', slug:slug}, '', newUrl);
    }
  },
  closeCategory: async () => {
    document.getElementById('categoryOverlay').classList.remove('active');
    document.body.style.overflow = '';
    const newUrl = `${window.location.origin}${window.location.pathname}`;
    history.pushState({page:'home'}, '', newUrl);
    
    // 수정됨: 메인 홈이 로드되지 않았다면 즉시 로드 및 로딩 표시
    const container = document.getElementById('rowsContainer');
    if(!container || container.children.length === 0) {
      openLoading('홈페이지를 불러오는 중...');
      await loadHomeChunk(1);
      closeLoading();
    }
    
    // 스크롤 리셋
    resetScrollTop('window');
    await nextFrame();
  },
  openEditors: async (updateURL = true) => {
    // [IMPACT-LOADING] 즉시 로딩 표시
    openLoading('에디터 목록을 불러오는 중...');
    
    // 수정됨: EDITORS 페이지 열기 전에 먼저 스크롤 리셋
    const editorsOverlay = document.getElementById('editorsOverlay');
    editorsOverlay.scrollTop = 0;
    
    document.getElementById('editorsOverlay').classList.add('active');
    // 수정됨: 모바일과 데스크탑 모두에서 메인 홈 스크롤 중단
    document.body.style.overflow = 'hidden';
    
    await loadEditors();
    
    // [IMPACT-LOADING] 완료 후 스크롤 리셋 및 로딩 해제
    resetScrollTop('editors');
    await nextFrame();
    closeLoading();
    
    if(updateURL) {
      const newUrl = `${window.location.origin}${window.location.pathname}?page=editors`;
      history.pushState({page:'editors'}, '', newUrl);
    }
  },
  closeEditors: async () => {
    document.getElementById('editorsOverlay').classList.remove('active');
    document.body.style.overflow = '';
    const newUrl = `${window.location.origin}${window.location.pathname}`;
    history.pushState({page:'home'}, '', newUrl);
    
    // 수정됨: 메인 홈이 로드되지 않았다면 즉시 로드 및 로딩 표시
    const container = document.getElementById('rowsContainer');
    if(!container || container.children.length === 0) {
      openLoading('홈페이지를 불러오는 중...');
      await loadHomeChunk(1);
      closeLoading();
    }
    
    // 스크롤 리셋
    resetScrollTop('window');
    await nextFrame();
  },
  openAbout: async (updateURL = true) => {
    // [IMPACT-LOADING] 즉시 로딩 표시
    openLoading('ABOUT 페이지를 불러오는 중...');
    
    // 수정됨: ABOUT 페이지 열기 전에 먼저 스크롤 리셋
    const aboutPage = document.getElementById('aboutPage');
    aboutPage.scrollTop = 0;
    
    document.getElementById('aboutPage').classList.add('active');
    // 수정됨: 모바일과 데스크탑 모두에서 메인 홈 스크롤 중단
    document.body.style.overflow = 'hidden';
    
    // [IMPACT-LOADING] 완료 후 스크롤 리셋 및 로딩 해제
    resetScrollTop('about');
    await nextFrame();
    closeLoading();
    
    if(updateURL) {
      const newUrl = `${window.location.origin}${window.location.pathname}?page=about`;
      history.pushState({page:'about'}, '', newUrl);
    }
  },
  closeAbout: async () => {
    document.getElementById('aboutPage').classList.remove('active');
    document.body.style.overflow = '';
    const newUrl = `${window.location.origin}${window.location.pathname}`;
    history.pushState({page:'home'}, '', newUrl);
    
    // 수정됨: 메인 홈이 로드되지 않았다면 즉시 로드 및 로딩 표시
    const container = document.getElementById('rowsContainer');
    if(!container || container.children.length === 0) {
      openLoading('홈페이지를 불러오는 중...');
      await loadHomeChunk(1);
      closeLoading();
    }
    
    // 스크롤 리셋
    resetScrollTop('window');
    await nextFrame();
  },
  closePost: () => {
    const overlay = document.getElementById('postOverlay');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    document.getElementById('progressBar').classList.remove('active');
    document.getElementById('postHeaderBar').classList.remove('show');
    document.getElementById('postToTopBtn').classList.remove('show');

    const currentState = history.state;
    if(currentState && currentState.previous) {
      const prev = currentState.previous;

      if(prev.page === 'category' && prev.category) {
        const newUrl = `${window.location.origin}${window.location.pathname}?category=${prev.category}`;
        history.pushState({page: 'category', slug: prev.category}, '', newUrl);
        router.openCategory(prev.category, false);
      } else if(prev.page === 'editor' && prev.editor) {
        const newUrl = `${window.location.origin}${window.location.pathname}?editor=${prev.editor}`;
        history.pushState({page: 'editor', id: prev.editor}, '', newUrl);
        router.openEditors(false);
        setTimeout(async () => {
          if(state.editorsList.length === 0) {
            await loadEditors();
          }
          const editor = state.editorsList.find(e => e.id === parseInt(prev.editor));
          if(editor) {
            router.openEditorProfile(editor, false);
          }
        }, 100);
      } else if(prev.page === 'search') {
        const newUrl = `${window.location.origin}${window.location.pathname}?page=search`;
        history.pushState({page: 'search'}, '', newUrl);
        openNavlessSearch(false);
        if(prev.searchTerm) {
          setTimeout(() => {
            const searchInput = document.getElementById('searchInput');
            if(searchInput) {
              searchInput.value = prev.searchTerm;
              performSearch(prev.searchTerm, 'fullSearch');
            }
          }, 100);
        }
      } else if(prev.page === 'about') {
        const newUrl = `${window.location.origin}${window.location.pathname}?page=about`;
        history.pushState({page: 'about'}, '', newUrl);
        router.openAbout(false);
      } else if(prev.page === 'editors') {
        const newUrl = `${window.location.origin}${window.location.pathname}?page=editors`;
        history.pushState({page: 'editors'}, '', newUrl);
        router.openEditors(false);
      } else {
        const newUrl = `${window.location.origin}${window.location.pathname}`;
        history.pushState({page: 'home'}, '', newUrl);
        
        // 수정됨: 메인 홈이 로드되지 않았다면 즉시 로딩 표시 및 로드
        const container = document.getElementById('rowsContainer');
        if(!container || container.children.length === 0) {
          openLoading('홈페이지를 불러오는 중...');
          loadHomeChunk(1).then(() => {
            closeLoading();
            if(prev.scrollPosition) {
              setTimeout(() => {
                window.scrollTo(0, prev.scrollPosition);
              }, 100);
            }
          }).catch(() => {
            closeLoading();
          });
        } else if(prev.scrollPosition) {
          setTimeout(() => {
            window.scrollTo(0, prev.scrollPosition);
          }, 100);
        }
      }
    } else {
      history.back();
    }
  },
  openEditorProfile: async (user, updateURL = true) => {
    if(!user || !user.id) return;
    
    // [IMPACT-LOADING] 이미 에디터 박스에서 openLoading이 호출되었으므로 여기서는 생략
    // 단, 직접 호출되는 경우를 위해 조건부로 체크
    const loadingEl = document.getElementById('pageTransition');
    if(!loadingEl || !loadingEl.classList.contains('active')) {
      openLoading('에디터 프로필을 불러오는 중...');
    }
    
    const overlay = document.getElementById('editorsOverlay');
    
    // 수정됨: 에디터 프로필 페이지 열기 전에 먼저 스크롤 리셋
    overlay.scrollTop = 0;
    
    if(!overlay.classList.contains('active')) {
      overlay.classList.add('active');
      // 수정됨: 모바일과 데스크탑 모두에서 메인 홈 스크롤 중단
      document.body.style.overflow = 'hidden';
    }
    
    document.getElementById('editorsGridWrapper').style.display = 'none';
    const section = document.getElementById('editorProfileSection');
    section.style.display = 'block';
    document.getElementById('editorProfileName').textContent = user.name || user.slug || '';
    document.getElementById('editorProfileBio').textContent = user.description || '';
    const grid = document.getElementById('editorPostsGrid');
    grid.innerHTML = '';
    document.getElementById('editorPostsLoading').textContent = '로딩 중...';
    
    if(state.editorsList.length === 0) {
      await loadEditors();
    }
    
    try {
      const res = await fetch(api(`posts?author=${user.id}&per_page=50`));
      const posts = await res.json();
      if(Array.isArray(posts)) {
        posts.forEach(p => {
          state.postsCache[p.id] = p;
          const card = createCardNode(p);
          grid.appendChild(card);
        });
      }
      document.getElementById('editorPostsLoading').textContent = '';

      if(updateURL) {
        const newUrl = `${window.location.origin}${window.location.pathname}?editor=${user.id}`;
        history.pushState({page:'editor', id:user.id}, '', newUrl);
      }
      
      // [IMPACT-LOADING] 완료 후 스크롤 리셋 및 로딩 해제
      resetScrollTop('editors');
      await nextFrame();
      closeLoading();
    } catch(e) {
      console.error(e);
      document.getElementById('editorPostsLoading').textContent = '불러오기 실패';
      // [IMPACT-LOADING] 에러 시에도 로딩 해제
      closeLoading();
    }
  }
};
async function openNavlessSearch(updateURL = true) {
  // [IMPACT-LOADING] 즉시 로딩 표시
  openLoading('검색 페이지를 불러오는 중...');
  
  const overlay = document.getElementById('searchOverlay');
  // 수정됨: 검색 페이지 열기 전에 먼저 스크롤 리셋
  overlay.scrollTop = 0;
  overlay.classList.add('active');
  
  // 수정됨: 모바일과 데스크탑 모두에서 메인 홈 스크롤 중단
  document.body.style.overflow = 'hidden';
  
  // [IMPACT-LOADING] 완료 후 스크롤 리셋 및 로딩 해제
  resetScrollTop('search');
  await nextFrame();
  closeLoading();
  
  document.getElementById('searchInput').focus();
  if(updateURL) {
    const newUrl = `${window.location.origin}${window.location.pathname}?page=search`;
    history.pushState({page:'search'}, '', newUrl);
  }
}
async function closeSearch() {
  document.getElementById('searchOverlay').classList.remove('active');
  document.body.style.overflow = '';
  document.getElementById('searchResults').innerHTML = '';
  document.getElementById('searchInput').value = '';
  const newUrl = `${window.location.origin}${window.location.pathname}`;
  history.pushState({page:'home'}, '', newUrl);
  
  // [IMPACT-LOADING] 완료 후 스크롤 리셋 및 로딩 해제
  resetScrollTop('window');
  await nextFrame();
  closeLoading();
}
document.getElementById('globalNavSearch').addEventListener('keypress', (e) => {
  if(e.key === 'Enter') {
    e.preventDefault();
    const query = e.target.value.trim();
    if(query.length >= 1) {
      ui.toggleNav(true);
      openSearchWithQuery(query);
    }
  }
});
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(state.searchDebounce);
  const query = e.target.value.trim();
  if(query.length < 2) {
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchLoading').textContent = '';
    return;
  }

  state.searchDebounce = setTimeout(() => {
    performSearch(query, 'fullSearch');
  }, 500);
});
async function performSearch(query, mode) {
  if(mode === 'fullSearch') {
    const resultsEl = document.getElementById('searchResults');
    const loadingEl = document.getElementById('searchLoading');
    resultsEl.innerHTML = '';
    loadingEl.textContent = '검색 중...';

    try {
      const res = await fetch(api(`posts?search=${encodeURIComponent(query)}&per_page=20`));
      const posts = await res.json();

      loadingEl.textContent = '';

      if(Array.isArray(posts) && posts.length > 0) {
        const uniquePosts = posts.filter((post, index, self) =>
          index === self.findIndex(p => p.id === post.id)
        );

        uniquePosts.forEach(p => {
          state.postsCache[p.id] = p;
          const card = createCardNode(p);
          resultsEl.appendChild(card);
        });
      } else {
        loadingEl.textContent = '검색 결과가 없습니다.';
      }
      
      // [IMPACT-LOADING] 검색 완료 후 로딩 해제
      await nextFrame();
      closeLoading();
    } catch(e) {
      console.error(e);
      loadingEl.textContent = '검색 실패';
      // [IMPACT-LOADING] 에러 시에도 로딩 해제
      closeLoading();
    }
  }
}
async function openSearchWithQuery(query) {
  // [IMPACT-LOADING] 즉시 로딩 표시
  openLoading('검색 중...');
  
  const overlay = document.getElementById('searchOverlay');
  overlay.classList.add('active');
  
  if(window.innerWidth <= 680) {
    document.body.style.overflow = 'hidden';
  }

  // [IMPACT-LOADING] 스크롤 리셋
  resetScrollTop('search');
  await nextFrame();

  const searchInput = document.getElementById('searchInput');
  searchInput.value = query;

  performSearch(query, 'fullSearch');
}
function checkURLAndLoadPost() {
  const urlParams = new URLSearchParams(window.location.search);
  const postParam = urlParams.get('post');
  const categoryParam = urlParams.get('category');
  const editorParam = urlParams.get('editor');
  const pageParam = urlParams.get('page');

  if(postParam) {
    const postId = parseInt(postParam);
    if(!isNaN(postId)) {
      openPostOverlayById(postId, false);
      return true;
    }
  }

  if(categoryParam) {
    router.openCategory(categoryParam, false);
    return true;
  }

  if(editorParam) {
    const editorId = parseInt(editorParam);
    if(!isNaN(editorId)) {
      router.openEditors(false);
      setTimeout(async () => {
        if(state.editorsList.length === 0) {
          await loadEditors();
        }
        const editor = state.editorsList.find(e => e.id === editorId);
        if(editor) {
          router.openEditorProfile(editor, false);
        }
      }, 300);
      return true;
    }
  }

  if(pageParam === 'editors') {
    router.openEditors(false);
    return true;
  } else if(pageParam === 'about') {
    router.openAbout(false);
    return true;
  } else if(pageParam === 'search') {
    openNavlessSearch(false);
    return true;
  }

  const hash = window.location.hash;

  if(hash.startsWith('#post-')) {
    const postId = hash.replace('#post-', '');
    if(postId && !isNaN(parseInt(postId))) {
      const newUrl = `${window.location.origin}${window.location.pathname}?post=${postId}`;
      history.replaceState({page: 'post', id: parseInt(postId)}, '', newUrl);
      setTimeout(() => {
        openPostOverlayById(parseInt(postId), false);
      }, 100);
      return true;
    }
  } else if(hash.startsWith('#editor-')) {
    const editorId = hash.replace('#editor-', '');
    if(editorId && !isNaN(parseInt(editorId))) {
      const newUrl = `${window.location.origin}${window.location.pathname}?editor=${editorId}`;
      history.replaceState({page: 'editor', id: parseInt(editorId)}, '', newUrl);
      router.openEditorProfile(parseInt(editorId), false);
      return true;
    }
  } else if(hash === '#editors') {
    const newUrl = `${window.location.origin}${window.location.pathname}?page=editors`;
    history.replaceState({page: 'editors'}, '', newUrl);
    router.openEditors(false);
    return true;
  } else if(hash === '#about') {
    const newUrl = `${window.location.origin}${window.location.pathname}?page=about`;
    history.replaceState({page: 'about'}, '', newUrl);
    router.openAbout(false);
    return true;
  } else if(hash === '#search') {
    const newUrl = `${window.location.origin}${window.location.pathname}?page=search`;
    history.replaceState({page: 'search'}, '', newUrl);
    openNavlessSearch(false);
    return true;
  }

  return false;
}
window.addEventListener('popstate', (e) => {
  const urlParams = new URLSearchParams(window.location.search);
  const postParam = urlParams.get('post');
  const categoryParam = urlParams.get('category');
  const editorParam = urlParams.get('editor');
  const pageParam = urlParams.get('page');

  if(postParam) {
    const postId = parseInt(postParam);
    if(!isNaN(postId)) {
      setTimeout(() => {
        openPostOverlayById(postId, false);
      }, 50);
      return;
    }
  }

  if(categoryParam) {
    document.querySelectorAll('.post-overlay, .search-overlay, .about-page, .editors-overlay').forEach(el => {
      el.classList.remove('active');
    });
    document.body.style.overflow = '';
    document.getElementById('progressBar').classList.remove('active');
    document.getElementById('postHeaderBar').classList.remove('show');
    document.getElementById('postToTopBtn').classList.remove('show');

    router.openCategory(categoryParam, false);
    return;
  }

  if(editorParam) {
    const editorId = parseInt(editorParam);
    if(!isNaN(editorId)) {
      document.querySelectorAll('.post-overlay, .search-overlay, .about-page, .category-overlay').forEach(el => {
        el.classList.remove('active');
      });
      document.body.style.overflow = '';
      document.getElementById('progressBar').classList.remove('active');
      document.getElementById('postHeaderBar').classList.remove('show');
      document.getElementById('postToTopBtn').classList.remove('show');

      if(!document.getElementById('editorsOverlay').classList.contains('active')) {
        router.openEditors(false);
      }

      setTimeout(async () => {
        if(state.editorsList.length === 0) {
          await loadEditors();
        }
        const editor = state.editorsList.find(e => e.id === editorId);
        if(editor) {
          router.openEditorProfile(editor, false);
        }
      }, 100);
      return;
    }
  }

  if(pageParam === 'editors') {
    document.querySelectorAll('.post-overlay, .search-overlay, .about-page, .category-overlay').forEach(el => {
      el.classList.remove('active');
    });
    document.body.style.overflow = '';
    document.getElementById('progressBar').classList.remove('active');
    document.getElementById('postHeaderBar').classList.remove('show');
    document.getElementById('postToTopBtn').classList.remove('show');

    router.openEditors(false);
    return;
  } else if(pageParam === 'about') {
    document.querySelectorAll('.post-overlay, .search-overlay, .editors-overlay, .category-overlay').forEach(el => {
      el.classList.remove('active');
    });
    document.body.style.overflow = '';
    document.getElementById('progressBar').classList.remove('active');
    document.getElementById('postHeaderBar').classList.remove('show');
    document.getElementById('postToTopBtn').classList.remove('show');

    router.openAbout(false);
    return;
  } else if(pageParam === 'search') {
    document.querySelectorAll('.post-overlay, .about-page, .editors-overlay, .category-overlay').forEach(el => {
      el.classList.remove('active');
    });
    document.body.style.overflow = '';
    document.getElementById('progressBar').classList.remove('active');
    document.getElementById('postHeaderBar').classList.remove('show');
    document.getElementById('postToTopBtn').classList.remove('show');

    openNavlessSearch(false);
    return;
  }

  if(!postParam && !categoryParam && !editorParam && !pageParam) {
    document.querySelectorAll('.category-overlay, .post-overlay, .search-overlay, .about-page, .editors-overlay').forEach(el => {
      el.classList.remove('active');
    });
    document.body.style.overflow = '';
    document.getElementById('progressBar').classList.remove('active');
    document.getElementById('postHeaderBar').classList.remove('show');
    document.getElementById('postToTopBtn').classList.remove('show');
  }
});

document.getElementById('imageModal').addEventListener('click', (e) => {
  if(e.target.id === 'imageModal' || e.target.classList.contains('image-modal')) {
    closeImageModal();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  renderNavList();

  const loadingEl = document.getElementById('homeLoading');
  loadingEl.textContent = '페이지를 불러오는 중...';

  // 수정됨: 새로고침 시 항상 메인 콘텐츠를 미리 로드
  // 메인 홈 콘텐츠를 백그라운드로 로드
  const loadHomeInBackground = async () => {
    try {
      await loadHomeChunk(1);
      console.log('Home loaded successfully in background');
    } catch(err) {
      console.error('Background home loading failed:', err);
    }
  };

  const hasSpecificPage = checkURLAndLoadPost();

  if(!hasSpecificPage) {
    // 메인 페이지인 경우 즉시 로드
    loadHomeChunk(1)
      .then(() => {
        console.log('Home loaded successfully');
      })
      .catch((err) => {
        console.error('Home loading failed:', err);
        loadingEl.textContent = '페이지를 불러오지 못했습니다. 새로고침을 시도해주세요.';
      });
  } else {
    // 수정됨: 서브 페이지에서 시작한 경우도 백그라운드로 메인 콘텐츠 로드
    loadingEl.textContent = '';
    // 약간의 디레이 후 백그라운드로 메인 콘텐츠 로드
    setTimeout(() => {
      loadHomeInBackground();
    }, 1000);
  }
});
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if(!document.getElementById('categoryOverlay').classList.contains('active') &&
       !document.getElementById('postOverlay').classList.contains('active') &&
       !document.getElementById('searchOverlay').classList.contains('active') &&
       !document.getElementById('aboutPage').classList.contains('active') &&
       !document.getElementById('editorsOverlay').classList.contains('active')) {
      state.homeLoadPromise = null;
      loadHomeChunk(state.homePage || 1);
    }
  }, 300);
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape') {
    if(document.getElementById('imageModal').classList.contains('active')) {
      closeImageModal();
    } else if(document.getElementById('postOverlay').classList.contains('active')) {
      router.closePost();
    } else if(document.getElementById('searchOverlay').classList.contains('active')) {
      closeSearch();
    } else if(document.getElementById('categoryOverlay').classList.contains('active')) {
      router.closeCategory();
    } else if(document.getElementById('editorsOverlay').classList.contains('active')) {
      router.closeEditors();
    } else if(document.getElementById('aboutPage').classList.contains('active')) {
      router.closeAbout();
    } else if(document.getElementById('navOverlay').classList.contains('active')) {
      ui.toggleNav(true);
    }
  }
});
