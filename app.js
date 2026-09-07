/* вишлист — маленькое приложение на двоих, всё хранится в localStorage */
(function () {
  'use strict';

  var PEOPLE = {
    nikita: { name: 'никита', key: 'wishlist.v1.nikita' },
    nika:   { name: 'ника',   key: 'wishlist.v1.nika' }
  };

  var PHOTO_SIZE = 640;      // сторона квадрата, в пикселях
  var PHOTO_QUALITY = 0.82;

  var current = 'nikita';
  var editingId = null;      // id виша, который сейчас редактируем
  var pendingPhoto = null;   // фото в открытом попапе (data url) либо null
  var deletingId = null;
  var lastFocused = null;

  var $ = function (id) { return document.getElementById(id); };

  var grid = $('grid'), empty = $('empty'), counter = $('counter');
  var wishOverlay = $('wish-overlay'), confirmOverlay = $('confirm-overlay');
  var form = $('wish-form'), titleInput = $('title'), linkInput = $('link');
  var photoInput = $('photo'), preview = $('preview'), dropHint = $('drop-hint');
  var drop = $('drop'), removePhotoBtn = $('remove-photo'), errorBox = $('error');
  var sheetTitle = $('wish-title'), toast = $('toast');

  /* ---------- хранилище ---------- */

  function load(person) {
    try {
      var raw = localStorage.getItem(PEOPLE[person].key);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function save(person, list) {
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
    var list = load(current);

    grid.innerHTML = '';
    empty.hidden = list.length > 0;
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

    var wish = null;
    if (id) {
      wish = load(current).filter(function (w) { return w.id === id; })[0] || null;
    }

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

    var list = load(current);

    if (editingId) {
      list = list.map(function (w) {
        return w.id === editingId ? { id: w.id, title: title, link: link, photo: pendingPhoto, createdAt: w.createdAt } : w;
      });
    } else {
      list.unshift({ id: makeId(), title: title, link: link, photo: pendingPhoto, createdAt: Date.now() });
    }

    if (!save(current, list)) return;

    closeOverlay(wishOverlay);
    render();
    showToast(editingId ? 'виш обновлён ✨' : 'виш добавлен ✨');
    editingId = null;
  });

  /* ---------- удаление ---------- */

  function askDelete(id) {
    deletingId = id;
    var wish = load(current).filter(function (w) { return w.id === id; })[0];
    $('confirm-text').textContent = wish ? '«' + wish.title + '» нельзя будет вернуть' : 'его нельзя будет вернуть';
    openOverlay(confirmOverlay);
    setTimeout(function () { $('confirm-no').focus(); }, 60);
  }

  $('confirm-yes').addEventListener('click', function () {
    var list = load(current).filter(function (w) { return w.id !== deletingId; });
    save(current, list);
    deletingId = null;
    closeOverlay(confirmOverlay);
    render();
    showToast('виш удалён');
  });

  /* ---------- тост ---------- */

  var toastTimer = null;
  function showToast(text) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2200);
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

  var savedTab;
  try { savedTab = localStorage.getItem('wishlist.v1.tab'); } catch (e) {}
  if (savedTab && PEOPLE[savedTab] && savedTab !== current) {
    switchTo(savedTab);
  } else {
    render();
  }

  if (!window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    scheduleCritter(true);
  }
})();
