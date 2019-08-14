const baseAssert = require('./baseAssert');

class UserAssert extends baseAssert {
  constructor () {
    super('User Assert');
  }
}

module.exports = new UserAssert();
