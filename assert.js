const baseAssert = require('./baseAssert');

class Assert extends baseAssert {
  constructor () {
    super('Assert');
  }
}

module.exports = new Assert();
