// event emitter for message passing
var EE2 = require('eventemitter2').EventEmitter2;

// event factory
function createEvent(bus, name) {
  return {
    addListener: function(callback) { bus.on(name, callback); },
    removeListener: function(callback) { bus.removeListener(name, callback); }
  };
}

var runtimes = {};

function ChromeRuntime() {

  // tab id is increased every second .connect()
  var counter = 0;
  var tabId = 1;

  //
  // chrome.runtime.Port
  //

  function Port(id, info, bus, myPrefix, otherPrefix) {
    // public properties
    this.name = info && info.name;
    if ('A' === myPrefix) { // on that will be passed to onConnect
      this.sender = { id: id, tab: { id: tabId } };
      if (counter++ & 1) { tabId++; }
      if ('dt' === this.name) { this.sender = {}; }  // developer tools
    }
    // disconnect
    this.disconnect = function() {
      setImmediate(bus.emit.bind(bus, otherPrefix + 'disconnect'));
    };
    this.onDisconnect = createEvent(bus, myPrefix + 'disconnect');
    // postMessage
    this.postMessage = function(msg) {
      // msg should be serializable (so that it can be passed accross process
      // boundaries). we create a deep copy of it using JSON, so that we know that
      // the message we pass is unique in each context we pass it into  (even if
      // we send the same message (or with the same deep references) over and over
      // again to multiple destinations).
      var _str = JSON.stringify({ data: msg });
      var _obj = JSON.parse(_str);
      setImmediate(bus.emit.bind(bus, otherPrefix + 'message', _obj.data));
    };
    this.onMessage = createEvent(bus, myPrefix + 'message');
  }


  // event dispatcher for chrome.runtime
  var server = new EE2();

  //
  // chrome.runtime.(connect/onConnect):
  //

  this.id = Math.floor(Math.random() * 10000000).toString();
  runtimes[this.id] = function(port) { // store connect invoker for external connections
    setImmediate(server.emit.bind(server, 'connectExternal', port));
  };

  this.onConnect = createEvent(server, 'connect');
  this.onConnectExternal = createEvent(server, 'connectExternal');

  this.connect = function() {
    // process args:
    var id = arguments[0], info = arguments[0];
    if (typeof(id) === 'string') { info = arguments[1]; }  // id provided
    else { id = undefined; } // id not provided
    // shared event bus for two communicating Ports
    var bus = new EE2();
    var portA = new Port(this.id, info, bus, 'A', 'B');
    var portB = new Port(id, info, bus, 'B', 'A');
    // let the port register onMessage --> setImmediate()
    if (id) {
      if (typeof(runtimes[id]) === 'function') {
        runtimes[id](portA);
      }
    }
    else {
      setImmediate(server.emit.bind(server, 'connect', portA));
    }
    return portB;
  };

  // for unit tests only
  this.__resetTabId = function(val) {
    tabId = val || 1;
    counter = 0;
  };
}


// exported
module.exports = ChromeRuntime;
