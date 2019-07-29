
class RPCValidator {
  constructor (methods, dbManager) {
    this.errorCodes = [
      { error: { message: 'Parse error!', code: -32700 }, http_status: 500 },
      { error: { message: 'Invalid Request', code: -32600 }, http_status: 400 },
      { error: { message: 'Method not found!', code: -32601 }, http_status: 404 },
      { error: { message: 'Invalid params!', code: -32602 }, http_status: 500 },
      { error: { message: 'Internal error!', code: -32603 }, http_status: 500 },
      { message: 'Valid', http_status: 200 }
    ];
    this.methods = methods;
    this.dbManager = dbManager;
  }

  async validateJSON (obj) {
    try {
      JSON.stringify(obj);
      if (!obj.jsonrpc ||
                obj.jsonrpc !== '2.0' ||
                !obj.method ||
                !this.methods[obj.method] ||
                !obj.params ||
                !obj.params.api_key ||
                !obj.id) {
        return this.errorCodes[1];
      } else {
        return this.errorCodes[5];
      }
    } catch (e) {
      return this.errorCodes[0];
    }
  }

  async validateApiKey (apiKey) {
    try {
      const user = (await this.dbManager.getUserByAPI(apiKey));
      if (!user) {
        return this.errorCodes[1];
      }
      return user.id;
    } catch (e) {
      return this.errorCodes[4];
    }
  }

  validateParameters (obj) {
    try {
      const methodParams = this.methods[obj.method].params;
      if (this.methods[obj.method].strictArgs && (Object.keys(methodParams).length !== Object.keys(obj.params).length)) {
        return this.errorCodes[0];
      }
      const required = Object.keys(methodParams).filter(k => methodParams[k].required);
      for (const prop in obj.params) {
        if (!methodParams[prop]) {
          return this.errorCodes[3];
        }
        const type = methodParams[prop].type;
        if (typeof obj.params[prop] === 'object' && type instanceof Object) {
          if (!(obj.params[prop] instanceof type)) {
            return this.errorCodes[3];
          }
        } else {
          if (typeof obj.params[prop] !== type) {
            return this.errorCodes[3];
          }
        }
        if (methodParams[prop].required) {
          required.splice(required.indexOf(prop), 1);
        }
      }
      if (required.length === 0) {
        return this.errorCodes[5];
      } else {
        return this.errorCodes[3];
      }
    } catch (e) {
      console.log(e);

      return this.errorCodes[4];
    }
  }
}

module.exports = RPCValidator;
