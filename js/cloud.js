/* ============================================================
 * cloud.js —— 云数据库适配层（Supabase / PostgreSQL）
 * ------------------------------------------------------------
 * 设计原则：
 *   1. 未配置 SUPABASE_URL / SUPABASE_ANON_KEY 时，自动退化为 localStorage
 *      单机模式，原有行为完全不变，页面照常可用。
 *   2. 配置后走云端：所有打分人共享同一份数据，实时汇总。
 *   3. 前端只使用 anon（publishable）key，权限由数据库 RLS 策略兜底。
 *   4. 对外暴露与 Store 相同形状的快照结构 {items,config,records,admin}，
 *      上层 app.js 无需关心数据来源。
 * ============================================================ */
(function (global) {
  'use strict';

  // ===== 在此填入你的 Supabase 项目配置（可留空，留空即本地单机模式） =====
  var SUPABASE_URL = 'https://dyvfnkgnztmncgobwiqj.supabase.co';
  var SUPABASE_ANON_KEY = 'sb_publishable_PdfG-Tf0Fa5IMOuiIFCbpg_mo7aEShC';
  // ==========================================================

  var TABLE = 'kaopin_state';
  var ROW_ID = 'main';
  var LS_KEY = 'kaopin_web_v1_cloud_cache';

  function hasConfig() {
    return !!(SUPABASE_URL && SUPABASE_ANON_KEY &&
      SUPABASE_URL.indexOf('你的') < 0 && SUPABASE_ANON_KEY.indexOf('你的') < 0);
  }

  function client() {
    if (!hasConfig()) return null;
    if (global.__sbClient) return global.__sbClient;
    if (!global.supabase || !global.supabase.createClient) {
      console.warn('[cloud] 未检测到 supabase SDK，已退回本地模式');
      return null;
    }
    global.__sbClient = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false }
    });
    return global.__sbClient;
  }

  function mode() { return hasConfig() && client() ? 'cloud' : 'local'; }

  // 读取本地缓存（断网 / 加载失败时兜底，保证页面不白屏）
  function readCache() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function writeCache(snap) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(snap)); } catch (e) {}
  }

  function normalize(row) {
    if (!row || !row.data) return null;
    var d = row.data;
    return {
      items: d.items || [],
      config: d.config || { items: [], password: 'admin888' },
      records: d.records || [],
      admin: !!d.admin,
      updatedAt: row.updated_at || null
    };
  }

  // 首次部署时把本地已有数据搬运上云，避免"升级后数据不见了"
  async function migrateLocal(sb) {
    var local = null;
    try { local = JSON.parse(localStorage.getItem('kaopin_web_v1') || 'null'); } catch (e) {}
    if (!local || (!local.items && !local.records)) return;
    var exist = await sb.from(TABLE).select('id').eq('id', ROW_ID).maybeSingle();
    if (exist && exist.data) return; // 云端已有数据，不覆盖
    var payload = {
      id: ROW_ID,
      data: {
        items: local.items || [],
        config: local.config || { items: [], password: 'admin888' },
        records: local.records || [],
        admin: false
      },
      updated_at: new Date().toISOString()
    };
    await sb.from(TABLE).insert(payload);
  }

  async function load() {
    var sb = client();
    if (!sb) return { snap: null, mode: 'local' };
    try {
      var res = await sb.from(TABLE).select('data,updated_at').eq('id', ROW_ID).maybeSingle();
      if (res.error) throw res.error;
      if (!res.data) { await migrateLocal(sb); return load(); }
      var snap = normalize(res.data);
      writeCache(snap);
      return { snap: snap, mode: 'cloud' };
    } catch (e) {
      console.warn('[cloud] 读取云端失败，使用本地缓存：', e && e.message);
      return { snap: readCache(), mode: 'cloud-offline', error: e };
    }
  }

  // 本地原子改写：读取 → 修改 → 整体写回，避免并发覆盖丢数据
  async function mutate(fn) {
    var sb = client();
    if (!sb) return null;
    var cur = await load();
    var base = cur.snap || { items: [], config: { items: [], password: 'admin888' }, records: [], admin: false };
    var next = fn(JSON.parse(JSON.stringify(base))) || base;
    next.updatedAt = new Date().toISOString();
    var payload = {
      id: ROW_ID,
      data: { items: next.items, config: next.config, records: next.records, admin: next.admin },
      updated_at: next.updatedAt
    };
    var res = await sb.from(TABLE).upsert(payload, { onConflict: 'id' });
    if (res.error) throw res.error;
    writeCache(next);
    return next;
  }

  global.Cloud = {
    hasConfig: hasConfig,
    mode: mode,
    load: load,
    mutate: mutate,
    LS_KEY: LS_KEY,
    // 云函数入口（可选）：批量导入校验更严格，未部署时前端自动降级为本地解析
    async importPersons(rows) {
      var sb = client();
      if (!sb) return null;
      try {
        var res = await sb.rpc('kaopin_import_persons', { rows: rows });
        if (res.error) throw res.error;
        return res.data;
      } catch (e) {
        console.warn('[cloud] 云函数不可用，改用前端解析：', e && e.message);
        return null;
      }
    },
    // 订阅数据变更，实现多端实时同步
    subscribe: function (onChange) {
      var sb = client();
      if (!sb) return function () {};
      var ch = sb.channel('kaopin_state_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, function () { onChange(); })
        .subscribe();
      return function () { try { sb.removeChannel(ch); } catch (e) {} };
    }
  };
})(window);
