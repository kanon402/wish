/* вишлист — списки на двоих.
   без настроек firebase всё хранится в localStorage этого браузера,
   с настройками — синхронизируется между устройствами через firestore. */
(function () {
  'use strict';

  var PEOPLE = {
    nikita: { name: 'никита', key: 'wishlist.v1.nikita' },
    nika:   { name: 'ника',   key: 'wishlist.v1.nika' }
  };

  var PHOTO_SIZE = 512;      // сторона квадрата, в пикселях
  var PHOTO_QUALITY = 0.78;
  var FIREBASE_VERSION = '12.18.0';

  var current = 'nikita';
  var state = { nikita: [], nika: [] };   // текущие списки в памяти
  var cloud = null;                       // подключение к firestore либо null
  var editingId = null;                   // id виша, который сейчас редактируем
  var pendingPhoto = null;                // фото в открытом попапе (data url) либо null
  var deletingId = null;
  var lastFocused = null;

  var $ = function (id) { return document.getElementById(id); };

  var grid = $('grid'), counter = $('counter');
  var wishOverlay = $('wish-overlay'), confirmOverlay = $('confirm-overlay');
  var form = $('wish-form'), titleInput = $('title'), linkInput = $('link');
  var photoInput = $('photo'), preview = $('preview'), dropHint = $('drop-hint');
  var drop = $('drop'), removePhotoBtn = $('remove-photo'), errorBox = $('error');
  var sheetTitle = $('wish-title'), toast = $('toast');

  /* ---------- локальное хранилище ---------- */

  function readLocal(person) {
    try {
      var raw = localStorage.getItem(PEOPLE[person].key);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocal(person, list) {
    try {
      localStorage.setItem(PEOPLE[person].key, JSON.stringify(list));
      return true;
    } catch (e) {
      showToast('не хватило места в памяти браузера — попробуй фото полегче');
      return false;
    }
  }

  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function byNewest(a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  }

  function setList(person, list) {
    state[person] = list.slice().sort(byNewest);
    writeLocal(person, state[person]);
    if (person === current) render();
  }

  /* ---------- синхронизация через firestore ---------- */

  function cloudSettings() {
    var c = window.firebaseConfig;
    return (c && c.apiKey && c.projectId) ? c : null;
  }

  function connectCloud() {
    var settings = cloudSettings();
    if (!settings) return Promise.resolve(null);

    var base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/';

    return Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-firestore.js')
    ]).then(function (parts) {
      var app = parts[0].initializeApp(settings);
      var fs = parts[1];
      var db = fs.getFirestore(app);

      function wishDoc(person, id) { return fs.doc(db, 'lists', person, 'wishes', id); }

      return {
        put: function (person, wish) { return fs.setDoc(wishDoc(person, wish.id), wish); },
        drop: function (person, id) { return fs.deleteDoc(wishDoc(person, id)); },
        watch: function (person, onList, onFail) {
          var wishes = fs.query(
            fs.collection(db, 'lists', person, 'wishes'),
            fs.orderBy('createdAt', 'desc')
          );
          return fs.onSnapshot(wishes, function (snap) {
            onList(snap.docs.map(function (d) { return d.data(); }));
          }, onFail);
        }
      };
    }).catch(function () {
      return null;   // нет сети или неверные настройки — остаёмся на локальном хранилище
    });
  }

  // виши, пришедшие из облака, помечаем cloud: true — это только локальная пометка.
  // всё, что такой пометки не имеет, ещё не доехало до firestore и живёт до подтверждения.
  function forCloud(wish) {
    var copy = {};
    Object.keys(wish).forEach(function (k) { if (k !== 'cloud') copy[k] = wish[k]; });
    return copy;
  }

  var firstSnapshot = { nikita: true, nika: true };

  function applySnapshot(person, list) {
    var known = {};
    list.forEach(function (w) { known[w.id] = true; w.cloud = true; });

    // то, что создано без сети или до подключения облака
    var unsynced = state[person].filter(function (w) { return !w.cloud && !known[w.id]; });

    if (firstSnapshot[person]) {
      firstSnapshot[person] = false;
      unsynced.forEach(function (w) { cloud.put(person, forCloud(w)).catch(function () {}); });
    }

    setList(person, list.concat(unsynced));
  }

  function startSync() {
    Object.keys(PEOPLE).forEach(function (person) {
      cloud.watch(person, function (list) {
        applySnapshot(person, list);
      }, function () {
        showToast('не получилось связаться с облаком — виши остались на этом устройстве');
      });
    });
  }

  /* ---------- операции над вишами ---------- */

  function saveWish(person, wish) {
    var list = state[person].filter(function (w) { return w.id !== wish.id; });
    list.push(wish);
    setList(person, list);
    if (cloud) {
      cloud.put(person, forCloud(wish)).catch(function () {
        showToast('виш сохранён на этом устройстве, но не улетел в облако');
      });
    }
  }

  function deleteWish(person, id) {
    setList(person, state[person].filter(function (w) { return w.id !== id; }));
    if (cloud) {
      cloud.drop(person, id).catch(function () {
        showToast('виш удалён здесь, но в облаке остался');
      });
    }
  }

  function findWish(person, id) {
    return state[person].filter(function (w) { return w.id === id; })[0] || null;
  }

  /* ---------- отрисовка ---------- */

  function plural(n) {
    var ten = n % 100;
    if (ten > 4 && ten < 21) return 'вишей';
    var one = n % 10;
    if (one === 1) return 'виш';
    if (one > 1 && one < 5) return 'виша';
    return 'вишей';
  }

  function render() {
    var list = state[current];

    grid.innerHTML = '';
    counter.textContent = list.length
      ? 'в списке ' + list.length + ' ' + plural(list.length)
      : 'вишей пока нет';

    list.forEach(function (wish) {
      grid.appendChild(cardFor(wish));
    });
  }

  function cardFor(wish) {
    var li = document.createElement('li');
    li.className = 'card';

    if (wish.photo) {
      var img = document.createElement('img');
      img.className = 'card-photo';
      img.src = wish.photo;
      img.alt = wish.title;
      img.loading = 'lazy';
      li.appendChild(img);
    } else {
      var stub = document.createElement('div');
      stub.className = 'card-photo is-empty';
      stub.textContent = '🎁';
      li.appendChild(stub);
    }

    var body = document.createElement('div');
    body.className = 'card-body';

    var h3 = document.createElement('h3');
    h3.className = 'card-title';
    h3.textContent = wish.title;
    body.appendChild(h3);

    if (wish.link) {
      var a = document.createElement('a');
      a.className = 'card-link';
      a.href = wish.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'перейти в магазин ↗';
      body.appendChild(a);
    }

    var actions = document.createElement('div');
    actions.className = 'card-actions';

    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'icon-btn';
    editBtn.textContent = '✏️ изменить';
    editBtn.setAttribute('aria-label', 'изменить виш «' + wish.title + '»');
    editBtn.addEventListener('click', function () { openWish(wish.id); });

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'icon-btn is-danger';
    delBtn.textContent = '🗑 удалить';
    delBtn.setAttribute('aria-label', 'удалить виш «' + wish.title + '»');
    delBtn.addEventListener('click', function () { askDelete(wish.id); });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    body.appendChild(actions);
    li.appendChild(body);
    return li;
  }

  /* ---------- вкладки ---------- */

  function switchTo(person) {
    if (!PEOPLE[person] || person === current) return;
    current = person;
    document.documentElement.setAttribute('data-theme', person);

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', person === 'nikita' ? '#12281c' : '#fff3f7');

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      var on = tab.dataset.person === person;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('panel').setAttribute('aria-labelledby', 'tab-' + person);

    try { localStorage.setItem('wishlist.v1.tab', person); } catch (e) {}
    render();
  }

  /* ---------- попап виша ---------- */

  function openOverlay(node) {
    lastFocused = document.activeElement;
    node.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeOverlay(node) {
    node.hidden = true;
    document.body.style.overflow = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function openWish(id) {
    editingId = id || null;
    errorBox.hidden = true;

    var wish = id ? findWish(current, id) : null;

    sheetTitle.textContent = wish ? 'редактировать виш' : 'новый виш';
    titleInput.value = wish ? wish.title : '';
    linkInput.value = wish && wish.link ? wish.link : '';
    setPhoto(wish ? wish.photo : null);

    openOverlay(wishOverlay);
    setTimeout(function () { titleInput.focus(); }, 60);
  }

  function setPhoto(dataUrl) {
    pendingPhoto = dataUrl || null;
    if (pendingPhoto) {
      preview.src = pendingPhoto;
      preview.hidden = false;
      dropHint.hidden = true;
      removePhotoBtn.hidden = false;
    } else {
      preview.removeAttribute('src');
      preview.hidden = true;
      dropHint.hidden = false;
      removePhotoBtn.hidden = true;
      photoInput.value = '';
    }
  }

  /* ---------- фото: обрезаем в один квадратный формат ---------- */

  function processImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) {
        reject(new Error('это не картинка'));
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('не получилось прочитать файл')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('не получилось открыть картинку')); };
        img.onload = function () {
          var side = Math.min(img.naturalWidth, img.naturalHeight);
          var sx = (img.naturalWidth - side) / 2;
          var sy = (img.naturalHeight - side) / 2;

          var canvas = document.createElement('canvas');
          canvas.width = PHOTO_SIZE;
          canvas.height = PHOTO_SIZE;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
          ctx.drawImage(img, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

          resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function handleFile(file) {
    errorBox.hidden = true;
    processImage(file).then(setPhoto).catch(function (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    });
  }

  /* ---------- сохранение ---------- */

  function normalizeLink(value) {
    var v = (value || '').trim();
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try {
      var u = new URL(v);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.href;
    } catch (e) {
      return null;
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var title = titleInput.value.trim();

    if (!title) {
      errorBox.textContent = 'придумай название для виша';
      errorBox.hidden = false;
      titleInput.focus();
      return;
    }

    var link = normalizeLink(linkInput.value);
    if (link === null) {
      errorBox.textContent = 'ссылка выглядит странно — проверь её';
      errorBox.hidden = false;
      linkInput.focus();
      return;
    }

    var old = editingId ? findWish(current, editingId) : null;
    saveWish(current, {
      id: old ? old.id : makeId(),
      title: title,
      link: link,
      photo: pendingPhoto,
      createdAt: old ? (old.createdAt || Date.now()) : Date.now()
    });

    closeOverlay(wishOverlay);
    showToast(editingId ? 'виш обновлён ✨' : 'виш добавлен ✨');
    editingId = null;
  });

  /* ---------- удаление ---------- */

  function askDelete(id) {
    deletingId = id;
    var wish = findWish(current, id);
    $('confirm-text').textContent = wish ? '«' + wish.title + '» нельзя будет вернуть' : 'его нельзя будет вернуть';
    openOverlay(confirmOverlay);
    setTimeout(function () { $('confirm-no').focus(); }, 60);
  }

  $('confirm-yes').addEventListener('click', function () {
    deleteWish(current, deletingId);
    deletingId = null;
    closeOverlay(confirmOverlay);
    showToast('виш удалён');
  });

  /* ---------- тост ---------- */

  var toastTimer = null;
  function showToast(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2600);
  }

  /* ---------- события ---------- */

  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
    tab.addEventListener('click', function () { switchTo(tab.dataset.person); });
  });

  $('add-btn').addEventListener('click', function () { openWish(null); });
  $('cancel-btn').addEventListener('click', function () { closeOverlay(wishOverlay); editingId = null; });
  $('confirm-no').addEventListener('click', function () { closeOverlay(confirmOverlay); deletingId = null; });
  removePhotoBtn.addEventListener('click', function () { setPhoto(null); });

  photoInput.addEventListener('change', function () {
    if (photoInput.files && photoInput.files[0]) handleFile(photoInput.files[0]);
  });

  ['dragenter', 'dragover'].forEach(function (type) {
    drop.addEventListener(type, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    drop.addEventListener(type, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
  });
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  [wishOverlay, confirmOverlay].forEach(function (node) {
    node.addEventListener('click', function (e) {
      if (e.target === node) { closeOverlay(node); editingId = null; deletingId = null; }
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!confirmOverlay.hidden) { closeOverlay(confirmOverlay); deletingId = null; }
    else if (!wishOverlay.hidden) { closeOverlay(wishOverlay); editingId = null; }
  });

  /* ---------- зверята, которые изредка ползают по кнопкам ---------- */

  var CRITTERS = ['🐸', '🐌', '🐱', '🧚', '🐼'];

  function visibleButtons() {
    return Array.prototype.filter.call(
      document.querySelectorAll('.btn, .tab, .icon-btn'),
      function (el) {
        var r = el.getBoundingClientRect();
        return r.width > 40 && r.height > 0 &&
               r.top > -20 && r.bottom < window.innerHeight + 20;
      }
    );
  }

  function sendCritter() {
    var buttons = visibleButtons();
    if (!buttons.length) return;

    var target = buttons[Math.floor(Math.random() * buttons.length)];
    var rect = target.getBoundingClientRect();
    var toRight = Math.random() < 0.5;
    var distance = rect.width + 24;

    var span = document.createElement('span');
    span.className = 'critter';
    span.setAttribute('aria-hidden', 'true');

    var inner = document.createElement('i');
    inner.textContent = CRITTERS[Math.floor(Math.random() * CRITTERS.length)];
    span.appendChild(inner);

    span.style.top = (rect.bottom + window.scrollY - 14) + 'px';
    span.style.left = ((toRight ? rect.left - 12 : rect.right + 2) + window.scrollX) + 'px';
    span.style.setProperty('--dx', (toRight ? distance : -distance) + 'px');
    span.style.setProperty('--flip', toRight ? '1' : '-1');
    span.style.setProperty('--dur', (4 + Math.random() * 2.5).toFixed(1) + 's');

    document.body.appendChild(span);
    span.addEventListener('animationend', function (e) {
      if (e.animationName === 'critter-walk') span.remove();
    });
    setTimeout(function () { if (span.parentNode) span.remove(); }, 9000);
  }

  function scheduleCritter(first) {
    var delay = first ? 15000 + Math.random() * 10000 : 45000 + Math.random() * 30000;
    setTimeout(function () {
      if (!document.hidden) sendCritter();
      scheduleCritter(false);
    }, delay);
  }

  // ручной вызов зверька — удобно для проверки
  window.wishlistCritter = sendCritter;

  /* ---------- старт ---------- */

  Object.keys(PEOPLE).forEach(function (person) {
    state[person] = readLocal(person).sort(byNewest);
  });

  var savedTab;
  try { savedTab = localStorage.getItem('wishlist.v1.tab'); } catch (e) {}
  if (savedTab && PEOPLE[savedTab] && savedTab !== current) {
    switchTo(savedTab);
  } else {
    render();
  }

  connectCloud().then(function (api) {
    if (!api) return;
    cloud = api;
    startSync();
  });

  if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    scheduleCritter(true);
  }
})();
