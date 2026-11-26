/* 校验规则：与小程序版 util.js 保持一致 */
(function (global) {
  var NAME_RE = /^[\u4e00-\u9fa5a-zA-Z0-9·.\-\s]+$/;

  function err(msg) { return { ok: false, msg: msg }; }
  function ok() { return { ok: true }; }

  var Validate = {
    // 单项分值：必填、0~max(20)、整数
    itemScore: function (val, max) {
      if (val === '' || val === null || val === undefined) return err('请填写分值');
      var n = Number(val);
      if (isNaN(n) || Math.floor(n) !== n) return err('分值须为整数');
      if (n < 0) return err('分值不能为负');
      if (n > (max || 20)) return err('单项不能超过 ' + (max || 20) + ' 分');
      return ok();
    },
    totalScore: function (total, maxTotal) {
      if (Number(total) > (maxTotal || 100)) return err('总分不能超过 ' + (maxTotal || 100) + ' 分');
      return ok();
    },
    remark: function (text) {
      var s = String(text || '');
      if (s.length > 200) return err('备注不能超过 200 字');
      return ok();
    },
    personName: function (name) {
      var s = String(name || '').trim();
      if (!s) return err('姓名不能为空');
      if (s.length > 20) return err('姓名不能超过 20 字');
      if (!NAME_RE.test(s)) return err('姓名含非法字符');
      return ok();
    },
    personDuty: function (duty) {
      var s = String(duty || '').trim();
      if (!s) return err('职务不能为空');
      if (s.length > 30) return err('职务不能超过 30 字');
      return ok();
    },
    // 行级校验，返回错误数组
    personRow: function (row, idx) {
      var errs = [];
      var n = this.personName(row.name);
      if (!n.ok) errs.push({ row: idx, type: 'name', msg: n.msg, value: row.name });
      var d = this.personDuty(row.duty);
      if (!d.ok) errs.push({ row: idx, type: 'duty', msg: d.msg, value: row.duty });
      return errs;
    }
  };
  global.Validate = Validate;
})(window);
