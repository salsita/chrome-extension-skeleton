import assert from 'assert';
import handlers from './handlers';

let h;

// surpress console.log
handlers.__resetLog(); // eslint-disable-line no-underscore-dangle

describe('handlers module', () => {
  it('should export create() function', () => {
    assert.strictEqual(handlers && typeof handlers.create, 'function');
  });

  it('should create() handler object with 3 commands', () => {
    h = handlers.create('test');
    assert(typeof h === 'object');
    assert(Object.keys(h).length === 3);
    assert.deepEqual(['echo', 'random', 'randomAsync'], Object.keys(h).sort());
  });

  it('should "return" random number 0 - 999', () => {
    h.random((i) => {
      assert(typeof i === 'number');
      assert(i >= 0);
      assert(i <= 999);
    });
  });

  // randomAsync and echo commands not tested ... nothing interesting there
});
