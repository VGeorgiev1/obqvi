const errorCodes = require('./errorCodes');

class RPCValidator {
  constructor (methods, db) { 
    this.errorCodes = errorCodes;
    this.methods = methods;
    this.db = db;
  }

  async validJSON (obj) {
    try {
      if (obj.jsonrpc !== '2.0' ||
          (typeof this.methods[obj.method] !== 'function') ||
          !obj.params.api_key ||
          (typeof obj.params !== 'object') ||
          (typeof obj.id !== 'number')) {
        return 'INVALID_REQUEST';
      } else {
        return 'OK';
      }
    } catch (e) {
      return 'PARSE_ERROR';
    }
  }

  validateParameters (obj) {
    try {
      const methodParams = this.methods[obj.method].params;
      if (this.methods[obj.method].strictArgs && (Object.keys(methodParams).length !== Object.keys(obj.params).length)) {
        return 'PARSE_ERROR';
      }
      const required = Object.keys(methodParams).filter(k => methodParams[k].required);
      for (const prop in obj.params) {
        if (!methodParams[prop]) {
          return 'INVALID_PARAMS';
        }
        const type = methodParams[prop].type;
        if (typeof obj.params[prop] === 'object' && type instanceof Object) {
          if (!(obj.params[prop] instanceof type)) {
            return 'INVALID_PARAMS';
          }
        } else {
          // eslint-disable-next-line valid-typeof
          if (typeof obj.params[prop] !== type) {
            return 'INVALID_PARAMS';
          }
        }
        if (methodParams[prop].required) {
          required.splice(required.indexOf(prop), 1);
        }
      }
      if (required.length === 0) {
        return 'OK';
      } else {
        return 'INVALID_PARAMS';
      }
    } catch (e) {
      console.log(e);
      return 'INTERNAL_ERROR';
    }
  }
}

module.exports = RPCValidator;
