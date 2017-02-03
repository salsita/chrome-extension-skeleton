import assert from 'assert';
import ChromeRuntime from './chrome.runtime.mock';

const runtime = new ChromeRuntime();
const runtimeExt = new ChromeRuntime();

let log = [];

// function dumpLog() { console.log(JSON.stringify(log, null, 4)); }
function addLogEntry(args) {
  log.push(args);
}
function createCb(scope) {
  return (...args) => {
    Array.prototype.unshift.call(args, scope);
    addLogEntry(args);
  };
}

const onConnect = createCb('main::onConnect');
const onConnectExt = createCb('main::onConnectExternal');

function verifyPort(port) {
  assert(typeof port === 'object');
  assert(port.name === 'myPort');
  assert(typeof port.disconnect === 'function');
  assert(typeof port.postMessage === 'function');
  assert(typeof port.onDisconnect === 'object');
  assert(typeof port.onDisconnect.addListener === 'function');
  assert(typeof port.onDisconnect.removeListener === 'function');
  assert(typeof port.onMessage === 'object');
  assert(typeof port.onMessage.addListener === 'function');
  assert(typeof port.onMessage.removeListener === 'function');
}

describe('chrome.runtime.mock module', () => {
  beforeEach(() => {
    log = [];
    runtime.onConnect.addListener(onConnect);
    runtimeExt.onConnectExternal.addListener(onConnectExt);
  });

  afterEach(() => {
    runtime.onConnect.removeListener(onConnect);
    runtimeExt.onConnectExternal.removeListener(onConnectExt);
  });

  it('should export connect method and onConnect / onConnectExternal events', () => {
    assert(typeof runtime === 'object');
    assert(typeof runtime.connect === 'function');
    assert(typeof runtime.onConnect === 'object');
    assert(typeof runtime.onConnect.addListener === 'function');
    assert(typeof runtime.onConnect.removeListener === 'function');
    assert(typeof runtime.onConnectExternal === 'object');
    assert(typeof runtime.onConnectExternal.addListener === 'function');
    assert(typeof runtime.onConnectExternal.removeListener === 'function');
  });

  it('connect() should create Port', (done) => {
    const port = runtime.connect({ name: 'myPort' });
    verifyPort(port);
    assert(typeof port.sender === 'undefined');
    setImmediate(done);  // connect writes to log asynchronously, so need to wait here
  });

  it('should notify onConnect handler when Port is connected', (done) => {
    runtime.connect({ name: 'myPort' });
    setImmediate(() => {
      assert(log.length === 1);
      assert(log[0][0] === 'main::onConnect');
      const port = log[0][1];
      verifyPort(port);
      assert(typeof (port.sender && port.sender.tab && port.sender.tab.id) === 'number');
      done();
    });
  });

  it('should notify onConnectExternal handler when connect has been called with extension id', (done) => {
    runtime.connect(runtimeExt.id, { name: 'myPort' });
    setImmediate(() => {
      assert(log.length === 1);
      assert.strictEqual(log[0][0], 'main::onConnectExternal');
      const port = log[0][1];
      verifyPort(port);
      assert.strictEqual(port.sender && port.sender.id, runtime.id);
      done();
    });
  });

  it('should be able to add/remove onConnect listeners', (done) => {
    runtime.connect();
    setImmediate(() => {
      assert(log.length === 1);  // orig
      const cb = createCb('extra::onConnect');
      runtime.onConnect.addListener(cb);
      runtime.connect();
      setImmediate(() => {
        assert(log.length === 3);  // orig + (orig + extra)
        assert(log[1][1] === log[2][1]);  // the listners should get the same Port
        runtime.onConnect.removeListener(cb);
        runtime.connect();
        setImmediate(() => {
          assert(log.length === 4); // orig + (orig + extra) + orig
          assert(log[3][0] === 'main::onConnect');
          done();
        });
      });
    });
  });

  it('should pass messages between Port parts', (done) => {
    const portA = runtime.connect();
    setImmediate(() => {
      const portB = log[0][1]; // counterpart to portA
      const onMsgA = createCb('A::onMsg');
      const onMsgB = createCb('B::onMsg');
      portA.onMessage.addListener(onMsgA);
      portB.onMessage.addListener(onMsgB);
      portA.postMessage();
      setImmediate(() => {
        assert(log.length === 2);
        assert(log[1][0] === 'B::onMsg');
        portB.postMessage({ b: false, i: 1, s: 'str', a: ['a', 'b'], o: { x: 1, y: 2 } });
        setImmediate(() => {
          assert(log.length === 3);
          const _ref = log[2]; // eslint-disable-line no-underscore-dangle
          assert(_ref[0] === 'A::onMsg');
          assert.deepEqual(_ref[1], { b: false, i: 1, s: 'str', a: ['a', 'b'], o: { x: 1, y: 2 } });
          done();
        });
      });
    });
  });

  it('should be abble to add/remove more onMessage Port handlers', (done) => {
    const portA = runtime.connect();
    setImmediate(() => {
      const portB = log[0][1];
      portB.postMessage();
      setImmediate(() => {
        assert(log.length === 1);  // i.e. no message, no handler added yet
        const cb1 = createCb('A1::onMsg');
        const cb2 = createCb('A2::onMsg');
        portA.onMessage.addListener(cb1);
        portB.postMessage();
        setImmediate(() => {
          assert(log.length === 2);  // 1 new entry
          assert(log[1][0] === 'A1::onMsg');
          portA.onMessage.addListener(cb2);
          portB.postMessage();
          setImmediate(() => {
            assert(log.length === 4);  // 2 new entries
            assert(log[2][0] !== log[3][0]);  // coming from different handlers
            portA.onMessage.removeListener(cb1);
            portB.postMessage();
            setImmediate(() => {
              assert(log.length === 5);
              assert(log[4][0] === 'A2::onMsg');
              portA.onMessage.removeListener(cb1);  // removing for second time, should do no harm
              portB.postMessage();
              setImmediate(() => {
                assert(log.length === 6);
                assert(log[5][0] === 'A2::onMsg');
                portA.onMessage.removeListener(cb2);
                portB.postMessage();
                setImmediate(() => {
                  assert(log.length === 6);  // no change
                  done();
                });
              });
            });
          });
        });
      });
    });
  });

  it('should not mix msg communication across different Ports', (done) => {
    const port1A = runtime.connect();
    const port2A = runtime.connect();
    port1A.onMessage.addListener(createCb('1A::onMsg'));
    port2A.onMessage.addListener(createCb('2A::onMsg'));
    setImmediate(() => {
      const port1B = log[0][1];
      const port2B = log[1][1];
      port1B.onMessage.addListener(createCb('1B::onMsg'));
      port2B.onMessage.addListener(createCb('2B::onMsg'));
      port1A.postMessage();
      setImmediate(() => {
        assert(log[2][0] === '1B::onMsg');
        port1B.postMessage();
        setImmediate(() => {
          assert(log[3][0] === '1A::onMsg');
          port2A.postMessage();
          setImmediate(() => {
            assert(log[4][0] === '2B::onMsg');
            port2B.postMessage();
            setImmediate(() => {
              assert(log[5][0] === '2A::onMsg');
              done();
            });
          });
        });
      });
    });
  });

  it('should notify onDisconnect handler when Port is closed', (done) => {
    const portA = runtime.connect();
    setImmediate(() => {
      const portB = log[0][1];
      portA.onDisconnect.addListener(createCb('A::onDisconnect'));
      portB.onDisconnect.addListener(createCb('B::onDisconnect'));
      portA.disconnect();
      setImmediate(() => {
        assert(log.length === 2);
        assert(log[1][0] === 'B::onDisconnect');
        portB.disconnect();
        setImmediate(() => {
          assert(log.length === 3);
          assert(log[2][0] === 'A::onDisconnect');
          const extraCb = createCb('A2::onDisconnect');
          portA.onDisconnect.addListener(extraCb);
          portA.disconnect();
          setImmediate(() => {
            assert(log.length === 4);
            assert(log[3][0] === 'B::onDisconnect');
            portB.disconnect();
            setImmediate(() => {
              assert(log.length === 6);
              assert(((log[4][0] === 'A::onDisconnect') && (log[5][0] === 'A2::onDisconnect')) ||
                      ((log[5][0] === 'A::onDisconnect') && (log[4][0] === 'A2::onDisconnect')));
              portA.onDisconnect.removeListener(extraCb);
              portB.disconnect();
              setImmediate(() => {
                assert(log.length === 7);
                assert(log[6][0] === 'A::onDisconnect');
                done();
              });
            });
          });
        });
      });
    });
  });
});
