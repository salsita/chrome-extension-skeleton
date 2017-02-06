//
// Extension messaging system.
//
//
// This module, when used, allows communication among any extension-related
// contexts (background script, content scripts, development tools scripts, any
// JS code running in extension-related HTML pages, such as popups, options,
// ...).
//
// To start using the system, one needs to invoke exported `init` function from
// background script (once), passing 'bg' as the name of the context, optionally
// providing message handling functions. This will install onConnect listener
// for incoming Port connections from all other context.
//
// Any other context (with arbitrary name and (optional) message handlers) also
// invokes the `init` function. In this case, Port is created and connected to
// background script.
//
// Note: due to bug https://code.google.com/p/chromium/issues/detail?id=356133
// we also have dedicated name for developer tools context: 'dt'. Once this bug
// is fixed, the only reserved context name will be 'bg' for background again.
//
// To avoid race conditions, make sure that your background script calls `init`
// function after it is started, so it doesn't miss any Port connections
// attempts.
//
// To be able to handle commands (or associated messages) in contexts (both
// background and non-background), one must pass message handling functions in
// `handlers` object when invoking respective `init` function for given context.
// The `handlers` object is a function lookup table, i.e. object with function
// names as its keys and functions (code) as corresponding values. The function
// will be invoked, when given context is requested to handle message
// representing command with name that can be found as a key of the `handlers`
// object. Its return value (passed in callback, see below) will be treated as
// value that should be passed back to the requestor.
//
// Each message handling function can take any number of parameters, but MUST
// take callback as its last argument and invoke this callback when the message
// handler is done with processing of the message (regardless if synchronous or
// asynchronous). The callback takes one argument, this argument is treated as
// return value of the message handler. The callback function MUST be invoked
// once and only once.
//
// The `init` function returns (for any context it is invoked in) messaging
// object with two function: `cmd` and `bcast`, both used for sending messages
// to different contexts (or same context in different windows / tabs).
//
// Both functions behave the same way and have also the same arguments, the only
// difference is that the `cmd` callback (its last argument, if provided) is
// invoked with only one response value from all collected responses, while to
// the `bcast` callback (if provided) we pass array with all valid responses we
// collected while broadcasting given request.
//
// `cmd` and `bcast` functions arguments:
//
// (optional) [int] tabId: if not specified, broadcasted to all tabs,
//      if specified, sent only to given tab, can use SAME_TAB value here
//      (exported from this module, too)
//
// (optional) [array] contexts: if not specified, broadcasted to all contexts,
//      if specified, sent only to listed contexts (context name is provided
//      as the first argument when invoking the `init` function)
//
// (required) [string] command: name of the command to be executed
//
// (optional) [any type] arguments: any number of aruments that follow command
//      name are passed to execution handler when it is invoked
//
// (optional) [function(result)] callback: if provided (as last argument to
//      `cmd` or `bcast`), this function will be invoked when the response(s)
//      is/are received
//
// The `cmd` and `bcast` functions return `true` if the processing of the
// request was successful (i.e. if all the arguments were recognized properly),
// otherwise it returns `false`.
//
// When `cmd` or `bcast` function is invoked from background context, a set of
// context instances, to which the message will be sent to, is created based on
// provided arguments (tab id and context names). The set is NOT filtered by
// provided command name, as background context doesn't know what message
// handlers are used in all the contexts (i.e. it doesn't know the function
// names in message handling lookup function tables of non-background contexts).
//
// When tab id or context names are NOT provided, the command is broadcasted to
// all possible context instances, which the background knows about, and that
// may require a lot of messaging... So for performance reasons it is wise to
// provide tab-id and / or context name(s) whenever possible to reduce the size
// of the context instances set as much as it gets.
//
// When message corresponding to command is then received in non-background
// context, the handler lookup table is checked if it contains handler for
// requested command name. If so, the handler is invokend and its "return value"
// (passed in callback, to allow asynchronous message handling) is then sent
// back to background. If there is no corresponding handler (for requested
// command name), message indicating that is sent back instead.
//
// When background collects all the responses back from all the context
// instances it sent the message to, it invokes the `cmd` or `bcast` callback,
// passing the response value(s). If there was no callback provided, the
// collected response values are simply dropped.
//
// When `cmd` or `bcast` function is invoked from non-background context, the
// request message is sent to background. Background then dispatches the request
// to all relevant context instances that match provided filters (again, based on
// passed tab id and / or context names), and dispatches the request in favor of
// the context instance that sent the original request to background. The
// dispatching logic is described above (i.e. it is the same as if the request
// was sent by background).
//
// There is one difference though: if background has corresponding handler for
// requested command name (and background context is not filtered out when
// creating the set of contexts), this handler is invoked (in background
// context) and the "return value" is also part of the collected set of
// responses.
//
// When all the processing in all the context instances (including background
// context, if applicable) is finished and responses are collected, the
// responses are sent back to the original context instance that initiated the
// message processing.
//
//
// EXAMPLE:
//
// background script:
// -----
//
// var msg = require('msg').init('bg', {
//   square: function(what, done) { done(what*what); }
// });
//
// setInterval(function() {
//   msg.bcast(/* ['ct'] */, 'ping', function(responses) {
//     console.log(responses);  // --->  ['pong','pong',...]
//   });
// }, 1000);  // broadcast 'ping' each second
//
//
// content script:
// -----
//
// var msg = require('msg').init('ct', {
//   ping: function(done) { done('pong'); }
// });
//
// msg.cmd(/* ['bg'] */, 'square', 5, function(res) {
//   console.log(res);  // ---> 25
// });
//
// ----------
//
// For convenient sending requests from non-background contexts to
// background-only (as this is most common case: non-bg context needs some info
// from background), there is one more function in the messaging object returned
// by the init() function. The function is called 'bg' and it prepends the list
// of passed arguments with ['bg'] array, so that means the reuqest is targeted
// to background-only. The 'bg' function does NOT take 'tabId' or 'contexts'
// parameters, the first argument must be the command name.
//
// EXAMPLE:
//
// background script
// -----
//
// ( ... as above ... )
//
// content script:
// -----
//
// var msg = require('msg').init('ct', {
//   ping: function(done) { done('pong'); }
// });
//
// msg.bg('square', 5, function(res) {
//   console.log(res);  // ---> 25
// });
//
// ----------
//
// There are two dedicated background handlers that, when provided in `handlers`
// object for `bg` context in `init` function, are invoked by the messaging
// system itself. These handlers are:
//
// + onConnect: function(contextName, tabId),
// + onDisconnect: function(contextName, tabId)
//
// These two special handlers, if provided, are invoked when new Port is
// connected (i.e. when `init` function is invoked in non-bg context), and
// then when they are closed (disconnected) later on. This notification system
// allows to maintain some state about connected contexts in extension
// backround.
//
// Please note that unlike all other handlers passed as the `handlers` object to
// `init` function, these two special handlers do NOT take callback as their
// last arguments. Any return value these handlers may return is ignored.
//
// The `contextName` parameter is value provided to non-background `init`
// function, while the `tabId` is provided by the browser. If tabId is not
// provided by the browser, the `tabId` will be `Infinity`.
//


// constant for "same tab as me"
const SAME_TAB = -1000;  // was -Infinity, but JSON.stringify() + JSON.parse() don't like that value

// run-time API:
// variable + exported function to change it, so it can be mocked in unit tests
/* global chrome */
const runtime = (typeof chrome === 'object') && chrome.runtime;
// the same for devtools API:
const devtools = (typeof chrome === 'object') && chrome.devtools;

// utility function for looping through object's own keys
// callback: function(key, value, obj) ... doesn't need to use all 3 parameters
// returns object with same keys as the callback was invoked on, values are the
//   callback returned values ... can be of course ignored by the caller, too
function forOwnProps(obj, callback) {
  if (typeof callback !== 'function') {
    return null;
  }
  const res = {};
  for (const key in obj) { // eslint-disable-line no-restricted-syntax
    if (obj.hasOwnProperty(key)) { // eslint-disable-line no-prototype-builtins
      res[key] = callback(key, obj[key], obj);
    }
  }
  return res;
}

// we wrap the whole module functionality into isolated scope, so that later we
// can instantiate multiple parallel scopes for unit testing.
// The module will still seem to hold singleton object, because we'll create
// this singleton and will export its methods as (whole) module methods.

function Messaging() {
  // handlers available in given context (function lookup table), set in `init()`
  // format:
  // {
  //   (string)<functioName>: (function)<code>,
  //   ...
  // }
  this.handlers = {};

  // id assigned by background, used in non-background contexts only
  // in background set to 'bg'
  this.id = null;

  // port used for communication with background (i.e. not used in background)
  // type: (chrome.runtime) Port
  this.port = null;

  // map of ports for connected extensions
  // key = extension id, value = port
  this.extPorts = {};

  // callback lookup table: if request waits for response, this table holds
  // the callback function that will be invoke upon response
  // format:
  // {
  //   (int)<requestId>: (function)<callback code>,
  //   ...
  // }
  this.cbTable = {};

  // background table of pending requests
  // format:
  // {
  //   (string)<portId>: [ { id: (int)<requestId>, cb: (function)<callback> }, ...],
  //   ...
  // }
  this.pendingReqs = {};

  // unique context id, used by background
  this.uId = 1;

  // request id, used by all contexts
  this.requestId = 1;

  // mapping non-background context names to objects indexed by name of the context
  // instances, holding { tab-id, (chrome.runtime.)Port } pairs,
  // used for message dispatching
  // format:
  // {
  //   (string)<category>: {
  //     (string)<id>: { tabId: (optional)<int>, port: <chrome.runtime.Port> },
  //     ...
  //   },
  //   ...
  // }
  // background-only variable
  this.portMap = {};

  // runetime and devtools references, so that we can change it in unit tests
  this.runtime = runtime;
  this.devtools = devtools;
}

// background function for selecting target ports to which we broadcast the request
// fromBg: is the request to collect targets from bacground, or based on message?
// targ*: filter for target ports
// src*: information about source port
// returns array of { port: (chrome.runtime.Port), id: (string) }
Messaging.prototype.selectTargets =
  function selectTargets(fromBg, targTabId, targCategories, srcCategory, srcPortId) {
    const res = [];
    // eslint-disable-next-line no-underscore-dangle
    const _port = this.portMap[srcCategory] && this.portMap[srcCategory][srcPortId];
    if (!fromBg && !_port) {
      // this should never happen, we just got request from this port!
      return [];
    }
    if (!fromBg && (targTabId === SAME_TAB)) {
      targTabId = _port.tabId; // eslint-disable-line no-param-reassign
    }
    // iterate through portMap, pick targets:
    forOwnProps(this.portMap, (categ, portGroup) => {
      if (targCategories && (targCategories.indexOf(categ) === -1)) {
        // we are interested only in specified contexts,
        // and this category is not on the list
        return;
      }
      forOwnProps(portGroup, (id, _ref) => {
        if (targTabId && (targTabId !== _ref.tabId)) {
          // we are interested in specified tab id,
          // and this id doesn't match
          return;
        }
        if (fromBg || (_port.port !== _ref.port)) {
          // do not ask me back, ask only different ports
          res.push({ port: _ref.port, id });
        }
      });
    });
    return res;
  };

// message handler (useb by both background and non-backound)
Messaging.prototype.onCustomMsg = function onCustomMsg(message) {
  /* eslint-disable no-underscore-dangle */
  let _port;
  let _arr;
  let _localHandler;
  let _ref;
  let i;
  /* eslint-enable */

  // helper functions:

  // send response on result (non-background):
  function sendResultCb(result) {
    if (message.sendResponse) {
      this.port.postMessage({
        cmd: 'response',
        portId: this.id,
        reqId: message.reqId,
        resultValid: true,
        result
      });
    }
  }

  // create callback waiting for N results, then send response (background):
  function createCbForMoreResults(N) {
    const results = [];
    const myId = this.runtime.id;
    return (result, resultValid) => {
      if (resultValid !== false) {  // can be either `true` or `undefined`
        results.push(result);
      }
      N -= 1; // eslint-disable-line no-param-reassign
      if (!N && message.sendResponse && // eslint-disable-line no-cond-assign
        (
          (_port = this.extPorts[message.extensionId]) ||
          (
            this.portMap[message.category] &&
            (_port = this.portMap[message.category][message.portId])
          )
        )
      ) {
        const response = {
          cmd: 'response',
          reqId: message.reqId,
          result: message.broadcast ? results : results[0]
        };

        if (message.extensionId) {
          response.extensionId = myId;
        }
        _port.port.postMessage(response);
      }
    }; // .bind(this);
  }

  // main message processing:
  if (!message || !message.cmd) {
    return;
  }
  if (message.cmd === 'setName') {
    this.id = message.name;
    return;
  }
  if (this.id === 'bg') {
    // background
    if (message.cmd === 'request') {
      const targetPorts = this.selectTargets(false, message.tabId, message.contexts,
                                           message.category, message.portId);
      let responsesNeeded = targetPorts.length;
      if ((message.tabId === undefined) &&
           (!message.contexts || (message.contexts.indexOf('bg') !== -1))) {
        // we are also interested in response from background itself
        if ( // eslint-disable-line no-cond-assign
          (_ref = this.handlers[message.cmdName]) &&
          (typeof _ref === 'function')
        ) {
          _localHandler = _ref;
          responsesNeeded += 1;
        }
      }
      if (!responsesNeeded) {
        // no one to answer that now
        if ( // eslint-disable-line no-cond-assign
          message.sendResponse &&
          (
            (_port = this.extPorts[message.extensionId]) ||
            (
              this.portMap[message.category] &&
              (_port = this.portMap[message.category][message.portId])
            )
          )
        ) {
          const response = {
            cmd: 'response',
            reqId: message.reqId,
            resultValid: false,
            result: message.broadcast ? [] : undefined
          };
          if (message.extensionId) {
            response.extensionId = this.runtime.id;
          }
          _port.port.postMessage(response);
        }
      } else {
        // some responses needed
        const cb = createCbForMoreResults.call(this, responsesNeeded);
        // send to target ports
        for (i = 0; i < targetPorts.length; i += 1) {
          _port = targetPorts[i];
          _port.port.postMessage({
            cmd: 'request',
            cmdName: message.cmdName,
            sendResponse: true,
            args: message.args,
            reqId: this.requestId
          });
          _arr = this.pendingReqs[_port.id] || [];
          _arr.push({ id: this.requestId, cb });
          this.pendingReqs[_port.id] = _arr;
          this.requestId += 1;
        }
        // get local response (if background can provide it)
        if (_localHandler) {
          message.args.push(cb);
          _localHandler.apply(this.handlers, message.args);
        }
      }
    } else if (message.cmd === 'response') {
      const id = message.portId || message.extensionId;
      _arr = this.pendingReqs[id];  // warning: IE creates a copy here!
      if (_arr) {
        // some results from given port expected, find the callback for reqId
        i = 0;
        while ((i < _arr.length) && (_arr[i].id !== message.reqId)) { i += 1; }
        if (i < _arr.length) {
          // callback found
          _arr[i].cb(message.result, message.resultValid);
          this.pendingReqs[id].splice(i, 1);   // need to use orig array (IE problem)
          if (!this.pendingReqs[id].length) {  // ... same here
            delete this.pendingReqs[id];
          }
        }
      }
    } else if (message.cmd === 'updateTabId') {
      const context = message.context;
      const portId = message.portId;
      if ( // eslint-disable-line no-cond-assign
        (_port = this.portMap[context]) &&
        (_port = _port[portId])
      ) {
        if (typeof this.handlers.onDisconnect === 'function') {
          this.handlers.onDisconnect(context, _port.tabId);
        }
        _port.tabId = message.tabId;
        if (typeof this.handlers.onConnect === 'function') {
          this.handlers.onConnect(context, _port.tabId);
        }
      }
    }
  } else if (message.cmd === 'request') { // non-background
    _localHandler = this.handlers[message.cmdName];
    if (typeof _localHandler !== 'function') {
      if (message.sendResponse) {
        this.port.postMessage({
          cmd: 'response',
          portId: this.id,
          reqId: message.reqId,
          resultValid: false
        });
      }
    } else {
      message.args.push(sendResultCb.bind(this));
      _localHandler.apply(this.handlers, message.args);
    }
  } else if (message.cmd === 'response') {
    if (this.cbTable[message.reqId]) {
      this.cbTable[message.reqId](message.result);
      delete this.cbTable[message.reqId];
    }
  }
};

// invoke callbacks for pending requests and remove the requests from the structure
Messaging.prototype.closePendingReqs = function closePendingReqs(portId) {
  let arr;
  if (arr = this.pendingReqs[portId]) { // eslint-disable-line no-cond-assign
    for (let i = 0; i < arr.length; i += 1) {
      arr[i].cb(undefined, false);
    }
    delete this.pendingReqs[portId];
  }
};

Messaging.prototype.registerExternalConnection = function regExternalConnection(extensionId, port) {
  this.extPorts[extensionId] = { port };

  let onCustomMsg;
  let onDisconnect;

  // on disconnect: remove listeners and delete from port map
  function onDisconnectFn() {
    // listeners:
    port.onDisconnect.removeListener(onDisconnect);
    port.onMessage.removeListener(onCustomMsg);
    delete this.extPorts[extensionId];
    // close all pending requests:
    this.closePendingReqs(extensionId);
    // invoke custom onDisconnect handler
    if (typeof this.handlers.onExtensionDisconnect === 'function') {
      this.handlers.onExtensionDisconnect(extensionId);
    }
  }

  // install port handlers
  port.onMessage.addListener(onCustomMsg = this.onCustomMsg.bind(this));
  port.onDisconnect.addListener(onDisconnect = onDisconnectFn.bind(this));
  // invoke custom onConnect handler
  if (typeof this.handlers.onExtensionConnect === 'function') {
    this.handlers.onExtensionConnect(extensionId);
  }
};

Messaging.prototype.onConnectExternal = function onConnectExternal(port) {
  if (this.extPorts[port.sender.id]) {
    return;
  }

  this.registerExternalConnection(port.sender.id, port);
};

// backround onConnect handler
Messaging.prototype.onConnect = function onConnect(port) {
  // add to port map
  const categName = port.name || 'unknown';
  const portId = `${categName}-${this.uId}`;
  this.uId += 1;
  let portCateg = this.portMap[categName] || {};
  let tabId = (port.sender && port.sender.tab && port.sender.tab.id) || Infinity;
  portCateg[portId] = { port, tabId };
  this.portMap[categName] = portCateg;
  let onCustomMsg;
  let onDisconnect;
  // on disconnect: remove listeners and delete from port map
  function onDisconnectFn() {
    // listeners:
    port.onDisconnect.removeListener(onDisconnect);
    port.onMessage.removeListener(onCustomMsg);
    // port map:
    portCateg = this.portMap[categName];
    let _port; // eslint-disable-line no-underscore-dangle
    if (portCateg && (_port = portCateg[portId])) { // eslint-disable-line no-cond-assign
      tabId = _port.tabId;
      delete portCateg[portId];
    }
    // close all pending requests:
    this.closePendingReqs(portId);
    // invoke custom onDisconnect handler
    if (typeof this.handlers.onDisconnect === 'function') {
      this.handlers.onDisconnect(categName, tabId);
    }
  }
  // install port handlers
  port.onMessage.addListener(onCustomMsg = this.onCustomMsg.bind(this));
  port.onDisconnect.addListener(onDisconnect = onDisconnectFn.bind(this));
  // ask counter part to set its id
  port.postMessage({ cmd: 'setName', name: portId });
  // invoke custom onConnect handler
  if (typeof this.handlers.onConnect === 'function') {
    this.handlers.onConnect(categName, tabId);
  }
};

// create main messaging object, hiding all the complexity from the user
// it takes name of local context `myContextName`
//
// the returned object has two main functions: cmd and bcast
//
// they behave the same way and have also the same arguments, the only
// difference is that to `cmd` callback (if provided) is invoked with only one
// response value from all possible responses, while to `bcast` callback (if
// provided) we pass array with all valid responses we collected while
// broadcasting given request.
//
// functions arguments:
//
// (optional) [int] tabId: if not specified, broadcasted to all tabs,
//      if specified, sent only to given tab, can use SAME_TAB value here
//
// (optional) [array] contexts: if not specified, broadcasted to all contexts,
//      if specified, sent only to listed contexts
//
// (required) [string] command: name of the command to be executed
//
// (optional) [any type] arguments: any number of aruments that follow command
//      name are passed to execution handler when it is invoked
//
// (optional) [function(result)] callback: if provided (as last argument to
//      `cmd` or `bcast`) this function will be invoked when the response(s)
//      is/are received
//
// the functions return `true` if the processing of the request was successful
// (i.e. if all the arguments were recognized properly), otherwise it returns
// `false`.
//
// for non-bg contexts there is one more function in the messaging object
// available: 'bg' function, that is the same as 'cmd', but prepends the list of
// arguments with ['bg'], so that the user doesn't have to write it when
// requesting some info in non-bg context from background.
//
Messaging.prototype.createMsgObject = function createMsgObject(myContextName) {
  // generator for functions `cmd` and `bcast`
  function createFn(broadcast) {
    // helper function for invoking provided callback in background
    function createCbForMoreResults(N, callback) {
      const results = [];
      return (result, resultValid) => {
        if (resultValid) {
          results.push(result);
        }
        N -= 1; // eslint-disable-line no-param-reassign
        if ((N <= 0) && callback) {
          callback(broadcast ? results : results[0]);
        }
      };
    }
    // generated function:
    return function _msg() {
      // process arguments:
      if (!arguments.length) {
        // at least command name must be provided
        return false;
      }
      if (!this.id) {
        // since we learn our id of non-background context in asynchronous
        // message, we may need to wait for it...
        const _ctx = this;
        const _args = arguments;
        setTimeout(() => { _msg.apply(_ctx, _args); }, 1);
        return true;
      }
      let tabId;
      let contexts;
      let cmdName;
      const args = [];
      let callback;
      let curArg = 0;
      let argsLimit = arguments.length;
      // check if we have callback:
      if (typeof arguments[argsLimit - 1] === 'function') {
        argsLimit -= 1;
        callback = arguments[argsLimit];
      }
      // other arguments:
      while (curArg < argsLimit) {
        const arg = arguments[curArg];
        curArg += 1;
        if (cmdName !== undefined) {
          args.push(arg);
        } else {
          // we don't have command name yet...
          switch (typeof (arg)) {
            // tab id
            case 'number':
              if (tabId !== undefined) {
                return false; // we already have tab id --> invalid args
              }
              tabId = arg;
              break;
            // contexts  (array)
            case 'object':
              if ((typeof (arg.length) === 'undefined') || (contexts !== undefined)) {
                return false; // we either have it, or it is not array-like object
              }
              contexts = arg;
              break;
            // command name
            case 'string':
              cmdName = arg;
              break;
            // anything else --> error
            default:
              return false;
          }
        }
      }
      if (cmdName === undefined) {
        return false; // command name is mandatory
      }
      // store the callback and issue the request (message)
      if ('bg' === this.id) {
        const targetPorts = this.selectTargets(true, tabId, contexts);
        const responsesNeeded = targetPorts.length;
        const cb = createCbForMoreResults.call(this, responsesNeeded, callback);
        // send to target ports
        for (let i = 0; i < targetPorts.length; i += 1) {
          const _port = targetPorts[i];
          _port.port.postMessage({
            cmd: 'request',
            cmdName,
            sendResponse: true,
            args,
            reqId: this.requestId
          });
          const _arr = this.pendingReqs[_port.id] || [];
          _arr.push({ id: this.requestId, cb });
          this.pendingReqs[_port.id] = _arr;
          this.requestId += 1;
        }
        if (!targetPorts.length) {
          // no one to respond, invoke the callback (if provided) right away
          cb(null, false);
        }
      } else {
        if (callback) {
          this.cbTable[this.requestId] = callback;
        }
        this.port.postMessage({
          cmd: 'request',
          cmdName,
          reqId: this.requestId,
          sendResponse: (callback !== undefined),
          broadcast,
          category: myContextName,
          portId: this.id,
          tabId,
          contexts,
          args
        });
        this.requestId += 1;
      }
      // everything went OK
      return true;
    }.bind(this);
  }

  function createCmdExtFn() {
    return function _msg(extensionId, commandName) {
      // process arguments:
      if (arguments.length < 2) {
        // at least extension id and command name must be provided
        return false;
      }

      if (this.id !== 'bg') {
        return false; // only background can send messagess to another extensions
      }

      const args = Array.prototype.slice.call(arguments, 2);
      let callback;
      if (typeof (args[args.length - 1]) === 'function') {
        callback = args.pop();
      }

      const _port = this.extPorts[extensionId];
      if (!_port) {
        // no one to respond, invoke the callback (if provided) right away
        if (callback) { callback(); }

        return true;
      }

      _port.port.postMessage({
        cmd: 'request',
        cmdName: commandName,
        sendResponse: true,
        args,
        reqId: this.requestId,
        extensionId: this.runtime.id
      });

      const _arr = this.pendingReqs[extensionId] || [];
      _arr.push({ id: this.requestId,
        cb(result/* , resultValid/**/) { // ignore 'resultValid' because it is not applicable here
          if (callback) { callback(result); }
        }
      });
      this.pendingReqs[extensionId] = _arr;
      this.requestId += 1;

      // everything went OK
      return true;
    }.bind(this);
  }

  // returned object:
  const res = {
    cmd: createFn.call(this, false),
    bcast: createFn.call(this, true)
  };

  // for more convenience (when sending request from non-bg to background only)
  // adding 'bg(<cmdName>, ...)' function, that is equivalent to "cmd(['bg'], <cmdName>, ...)"
  if (myContextName !== 'bg') {
    res.bg = function bg() {
      if (0 === arguments.length || 'string' !== typeof (arguments[0])) {
        return false;
      }
      const args = [['bg']];
      for (let i = 0; i < arguments.length; i += 1) { args.push(arguments[i]); }
      return res.cmd(...args);
    };
  } else {
    res.connectExt = function connectExt(id) {
      if (this.extPorts[id]) { // already connected
        return true;
      }
      const port = this.runtime.connect(id);
      this.registerExternalConnection(id, port);
      return undefined;
    }.bind(this);
    res.cmdExt = createCmdExtFn.call(this);
  }

  return res;
};

// init function, exported
//
// takes mandatory `context`, it is any string (e.g. 'ct', 'popup', ...),
// only one value is of special meaning: 'bg' ... must be used for initializing
// of the background part, any other context is considered non-background
//
// optionally takes `handlers`, which is object mapping function names to
// function codes, that is used as function lookup table. each message handling
// function MUST take callback as its last argument and invoke this callback
// when the message handler is done with processing of the message (regardless
// if synchronous or asynchronous). the callback takes one argument, this
// argument is treated as return value of the message handler.
//
// for background (`context` is 'bg'): installs onConnect listener
// for non-background context it connects to background
//
Messaging.prototype.init = function init(context, handlers) {
  // set message handlers (optional)
  this.handlers = handlers || {};

  // listener references
  let onDisconnect;
  let onCustomMsg;

  // helper function:
  function onDisconnectFn() {
    this.port.onDisconnect.removeListener(onDisconnect);
    this.port.onMessage.removeListener(onCustomMsg);
  }

  let tabId;
  function updateTabId() {
    if (!this.id) {
      setTimeout(updateTabId.bind(this), 1);
      return;
    }
    this.port.postMessage({
      cmd: 'updateTabId',
      context,
      portId: this.id,
      tabId
    });
  }

  if (context === 'bg') {
    // background
    this.id = 'bg';
    this.runtime.onConnect.addListener(this.onConnect.bind(this));
    this.runtime.onConnectExternal.addListener(this.onConnectExternal.bind(this));
  } else {
    // anything else than background
    this.port = this.runtime.connect({ name: context });
    this.port.onMessage.addListener(onCustomMsg = this.onCustomMsg.bind(this));
    this.port.onDisconnect.addListener(onDisconnect = onDisconnectFn.bind(this));
    // tabId update for developer tools
    // unfortunately we need dedicated name for developer tools context, due to
    // this bug: https://code.google.com/p/chromium/issues/detail?id=356133
    // ... we are not able to tell if we are in DT context otherwise :(
    if ( // eslint-disable-line no-cond-assign
      (context === 'dt') && this.devtools &&
      (tabId = this.devtools.inspectedWindow) &&
         (typeof (tabId = tabId.tabId) === 'number')
    ) {
      updateTabId.call(this);
    }
  }

  return this.createMsgObject(context);
};


// singleton representing this module
const singleton = new Messaging();

// helper function to install methods used for unit tests
function installUnitTestMethods(target, delegate) {
  /* eslint-disable no-underscore-dangle, no-param-reassign */
  // setters
  target.__setRuntime = (rt) => { delegate.runtime = rt; return target; };
  target.__setDevTools = (dt) => { delegate.devtools = dt; return target; };
  // getters
  target.__getId = () => delegate.id;
  target.__getPort = () => delegate.port;
  target.__getPortMap = () => delegate.portMap;
  target.__getHandlers = () => delegate.handlers;
  target.__getPendingReqs = () => delegate.pendingReqs;
  /* eslint-enable */
}

export default {
  // same tab id
  SAME_TAB,
  // see description for init function above
  init: singleton.init.bind(singleton),
  // --- for unit tests ---
  // allow unit testing of the main module:
  __allowUnitTests() { installUnitTestMethods(this, singleton); },
  // context cloning
  __createClone() {
    const clone = new Messaging();
    clone.SAME_TAB = SAME_TAB;
    installUnitTestMethods(clone, clone);
    return clone;
  }
};
