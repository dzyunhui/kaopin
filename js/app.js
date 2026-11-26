/* 页面逻辑 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var state = { user: null, role: null, page: 'score' };

  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(t._t); t._t = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function modal(title, bodyHtml, buttons) {
    // 容错：内容为空且未传按钮时，不显示空白弹窗（避免“只有标题和×”的空壳）
    var btns = buttons || [{ text: '关闭', cls: 'btn' }];
    var text = String(bodyHtml === undefined || bodyHtml === null ? '' : bodyHtml).trim();
    if (!text && (!buttons || !buttons.length)) {
      toast('暂无可显示的内容');
      return;
    }
    $('modalTitle').textContent = title || '提示';
    $('modalBody').innerHTML = text || '<p style="color:#6b7280">暂无内容</p>';
    var foot = $('modalFoot'); foot.innerHTML = '';
    btns.forEach(function (b) {
      var el = document.createElement('button');
      el.className = b.cls || 'btn'; el.textContent = b.text;
      el.onclick = function () { if (b.onClick) b.onClick(); else closeModal(); };
      foot.appendChild(el);
    });
    $('modal').hidden = false;
  }
  function closeModal() { $('modal').hidden = true; }

  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ---------- 登录 ---------- */
  function switchMode(m) {
    Array.prototype.forEach.call(document.querySelectorAll('.login-modes .mode'), function (b) {
      b.classList.toggle('active', b.dataset.mode === m);
    });
    $('pwdField').hidden = m !== 'admin';
    $('nameLabel').textContent = m === 'admin' ? '管理员标识' : '你的姓名';
    $('loginName').placeholder = m === 'admin' ? '例如 admin' : '请输入姓名';
  }
  function doLogin() {
    var m = document.querySelector('.login-modes .mode.active').dataset.mode;
    var name = $('loginName').value.trim();
    if (!name) return toast('请填写姓名');
    if (m === 'admin') {
      if (!Store.checkPwd($('loginPwd').value)) return toast('管理密码错误');
      state.role = 'admin'; state.user = name;
    } else {
      state.role = 'rater'; state.user = name;
    }
    $('whoText').textContent = name + (m === 'admin' ? '（管理员）' : '（打分人）');
    Array.prototype.forEach.call(document.querySelectorAll('.tab.admin-only'), function (t) { t.classList.toggle('show', state.role === 'admin'); });
    go(state.page === 'login' ? 'score' : state.page);
    toast('欢迎，' + name);
  }
  function doLogout() {
    state.user = null; state.role = null; state.page = 'login';
    Array.prototype.forEach.call(document.querySelectorAll('.tab.admin-only'), function (t) { t.classList.remove('show'); });
    go('login');
  }

  /* ---------- 路由 ---------- */
  function go(page) {
    if (!state.user) page = 'login';
    if (page === 'admin' && state.role !== 'admin') page = 'score';
    state.page = page;
    Array.prototype.forEach.call(document.querySelectorAll('.page'), function (p) { p.classList.toggle('active', p.id === 'page-' + page); });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) { t.classList.toggle('active', t.dataset.page === page); });
    if (page === 'score') renderScore();
    if (page === 'result') renderResult();
    if (page === 'admin') renderAdmin();
    if (page !== 'login') refreshSubtitle();
  }
  function refreshSubtitle() {
    $('subTitle').textContent = '共 ' + Store.getPersons().length + ' 名考核对象 · ' + Store.getItems().length + ' 项考核内容 · 满分 ' + Store.totalMax() + ' 分';
  }

  /* ---------- 打分页 ---------- */
  function renderScore() {
    var persons = Store.getPersons(), items = Store.getItems();
    var sel = $('personSelect');
    sel.innerHTML = persons.length
      ? persons.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '（' + esc(p.duty || '') + '）</option>'; }).join('')
      : '<option value="">（暂无考核对象，请管理员在后台添加或导入）</option>';
    $('maxTotal').textContent = Store.totalMax();
    $('scoreBody').innerHTML = items.map(function (it) {
      return '<tr>' +
        '<td>' + esc(it.name) + '</td>' +
        '<td><input type="number" class="score-input" data-id="' + it.id + '" data-max="' + it.max + '" min="0" max="' + it.max + '" step="1" placeholder="0-' + it.max + '"></td>' +
        '<td><textarea class="remark-input" data-id="' + it.id + '" maxlength="200" placeholder="选填，200字以内"></textarea><div class="cnt" id="cnt_' + it.id + '">0/200</div></td>' +
        '</tr>';
    }).join('');
    bindScoreEvents();
    checkRated();
    calcTotal();
  }
  function bindScoreEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('.score-input'), function (inp) {
      inp.addEventListener('input', function () {
        var v = inp.value;
        var r = Validate.itemScore(v, Number(inp.dataset.max));
        inp.classList.toggle('invalid', v !== '' && !r.ok);
        calcTotal();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.remark-input'), function (ta) {
      ta.addEventListener('input', function () {
        var c = $('cnt_' + ta.dataset.id);
        c.textContent = ta.value.length + '/200';
        ta.classList.toggle('invalid', ta.value.length > 200);
      });
    });
    $('personSelect').addEventListener('change', checkRated);
  }
  function checkRated() {
    var pid = $('personSelect').value;
    var rec = pid ? Store.getRecord(state.user, pid) : null;
    $('ratedTip').hidden = !rec;
    if (rec) fillScores(rec);
  }
  function fillScores(rec) {
    Array.prototype.forEach.call(document.querySelectorAll('.score-input'), function (inp) {
      var v = (rec.scores || {})[inp.dataset.id];
      inp.value = v === undefined ? '' : v; inp.classList.remove('invalid');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.remark-input'), function (ta) {
      var v = (rec.remarks || {})[ta.dataset.id] || '';
      ta.value = v; $('cnt_' + ta.dataset.id).textContent = v.length + '/200';
    });
    calcTotal();
  }
  function calcTotal() {
    var t = 0, any = false, bad = false;
    Array.prototype.forEach.call(document.querySelectorAll('.score-input'), function (inp) {
      if (inp.value !== '') { any = true; var n = Number(inp.value); if (!isNaN(n)) t += n; }
      if (inp.classList.contains('invalid')) bad = true;
    });
    $('totalScore').textContent = t;
    var over = t > Store.totalMax();
    $('totalWarn').hidden = !over;
    return { total: t, any: any, bad: bad, over: over };
  }
  function submitScore() {
    var pid = $('personSelect').value;
    if (!pid) return toast('请先选择考核对象');
    var st = calcTotal();
    if (st.bad) return toast('存在单项超过 20 分或未填写整数，请检查');
    if (!st.any) return toast('请至少填写一项分值');
    if (st.over) return toast('总分不能超过 ' + Store.totalMax() + ' 分');
    var scores = {}, remarks = {}, badRemark = false;
    Array.prototype.forEach.call(document.querySelectorAll('.score-input'), function (inp) { if (inp.value !== '') scores[inp.dataset.id] = Number(inp.value); });
    Array.prototype.forEach.call(document.querySelectorAll('.remark-input'), function (ta) {
      remarks[ta.dataset.id] = ta.value.slice(0, 200);
      if (ta.value.length > 200) badRemark = true;
    });
    if (badRemark) return toast('备注不能超过 200 字');
    var existed = !!Store.getRecord(state.user, pid);
    Store.saveRecord({ rater: state.user, personId: pid, person: Store.getPerson(pid), scores: scores, remarks: remarks, total: st.total, time: new Date().toLocaleString('zh-CN', { hour12: false }) });
    toast(existed ? '已覆盖更新原有评分' : '提交成功');
    checkRated();
  }
  function resetScore() {
    if ($('ratedTip').hidden) { fillScores({ scores: {}, remarks: {} }); }
    else { checkRated(); }
  }

  /* ---------- 汇总页 ---------- */
  function renderResult() {
    var items = Store.getItems();
    var head = '<th>排名</th><th>姓名</th><th>职务</th><th>参评</th>';
    items.forEach(function (it) { head += '<th>' + esc(it.name) + '</th>'; });
    head += '<th>总分平均</th>';
    $('sumHead').innerHTML = head;

    var rows = Store.summary().slice().sort(function (a, b) {
      var x = a.avgTotal === null ? -1 : a.avgTotal, y = b.avgTotal === null ? -1 : b.avgTotal; return y - x;
    });
    if (!rows.length) { $('sumBody').innerHTML = '<tr><td colspan="' + (items.length + 5) + '" class="hint-empty">暂无考核对象</td></tr>'; }
    else {
      $('sumBody').innerHTML = rows.map(function (r, i) {
        var s = '<td class="num"><span class="rank ' + (i < 3 && r.avgTotal !== null ? 'top' : '') + '">' + (r.avgTotal === null ? '-' : (i + 1)) + '</span></td>' +
          '<td>' + esc(r.person.name) + '</td><td>' + esc(r.person.duty || '') + '</td><td class="num">' + r.count + '</td>';
        items.forEach(function (it) { s += '<td class="num">' + (r.avg[it.id] === null ? '-' : (Math.round(r.avg[it.id] * 100) / 100)) + '</td>'; });
        s += '<td class="num"><b>' + (r.avgTotal === null ? '-' : Math.round(r.avgTotal * 100) / 100) + '</b></td>';
        return s;
      }).join('');
    }

    var dhead = '<th>时间</th><th>打分人</th><th>姓名</th><th>职务</th>';
    items.forEach(function (it) { dhead += '<th>' + esc(it.name) + '</th>'; });
    dhead += '<th>总分</th><th>备注</th>';
    $('detailHead').innerHTML = dhead;
    var recs = Store.getRecords();
    if (!recs.length) { $('detailBody').innerHTML = '<tr><td colspan="' + (items.length + 7) + '" class="hint-empty">暂无打分记录</td></tr>'; }
    else {
      $('detailBody').innerHTML = recs.slice().reverse().map(function (rc) {
        var s = '<td>' + esc(rc.time) + '</td><td>' + esc(rc.rater) + '</td><td>' + esc(rc.person && rc.person.name) + '</td><td>' + esc(rc.person && rc.person.duty) + '</td>';
        items.forEach(function (it) { s += '<td class="num">' + ((rc.scores || {})[it.id] === undefined ? '-' : rc.scores[it.id]) + '</td>'; });
        var rm = Object.keys(rc.remarks || {}).map(function (k) { return rc.remarks[k]; }).filter(Boolean).join(' / ');
        return s + '<td class="num"><b>' + rc.total + '</b></td><td>' + esc(rm.slice(0, 120)) + '</td>';
      }).join('');
    }
  }

  /* ---------- 管理后台 ---------- */
  function renderAdmin() {
    $('personBody').innerHTML = Store.getPersons().length
      ? Store.getPersons().map(function (p) {
          return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.duty || '') + '</td>' +
            '<td><button class="link-btn" data-act="edit" data-id="' + p.id + '">编辑</button>' +
            '<button class="link-btn danger" data-act="del" data-id="' + p.id + '">删除</button></td></tr>';
        }).join('')
      : '<tr><td colspan="3" class="hint-empty">暂无考核对象，可新增或用 Excel 导入</td></tr>';

    $('itemBody').innerHTML = Store.getItems().map(function (it) {
      return '<tr><td>' + esc(it.name) + '</td><td class="num">' + it.max + '</td>' +
        '<td><button class="link-btn" data-act="item-edit" data-id="' + it.id + '">编辑</button>' +
        '<button class="link-btn danger" data-act="item-del" data-id="' + it.id + '">删除</button></td></tr>';
    }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('#personBody .link-btn'), function (b) {
      b.onclick = function () {
        var p = Store.getPerson(b.dataset.id); if (!p) return;
        if (b.dataset.act === 'del') {
          modal('删除考核对象', '<p>确定删除「' + esc(p.name) + '」？相关打分记录也会一并删除。</p>', [
            { text: '取消' }, { text: '确定删除', cls: 'btn danger', onClick: function () { Store.delPerson(p.id); closeModal(); renderAdmin(); refreshSubtitle(); toast('已删除'); } }
          ]);
        } else { personDialog(p); }
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('#itemBody .link-btn'), function (b) {
      b.onclick = function () {
        var it = Store.getItems().filter(function (x) { return x.id === b.dataset.id; })[0]; if (!it) return;
        if (b.dataset.act === 'del') {
          modal('删除考核项', '<p>确定删除「' + esc(it.name) + '」？已提交的评分中该项将不再展示。</p>', [
            { text: '取消' }, { text: '确定删除', cls: 'btn danger', onClick: function () { var l = Store.getItems().filter(function (x) { return x.id !== it.id; }); Store.setItems(l); closeModal(); renderAdmin(); refreshSubtitle(); } }
          ]);
        } else { itemDialog(it); }
      };
    });
  }
  function personDialog(p) {
    var isNew = !p;
    p = p || { name: '', duty: '' };
    modal(isNew ? '新增考核对象' : '编辑考核对象',
      '<div class="field"><label>姓名（必填，≤20字）</label><input id="fName" maxlength="20" value="' + esc(p.name) + '"></div>' +
      '<div class="field"><label>职务（必填，≤30字）</label><input id="fDuty" maxlength="30" value="' + esc(p.duty) + '"></div>',
      [{ text: '取消' }, {
        text: '保存', cls: 'btn primary', onClick: function () {
          var n = $('fName').value.trim(), d = $('fDuty').value.trim();
          var v1 = Validate.personName(n), v2 = Validate.personDuty(d);
          if (!v1.ok) return toast(v1.msg);
          if (!v2.ok) return toast(v2.msg);
          if (isNew && Store.findByName(n)) return toast('该姓名已存在');
          if (isNew) Store.addPerson(n, d); else Store.updatePerson(p.id, n, d);
          closeModal(); renderAdmin(); refreshSubtitle(); toast('已保存');
        }
      }]);
  }
  function itemDialog(it) {
    modal('编辑考核项',
      '<div class="field"><label>考核内容名称</label><input id="iName" maxlength="20" value="' + esc(it.name) + '"></div>' +
      '<div class="field"><label>满分（建议 20）</label><input id="iMax" type="number" min="1" max="100" step="1" value="' + it.max + '"></div>',
      [{ text: '取消' }, {
        text: '保存', cls: 'btn primary', onClick: function () {
          var n = $('iName').value.trim(), m = Number($('iMax').value);
          if (!n) return toast('名称不能为空');
          if (!(m > 0) || Math.floor(m) !== m) return toast('满分须为正整数');
          var list = Store.getItems().map(function (x) { return x.id === it.id ? { id: x.id, name: n, max: m } : x; });
          Store.setItems(list); closeModal(); renderAdmin(); refreshSubtitle(); toast('已保存');
        }
      }]);
  }

  /* ---------- 导入 ---------- */
  var importFile = null;
  function doImport(file) {
    importFile = file;
    Excel.readFile(file).then(function (rows) {
      var exists = Store.getPersons().map(function (p) { return p.name; });
      var r = Excel.parsePersons(rows, exists);
      var html = '<p>共解析 <b>' + r.total + '</b> 条：可导入 <span class="prev-ok">' + r.valid.length + '</span> 条，' +
        '重复跳过 ' + r.dupExists.length + ' 条，不合法 <span class="prev-err">' + (r.total - r.valid.length - r.dupExists.length) + '</span> 条。</p>';
      if (r.valid.length) {
        html += '<div class="prev-list">' + r.valid.slice(0, 6).map(function (v) { return '<div>第' + v.row + '行：' + esc(v.name) + ' ｜ ' + esc(v.duty || '(空)') + '</div>'; }).join('') + '</div>';
        if (r.valid.length > 6) html += '<p class="tip">仅预览前 6 条，其余 ' + (r.valid.length - 6) + ' 条将在确认后一并导入。</p>';
      }
      if (r.errors.length) {
        html += '<div class="prev-list">' + r.errors.slice(0, 6).map(function (e) { return '<div class="prev-err">第' + e.row + '行：' + esc(e.msg) + (e.value ? '（' + esc(e.value) + '）' : '') + '</div>'; }).join('') + '</div>';
      }
      var btns = [{ text: '取消' }];
      if (r.valid.length) btns.push({ text: '确认导入 ' + r.valid.length + ' 人', cls: 'btn primary', onClick: function () { confirmImport(r.valid); } });
      else btns.push({ text: '知道了', cls: 'btn primary' });
      modal('导入预览', html, btns);
    }).catch(function (e) { toast('解析失败：' + (e && e.message ? e.message : '请确认是有效的 xlsx/xls/csv 文件')); });
  }
  function confirmImport(list) {
    list.forEach(function (v) { Store.addPerson(v.name, v.duty); });
    closeModal(); renderAdmin(); refreshSubtitle();
    toast('成功导入 ' + list.length + ' 人');
    importFile = null;
  }

  /* ---------- 事件绑定 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(document.querySelectorAll('.tabs .tab'), function (t) {
      t.addEventListener('click', function () { go(t.dataset.page); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.login-modes .mode'), function (b) {
      b.addEventListener('click', function () { switchMode(b.dataset.mode); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.subtabs .subtab'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.subtabs .subtab'), function (x) { x.classList.toggle('active', x === b); });
        Array.prototype.forEach.call(document.querySelectorAll('.subpage'), function (p) { p.classList.toggle('active', p.id === 'sub-' + b.dataset.sub); });
      });
    });
    $('btnLogin').onclick = doLogin;
    $('btnLogout').onclick = doLogout;
    $('btnSubmit').onclick = submitScore;
    $('btnReset').onclick = resetScore;
    $('btnRefresh').onclick = function () { renderResult(); toast('已刷新'); };
    $('btnExport').onclick = function () {
      var items = Store.getItems(), rows = Store.summary(), recs = Store.getRecords().map(function (r) { return Object.assign({}, r, { person: Store.getPerson(r.personId) }); });
      if (!recs.length) return toast('暂无打分记录，无法导出');
      Excel.exportResult(items, rows, recs); toast('已导出 Excel');
    };
    $('btnAddPerson').onclick = function () { personDialog(null); };
    $('btnClearPersons').onclick = function () {
      modal('清空人员', '<p>将删除全部考核对象及打分记录，确定继续？</p>', [{ text: '取消' }, { text: '确定清空', cls: 'btn danger', onClick: function () { Store.clearPersons(); closeModal(); renderAdmin(); refreshSubtitle(); toast('已清空'); } }]);
    };
    $('btnAddItem').onclick = function () { itemDialog({ id: '', name: '', max: 20 }); };
    $('btnResetItems').onclick = function () { Store.resetItems(); renderAdmin(); refreshSubtitle(); toast('已恢复默认五项'); };
    $('btnSavePwd').onclick = function () {
      var p = $('newPwd').value;
      if (p.length < 6) return toast('密码至少 6 位');
      Store.setPwd(p); $('newPwd').value = ''; toast('管理密码已更新');
    };
    $('btnTpl').onclick = function () { Excel.buildTemplate(); toast('模板已下载'); };
    $('btnImport').onclick = function () { $('fileInput').value = ''; $('fileInput').click(); };
    $('fileInput').onchange = function (e) { var f = e.target.files && e.target.files[0]; if (f) doImport(f); };
    $('modalClose').onclick = closeModal;
    $('modal').addEventListener('click', function (e) { if (e.target.id === 'modal') closeModal(); });

    // 云端状态指示：不配置 SDK 也安全，仅在登录页显示当前数据来源
    (function showCloudState() {
      var tip = $('cloudTip');
      if (!tip) return;
      var render = function (text, color) {
        tip.textContent = text;
        tip.style.color = color || '';
      };
      try {
        if (global.Store && Store.initCloud) {
          Store.initCloud().then(function (m) {
            if (m === 'cloud') render('● 云端共享：数据多人实时同步', '#16a34a');
            else if (m === 'cloud-offline') render('● 离线：云端暂时不可用，显示本机缓存，恢复网络后自动重连', '#d97706');
            else render('● 单机模式：数据仅存本机浏览器（未配置云端）', '#6b7280');
          }, function () {
            render('● 云端连接异常，已退回单机模式，详见控制台(F12)', '#dc2626');
          });
        } else {
          render('● 单机模式：数据仅存本机浏览器', '#6b7280');
        }
      } catch (e) {
        render('● 状态检测失败，按单机模式运行', '#6b7280');
      }
    })();

    go('login');
  });
})();
