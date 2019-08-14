const Validator = require('./rpc_validator');
const assert = require('./assert').assert;
const errorCodes = require('./errorCodes');
const crypto = require('crypto');

class RPC {
  constructor (db, promotion) {
    this.version = '2.0';
    this.db = db;
    this.promotion = promotion;
    assert(db != null, 'db instance is undefined');
    assert(promotion != null, 'promotion instance class is undefined');

    this.methods = {
      getClassified: {
        params: {
          classified_id: { type: 'string', required: true }
        },
        method: async (obj) => {
          assert(typeof db.getClassified === 'function');
          return db.getClassified(obj.classified_id);
        }
      },
      getMyClassifieds: {
        params: {
        },
        method: async (obj) => {
          return db.getUserClassfieds(obj.userId);
        }
      },
      createClassified: {
        params: {
          title: { type: 'string', required: true },
          description: { type: 'string', required: true },
          quantity: { type: 'number' },
          price: { type: 'number' },
          type: { type: 'string' },
          picture: { type: 'string' }
        },
        method: async (obj) => {
          assert(typeof db.createClassified === 'function');
          obj.picture = Buffer.from(obj.picture, 'base64');

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
          picture: { type: 'string' }
        },
        method: async (obj) => {
          assert(typeof db.updateClassified === 'function');

          obj.picture = Buffer.from(obj.picture, 'base64');
          obj.entityId = obj.classified_id;

          await db.updateClassified(obj);

          return 'Classified updated successful!';
        }
      },
      deleteClassified: {
        params: {
          classified_id: { type: 'string', required: true }
        },
        method: async (obj) => {
          assert(typeof db.deleteClassified === 'function');

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
          assert(typeof promotion.calcPromotion === 'function');

          return promotion.calcPromotion(obj);
        }
      },
      promoteClassified: {
        params: {
          date: { type: 'string', required: true },
          classifieds: { type: Array, required: true }
        },
        method: async (obj) => {
          assert(typeof promotion.createPromotion === 'function');

          const link = await promotion.createPromotion({ to: obj.date, keys: obj.classifieds, userId: obj.userId });
          return link;
        }
      }
    };
    this.validator = new Validator(this.methods, db);
  }

  async execute (obj) {
    try {
      const result = this.validator.validJSON(obj);

      if (errorCodes[result]) {
        return this.reject(errorCodes[result]);
      }

      const user = (await this.db.getUserByAPI({ apiKey: obj.params.api_key }));

      if (!user) {
        return this.reject(errorCodes['INVALID_REQUEST']);
      }

      const deffered = this.methods[obj.method].method;

      delete obj.params.api_key;
      const res = this.validator.validateParameters(obj);
      if (!res.error) {
        obj.params.userId = user.id;
        const result = await deffered(obj.params);
        return this.response({ id: obj.id, message: result, httpStatus: 200 });
      } else {
        return this.reject(errorCodes[res]);
      }
    } catch (e) {
      console.log(e);
      return this.reject(errorCodes['INTERNAL_ERROR']);
    }
  }

  reject (res) {
    return {
      response: {
        jsonrpc: this.version,
        error: { code: res.error.code, message: res.error.message },
        id: null
      },
      httpStatus: res.httpStatus
    };
  }

  response (res) {
    return {
      response: {
        jsonrpc: this.version,
        result: res.message,
        id: res.id
      },
      httpStatus: res.httpStatus
    };
  }
}

module.exports = RPC;
