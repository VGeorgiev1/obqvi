
class RPCValidator {
  constructor (methods, db) {
    this.errorCodes = {
      PARSE_ERR: { error: { message: 'Parse error!', code: -32700 }, http_status: 500 },
      INVALID_REQUEST: { error: { message: 'Invalid Request', code: -32600 }, http_status: 400 },
      METHOD_NOT_FOUND: { error: { message: 'Method not found!', code: -32601 }, http_status: 404 },
      INVALID_PARAMS: { error: { message: 'Invalid params!', code: -32602 }, http_status: 500 },
      INTERNAL_ERROR: { error: { message: 'Internal error!', code: -32603 }, http_status: 500 },
      OK: { message: 'Valid', http_status: 200 }
    };
    this.methods = methods;
    this.db = db;
  }

  async validateJSON (obj) {
    try {
      JSON.stringify(obj);
      if (obj.jsonrpc !== '2.0' ||
          !this.methods[obj.method] ||
          !obj.params ||
          !obj.params.api_key ||
          !obj.id ||
          (typeof obj.params !== 'object') ||
          (typeof obj.id !== 'number')) {
        return this.errorCodes['INVALID_REQUEST'];
      } else {
        return this.errorCodes['OK'];
      }
    } catch (e) {
      return this.errorCodes['PARSE_ERR'];
    }
  }

  async validateApiKey (apiKey) {
    try {
      const user = (await this.db.getUserByAPI(apiKey));
      
      if (!user) {
        return this.errorCodes['INVALID_REQUEST'];
      }
      return user.id;
    } catch (e) {
      return this.errorCodes['INTERNAL_ERROR'];
    }
  }

  validateParameters (obj) {
    try {
      const methodParams = this.methods[obj.method].params;
      if (this.methods[obj.method].strictArgs && (Object.keys(methodParams).length !== Object.keys(obj.params).length)) {
        return this.errorCodes['PARSE_ERR'];
      }
      const required = Object.keys(methodParams).filter(k => methodParams[k].required);
      for (const prop in obj.params) {
        if (!methodParams[prop]) {
          return this.errorCodes['INVALID_PARAMS'];
        }
        const type = methodParams[prop].type;
        if (typeof obj.params[prop] === 'object' && type instanceof Object) {
          if (!(obj.params[prop] instanceof type)) {
            return this.errorCodes['INVALID_PARAMS'];
          }
        } else {
          // eslint-disable-next-line valid-typeof
          if (typeof obj.params[prop] !== type) {
            return this.errorCodes['INVALID_PARAMS'];
          }
        }
        if (methodParams[prop].required) {
          required.splice(required.indexOf(prop), 1);
        }
      }
      if (required.length === 0) {
        return this.errorCodes['OK'];
      } else {
        return this.errorCodes['INVALID_PARAMS'];
      }
    } catch (e) {
      console.log(e);
      return this.errorCodes['INTERNAL_ERROR'];
    }
  }
}

module.exports = RPCValidator;
