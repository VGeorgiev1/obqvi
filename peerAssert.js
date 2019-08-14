const baseAssert = require('./baseAssert');

class PeertAssert extends baseAssert {
  constructor () {
    super('Peer Assert');
  }
}

module.exports = new PeertAssert();
