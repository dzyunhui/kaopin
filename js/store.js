/* 数据层：localStorage 持久化 + 云数据库（Supabase）双模式
 * 结构：{ adminPwd, items[], persons[], records[] }
 * 未配置云数据库时行为与单机版完全一致；配置后所有写操作同步上云，并订阅实时变更。 */
(function (global) {
  var moduleRoot = (function () {
    var p = location.pathname || '/';
    return p.replace(/[^/]*$/, '') || '/';
  })();
  var KEY = 'kaopin_web_v1' + '::' + moduleRoot;
  var DEFAULT_ITEMS = [
    { id: 'i1', name: '政治品德', max: 20 },
    { id: 'i2', name: '工作能力', max: 20 },
    { id: 'i3', name: '工作态度', max: 20 },
    { id: 'i4', name: '业绩贡献', max: 20 },
    { id: 'i5', name: '廉洁从业', max: 20 }
  ];

  function blank() {
    return { adminPwd: 'admin888', items: DEFAULT_ITEMS.slice(), persons: [], records: [] };
  }
  function normalize(d) {
    if (!d || typeof d !== 'object') return blank();
    if (!Array.isArray(d.items) || !d.items.length) d.items = DEFAULT_ITEMS.slice();
    if (!Array.isArray(d.persons)) d.persons = [];
    if (!Array.isArray(d.records)) d.records = [];
    if (!d.adminPwd) d.adminPwd = 'admin888';
    return d;
  }
  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (!raw) return blank();
      return normalize(JSON.parse(raw));
    } catch (e) { return blank(); }
  }
  var db = load();
  function save() {
    try { global.localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
  }
  function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- 云端同步 ---------- */
  var cloudMode = 'local';
  var listeners = [];
  var applyingRemote = false;

  function toCloudData() {
    return { items: db.items, config: { items: db.items, password: db.adminPwd }, persons: db.persons, records: db.records, admin: false };
  }
  function applyRemote(snap) {
    if (!snap) return;
    db = normalize({
      adminPwd: (snap.config && snap.config.password) || db.adminPwd,
      items: (snap.config && snap.config.items && snap.config.items.length) ? snap.config.items : (snap.items && snap.items.length ? snap.items : db.items),
      persons: snap.items || snap.persons || [],
      records: snap.records || []
    });
    save();
  }
  // 云端写回：失败不阻塞本地使用
  function push() {
    if (cloudMode !== 'cloud' || applyingRemote) return;
    var Cloud = global.Cloud;
    if (!Cloud || !Cloud.mutate) return;
    Cloud.mutate(function () { return toCloudData(); }).catch(function (e) {
      console.warn('[store] 云端同步失败：', e && e.message);
    });
  }
  function saveBoth() { save(); push(); }

  async function initCloud() {
    var Cloud = global.Cloud;
    if (!Cloud || !Cloud.hasConfig || !Cloud.hasConfig()) { cloudMode = 'local'; return 'local'; }
    var r = await Cloud.load();
    cloudMode = r.mode;
    if (r.snap && (r.mode === 'cloud' || r.mode === 'cloud-offline')) {
      applyRemote(r.snap);
    } else if (r.mode === 'cloud') {
      // 云端为空：把本地已有数据搬运上云
      push();
    }
    if (Cloud.subscribe) {
      Cloud.subscribe(function () {
        Cloud.load().then(function (x) {
          if (!x.snap) return;
          applyingRemote = true;
          applyRemote(x.snap);
          applyingRemote = false;
          listeners.forEach(function (fn) { try { fn(); } catch (e) {} });
        });
      });
    }
    return cloudMode;
  }
  function onChange(fn) { listeners.push(fn); }

  var Store = {
    getItems: function () { return db.items.slice(); },
    setItems: function (list) {
      db.items = list.map(function (x) { return { id: x.id || uid('i'), name: String(x.name || '').trim(), max: Number(x.max) > 0 ? Number(x.max) : 20 }; });
      saveBoth();
    },
    resetItems: function () { db.items = DEFAULT_ITEMS.slice(); saveBoth(); },
    totalMax: function () { return db.items.reduce(function (s, x) { return s + (Number(x.max) || 0); }, 0); },

    getPersons: function () { return db.persons.slice(); },
    getPerson: function (id) { for (var i = 0; i < db.persons.length; i++) { if (db.persons[i].id === id) return db.persons[i]; } return null; },
    addPerson: function (name, duty) {
      var p = { id: uid('p'), name: String(name || '').trim(), duty: String(duty || '').trim() };
      db.persons.push(p); saveBoth(); return p;
    },
    updatePerson: function (id, name, duty) {
      var p = this.getPerson(id);
      if (p) { p.name = String(name || '').trim(); p.duty = String(duty || '').trim(); saveBoth(); }
    },
    delPerson: function (id) {
      db.persons = db.persons.filter(function (p) { return p.id !== id; });
      db.records = db.records.filter(function (r) { return r.personId !== id; });
      saveBoth();
    },
    clearPersons: function () { db.persons = []; db.records = []; saveBoth(); },
    findByName: function (name) {
      var n = String(name || '').trim();
      for (var i = 0; i < db.persons.length; i++) { if (db.persons[i].name === n) return db.persons[i]; }
      return null;
    },

    getRecords: function () { return db.records.slice(); },
    getRecord: function (rater, personId) {
      for (var i = 0; i < db.records.length; i++) {
        if (db.records[i].rater === rater && db.records[i].personId === personId) return db.records[i];
      }
      return null;
    },
    saveRecord: function (rec) {
      var exist = this.getRecord(rec.rater, rec.personId);
      if (exist) {
        exist.scores = rec.scores; exist.remarks = rec.remarks; exist.total = rec.total; exist.time = rec.time;
      } else {
        rec.id = uid('r'); db.records.push(rec);
      }
      saveBoth();
    },
    delRecord: function (id) { db.records = db.records.filter(function (r) { return r.id !== id; }); saveBoth(); },

    checkPwd: function (p) { return String(p || '') === db.adminPwd; },
    setPwd: function (p) { db.adminPwd = String(p || ''); saveBoth(); },

    summary: function () {
      var self = this;
      return db.persons.map(function (p) {
        var rs = db.records.filter(function (r) { return r.personId === p.id; });
        var acc = {}, totals = [];
        self.getItems().forEach(function (it) { acc[it.id] = 0; });
        rs.forEach(function (r) {
          totals.push(Number(r.total) || 0);
          self.getItems().forEach(function (it) { acc[it.id] += Number((r.scores || {})[it.id]) || 0; });
        });
        var avgTotal = totals.length ? totals.reduce(function (a, b) { return a + b; }, 0) / totals.length : null;
        var row = { person: p, count: rs.length, avgTotal: avgTotal, avg: {} };
        self.getItems().forEach(function (it) { row.avg[it.id] = rs.length ? acc[it.id] / rs.length : null; });
        return row;
      });
    },
    resetAll: function () { db = blank(); saveBoth(); },

    /* 云端相关对外接口 */
    initCloud: initCloud,
    onChange: onChange,
    mode: function () { return cloudMode; },
    DEFAULT_ITEMS: DEFAULT_ITEMS
  };
  global.Store = Store;
})(window);
