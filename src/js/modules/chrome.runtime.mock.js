// event emitter for message passing
import { EventEmitter2 } from 'eventemitter2'; // eslint-disable-line import/no-extraneous-dependencies


// event factory
function createEvent(bus, name) {
  return {
    addListener(callback) { bus.on(name, callback); },
    removeListener(callback) { bus.removeListener(name, callback); }
  };
}

const runtimes = {};

function ChromeRuntime() {
  // tab id is increased every second .connect()
  let counter = 0;
  let tabId = 1;

  //
  // chrome.runtime.Port
  //

  function Port(id, info, bus, myPrefix, otherPrefix) {
    // public properties
    this.name = info && info.name;
    if (myPrefix === 'A') { // on that will be passed to onConnect
      this.sender = { id, tab: { id: tabId } };
      if (counter++ & 1) { tabId++; } // eslint-disable-line
      if (this.name === 'dt') { this.sender = {}; }  // developer tools
    }
    // disconnect
    this.disconnect = () => {
      setImmediate(bus.emit.bind(bus, `${otherPrefix}disconnect`));
    };
    this.onDisconnect = createEvent(bus, `${myPrefix}disconnect`);
    // postMessage
    this.postMessage = (msg) => {
      // msg should be serializable (so that it can be passed accross process
      // boundaries). we create a deep copy of it using JSON, so that we know that
      // the message we pass is unique in each context we pass it into  (even if
      // we send the same message (or with the same deep references) over and over
      // again to multiple destinations).
      const _str = JSON.stringify({ data: msg });
      const _obj = JSON.parse(_str);
      setImmediate(bus.emit.bind(bus, `${otherPrefix}message`, _obj.data));
    };
    this.onMessage = createEvent(bus, `${myPrefix}message`);
  }


  // event dispatcher for chrome.runtime
  const server = new EventEmitter2();

  //
  // chrome.runtime.(connect/onConnect):
  //

  this.id = Math.floor(Math.random() * 10000000).toString();
  runtimes[this.id] = (port) => { // store connect invoker for external connections
    setImmediate(server.emit.bind(server, 'connectExternal', port));
  };

  this.onConnect = createEvent(server, 'connect');
  this.onConnectExternal = createEvent(server, 'connectExternal');

  this.connect = (...args) => {
    // process args:
    let id = args[0];
    let info = args[0];
    if (typeof id === 'string') { // id provided
      info = args[1];
    } else { // id not provided
      id = undefined;
    }
    // shared event bus for two communicating Ports
    const bus = new EventEmitter2();
    const portA = new Port(this.id, info, bus, 'A', 'B');
    const portB = new Port(id, info, bus, 'B', 'A');
    // let the port register onMessage --> setImmediate()
    if (id) {
      if (typeof runtimes[id] === 'function') {
        runtimes[id](portA);
      }
    } else {
      setImmediate(server.emit.bind(server, 'connect', portA));
    }
    return portB;
  };

  // for unit tests only
  this.__resetTabId = (val) => { // eslint-disable-line no-underscore-dangle
    tabId = val || 1;
    counter = 0;
  };
}


// exported
export default ChromeRuntime;
