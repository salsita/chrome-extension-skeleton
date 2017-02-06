// module that translates structured information about command invocation from
// form.js into real command invocation
//
// exported function `go` takes two parameters: messaging object `msg` on which
// it'll invoke the methods, and structured `info` which is collected from the
// form. we assume both `msg` and `info` parameters to be valid

import message from './msg';

let log = console.log.bind(console); // eslint-disable-line no-console
function callback(res) { log(`<<<<< callback invoked, return value = ${JSON.stringify(res)}`); }

const runner = {};

runner.go = (msg, info) => {
  if ('bg' === info.type) { // msg.bg
    if ('echo' === info.cmd) {
      log(`>>>>> invoking msg.bg('echo', '${info.arg}', callback)`);
      msg.bg('echo', info.arg, callback);
    } else if ('random' === info.cmd) {
      log(">>>>> invoking msg.bg('random', callback)");
      msg.bg('random', callback);
    } else {
      log(">>>>> invoking msg.bg('randomAsync', callback) ... 15 sec delay");
      msg.bg('randomAsync', callback);
    }
  } else if ('echo' === info.cmd) { // msg.bcast + msg.cmd
    if (-1 === info.tab) { // all tab ids
      if (info.ctx_all) {
        log(`>>>>> invoking msg.${info.type}('echo', '${info.arg}', callback)`);
        msg[info.type]('echo', info.arg, callback);
      } else {
        log(`>>>>> invoking msg.${info.type}(${JSON.stringify(info.ctxs)}, 'echo', '${info.arg}', callback)`);
        msg[info.type](info.ctxs, 'echo', info.arg, callback);
      }
    } else if (-2 === info.tab) { // same id
      if (info.ctx_all) {
        log(`>>>>> invoking msg.${info.type}(SAME_TAB, 'echo', '${info.arg}', callback)`);
        msg[info.type](message.SAME_TAB, 'echo', info.arg, callback);
      } else {
        log(`>>>>> invoking msg.${info.type}(SAME_TAB, ${JSON.stringify(info.ctxs)}, 'echo', '${info.arg}', callback)`);
        msg[info.type](message.SAME_TAB, info.ctxs, 'echo', info.arg, callback);
      }
    } else if (info.ctx_all) {  // tab id provided
      log(`>>>>> invoking msg.${info.type}(${info.tab}, 'echo', '${info.arg}', callback)`);
      msg[info.type](info.tab, 'echo', info.arg, callback);
    } else {
      log(`>>>>> invoking msg.${info.type}(${info.tab}, ${JSON.stringify(info.ctxs)}, 'echo', '${info.arg}', callback)`);
      msg[info.type](info.tab, info.ctxs, 'echo', info.arg, callback);
    }
  } else if (-1 === info.tab) { // all tab ids // random + randomAsync
    if (info.ctx_all) {
      log(`>>>>> invoking msg.${info.type}('${info.cmd}', callback)`);
      msg[info.type](info.cmd, callback);
    } else {
      log(`>>>>> invoking msg.${info.type}(${JSON.stringify(info.ctxs)}, '${info.cmd}', callback)`);
      msg[info.type](info.ctxs, info.cmd, callback);
    }
  } else if (-2 === info.tab) { // same id
    if (info.ctx_all) {
      log(`>>>>> invoking msg.${info.type}(SAME_TAB, '${info.cmd}', callback)`);
      msg[info.type](message.SAME_TAB, info.cmd, callback);
    } else {
      log(`>>>>> invoking msg.${info.type}(SAME_TAB, ${JSON.stringify(info.ctxs)}, '${info.cmd}', callback)`);
      msg[info.type](message.SAME_TAB, info.ctxs, info.cmd, callback);
    }
  } else if (info.ctx_all) { // tab id provided
    log(`>>>>> invoking msg.${info.type}(${info.tab}, '${info.cmd}', callback)`);
    msg[info.type](info.tab, info.cmd, callback);
  } else {
    log(`>>>>> invoking msg.${info.type}(${info.tab}, ${JSON.stringify(info.ctxs)}, '${info.cmd}', callback)`);
    msg[info.type](info.tab, info.ctxs, info.cmd, callback);
  }
};

// for surpressing console.log output in unit tests:
runner.__resetLog = () => { log = () => {}; };

export default runner;
