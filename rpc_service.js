const Validator = require('./rpc_validator');

const crypto = require('crypto');

class RPC {
  constructor (db, promotion) {
    this.version = '2.0';
    this.db = db;
    this.promotion = promotion;
    this.methods = {
      getClassified: {
        params: {
          classified_id: { type: 'string', required: true }
        },
        method: async (obj) => {
          return db.getClassified(obj.classified_id);
        }
      },
      createClassified: {
        params: {
          title: { type: 'string', required: true },
          description: { type: 'string', required: true },
          quantity: { type: 'number' },
          price: { type: 'number' },
          picture: { type: Buffer }
        },
        method: async (obj) => {
          obj.entityId = crypto.randomBytes(10).toString('hex');
          return (await db.createClassified(obj)).entity_id;
        }
      },
      updateClassified: {
        params: {
          classified_id: { type: 'string', required: true },
          title: { type: 'string' },
          description: { type: 'string' },
          quantity: { type: 'number' },
          price: { type: 'number' },
          picture: { type: Buffer }
        },
        method: async (obj) => {
          obj.entityId = obj.classified_id;
          console.log(await db.updateClassified(obj));
          return 'Classified updated successful!';
        }
      },
      deleteClassified: {
        params: {
          classified_id: { type: 'string', required: true }
        },
        method: async (obj) => {
          const affectedRows = (await db.deleteClassified(obj.classified_id)).rowCount;
          if (affectedRows === 0) {
            return 'Classified already deleted!';
          }
          return 'Classified deleted successful!';
        }
      },
      calcPromotion: {
        params: {
          date: { type: 'string', required: true },
          classifieds: { type: 'number', required: true }
        },
        method: async (obj) => {
          return promotion.calcPromotion(obj);
        }
      },
      promoteClassified: {
        params: {
          date: { type: 'string', required: true },
          classifieds: { type: Array, required: true }
        },
        method: async (obj) => {
          const link = await promotion.createPromotion({ to: obj.date, keys: obj.classifieds, userId: obj.userId });
          return link;
        }
      }
    };
    this.validator = new Validator(this.methods, db);
  }

  async execute (obj) {
    const validJsonRes = this.validator.validateJSON(obj);
    if (validJsonRes.error) {
      return this.reject(validJsonRes);
    }
    const validApiKeyRes = await this.validator.validateApiKey(obj.params.api_key);

    if (validApiKeyRes.error) {
      return this.reject(validApiKeyRes);
    }

    const deffered = this.methods[obj.method].method;

    delete obj.params.api_key;
    const res = this.validator.validateParameters(obj);
    if (!res.error) {
      try {
        obj.params.userId = validApiKeyRes;
        const result = await deffered(obj.params);
        return this.response({ id: obj.id, message: result });
      } catch (e) {
        console.log(e.stack.split('\n'));
        return this.reject(this.validator.errorCodes[4]);
      }
    } else {
      return this.reject(res);
    }
  }

  reject (res) {
    return {
      jsonrpc: this.version,
      error: { code: res.error.code, message: res.error.message },
      id: null
    };
  }

  response (res) {
    return {
      jsonrpc: this.version,
      result: res.message,
      id: res.id
    };
  }
}

module.exports = RPC;
