import assert from 'assert';

// mocked chrome.runtime
import ChromeRuntime from './chrome.runtime.mock';

// mocked chrome.devtools
import { devtools } from './chrome.devtools.mock';
import bgMain from './msg';  // for background, we can load the main module

const runtime1 = new ChromeRuntime();
const runtime2 = new ChromeRuntime();

// tested messaging module for background context and other contexts
const ctxMain = []; // these will stay for inspecting internals, while
let bg;
const ctx = [];         // these will become messaging objects later on
let bg1; // messaging object for cross-extension messaging
// number of non-background contexts used in the test
const CTX_COUNT = 20;
// background handlers, for testing custom onConnect and onDisconnect callbacks
let bgHandlers;
let bgExtHandlers;

// load isolated module copies, so that we can simulate
// multiple parallel contexts

// install unit test inspecting methods
bgMain.__allowUnitTests(); // eslint-disable-line no-underscore-dangle
const bgExt = bgMain.__createClone(); // eslint-disable-line no-underscore-dangle

// non-bg copies:
for (let i = 0; i < CTX_COUNT; i += 1) {
  ctxMain.push(bgMain.__createClone().__setRuntime(runtime1));
}

// stores history of handler invocations (in all contexts)
let handlerLog = [];
// function dumpLog() { console.log(JSON.stringify(handlerLog, null, 4)); }
// helper to add items to log
function addLog(context, idx, cmd, args, retVal) {
  handlerLog.push({ context, idx, cmd, args, retVal });
}
// factory for generating context handlers
function createHandlers(context, idx) {
  // shared handlers:
  const res = {
    // SYNCHRONOUS
    // log passed arguments to handlerLog
    log: (...args) => {
      const done = args[args.length - 1]; // last arg is always callback
      addLog(context, idx, 'log', args.slice(0, args.length - 1));
      done();
    },
    // ASYNCHRONOUS
    // generates random number 0..max-1
    random(max, done) {
      const rand = Math.floor(Math.random() * max);
      addLog(context, idx, 'random', [max], rand);
      setImmediate(() => {
        done(rand);
      });
    },
    // BLOCKING FOREVER
    // invalid handler (doesn't invoke done()), used for testing tab-closing
    block: () => {
      addLog(context, idx, 'block', []);
    }
  };
  const ctxTypeCmd = `${context}_cmd`;
  const ctxInstCmd = `${context}_${idx}_cmd`;
  // CONTEXT-TYPE-ONLY handler, echoes passed argument
  res[ctxTypeCmd] = (what, done) => {
    addLog(context, idx, ctxTypeCmd, [what], what);
    done(what);
  };
  // CONTEXT-INSTANCE-ONLY handler, returns 'hello world'
  res[ctxInstCmd] = (done) => {
    addLog(context, idx, ctxInstCmd, [], 'hello world');
    done('hello world');
  };
  // FOR 'bg' CONTEXT, prepare (but do not install under correct name) custom
  // onConnect and onDisconnect handlers
  if (context === 'bg') {
    res._onConnect = (ctxName, tabId) => {
      addLog(context, idx, 'onConnect', [ctxName, tabId]);
    };
    res._onDisconnect = (ctxName, tabId) => {
      addLog(context, idx, 'onDisconnect', [ctxName, tabId]);
    };
    res._onExtensionConnect = (extensionId) => {
      addLog(context, idx, 'onExtensionConnect', [extensionId]);
    };
    res._onExtensionDisconnect = (extensionId) => {
      addLog(context, idx, 'onExtensionDisconnect', [extensionId]);
    };
  }
  //
  return res;
}

// non-background contexts definitions:          // generated tabId:
const ctxDefs = [
  { name: 'ct', idx: 1 }, // gener. tabId:  1
  { name: 'dt', idx: 1 }, // gener. tabId:  1
  { name: 'ct', idx: 2 }, // gener. tabId:  2
  { name: 'dt', idx: 2 }, // gener. tabId:  2
  { name: 'popup', idx: 9 }, // gener. tabId:  3
  { name: 'options', idx: 9 }, // gener. tabId:  3
  { name: 'ct', idx: 3 }, // gener. tabId:  4
  { name: 'dt', idx: 3 }, // gener. tabId:  4
  { name: 'ct', idx: 4 }, // gener. tabId:  5
  { name: 'dt', idx: 4 }, // gener. tabId:  5
  { name: 'ct', idx: 5 }, // gener. tabId:  6
  { name: 'dt', idx: 5 }, // gener. tabId:  6
  { name: 'popup', idx: 10 }, // gener. tabId:  7
  { name: 'options', idx: 10 }, // gener. tabId:  7
  { name: 'ct', idx: 6 }, // gener. tabId:  8
  { name: 'dt', idx: 6 }, // gener. tabId:  8
  { name: 'ct', idx: 7 }, // gener. tabId:  9
  { name: 'dt', idx: 7 }, // gener. tabId:  9
  { name: 'ct', idx: 8 }, // gener. tabId: 10
  { name: 'dt', idx: 8 }, // gener. tabId: 10
];

//
// MAIN
//
describe('messaging module', () => {
  beforeEach(() => { handlerLog = []; });

  it('should export init() function', () => {
    assert.strictEqual(bgMain && typeof bgMain.init, 'function');
  });

  it('should init() and return msg object with cmd(), bcast() and bg()', (done) => {
    let i;
    runtime1.__resetTabId();
    runtime2.__resetTabId();
    bgMain.__setRuntime(runtime1);
    bgExt.__setRuntime(runtime2);
    let pm = bgMain.__getPortMap();
    assert.deepEqual({}, pm);
    pm = bgExt.__getPortMap();
    assert.deepEqual({}, pm);
    // background
    bg = bgMain.init('bg', bgHandlers = createHandlers('bg', 1));
    assert(typeof bg === 'object');
    assert(typeof bg.cmd === 'function');
    assert(typeof bg.bcast === 'function');
    assert(typeof bg.connectExt === 'function');
    assert(typeof bg.cmdExt === 'function');
    assert(typeof bg.bg === 'undefined');
    // background for cross-extension messaging
    bg1 = bgExt.init('bg', bgExtHandlers = createHandlers('bg', 2));
    assert(typeof bg1 === 'object');
    assert(typeof bg1.cmd === 'function');
    assert(typeof bg1.bcast === 'function');
    assert(typeof bg1.connectExt === 'function');
    assert(typeof bg1.cmdExt === 'function');
    assert(typeof bg1.bg === 'undefined');

    // first 6 context only!
    for (i = 0; i < 6; i += 1) {
      const def = ctxDefs[i];
      if (def.name === 'dt') {
        devtools.__setTabId((i + 1) / 2);
        ctxMain[i].__setDevTools(devtools);
      }
      ctx.push(ctxMain[i].init(def.name, createHandlers(def.name, def.idx)));
    }
    // testing the first one only, the remaining ones should be the same
    assert(typeof ctx[0] === 'object');
    assert(typeof ctx[0].cmd === 'function');
    assert(typeof ctx[0].bcast === 'function');
    assert(typeof ctx[0].bg === 'function');
    // make sure we don't invoke onConnect background handler (it is not installed yet)
    let counter = 3;
    setImmediate(function _f() {
      assert(handlerLog.length === 0);  // no onConnect invoked
      if (counter -= 1) { // eslint-disable-line no-cond-assign
        setTimeout(_f, 0); // let dt's update their ids
      } else {
        done();
      }
    });
  });

  it('should set ids correctly', () => {
    assert(bgMain.__getId() === 'bg');
    assert(ctxMain[0].__getId() === 'ct-1');
  });

  it('should invoke onConnect background handler for newly connected ports, ' +
     'devTools should be updating their tabIds correctly', (done) => {
    // install onConnect / onDisconnect handlers
    bgHandlers.onConnect = bgHandlers._onConnect;
    bgHandlers.onDisconnect = bgHandlers._onDisconnect;
    for (let i = 6; i < CTX_COUNT; i += 1) {
      const def = ctxDefs[i];
      if (def.name === 'dt') {
        devtools.__setTabId((i + 1) / 2);
        ctxMain[i].__setDevTools(devtools);
      }
      ctx.push(ctxMain[i].init(def.name, createHandlers(def.name, def.idx)));
    }
    // custom onConnect handlers invocations
    setImmediate(function _f() {
      // (20 - 6) connect()s + (2 * 6) disconnect/connect updates for 'dt's
      if (handlerLog.length !== 26) { setImmediate(_f); return; }
      let log;
      const stat = { ct: [], dt: [], popup: [], options: [] };
      for (let i = 0; i < 14; i += 1) {
        log = handlerLog[i];
        assert(log.context === 'bg');
        assert(log.cmd === 'onConnect');
        log = log.args;
        stat[log[0]].push(log[1]);
      }
      for (let i = 14; i < 26; i += 1) {
        log = handlerLog[i];
        assert(log.context === 'bg');
        // tab id updates for 'dt'
        assert(((i % 2) ? 'onConnect' : 'onDisconnect') === log.cmd);
        log = log.args;
        stat[log[0]].push(log[1]);
      }
      let arr = [4, 5, 6, 8, 9, 10];  // tab ids for ct contexts
      assert(arr.length === stat.ct.length);
      for (let i = 0; i < arr.length; i += 1) { assert(stat.ct[i] === arr[i]); }
      arr = [Infinity, Infinity, Infinity, Infinity, Infinity, Infinity, Infinity,
        4, Infinity, 5, Infinity, 6, Infinity, 8, Infinity, 9, Infinity, 10];
      assert(arr.length === stat.dt.length);
      arr.sort((a, b) => a - b);
      stat.dt.sort((a, b) => a - b);
      for (let i = 0; i < arr.length; i += 1) { assert(stat.dt[i] === arr[i]); }
      assert(stat.popup.length === 1);
      assert(stat.popup[0] === 7);
      assert(stat.options.length === 1);
      assert(stat.options[0] === 7);
      done();
    });
  });

  it('should set portMap in bg context correctly', () => {
    const pm = bgMain.__getPortMap();
    assert(Object.keys(pm).length === 4);  // ct, dt, popup, options
    assert(pm.ct);
    assert(Object.keys(pm.ct).length === 8);       // 8 x 'ct' context
    assert(pm.dt);
    assert(Object.keys(pm.dt).length === 8);       // 8 x 'dt' context
    assert(pm.popup);
    assert(Object.keys(pm.popup).length === 2);    // 2 x 'popup' context
    assert(pm.options);
    assert(Object.keys(pm.options).length === 2);  // 2 x 'options' context
  });

  it('should not set portMap in non-bg context', () => {
    assert.deepEqual({}, ctxMain[0].__getPortMap());
  });

  it('should set local callback tables (msg handlers)', () => {
    let handlers = bgMain.__getHandlers();
    assert(typeof handlers === 'object');
    // log, random, invalid, bg_cmd, bg_1_cmd, _onConnect, _onDisconnect,
    // _onExtensionConnect, _onExtensionDisconnect, onConnect, onDisconnect
    assert(Object.keys(handlers).length === 11);
    handlers = ctxMain[0].__getHandlers();
    assert(typeof handlers === 'object');
    assert(Object.keys(handlers).length === 5); // log, random, invalid, ct_cmd, ct_1_cmd
  });

  it('should return false when invalid arguments are passed to cmd(), bcast() and bg()', () => {
    // cmd
    assert(ctx[0].cmd() === false);
    assert(ctx[0].cmd(1) === false);
    assert(ctx[0].cmd(['bg']) === false);
    assert(ctx[0].cmd(1, ['ct']) === false);
    assert(ctx[0].cmd(['ct'], 1) === false);
    assert(ctx[0].cmd(['ct'], ['dt'], 'log') === false);
    assert(ctx[0].cmd(1, 2, 'log') === false);
    // bcast
    assert(ctx[0].bcast() === false);
    assert(ctx[0].bcast(1) === false);
    assert(ctx[0].bcast(['bg']) === false);
    assert(ctx[0].bcast(1, ['ct']) === false);
    assert(ctx[0].bcast(['ct'], 1) === false);
    assert(ctx[0].bcast(['ct'], ['dt'], 'log') === false);
    assert(ctx[0].bcast(1, 2, 'log') === false);
    // bg
    assert(ctx[0].bg() === false);
    assert(ctx[0].bg(1) === false);
    assert(ctx[0].bg(['bg']) === false);
    assert(ctx[0].bg(1, ['ct']) === false);
    assert(ctx[0].bg(['ct'], 1) === false);
    assert(ctx[0].bg(['ct'], ['dt'], 'log') === false);
    assert(ctx[0].bg(1, 2, 'log') === false);
    assert(ctx[0].bg(['bg'], 'log') === false);
    assert(ctx[0].bg(1, 'log') === false);
  });

  it('should pass 0 args from ctx to bg', (done) => {
    const res = ctx[0].bg('log');
    assert(res === true);
    setImmediate(function _f() {
      if (handlerLog.length !== 1) { setImmediate(_f); return; }
      const log = handlerLog[0];
      assert(log.context === 'bg');
      assert(log.cmd === 'log');
      assert(handlerLog[0].args.length === 0);
      done();
    });
  });

  it('should pass multiple args from ctx to bg', (done) => {
    const res = ctx[0].bg('log', true, 0.1, 'str', ['a', 'b'], { o: 1, p: 2 }, null, undefined, 1);
    assert(res === true);
    setImmediate(function _f() {
      if (handlerLog.length !== 1) { setImmediate(_f); return; }
      const log = handlerLog[0];
      assert(log.context === 'bg');
      assert(log.cmd === 'log');
      const args = log.args;
      assert(args.length === 8);
      assert(args[0] === true);
      assert(args[1] === 0.1);
      assert(args[2] === 'str');
      assert.deepEqual(['a', 'b'], args[3]);
      assert.deepEqual({ o: 1, p: 2 }, args[4]);
      assert(args[5] === null);
      assert((args[6] === undefined) || (args[6] === null));
      assert(args[7] === 1);
      done();
    });
  });

  it('should invoke provided callback (0 args, ctx to bg, no return val)', (done) => {
    const res = ctx[0].bg('log', (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (2 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('bg' === log.context);
      assert('log' === log.cmd);
      assert(0 === log.args.length);
      log = handlerLog[1];
      assert('callback' === log.cmd);
      assert(undefined === log.args);
      done();
    });
  });

  it('should invoke provided callback (2 args, ctx to bg, no return val)', (done) => {
    const res = ctx[0].bg('log', 1, 2, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (2 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('bg' === log.context);
      assert('log' === log.cmd);
      assert(2 === log.args.length);
      log = handlerLog[1];
      assert('callback' === log.cmd);
      assert(undefined === log.args);
      done();
    });
  });

  it('should invoke provided callback (ctx to bg, return val)', (done) => {
    const res = ctx[0].bg('random', 10, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (2 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('bg' === log.context);
      assert('random' === log.cmd);
      assert(1 === log.args.length);
      assert(10 === log.args[0]);
      let _res;
      assert(typeof (_res = log.retVal) === 'number');
      log = handlerLog[1];
      assert('callback' === log.cmd);
      assert('number' === typeof log.args);
      assert(_res === log.args);
      done();
    });
  });

  it('should pass 0 args from bg to (single) ctx', (done) => {
    const res = bg.cmd(4, ['ct'], 'log');
    assert(true === res);
    setImmediate(function _f() {
      if (1 !== handlerLog.length) { setImmediate(_f); return; }
      const log = handlerLog[0];
      assert('ct' === log.context);
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('log' === log.cmd);
      assert(0 === handlerLog[0].args.length);
      done();
    });
  });

  it('should pass multiple args from bg to (single) ctx', (done) => {
    const res = bg.cmd(4, ['ct'], 'log', true, 0.1, 'str', ['a', 'b'], { o: 1, p: 2 }, null, undefined, 1);
    assert(true === res);
    setImmediate(function _f() {
      if (1 !== handlerLog.length) { setImmediate(_f); return; }
      const log = handlerLog[0];
      assert('ct' === log.context);
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('log' === log.cmd);
      const args = log.args;
      assert(8 === args.length);
      assert(true === args[0]);
      assert(0.1 === args[1]);
      assert('str' === args[2]);
      assert.deepEqual(['a', 'b'], args[3]);
      assert.deepEqual({ o: 1, p: 2 }, args[4]);
      assert(null === args[5]);
      assert((undefined === args[6]) || (null === args[6]));
      assert(1 === args[7]);
      done();
    });
  });

  it('should invoke provided callback (0 args, bg to (single) ctx, no return val)', (done) => {
    const res = bg.cmd(4, ['ct'], 'log', (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (2 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('ct' === log.context);
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('log' === log.cmd);
      assert(0 === log.args.length);
      log = handlerLog[1];
      assert('callback' === log.cmd);
      assert(undefined === log.args);
      done();
    });
  });

  it('should invoke provided callback (2 args, bg to (single) ctx, no return val)', (done) => {
    const res = bg.cmd(4, ['ct'], 'log', 1, 2, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (2 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('ct' === log.context);
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('log' === log.cmd);
      assert(2 === log.args.length);
      log = handlerLog[1];
      assert('callback' === log.cmd);
      assert(undefined === log.args);
      done();
    });
  });

  it('should invoke provided callback (bg to (single) ctx, return val)', (done) => {
    const res = bg.cmd(4, ['ct'], 'random', 10, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (2 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('ct' === log.context);
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('random' === log.cmd);
      assert(1 === log.args.length);
      assert(10 === log.args[0]);
      let _res;
      assert(typeof (_res = log.retVal) === 'number');
      log = handlerLog[1];
      assert('callback' === log.cmd);
      assert(typeof (log.args) === 'number');
      assert(_res === log.args);
      done();
    });
  });

  it('should match multiple requests with corresponding responses (ctx to bg)', (done) => {
    const res1 = ctx[0].bg('random', 100, (result) => { addLog(0, 0, 'cb1', result); });
    const res2 = ctx[0].bg('log', 1, 2, (result) => { addLog(0, 0, 'cb2', result); });
    assert(true === res1);
    assert(true === res2);
    setImmediate(function _f() {
      if (4 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('bg' === log.context);
      assert('random' === log.cmd);
      const _res = log.retVal;
      log = handlerLog[1];
      assert('bg' === log.context);
      assert('log' === log.cmd);
      // interesting part here: singe random() is async, its callback (cb1) will
      // be invoked after callback of (sync) log(), i.e. cb2...
      // this way we can verify the request-responses are matched accordingly,
      // as first request should be matched with second response, and second
      // request with first response...
      log = handlerLog[2];
      assert('cb2' === log.cmd);
      assert(undefined === log.result);
      log = handlerLog[3];
      assert('cb1' === log.cmd);
      assert(_res === log.args);
      done();
    });
  });

  it('should match multiple requests with corresponding responses (bg to (single) ctx)', (done) => {
    const res1 = bg.cmd(4, ['ct'], 'random', 100, (result) => { addLog(0, 0, 'cb1', result); });
    const res2 = bg.cmd(4, ['ct'], 'log', 1, 2, (result) => { addLog(0, 0, 'cb2', result); });
    assert(true === res1);
    assert(true === res2);
    setImmediate(function _f() {
      if (4 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('ct' === log.context);
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('random' === log.cmd);
      const _res = log.retVal;
      log = handlerLog[1];
      assert('ct' === log.context);
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('log' === log.cmd);
      // interesting part here: singe random() is async, its callback (cb1) will
      // be invoked after callback of (sync) log(), i.e. cb2...
      // this way we can verify the request-responses are matched accordingly,
      // as first request should be matched with second response, and second
      // request with first response...
      log = handlerLog[2];
      assert('cb2' === log.cmd);
      assert(undefined === log.result);
      log = handlerLog[3];
      assert('cb1' === log.cmd);
      assert(_res === log.args);
      done();
    });
  });

  it('should query contexts of given tabId only (bg to (multiple) ctx, first response)', (done) => {
    const res = bg.cmd(4, 'random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (3 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('random' === log.cmd);
      const _res = log.retVal;
      const _ctx = log.context;  // either 'ct' or 'dt'
      log = handlerLog[1];
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('random' === log.cmd);
      assert(_ctx !== log.context); // this must be the other one
      log = handlerLog[2];
      assert('callback' === log.cmd);
      assert(_res === log.args);   // we only get first response back
      done();
    });
  });

  it('should query contexts of given tabId only (bg to (multiple) ctx, all responses)', (done) => {
    const res = bg.bcast(4, 'random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (3 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('random' === log.cmd);
      const resps = [];
      resps.push(log.retVal);
      const _ctx = log.context;  // either 'ct' or 'dt'
      log = handlerLog[1];
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('random' === log.cmd);
      assert(_ctx !== log.context); // this must be the other one
      resps.push(log.retVal);
      log = handlerLog[2];
      assert('callback' === log.cmd);
      const _resps = log.args;   // it should be an array with all the results
      _resps.sort((a, b) => a - b);
      resps.sort((a, b) => a - b);
      assert(resps.length === _resps.length);  // the result arrays are the same
      for (let i = 0; i < resps.length; i += 1) {
        assert(resps[i] === _resps[i]);
      }
      done();
    });
  });

  it('should query contexts of (single) given context type only (bg to (multiple) ctx, all responses)', (done) => {
    const res = bg.bcast(['dt'], 'random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (9 !== handlerLog.length) { setImmediate(_f); return; }  // 8 x dt + cb
      const resps = [];
      const idxs = [];
      let i;
      let log;
      for (i = 0; i < 8; i += 1) {
        log = handlerLog[i];
        assert('random' === log.cmd);
        assert('dt' === log.context);
        resps.push(log.retVal);
        idxs.push(log.idx);
      }
      idxs.sort((a, b) => a - b);
      resps.sort((a, b) => a - b);
      for (i = 0; i < 8; i += 1) { assert(i + 1 === idxs[i]); }  // all dt contexts
      log = handlerLog[8];  // callback
      assert('callback' === log.cmd);
      const _resps = log.args;   // it should be an array with all the results
      _resps.sort((a, b) => a - b);
      assert(resps.length === _resps.length);  // the result arrays are the same
      for (i = 0; i < resps.length; i += 1) {
        assert(resps[i] === _resps[i]);
      }
      done();
    });
  });

  it('should query contexts of (multiple) given context types only (bg to (multiple) ctx, all responses)', (done) => {
    const res = bg.bcast(['dt', 'ct'], 'random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (17 !== handlerLog.length) { setImmediate(_f); return; }  // 8 x ct + 8 x dt + cb
      const resps = [];
      const idxs = [];
      let i;
      let log;
      for (i = 0; i < 16; i += 1) {
        log = handlerLog[i];
        assert('random' === log.cmd);
        assert(('dt' === log.context) || ('ct' === log.context));
        resps.push(log.retVal);
        idxs.push(log.idx);
      }
      idxs.sort((a, b) => a - b);
      resps.sort((a, b) => a - b);
      for (i = 0; i < 16; i += 1) {
        assert(1 + Math.floor(i / 2) === idxs[i]);  // all ct/dt contexts
      }
      log = handlerLog[16];  // callback
      assert('callback' === log.cmd);
      const _resps = log.args;   // it should be an array with all the results
      _resps.sort((a, b) => a - b);
      assert(resps.length === _resps.length);  // the result arrays are the same
      for (i = 0; i < resps.length; i += 1) {
        assert(resps[i] === _resps[i]);
      }
      done();
    });
  });

  it('should query all contexts (bg to (all) ctx, all responses)', (done) => {
    const res = bg.bcast('random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (21 !== handlerLog.length) { setImmediate(_f); return; }  // 20 x ctx + cb
      const resps = [];
      const idxs = [];
      let i;
      let log;
      for (i = 0; i < 20; i += 1) {
        log = handlerLog[i];
        assert('random' === log.cmd);
        resps.push(log.retVal);
        idxs.push(log.idx);
      }
      idxs.sort((a, b) => a - b);
      resps.sort((a, b) => a - b);
      for (i = 0; i < 20; i += 1) { assert(1 + Math.floor(i / 2) === idxs[i]); }  // all contexts
      log = handlerLog[20];  // callback
      assert('callback' === log.cmd);
      const _resps = log.args;   // it should be an array with all the results
      _resps.sort((a, b) => a - b);
      assert(resps.length === _resps.length);  // the result arrays are the same
      for (i = 0; i < resps.length; i += 1) {
        assert(resps[i] === _resps[i]);
      }
      done();
    });
  });

  it('should invoke callback when the requested handler is not found in any context (bg to (all) ctx, single response)', (done) => {
    const res = bg.cmd('__random__', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (1 !== handlerLog.length) { setImmediate(_f); return; }
      const log = handlerLog[0];
      assert('callback' === log.cmd);
      assert(undefined === log.args);
      done();
    });
  });

  it('should invoke callback when the requested handler is not found in any context (bg to (all) ctx, all responses)', (done) => {
    const res = bg.bcast('__random__', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (1 !== handlerLog.length) { setImmediate(_f); return; }
      const log = handlerLog[0];
      assert('callback' === log.cmd);
      assert(0 === log.args.length);
      done();
    });
  });

  it('should ignore responses with invalid return values (bg to (all) ctx, single response)', (done) => {
    const res = bg.cmd('popup_10_cmd', (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (2 !== handlerLog.length) { setImmediate(_f); return; } // popup_10 + cb
      let log = handlerLog[0];
      assert('popup' === log.context);
      assert('popup_10_cmd' === log.cmd);
      assert(10 === log.idx);
      log = handlerLog[1];
      assert('callback' === log.cmd);
      assert('hello world' === log.args);
      done();
    });
  });

  it('should ignore responses with invalid return values (bg to (all) ctx, all responses)', (done) => {
    const res = bg.bcast('options_cmd', 'message', (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (3 !== handlerLog.length) { setImmediate(_f); return; } // 2 x options + cb
      let log;
      let i;
      for (i = 0; i < 2; i += 1) {
        log = handlerLog[i];
        assert('options' === log.context);
        assert('options_cmd' === log.cmd);
      }
      log = handlerLog[2];
      assert('callback' === log.cmd);
      assert(2 === log.args.length);
      for (i = 0; i < 2; i += 1) { assert('message' === log.args[i]); }
      done();
    });
  });

  it('should query contexts of given tabId only (ctx to (multiple) ctx, first response)', (done) => {
    const res = ctx[0].cmd(4, 'random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (3 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('random' === log.cmd);
      const _res = log.retVal;
      const _ctx = log.context;  // either 'ct' or 'dt'
      log = handlerLog[1];
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('random' === log.cmd);
      assert(_ctx !== log.context); // this must be the other one
      log = handlerLog[2];
      assert('callback' === log.cmd);
      assert(_res === log.args);   // we only get first response back
      done();
    });
  });

  it('should query contexts of given tabId only (ctx to (multiple) ctx, all responses)', (done) => {
    const res = ctx[0].bcast(4, 'random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (3 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('random' === log.cmd);
      const resps = [];
      resps.push(log.retVal);
      const _ctx = log.context;  // either 'ct' or 'dt'
      log = handlerLog[1];
      assert(3 === log.idx);  // on tabId:4 there is ct with idx:3
      assert('random' === log.cmd);
      assert(_ctx !== log.context); // this must be the other one
      resps.push(log.retVal);
      log = handlerLog[2];
      assert('callback' === log.cmd);
      const _resps = log.args;   // it should be an array with all the results
      _resps.sort((a, b) => a - b);
      resps.sort((a, b) => a - b);
      assert(resps.length === _resps.length);  // the result arrays are the same
      for (let i = 0; i < resps.length; i += 1) {
        assert(resps[i] === _resps[i]);
      }
      done();
    });
  });

  it('should query contexts of (single) given context type only (ctx to (multiple) ctx, all responses)', (done) => {
    const res = ctx[1].bcast(['dt'], 'random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (8 !== handlerLog.length) { setImmediate(_f); return; }  // 8 x dt - invoking dt + cb
      const resps = [];
      const idxs = [];
      let i;
      let log;
      for (i = 0; i < 7; i += 1) {
        log = handlerLog[i];
        assert('random' === log.cmd);
        assert('dt' === log.context);
        resps.push(log.retVal);
        idxs.push(log.idx);
      }
      idxs.sort((a, b) => a - b);
      resps.sort((a, b) => a - b);
      for (i = 0; i < 7; i += 1) { assert(i + 2 === idxs[i]); }  // 8 x dt - invoking dt
      log = handlerLog[7];  // callback
      assert('callback' === log.cmd);
      const _resps = log.args;   // it should be an array with all the results
      _resps.sort((a, b) => a - b);
      assert(resps.length === _resps.length);  // the result arrays are the same
      for (i = 0; i < resps.length; i += 1) {
        assert(resps[i] === _resps[i]);
      }
      done();
    });
  });

  it('should query contexts of (multiple) given context types only (ctx to (multiple) ctx, all responses)', (done) => {
    const res = ctx[1].bcast(['dt', 'ct'], 'random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (16 !== handlerLog.length) {
        setImmediate(_f);  // 8 x ct + 8 x dt - invoking dt + cb
        return;
      }
      const resps = [];
      const idxs = [];
      let i;
      let log;
      for (i = 0; i < 15; i += 1) {
        log = handlerLog[i];
        assert('random' === log.cmd);
        assert(('dt' === log.context) || ('ct' === log.context));
        resps.push(log.retVal);
        idxs.push(log.idx);
      }
      idxs.sort((a, b) => a - b);
      resps.sort((a, b) => a - b);
      for (i = 0; i < 15; i += 1) {
        assert(1 + Math.floor((i + 1) / 2) === idxs[i]); // all ct/dt contexts - invoking dt
      }
      log = handlerLog[15];  // callback
      assert('callback' === log.cmd);
      const _resps = log.args;   // it should be an array with all the results
      _resps.sort((a, b) => a - b);
      assert(resps.length === _resps.length);  // the result arrays are the same
      for (i = 0; i < resps.length; i += 1) {
        assert(resps[i] === _resps[i]);
      }
      done();
    });
  });

  it('should query dt context of the SAME_TAB id (ctx to (same-tab) dt ctx, single response)', (done) => {
    // ctx[10]: 'ct', idx:5
    const res = ctx[10].cmd(ctxMain[10].SAME_TAB, 'random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (2 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('dt' === log.context);
      assert(5 === log.idx);
      assert('random' === log.cmd);
      const _res = log.retVal;
      log = handlerLog[1];
      assert('callback' === log.cmd);
      assert(_res === log.args);
      done();
    });
  });

  it('should query all contexts (ctx to (all) bg+ctx, all responses)', (done) => {
    const res = ctx[1].bcast('random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (21 !== handlerLog.length) {
        setImmediate(_f);  // bg + 20 x ctx - invoking dt + cb
        return;
      }
      const resps = [];
      const idxs = [];
      let i;
      let log;
      for (i = 0; i < 20; i += 1) {
        log = handlerLog[i];
        assert('random' === log.cmd);
        resps.push(log.retVal);
        idxs.push(log.idx);
      }
      idxs.sort((a, b) => a - b);
      resps.sort((a, b) => a - b);
      for (i = 0; i < 20; i += 1) {
        assert(1 + Math.floor(i / 2) === idxs[i]); // bg (idx:1) + all contexts - invoking dt
      }
      log = handlerLog[20];  // callback
      assert('callback' === log.cmd);
      const _resps = log.args;   // it should be an array with all the results
      _resps.sort((a, b) => a - b);
      assert(resps.length === _resps.length);  // the result arrays are the same
      for (i = 0; i < resps.length; i += 1) {
        assert(resps[i] === _resps[i]);
      }
      done();
    });
  });

  it('should invoke callback when the requested handler is not found in any context (ctx to (all) ctx, single response)', (done) => {
    const res = ctx[0].cmd('__random__', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (1 !== handlerLog.length) { setImmediate(_f); return; }
      const log = handlerLog[0];
      assert('callback' === log.cmd);
      assert(undefined === log.args);
      done();
    });
  });

  it('should invoke callback when the requested handler is not found in any context (ctx to (all) ctx, all responses)', (done) => {
    const res = ctx[0].bcast('__random__', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (1 !== handlerLog.length) { setImmediate(_f); return; }
      const log = handlerLog[0];
      assert('callback' === log.cmd);
      assert(0 === log.args.length);
      done();
    });
  });

  it('should ignore responses with invalid return values (ctx to (all) ctx, single response)', (done) => {
    const res = ctx[4].cmd('popup_10_cmd', (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (2 !== handlerLog.length) { setImmediate(_f); return; } // popup_10 + cb
      let log = handlerLog[0];
      assert('popup' === log.context);
      assert('popup_10_cmd' === log.cmd);
      assert(10 === log.idx);
      log = handlerLog[1];
      assert('callback' === log.cmd);
      assert('hello world' === log.args);
      done();
    });
  });

  it('should ignore responses with invalid return values (ctx to (all) ctx, all responses)', (done) => {
    const res = ctx[0].bcast('ct_cmd', 'message', (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (8 !== handlerLog.length) {
        setImmediate(_f); // 8 x ct - invoking ct (idx:1) + cb
        return;
      }
      let log;
      let i;
      for (i = 0; i < 7; i += 1) {
        log = handlerLog[i];
        assert('ct' === log.context);
        assert('ct_cmd' === log.cmd);
      }
      log = handlerLog[7];
      assert('callback' === log.cmd);
      assert(7 === log.args.length);
      for (i = 0; i < 7; i += 1) { assert('message' === log.args[i]); }
      done();
    });
  });

  it('should invoke onDisconnect background handler on Port disconnect', (done) => {
    let _port;
    _port = ctxMain[19].__getPort();   // 'dt', id: 10
    _port.disconnect();
    _port = ctxMain[18].__getPort();   // 'ct', id: 10
    _port.disconnect();
    setImmediate(function _f() {
      if (2 !== handlerLog.length) { setImmediate(_f); return; }
      let log;
      log = handlerLog[0];
      assert('bg' === log.context);
      assert('onDisconnect' === log.cmd);
      assert('dt' === log.args[0]);
      assert(10 === log.args[1]);
      log = handlerLog[1];
      assert('bg' === log.context);
      assert('onDisconnect' === log.cmd);
      assert('ct' === log.args[0]);
      assert(10 === log.args[1]);
      // uninstall onConnect / onDisconnect background handlers
      bgHandlers.onConnect = undefined;
      bgHandlers.onDisconnect = undefined;
      done();
    });
  });

  it('should not wait for response when Port is disconnected (bg to (single) ctx, single response)', (done) => {
    const res = bg.cmd(9, ['dt'], 'block', (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (1 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('dt' === log.context);
      assert(7 === log.idx);
      assert('block' === log.cmd);
      const pending = bgMain.__getPendingReqs();
      assert('object' === typeof pending);
      assert(1 === Object.keys(pending).length);              // 'dt-18'
      assert('object' === typeof pending['dt-18']);          // array
      assert('object' === typeof pending['dt-18'][0]);
      assert(2 === Object.keys(pending['dt-18'][0]).length);  // 'cb', 'id'
      assert('function' === typeof pending['dt-18'][0].cb);
      assert('number' === typeof pending['dt-18'][0].id);
      const _port = ctxMain[17].__getPort();
      _port.disconnect();
      setImmediate(function _g() {
        if (2 !== handlerLog.length) { setImmediate(_g); return; }
        log = handlerLog[1];
        assert('callback' === log.cmd);
        assert(undefined === log.args);
        done();
      });
    });
  });

  it('should not wait for response when Port is disconnected (bg to (single) ctx, all responses)', (done) => {
    const res = bg.bcast(9, ['ct'], 'block', (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (1 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('ct' === log.context);
      assert(7 === log.idx);
      assert('block' === log.cmd);
      const pending = bgMain.__getPendingReqs();
      assert('object' === typeof pending);
      assert(1 === Object.keys(pending).length);              // 'ct-17'
      assert('object' === typeof pending['ct-17']);          // array
      assert('object' === typeof pending['ct-17'][0]);
      assert(2 === Object.keys(pending['ct-17'][0]).length);  // 'cb', 'id'
      assert('function' === typeof pending['ct-17'][0].cb);
      assert('number' === typeof pending['ct-17'][0].id);
      const _port = ctxMain[16].__getPort();
      _port.disconnect();
      setImmediate(function _g() {
        if (2 !== handlerLog.length) { setImmediate(_g); return; }
        log = handlerLog[1];
        assert('callback' === log.cmd);
        assert(0 === log.args.length);
        done();
      });
    });
  });

  it('should not wait for response when Port is disconnected (ctx to (single) ctx, single response)', (done) => {
    const res = ctx[0].cmd(8, ['dt'], 'block', (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (1 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('dt' === log.context);
      assert(6 === log.idx);
      assert('block' === log.cmd);
      const pending = bgMain.__getPendingReqs();
      assert('object' === typeof pending);
      assert(1 === Object.keys(pending).length);              // 'dt-16'
      assert('object' === typeof pending['dt-16']);          // array
      assert('object' === typeof pending['dt-16'][0]);
      assert(2 === Object.keys(pending['dt-16'][0]).length);  // 'cb', 'id'
      assert('function' === typeof pending['dt-16'][0].cb);
      assert('number' === typeof pending['dt-16'][0].id);
      const _port = ctxMain[15].__getPort();
      _port.disconnect();
      setImmediate(function _g() {
        if (2 !== handlerLog.length) { setImmediate(_g); return; }
        log = handlerLog[1];
        assert('callback' === log.cmd);
        assert(undefined === log.args);
        done();
      });
    });
  });

  it('should not wait for response when Port is disconnected (ctx to (single) ctx, all responses)', (done) => {
    const res = ctx[0].bcast(8, ['ct'], 'block', (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (1 !== handlerLog.length) { setImmediate(_f); return; }
      let log = handlerLog[0];
      assert('ct' === log.context);
      assert(6 === log.idx);
      assert('block' === log.cmd);
      const pending = bgMain.__getPendingReqs();
      assert('object' === typeof pending);
      assert(1 === Object.keys(pending).length);              // 'ct-15'
      assert('object' === typeof pending['ct-15']);          // array
      assert('object' === typeof pending['ct-15'][0]);
      assert(2 === Object.keys(pending['ct-15'][0]).length);  // 'cb', 'id'
      assert('function' === typeof pending['ct-15'][0].cb);
      assert('number' === typeof pending['ct-15'][0].id);
      const _port = ctxMain[14].__getPort();
      _port.disconnect();
      setImmediate(function _g() {
        if (2 !== handlerLog.length) { setImmediate(_g); return; }
        log = handlerLog[1];
        assert('callback' === log.cmd);
        assert(0 === log.args.length);
        done();
      });
    });
  });

  it('should update portMap in bg context accordingly (6 disconnected Ports)', () => {
    const pm = bgMain.__getPortMap();
    assert(4 === Object.keys(pm).length);  // ct, dt, popup, options
    assert(pm.ct);
    assert(5 === Object.keys(pm.ct).length);       // 5 x 'ct' context
    assert(pm.dt);
    assert(5 === Object.keys(pm.dt).length);       // 5 x 'dt' context
    assert(pm.popup);
    assert(2 === Object.keys(pm.popup).length);    // 2 x 'popup' context
    assert(pm.options);
    assert(2 === Object.keys(pm.options).length);  // 2 x 'options' context
  });

  it('should not invoke handlers of disconnected Ports', (done) => {
    const res = bg.bcast('random', 100, (result) => { addLog(0, 0, 'callback', result); });
    assert(true === res);
    setImmediate(function _f() {
      if (15 !== handlerLog.length) { setImmediate(_f); return; } // 14 ctx + cb
      const log = handlerLog[14];
      assert('callback' === log.cmd);
      assert(14 === log.args.length);
      done();
    });
  });

  it('should properly connect to another extension', (done) => {
    // install onConnect / onDisconnect handlers
    bgHandlers.onExtensionConnect = bgHandlers._onExtensionConnect;
    bgHandlers.onExtensionDisconnect = bgHandlers._onExtensionDisconnect;
    bgExtHandlers.onExtensionConnect = bgExtHandlers._onExtensionConnect;
    bgExtHandlers.onExtensionDisconnect = bgExtHandlers._onExtensionDisconnect;

    bg.connectExt(runtime2.id);

    setImmediate(function _f() {
      if (handlerLog.length < 2) { setImmediate(_f); return; }
      assert.strictEqual(handlerLog[0].context, 'bg');
      assert.strictEqual(handlerLog[0].idx, 1);
      assert.strictEqual(handlerLog[0].cmd, 'onExtensionConnect');
      assert.strictEqual(handlerLog[0].args[0], runtime2.id);
      assert.strictEqual(handlerLog[1].context, 'bg');
      assert.strictEqual(handlerLog[1].idx, 2);
      assert.strictEqual(handlerLog[1].cmd, 'onExtensionConnect');
      assert.strictEqual(handlerLog[1].args[0], runtime1.id);

      done();
    });
  });

  it('should properly call handler of foreign extension\'s background', (done) => {
    const res = bg1.cmdExt(runtime1.id, 'log', true, 0.1, 'str', ['a', 'b'], { o: 1, p: 2 }, null, undefined, 1);
    assert(true === res);
    setImmediate(function _f() {
      if (1 !== handlerLog.length) { setImmediate(_f); return; }
      const log = handlerLog[0];
      assert('bg' === log.context);
      assert.strictEqual(log.idx, 1);
      assert('log' === log.cmd);
      const args = log.args;
      assert(8 === args.length);
      assert(true === args[0]);
      assert(0.1 === args[1]);
      assert('str' === args[2]);
      assert.deepEqual(['a', 'b'], args[3]);
      assert.deepEqual({ o: 1, p: 2 }, args[4]);
      assert(null === args[5]);
      assert((undefined === args[6]) || (null === args[6]));
      assert(1 === args[7]);
      done();
    });
  });
});
