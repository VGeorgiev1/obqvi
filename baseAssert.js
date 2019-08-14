class BaseAssert {
  constructor (name) {
    this.name = name;
  }

  assert (condition, message) {
    if (!condition) {
      throw new Error(message || this.name);
    }
  }

  deepEqual (actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || this.name);
    }
  }
}

module.exports = BaseAssert;
