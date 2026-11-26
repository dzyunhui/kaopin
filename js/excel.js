/* Excel 导入 / 导出 / 模板（依赖 SheetJS） */
(function (global) {
  var HEADER_ROWS = 12;
  var MAX_ROWS = 500;

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function (e) {
        try {
          var wb = global.XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellFormula: false, cellStyles: false });
          var sh = wb.Sheets[wb.SheetNames[0]];
          resolve(global.XLSX.utils.sheet_to_json(sh, { header: 1, raw: false, defval: '' }));
        } catch (err) { reject(err); }
      };
      fr.onerror = function () { reject(new Error('文件读取失败')); };
      fr.readAsArrayBuffer(file);
    });
  }

  function findHeader(rows) {
    var limit = Math.min(rows.length, HEADER_ROWS);
    for (var i = 0; i < limit; i++) {
      var cells = (rows[i] || []).map(function (c) { return String(c || '').replace(/\s/g, ''); });
      var joined = cells.join('');
      if (joined.indexOf('姓名') >= 0 || joined.indexOf('职务') >= 0) {
        var ni = -1, di = -1;
        cells.forEach(function (c, idx) {
          if (ni < 0 && (c === '姓名' || c.indexOf('姓名') >= 0)) ni = idx;
          else if (di < 0 && (c === '职务' || c.indexOf('职务') >= 0)) di = idx;
        });
        if (ni < 0) ni = 0;
        return { index: i, nameCol: ni, dutyCol: di };
      }
    }
    return null;
  }

  // 解析 + 校验，不写库
  function parsePersons(rows, existsNames) {
    var res = { total: 0, valid: [], dupInFile: [], dupExists: [], errors: [] };
    if (!rows || !rows.length) { res.errors.push({ row: 0, type: 'file', msg: '表格内容为空' }); return res; }
    var head = findHeader(rows);
    var start = head ? head.index + 1 : 0;
    var nc = head ? head.nameCol : 0;
    var dc = head ? head.dutyCol : 1;
    var seen = {};
    var body = rows.slice(start).filter(function (r) {
      return (r || []).some(function (c) { return String(c || '').trim() !== ''; });
    });
    if (body.length > MAX_ROWS) res.errors.push({ row: 0, type: 'limit', msg: '超过单次上限 ' + MAX_ROWS + ' 行，仅处理前 ' + MAX_ROWS + ' 行' });
    body = body.slice(0, MAX_ROWS);
    res.total = body.length;

    body.forEach(function (r, i) {
      var rowNo = start + i + 1;
      var name = String((r || [])[nc] === undefined ? '' : (r || [])[nc]).trim();
      var duty = dc >= 0 ? String((r || [])[dc] === undefined ? '' : (r || [])[dc]).trim() : '';
      var errs = global.Validate.personRow({ name: name, duty: duty }, rowNo);
      if (errs.length) { res.errors = res.errors.concat(errs); return; }
      var key = name;
      if (seen[key]) { res.dupInFile.push({ row: rowNo, name: name }); res.errors.push({ row: rowNo, type: 'dup', msg: '表格内姓名重复' }); return; }
      seen[key] = 1;
      if (existsNames.indexOf(name) >= 0) { res.dupExists.push({ row: rowNo, name: name }); return; }
      res.valid.push({ name: name, duty: duty, row: rowNo });
    });
    return res;
  }

  function buildTemplate() {
    var data = [['姓名', '职务'], ['张三', '部门经理'], ['李四', '主管'], ['王五', '科员']];
    var ws = global.XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 14 }, { wch: 18 }];
    var wb = global.XLSX.utils.book_new();
    global.XLSX.utils.book_append_sheet(wb, ws, '导入模板');
    global.XLSX.writeFile(wb, '考核对象导入模板.xlsx');
  }

  function exportResult(items, summary, records) {
    var head = ['排名', '姓名', '职务', '参评人数'];
    items.forEach(function (it) { head.push(it.name + '(' + it.max + ')'); });
    head.push('总分平均(' + items.reduce(function (s, i) { return s + i.max; }, 0) + ')');

    var rows = [head];
    var sorted = summary.slice().sort(function (a, b) {
      var x = a.avgTotal === null ? -1 : a.avgTotal, y = b.avgTotal === null ? -1 : b.avgTotal;
      return y - x;
    });
    sorted.forEach(function (r, i) {
      var line = [(r.avgTotal === null ? '-' : (i + 1)), r.person.name, r.person.duty || '', r.count];
      items.forEach(function (it) { line.push(r.avg[it.id] === null ? '-' : Math.round(r.avg[it.id] * 100) / 100); });
      line.push(r.avgTotal === null ? '-' : Math.round(r.avgTotal * 100) / 100);
      rows.push(line);
    });

    var dhead = ['打分时间', '打分人', '姓名', '职务'];
    items.forEach(function (it) { dhead.push(it.name); });
    dhead.push('总分', '备注');
    var drows = [dhead];
    records.slice().reverse().forEach(function (rc) {
      var line = [rc.time || '', rc.rater || '', (rc.person && rc.person.name) || '', (rc.person && rc.person.duty) || ''];
      items.forEach(function (it) { line.push((rc.scores || {})[it.id] === undefined ? '' : rc.scores[it.id]); });
      line.push(rc.total, (rc.remarks || '').replace(/\s+/g, ' ').slice(0, 200));
      drows.push(line);
    });

    var wb = global.XLSX.utils.book_new();
    var ws1 = global.XLSX.utils.aoa_to_sheet(rows);
    ws1['!cols'] = rows[0].map(function (h, i) { return { wch: i === 1 ? 12 : (i === 2 ? 16 : 11) }; });
    global.XLSX.utils.book_append_sheet(wb, ws1, '得分汇总');
    var ws2 = global.XLSX.utils.aoa_to_sheet(drows);
    ws2['!cols'] = dhead.map(function (h, i) { return { wch: i === dhead.length - 1 ? 40 : (i === 0 ? 18 : 11) }; });
    global.XLSX.utils.book_append_sheet(wb, ws2, '打分明细');
    global.XLSX.writeFile(wb, '年度考核测评结果.xlsx');
  }

  global.Excel = { readFile: readFile, parsePersons: parsePersons, buildTemplate: buildTemplate, exportResult: exportResult };
})(window);
