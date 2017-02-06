// create handler module for given `context`.
// handles `random`, `randomAsync`, and `echo` commands.
// both `random` function log the invocation information to console and return
// random number 0 - 999. `randomAsync` returns the value with 15 second delay.
// `echo` function doesn't return anything, just logs the input parameter
// `what`.

function log(...args) {
  console.log(...args); // eslint-disable-line no-console
}

const handlers = {};

handlers.create = context => ({
  random: (done) => {
    log(`--->${context}::random() invoked`);
    const r = Math.floor(1000 * Math.random());
    log(`<--- returns: ${r}`);
    done(r);
  },
  randomAsync: (done) => {
    log(`--->${context}::randomAsync() invoked (15 sec delay)`);
    setTimeout(() => {
      const r = Math.floor(1000 * Math.random());
      log(`<--- returns: ${r}`);
      done(r);
    }, 15 * 1000);
  },
  echo: (what, done) => {
    log(`---> ${context}::echo("${what}") invoked`);
    log('<--- (no return value)');
    done();
  }
});

// for surpressing console.log output in unit tests:
handlers.__resetLog = () => { // eslint-disable-line no-underscore-dangle
  log = () => {}; // eslint-disable-line no-func-assign
};

export default handlers;
