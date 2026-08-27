const makeId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const blankLeaf = (title = '新しいカード') => ({
  id: makeId(),
  title,
  overview: '',
  text: '',
  media: '',
  mediaId: '',
  mediaName: '',
  mediaType: '',
  cards: []
});

const initial = {
  title: '中国で、出会ったもの。',
  intro: '僕が中国で心に残ったものを、あなたに手渡します。',
  cards: [
    {
      id: 'food',
      title: '食',
      overview: '安くてうまい、うますぎる。',
      text: '',
      media: '',
      mediaId: '',
      mediaName: '',
      mediaType: '',
      cards: [
        {
          ...blankLeaf('肉夹馍（ロージャーモー）'),
          text: '手のひらサイズなのに、肉のうまみが濃い。朝からこれでいい。'
        },
        {
          ...blankLeaf('朝の豆漿'),
          text: '甘さ控えめで、まだ一日が始まっていない感じがする。'
        }
      ]
    },
    {
      id: 'sightseeing',
      title: '観光',
      overview: '自然と歴史。たまーに好きな建築。',
      text: '',
      media: '',
      mediaId: '',
      mediaName: '',
      mediaType: '',
      cards: [
        {
          ...blankLeaf('城壁の上から'),
          text: '遠くまで続く道を見ていると、時間の尺度が変わる。'
        }
      ]
    },
    {
      id: 'people',
      title: '文化・人',
      overview: '現地で会った面白い人との話。',
      text: '',
      media: '',
      mediaId: '',
      mediaName: '',
      mediaType: '',
      cards: [
        {
          ...blankLeaf('お茶をすすめてくれた人'),
          text: '「急がなくていい」と言われた気がした午後。'
        }
      ]
    },
    {
      id: 'feeling',
      title: '旅で感じたこと',
      overview: '',
      text: '',
      media: '',
      mediaId: '',
      mediaName: '',
      mediaType: '',
      cards: []
    }
  ]
};

const app = document.querySelector('#app');
const key = 'your-atorie-china-v2';
const mediaDbName = 'your-atorie-china-media';
let trip = JSON.parse(localStorage.getItem(key) || 'null') || structuredClone(initial);
let page = 'cover';
let activeCard = '';
let activeLeaf = '';
let mediaDbPromise = null;
let deckKeyHandler = null;
let publishedMode = false;

function publishedId() {
  const id = new URLSearchParams(location.search).get('c') || '';
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : '';
}

function isViewOnly() {
  const query = new URLSearchParams(location.search);
  return query.has('view') || Boolean(publishedId());
}

function isLanHost(host) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host || '');
}

function isDebugHost() {
  const host = location.hostname;
  return !host || host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || isLanHost(host);
}

function recipientUrl() {
  const url = new URL(location.href);
  url.hash = '';
  url.searchParams.set('view', '1');
  return url.href;
}

const esc = value => (value || '').replace(/[&<>"]/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
}[char]));

function isBundle(card) {
  return Boolean(card.cards && card.cards.length);
}

function normalizeCard(card) {
  card.id ||= makeId();
  card.title ||= card.name || '';
  card.overview ||= '';
  card.text ||= card.body || '';
  card.media ||= '';
  card.mediaId ||= '';
  card.mediaName ||= '';
  card.mediaType ||= '';
  if (card.media.startsWith('data:')) card.media = '';
  card.cards ||= [];
  delete card.name;
  delete card.body;
  delete card.kind;
  card.cards.forEach(child => {
    normalizeCard(child);
    child.cards = [];
  });
}

function ensureFeelingCard() {
  if (trip.cards.some(card => card.id === 'feeling')) return;
  const feeling = {
    ...blankLeaf('旅で感じたこと'),
    id: 'feeling',
    title: '旅で感じたこと'
  };
  const peopleIndex = trip.cards.findIndex(card => card.id === 'people');
  if (peopleIndex >= 0) {
    trip.cards.splice(peopleIndex + 1, 0, feeling);
  } else {
    trip.cards.push(feeling);
  }
}

function normalizeTrip() {
  if (Array.isArray(trip.topics) && !Array.isArray(trip.cards)) {
    trip.cards = trip.topics;
  }
  delete trip.topics;
  trip.cards ||= [];
  trip.cards.forEach(normalizeCard);
  if (!publishedMode) ensureFeelingCard();
}

function clearMediaFields(card) {
  card.media = '';
  (card.cards || []).forEach(clearMediaFields);
}

function save() {
  if (publishedMode) return;
  const snapshot = structuredClone(trip);
  snapshot.cards.forEach(clearMediaFields);
  localStorage.setItem(key, JSON.stringify(snapshot));
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function mediaStore() {
  if (mediaDbPromise) return mediaDbPromise;
  mediaDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(mediaDbName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('media');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return mediaDbPromise;
}

async function putMedia(id, file) {
  const db = await mediaStore();
  const transaction = db.transaction('media', 'readwrite');
  transaction.objectStore('media').put(file, id);
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteMedia(id) {
  if (!id) return;
  const db = await mediaStore();
  const transaction = db.transaction('media', 'readwrite');
  transaction.objectStore('media').delete(id);
}

async function hydrateOne(card) {
  if (!card.mediaId || card.media) return false;
  const db = await mediaStore();
  const transaction = db.transaction('media', 'readonly');
  const file = await requestToPromise(transaction.objectStore('media').get(card.mediaId));
  if (!file) return false;
  card.media = URL.createObjectURL(file);
  card.mediaType = isVideoFile(file) ? 'video' : 'image';
  card.mediaName ||= file.name || '';
  return true;
}

async function hydrateMedia() {
  if (!('indexedDB' in window)) return;
  let changed = false;
  for (const card of trip.cards) {
    if (await hydrateOne(card)) changed = true;
    for (const child of card.cards || []) {
      if (await hydrateOne(child)) changed = true;
    }
  }
  if (changed) renderCurrent();
}

function isVideoFile(file) {
  return Boolean(file) && (file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name || ''));
}

function isVideo(card) {
  return card?.mediaType === 'video' || /\.(mp4|webm|mov|m4v|ogv)$/i.test(card?.mediaName || '');
}

function mediaTag(card, className, mode = '') {
  if (!card?.media) return '';
  if (isVideo(card)) {
    const cover = mode === 'ambience' && className === 'cover-photo';
    const extra = cover ? ' autoplay loop' : mode === 'ambience' ? ' loop' : '';
    return `<video class="${className}" src="${card.media}" muted playsinline preload="${mode ? 'auto' : 'metadata'}" draggable="false"${extra}></video>`;
  }
  return `<img class="${className}" src="${card.media}" alt="" draggable="false">`;
}

function mark(title) {
  return esc((title || '').trim().slice(0, 1) || '・');
}

function renderLeafCard(card) {
  const title = card.title ? `<h3>${esc(card.title)}</h3>` : '';
  const text = card.text ? `<p>${esc(card.text)}</p>` : '';
  const play = isVideo(card) ? '<button class="video-play" type="button" aria-label="再生">▶</button>' : '';
  const photo = card.media
    ? `<div class="tinder-photo">${mediaTag(card, 'tinder-photo-media', isVideo(card) ? 'play' : '')}${play}</div>`
    : '';
  return `<article class="card tinder-card${card.media ? ' is-photo' : ' is-letter'}" data-leaf-id="${card.id}">${photo}<div class="tinder-copy">${title}${text}</div></article>`;
}

function shell(content, { back, title, extra } = {}) {
  const createButton = isViewOnly() || title ? '' : '<button id="creator-link">作成</button>';
  const backBtn = back ? `<button class="nav-back" type="button" data-page="${back}">←</button>` : '';
  const label = title
    ? `<h1 class="top-title">${esc(title)}</h1>`
    : '<span class="brand">YOUR ATORIE</span>';
  const trailing = extra || createButton || '<span></span>';
  app.innerHTML = `<main class="phone"><header class="topbar">${backBtn}${label}${trailing}</header>${content}</main>`;
  const creatorLink = document.querySelector('#creator-link');
  if (creatorLink) {
    creatorLink.onclick = () => {
      location.hash = 'create';
      creator();
    };
  }
  bindRecipient();
}

function previewSource(card) {
  if (card.media) return card;
  return (card.cards || []).find(item => item.media) || null;
}

function coverMedia() {
  for (const card of trip.cards) {
    const source = previewSource(card);
    if (source?.media) return source;
  }
  return null;
}

function coverCard(openable) {
  const source = coverMedia();
  const action = openable ? ' data-page="list" role="button" tabindex="0"' : '';
  return `<div class="cover-wrap"${action}><span class="cover-back"></span><span class="cover-mid"></span><span class="cover-face">${mediaTag(source, 'cover-photo', 'ambience')}<span class="cover-copy"><h1>${esc(trip.title)}</h1><p>${esc(trip.intro)}</p></span></span></div>`;
}

function leavesOf(card) {
  if (isBundle(card)) return card.cards;
  return [card];
}

function handFace(card, kind) {
  const source = kind === 'topic' ? previewSource(card) : card;
  const media = mediaTag(source, 'hand-photo', kind === 'topic' ? 'ambience' : '');
  const blank = media ? '' : `<span class="hand-blank"><em>${mark(card.title)}</em></span>`;
  const note = kind === 'topic' ? card.overview : card.text;
  const copy = `<div class="hand-copy"><strong>${esc(card.title)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
  return `<article class="hand-card${media ? '' : ' is-letter'}" data-hand-id="${card.id}"><div class="hand-face">${media}${blank}${copy}</div></article>`;
}

function pickerView(card) {
  const leaves = leavesOf(card);
  return shell(`<section class="hand-stage"><div class="hand" id="hand" data-pick="leaf">${leaves.map(item => handFace(item, 'leaf')).join('')}</div></section>`, {
    back: 'list',
    title: card.title
  });
}

function topicHand() {
  return shell(`<section class="hand-stage"><div class="hand" id="hand" data-pick="topic">${trip.cards.map(card => handFace(card, 'topic')).join('')}</div></section>`, { back: 'cover' });
}

function openView(bundle, leaf) {
  return shell(`<section class="reader" id="reader">${renderLeafCard(leaf)}</section>`, {
    back: 'picker',
    title: bundle.title
  });
}

function recipient() {
  if (page === 'cover') {
    return shell(`<section class="cover">${coverCard(true)}</section>`);
  }

  if (page === 'list') {
    return topicHand();
  }

  const card = trip.cards.find(item => item.id === activeCard) || trip.cards[0];
  if (page === 'picker') return pickerView(card);
  const leaves = leavesOf(card);
  const leaf = leaves.find(item => item.id === activeLeaf) || leaves[0];
  return openView(card, leaf);
}

function bindRecipient() {
  document.querySelectorAll('[data-page]').forEach(button => {
    button.onclick = () => {
      page = button.dataset.page;
      recipient();
    };
  });

  const hand = document.querySelector('#hand');
  if (hand) {
    const pick = hand.dataset.pick;
    let start = 0;
    if (pick === 'leaf') {
      const card = trip.cards.find(item => item.id === activeCard);
      const leaves = card ? leavesOf(card) : [];
      start = Math.max(0, leaves.findIndex(item => item.id === activeLeaf));
    }
    enableHand(hand, start, id => {
      if (pick === 'topic') {
        activeCard = id;
        activeLeaf = '';
        page = 'picker';
      } else {
        activeLeaf = id;
        page = 'open';
      }
      recipient();
    }, goBack);
  }

  const reader = document.querySelector('#reader');
  if (reader) enableReaderDrop(reader);

  bindVideoPlay();
}

function wrapIndex(value, n) {
  return ((value % n) + n) % n;
}

function goBack() {
  if (page === 'open') page = 'picker';
  else if (page === 'picker') page = 'list';
  else if (page === 'list') page = 'cover';
  else return;
  recipient();
}

function dropFollow(el, dy) {
  const y = Math.max(0, dy);
  el.classList.add('is-dropping');
  el.classList.remove('is-returning');
  el.style.transform = `translateY(${y}px)`;
  el.style.opacity = String(Math.max(0.38, 1 - y / 420));
  return y;
}

function dropRelease(el, y, velocityY) {
  if (y > 80 || velocityY > 0.45) {
    goBack();
    return true;
  }
  el.classList.remove('is-dropping');
  el.classList.add('is-returning');
  el.style.transform = '';
  el.style.opacity = '';
  const done = () => {
    el.classList.remove('is-returning');
    el.removeEventListener('transitionend', done);
  };
  el.addEventListener('transitionend', done);
  return false;
}

function enableHand(hand, start, onPick, onBack) {
  const cards = [...hand.querySelectorAll('.hand-card')];
  const n = cards.length;
  if (!n) return;

  let front = wrapIndex(start, n);
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let dragX = 0;
  let dragY = 0;
  let lastX = 0;
  let lastY = 0;
  let lastAt = 0;
  let velocity = 0;
  let velocityY = 0;
  let moved = false;
  let axis = '';
  let activePointer = null;
  let hitCard = null;
  let wheelLock = false;
  const pxPerCard = 42;
  const tapSlop = 14;
  const maxPeek = Math.min(3, Math.max(0, n - 1));
  const peekX = 34;
  const peekY = 26;
  const stage = hand.closest('.hand-stage');

  const depthOf = card => wrapIndex(cards.indexOf(card) - front, n);

  const layout = (live = false) => {
    hand.classList.toggle('is-live', live);
    cards.forEach((card, i) => {
      const d = wrapIndex(i - front, n);
      const peek = Math.min(d, maxPeek);
      const buried = d > maxPeek;
      const slide = d === 0 ? dragX : 0;
      const x = peek * peekX + slide;
      const y = peek * peekY + slide * 0.12;
      const r = peek * 1.15 + slide * 0.028;
      const s = d === 0 ? 1 : 1 - peek * 0.035;
      card.style.zIndex = d === 0 ? String(n + 8) : String(n - d);
      card.style.opacity = buried ? '0' : '1';
      card.style.pointerEvents = buried ? 'none' : 'auto';
      card.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg) scale(${s})`;
      card.classList.toggle('is-front', d === 0);
      card.classList.toggle('is-peek', d > 0 && !buried);
      const video = card.querySelector('video');
      if (!video) return;
      if (d === 0 && !live) {
        video.muted = true;
        const play = video.play();
        if (play && play.catch) play.catch(() => {});
      } else if (d !== 0 && !video.paused) {
        video.pause();
      }
    });
  };

  const snap = () => {
    dragX = 0;
    front = wrapIndex(front, n);
    layout(false);
  };

  const settle = () => {
    hand.classList.remove('is-dragging');
    hand.classList.remove('is-live');
    void hand.offsetWidth;
    snap();
  };

  const pickFront = () => {
    onPick(cards[wrapIndex(front, n)].dataset.handId);
  };

  const bringCardForward = card => {
    const i = cards.indexOf(card);
    if (i < 0) return false;
    const d = depthOf(card);
    if (d <= 0 || d > maxPeek) return false;
    front = i;
    settle();
    return true;
  };

  hand.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('button, a, input, textarea')) return;
    dragging = true;
    moved = false;
    axis = '';
    dragX = 0;
    dragY = 0;
    hitCard = event.target.closest('.hand-card');
    activePointer = event.pointerId;
    startX = lastX = event.clientX;
    startY = lastY = event.clientY;
    lastAt = performance.now();
    velocity = 0;
    velocityY = 0;
    hand.classList.add('is-dragging');
    try {
      hand.setPointerCapture(event.pointerId);
    } catch {}
    event.preventDefault();
  });

  hand.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== activePointer) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!axis) {
      if (Math.abs(dx) < tapSlop && Math.abs(dy) < tapSlop) return;
      axis = Math.abs(dy) > Math.abs(dx) * 1.25 ? 'y' : 'x';
      moved = true;
    }
    const now = performance.now();
    const dt = Math.max(1, now - lastAt);
    lastAt = now;
    if (axis === 'y') {
      velocityY = (event.clientY - lastY) / dt;
      lastY = event.clientY;
      if (stage && onBack) dragY = dropFollow(stage, dy);
      return;
    }
    velocity = (event.clientX - lastX) / dt;
    lastX = event.clientX;
    if (n < 2) return;
    dragX = dx;
    while (dragX <= -pxPerCard) {
      front += 1;
      startX -= pxPerCard;
      dragX += pxPerCard;
    }
    while (dragX >= pxPerCard) {
      front -= 1;
      startX += pxPerCard;
      dragX -= pxPerCard;
    }
    layout(true);
  });

  const endDrag = event => {
    if (!dragging) return;
    if (event && activePointer != null && event.pointerId !== activePointer) return;
    const tapped = hitCard;
    const wasAxis = axis;
    dragging = false;
    activePointer = null;
    hitCard = null;
    axis = '';
    if (!moved) {
      if (tapped && bringCardForward(tapped)) return;
      hand.classList.remove('is-dragging');
      pickFront();
      return;
    }
    if (wasAxis === 'y') {
      hand.classList.remove('is-dragging');
      if (stage && onBack && dropRelease(stage, dragY, velocityY)) return;
      settle();
      return;
    }
    if (n > 1) {
      if (dragX < -pxPerCard * 0.35 || velocity < -0.35) front += 1;
      else if (dragX > pxPerCard * 0.35 || velocity > 0.35) front -= 1;
    }
    settle();
  };

  hand.addEventListener('pointerup', endDrag);
  hand.addEventListener('pointercancel', endDrag);

  hand.addEventListener('wheel', event => {
    if (n < 2) return;
    event.preventDefault();
    if (wheelLock) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 4) return;
    wheelLock = true;
    front += delta > 0 ? 1 : -1;
    snap();
    setTimeout(() => {
      wheelLock = false;
    }, 90);
  }, { passive: false });

  const onKey = event => {
    if (!hand.isConnected) {
      document.removeEventListener('keydown', onKey);
      return;
    }
    if (event.target.closest('input, textarea')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      front += 1;
      snap();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      front -= 1;
      snap();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pickFront();
    }
  };
  if (deckKeyHandler) document.removeEventListener('keydown', deckKeyHandler);
  deckKeyHandler = onKey;
  document.addEventListener('keydown', onKey);
  layout(false);
}

function enableReaderDrop(reader) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let lastAt = 0;
  let velocityY = 0;
  let dragY = 0;
  let axis = '';
  let activePointer = null;
  const tapSlop = 14;

  const endDrag = event => {
    if (!dragging) return;
    if (event && activePointer != null && event.pointerId !== activePointer) return;
    const wasAxis = axis;
    dragging = false;
    activePointer = null;
    axis = '';
    if (wasAxis === 'y') dropRelease(reader, dragY, velocityY);
  };

  reader.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('video, button, a, input, textarea')) return;
    const copy = event.target.closest('.tinder-copy');
    const photo = event.target.closest('.tinder-photo');
    if (copy && copy.scrollTop > 8) return;
    if (!photo && reader.scrollTop > 8) return;
    dragging = true;
    axis = '';
    dragY = 0;
    activePointer = event.pointerId;
    startX = event.clientX;
    startY = lastY = event.clientY;
    lastAt = performance.now();
    velocityY = 0;
    if (photo) {
      try {
        reader.setPointerCapture(event.pointerId);
      } catch {}
      event.preventDefault();
    }
  });

  reader.addEventListener('pointermove', event => {
    if (!dragging || event.pointerId !== activePointer) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    const now = performance.now();
    const dt = Math.max(1, now - lastAt);
    if (!axis) {
      if (Math.abs(dx) < tapSlop && Math.abs(dy) < tapSlop) return;
      axis = Math.abs(dy) > Math.abs(dx) * 1.05 ? 'y' : 'x';
      if (axis === 'x' || dy < 0) {
        dragging = false;
        activePointer = null;
        axis = '';
        return;
      }
      try {
        reader.setPointerCapture(event.pointerId);
      } catch {}
      event.preventDefault();
    }
    lastAt = now;
    if (axis !== 'y') return;
    velocityY = (event.clientY - lastY) / dt;
    lastY = event.clientY;
    dragY = dropFollow(reader, dy);
  });

  reader.addEventListener('pointerup', endDrag);
  reader.addEventListener('pointercancel', endDrag);
}

function bindVideoPlay() {
  document.querySelectorAll('.video-play').forEach(button => {
    const video = button.parentElement.querySelector('video');
    if (!video) return;
    const sync = () => {
      const playing = !video.paused;
      button.classList.toggle('is-playing', playing);
      button.setAttribute('aria-label', playing ? '停止' : '再生');
      button.textContent = playing ? '❚❚' : '▶';
    };
    button.onclick = event => {
      event.stopPropagation();
      if (video.paused) {
        document.querySelectorAll('.tinder-card video').forEach(other => {
          if (other !== video) other.pause();
        });
        video.muted = false;
        const play = video.play();
        if (play && play.catch) {
          play.catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
        }
      } else {
        video.pause();
      }
    };
    button.addEventListener('pointerdown', event => event.stopPropagation());
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('ended', () => {
      video.currentTime = 0;
      sync();
    });
    sync();
  });
}

function field(label, value, path, area = false) {
  return `<div class="field"><label>${label}</label>${area ? `<textarea data-path="${path}">${esc(value)}</textarea>` : `<input data-path="${path}" value="${esc(value)}">`}</div>`;
}

function mediaFields(card, path) {
  return `<label class="upload"><span>写真または動画（空なら文章カード）</span><input type="file" accept="image/*,video/*" data-upload="${path}"></label><small data-status="${path}">${card.media ? `選択済み：${esc(card.mediaName || '表示中')}` : '未選択'}</small>${card.media ? `${isVideo(card) ? `<video class="media-preview" src="${card.media}" controls></video>` : `<img class="media-preview" src="${card.media}" alt="">`}<button class="remove" data-remove-media="${path}">メディアを外す</button>` : ''}`;
}

function innerEditor(card, parentIndex, cardIndex) {
  return `<section class="card-edit"><h3>CARD ${String(cardIndex + 1).padStart(2, '0')}</h3>${field('タイトル', card.title, `c.${parentIndex}.c.${cardIndex}.title`)}${field('文章', card.text, `c.${parentIndex}.c.${cardIndex}.text`, true)}${mediaFields(card, `${parentIndex}.${cardIndex}`)}<button class="remove" data-remove-inner="${parentIndex}.${cardIndex}">このカードを削除</button></section>`;
}

function cardEditor(card, index) {
  const kind = isBundle(card) ? '束' : '一枚';
  const head = `<article class="topic-edit"><div class="topic-name"><span><strong>${esc(card.title || '無題')}</strong><small class="card-kind">${kind}</small></span><button class="remove" data-remove-card="${index}">削除</button></div>${field('タイトル', card.title, `c.${index}.title`)}${field('概要コメント', card.overview, `c.${index}.overview`, true)}`;
  if (isBundle(card)) {
    return `${head}${card.cards.map((child, cardIndex) => innerEditor(child, index, cardIndex)).join('')}<button class="small-add" data-add-inner="${index}">＋ カードを追加</button></article>`;
  }
  return `${head}<div class="letter-edit">${field('文章', card.text, `c.${index}.text`, true)}</div>${mediaFields(card, String(index))}<button class="small-add" data-add-inner="${index}">＋ 中にカードを追加</button></article>`;
}

function creator() {
  history.replaceState({}, '', `${location.pathname}#create`);
  const debugPush = isDebugHost() ? '<button id="push-debug">スマホへ</button>' : '';
  app.innerHTML = `<main class="creator"><header class="creator-header"><div><h1>中国旅のカードをつくる</h1><p>全部カードです。一枚のまま書くか、中にカードを足して束にします。下書きはこのブラウザに保存されます。</p></div><div class="creator-actions"><button id="recipient">受け手画面を見る</button>${debugPush}<button class="publish" id="publish">渡す</button></div></header><div class="creator-main"><section><div class="section"><h2>渡す一枚</h2>${field('タイトル', trip.title, 'title')}${field('タイトルの下の文章', trip.intro, 'intro', true)}</div><div class="section"><h2>カード</h2>${trip.cards.map((card, index) => cardEditor(card, index)).join('')}<button class="add" id="add-card">＋ カードを追加</button></div></section><aside class="preview"><span>PREVIEW</span><div class="frame" id="preview"></div></aside></div></main>`;
  bindCreator();
  preview();
}

function toBundle(card) {
  if (!isBundle(card) && (card.text || card.media)) {
    card.cards = [{
      ...blankLeaf(''),
      title: '',
      text: card.text,
      media: card.media,
      mediaId: card.mediaId,
      mediaName: card.mediaName,
      mediaType: card.mediaType
    }];
    card.text = '';
    card.media = '';
    card.mediaId = '';
    card.mediaName = '';
    card.mediaType = '';
  }
  card.cards ||= [];
  card.cards.push(blankLeaf());
}

function cardAt(path) {
  const parts = String(path).split('.');
  const parent = trip.cards[Number(parts[0])];
  if (parts.length === 1) return parent;
  return parent.cards[Number(parts[1])];
}

function bindCreator() {
  document.querySelectorAll('[data-path]').forEach(input => {
    input.oninput = event => {
      set(event.target.dataset.path, event.target.value);
      save();
      preview();
    };
  });

  document.querySelectorAll('[data-upload]').forEach(input => {
    input.onchange = event => upload(event, input.dataset.upload);
  });

  document.querySelectorAll('[data-remove-card]').forEach(button => {
    button.onclick = () => {
      const card = trip.cards[Number(button.dataset.removeCard)];
      deleteMedia(card.mediaId);
      (card.cards || []).forEach(child => deleteMedia(child.mediaId));
      trip.cards.splice(Number(button.dataset.removeCard), 1);
      save();
      creator();
    };
  });

  document.querySelectorAll('[data-remove-inner]').forEach(button => {
    button.onclick = () => {
      const [parentIndex, cardIndex] = button.dataset.removeInner.split('.').map(Number);
      const parent = trip.cards[parentIndex];
      deleteMedia(parent.cards[cardIndex].mediaId);
      parent.cards.splice(cardIndex, 1);
      save();
      creator();
    };
  });

  document.querySelectorAll('[data-remove-media]').forEach(button => {
    button.onclick = () => {
      const card = cardAt(button.dataset.removeMedia);
      deleteMedia(card.mediaId);
      Object.assign(card, { media: '', mediaId: '', mediaName: '', mediaType: '' });
      save();
      creator();
    };
  });

  document.querySelectorAll('[data-add-inner]').forEach(button => {
    button.onclick = () => {
      toBundle(trip.cards[Number(button.dataset.addInner)]);
      save();
      creator();
    };
  });

  document.querySelector('#add-card').onclick = () => {
    trip.cards.push(blankLeaf());
    save();
    creator();
  };

  document.querySelector('#recipient').onclick = async () => {
    await pushDebugDraft(true);
    location.hash = '';
    page = 'cover';
    recipient();
  };

  document.querySelector('#publish').onclick = async () => {
    const button = document.querySelector('#publish');
    button.disabled = true;
    try {
      await publishTrip();
    } finally {
      button.disabled = false;
    }
  };

  const pushDebug = document.querySelector('#push-debug');
  if (pushDebug) pushDebug.onclick = () => pushDebugDraft();
}

function set(path, value) {
  const parts = path.split('.');
  if (parts[0] === 'title' || parts[0] === 'intro') {
    trip[parts[0]] = value;
    return;
  }
  const card = trip.cards[Number(parts[1])];
  if (parts[2] === 'c') {
    card.cards[Number(parts[3])][parts[4]] = value;
    return;
  }
  card[parts[2]] = value;
}

function walkCards(visit) {
  for (const card of trip.cards) {
    visit(card);
    for (const child of card.cards || []) visit(child);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const mime = (head.match(/data:(.*?);/) || [])[1] || 'application/octet-stream';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function mediaBlob(card) {
  if (card.media && card.media.startsWith('blob:')) {
    try {
      return await (await fetch(card.media)).blob();
    } catch {}
  }
  if (!card.mediaId || !('indexedDB' in window)) return null;
  const db = await mediaStore();
  const transaction = db.transaction('media', 'readonly');
  return requestToPromise(transaction.objectStore('media').get(card.mediaId));
}

async function packDraft() {
  const snapshot = structuredClone(trip);
  const originals = [];
  walkCards(card => originals.push(card));
  const copies = [];
  snapshot.cards.forEach(card => {
    copies.push(card);
    (card.cards || []).forEach(child => copies.push(child));
  });
  for (let i = 0; i < originals.length; i += 1) {
    const blob = await mediaBlob(originals[i]);
    copies[i].media = '';
    if (!blob) continue;
    copies[i].mediaData = await blobToDataUrl(blob);
  }
  return snapshot;
}

async function applyDraft(snapshot, { openCover = false } = {}) {
  if (!snapshot || !Array.isArray(snapshot.cards)) throw new Error('bad draft');
  trip = snapshot;
  normalizeTrip();
  const pending = [];
  walkCards(card => pending.push(card));
  for (const card of pending) {
    if (!card.mediaData) {
      if (card.media && card.media.startsWith('blob:')) card.media = '';
      continue;
    }
    const blob = dataUrlToBlob(card.mediaData);
    card.mediaId = card.mediaId || card.id;
    card.mediaName ||= 'import';
    card.mediaType = blob.type.startsWith('video/') || card.mediaType === 'video' ? 'video' : 'image';
    card.media = URL.createObjectURL(blob);
    delete card.mediaData;
    await putMedia(card.mediaId, blob);
  }
  save();
  if (openCover) {
    page = 'cover';
    location.hash = '';
    recipient();
  }
}

function passView(url, title) {
  history.replaceState({}, '', `${location.pathname}${location.search}#pass`);
  let svg = '';
  try {
    svg = qrSvg(url);
  } catch {
    toast('QRを作れませんでした');
  }
  app.innerHTML = `<main class="pass"><header class="topbar"><button class="nav-back" type="button" id="pass-back">←</button><span class="brand">YOUR ATORIE</span><span></span></header><section class="pass-stage"><div><div class="pass-qr">${svg}</div><h1 class="pass-title">${esc(title || '')}</h1><p class="pass-url">${esc(url)}</p></div></section></main>`;
  document.querySelector('#pass-back').onclick = () => {
    location.hash = 'create';
    creator();
  };
}

async function publishTrip() {
  save();
  const body = JSON.stringify(await packDraft());
  const targets = ['/publish', 'http://127.0.0.1:4180/publish'];
  for (const url of targets) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (!data?.url) continue;
      sessionStorage.setItem('atorie-pass', JSON.stringify({ url: data.url, title: trip.title }));
      if (!data.pushed) {
        toast('箱に置けませんでした');
        return false;
      }
      passView(data.url, trip.title);
      return true;
    } catch {}
  }
  toast('node server.mjs を起動してください');
  return false;
}

async function loadPublished(id) {
  try {
    const res = await fetch(`./trips/${encodeURIComponent(id)}.json`, { cache: 'no-store' });
    if (!res.ok) return false;
    const snapshot = await res.json();
    if (!snapshot || !Array.isArray(snapshot.cards)) return false;
    publishedMode = true;
    trip = snapshot;
    normalizeTrip();
    page = 'cover';
    return true;
  } catch {
    return false;
  }
}

async function pushDebugDraft(silent = false) {
  const body = JSON.stringify(await packDraft());
  const targets = ['/debug-draft', 'http://127.0.0.1:4180/debug-draft'];
  for (const url of targets) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      if (res.ok) {
        if (!silent) toast('スマホを更新してください');
        return true;
      }
    } catch {}
  }
  if (!silent) toast('node server.mjs を起動してください');
  return false;
}

function isPhonePreview() {
  return isLanHost(location.hostname);
}

async function pullDebugDraft() {
  if (!isPhonePreview()) return false;
  try {
    const res = await fetch('./debug-draft.json', { cache: 'no-store' });
    if (!res.ok) return false;
    await applyDraft(await res.json());
    return true;
  } catch {
    return false;
  }
}

async function upload(event, path) {
  const file = event.target.files[0];
  if (!file) return;

  const card = cardAt(path);
  const status = document.querySelector(`[data-status="${path}"]`);
  const mediaType = isVideoFile(file) ? 'video' : 'image';

  if (status) status.textContent = `選択済み：${file.name}`;

  if (card.media && card.media.startsWith('blob:')) {
    URL.revokeObjectURL(card.media);
  }

  card.media = URL.createObjectURL(file);
  card.mediaId = card.mediaId || card.id;
  card.mediaName = file.name;
  card.mediaType = mediaType;
  save();
  creator();

  try {
    await putMedia(card.mediaId, file);
    toast('ファイルを保存しました');
  } catch {
    toast('プレビューは表示しましたが、ブラウザ保存に失敗しました');
  }
}

function preview() {
  const frame = document.querySelector('#preview');
  if (!frame) return;
  frame.innerHTML = `<main class="phone"><header class="topbar"><span class="brand">YOUR ATORIE</span></header><section class="cover">${coverCard(false)}</section></main>`;
}

function toast(message) {
  const element = document.createElement('div');
  element.className = 'toast';
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 2400);
}

function renderCurrent() {
  if (location.hash === '#pass' && !isViewOnly()) {
    try {
      const data = JSON.parse(sessionStorage.getItem('atorie-pass') || 'null');
      if (data?.url) {
        passView(data.url, data.title);
        return;
      }
    } catch {}
    creator();
    return;
  }
  if (location.hash === '#create' && !isViewOnly()) {
    creator();
    return;
  }
  recipient();
}

normalizeTrip();
start();
window.addEventListener('hashchange', renderCurrent);

async function start() {
  const id = publishedId();
  if (id) {
    const ok = await loadPublished(id);
    if (!ok) toast('このカードはまだ届いていません');
    renderCurrent();
    return;
  }
  const pulled = await pullDebugDraft();
  if (!pulled) save();
  renderCurrent();
  hydrateMedia().catch(() => {
    toast('保存済みメディアの読み込みに失敗しました');
  });
}
