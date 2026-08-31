/* babel 的 _typeof 助手（与原生类型运算符语义逐项一致）。
 *
 * 警告：本文件内严禁出现该类型运算符的任何代码形态！增强编译会把
 * 全项目所有该类表达式改写为对本模块的调用，若本文件自身含之，改写后在
 * 模块工厂尚未执行完时循环自引用，真机上全线报 "_typeof3 is not a function"
 * （加热预设/打卡读取/云数据加载/计划提醒/表情引擎全部在首次调用处崩）。
 * 故用 Object.prototype.toString 实现，并保持全文件无该关键字（可用 grep 校验），
 * 让编译器无任何可改写目标。 */
function _typeof(o) {
  var t = Object.prototype.toString.call(o).slice(8, -1);
  if (t === "String" || t === "Number" || t === "Boolean") {
    /* 基本类型返回自身；包装对象（new String 等）按原生语义返回 object */
    return o === Object(o) ? "object" : t.toLowerCase();
  }
  if (t === "Undefined" || t === "Symbol" || t === "BigInt") {
    return t.toLowerCase();
  }
  if (t === "Null") {
    return "object";
  }
  /* Function/AsyncFunction/GeneratorFunction/AsyncGeneratorFunction 一律 function */
  if (t.slice(-8) === "Function") {
    return "function";
  }
  return "object";
}
module.exports = _typeof;
