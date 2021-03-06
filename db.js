const Pool = require('pg').Pool;
const bcrypt = require('bcrypt');
const saltRounds = 10;
class Db {
  constructor (errorHandler) {
    this.pool = new Pool();
    this.errorHandler = errorHandler;
    for (const fn of Object.getOwnPropertyNames(Db.prototype).filter(f => f !== 'constructor' && f !== 'tx')) {
      const deffered = this[fn].bind(this);

      this[fn] = async (obj) => {
        if (!obj) {
          obj = { client: await this.pool.connect() };
        }
        if (!obj.client) {
          obj.client = await this.pool.connect();
          try {
            return await deffered(obj);
          } finally {
            obj.client.release();
          }
        }
        return (await deffered(obj));
      };
    }
  }

  async tx (callback, errorback) {
    const client = await this.pool.connect();

    await client.query('BEGIN');
    try {
      await callback(client);
      client.query('COMMIT');
    } catch (e) {
      console.log(e);
      client.query('ROLLBACK');
      errorback(e);
    }
  }

  async createUser ({ client, username, password, email, gender, apiKey }) {
    const hash = await bcrypt.hash(password, saltRounds);
    return client.query(/* sql */`
      INSERT INTO users(username, password, email, gender, api_key) VALUES($1,$2,$3,$4,$5);
      `, [username, hash, email, gender, apiKey]);
  }

  async createPromotion ({ client, transactionId, classifiedId, to, status }) {
    return client.query(/* sql */`
      INSERT INTO promotions(transaction_id,classified_entity,end_date, status)
      VALUES($1,$2,TO_TIMESTAMP($3, 'MM/DD/YYYY'),$4);
    `, [transactionId, classifiedId, to, status]);
  }

  async getUserClassfieds ({ client, userId }) {
    return (await client.query(/* sql */`
      SELECT *
      FROM classifieds as cl
      LEFT JOIN promotions as p ON p.classified_entity = cl.entity_id
      WHERE creator_id = $1 AND cl.closed_at IS NULL;
      `, [userId])).rows;
  }

  async getUser ({ client, userId }) {
    return (await client.query(/* sql */`
      SELECT * FROM users 
      WHERE id = $1; 
    `, [userId])).rows[0];
  }

  async getShipments ({ client, userId }) {
    return (await client.query(/* sql */`
      SELECT 
        c.title,
        c.entity_id,
        up.transaction_id, 
        up.quantity, 
        up.amount
      FROM user_transactions as ut
      INNER JOIN user_payments as up ON ut.user_payment_id = up.id
      INNER JOIN classifieds as c ON c.entity_id = up.classified_entity
      WHERE ut.recipant = $1 
        AND ut.state = 'order_placed'
    `, [userId])).rows;
  }

  async authenticateUser ({ client, username, password }) {
    const res = await client.query(/* sql */`
      SELECT * 
      FROM users 
      WHERE username = $1
    `, [username]);

    if (!res.rows[0]) {
      return { authenticated: false, message: 'Wrong username!' };
    }

    const equal = await bcrypt.compare(password, res.rows[0].password);

    if (!equal) {
      return { authenticated: false, message: 'Wrong password!' };
    }

    return ({ authenticated: true, message: '', user: res.rows[0] });
  }

  async getTransaction ({ client, transactionId }) {
    return client.query(/* sql */`

      SELECT * 
      FROM promotion_transactions
      WHERE transaction_id = $1

    `, [transactionId]);
  }

  async createTransaction ({ client, transactionId, state, userId, amount }) {
    return client.query(/* sql */`
      INSERT INTO promotion_transactions(transaction_id, state, sender, amount) VALUES($1,$2,$3,$4)
    `, [transactionId, state, userId, amount]);
  }

  async prepareTransaction ({ client, paymentId, token, PayerID }) {
    return client.query(/* sql */`
      
      UPDATE promotion_transactions
      SET payer_id = $1,
        token = $2
      WHERE transaction_id = $3

    `, [PayerID, token, paymentId]);
  }

  async setTransactionState ({ client, transactionId, state }) {
    return client.query(/* sql */`
      UPDATE promotion_transactions
      SET state = $2
      WHERE transaction_id = $1
    `, [transactionId, state]);
  }

  async closeClassified ({ client, entityId }) {
    return client.query(/* sql */`
      UPDATE classifieds SET closed_at = NOW()
      WHERE entity_id = $1
    `, [entityId]);
  }

  async setPromotionStatus ({ client, transactionId, state }) {
    return client.query(/* sql */`
      UPDATE promotions
      SET status = $1
      WHERE transaction_id = $2
    `, [state, transactionId]);
  }

  async getPromotions ({ client, transactionId }) {
    return (await client.query(/* sql */`
      SELECT * FROM promotions as p
      INNER JOIN classifieds as c on c.entity_id = p.classified_entity 
      WHERE transaction_id = $1
    `, [transactionId])).rows;
  }

  async findTransaction ({ client, transactionId }) {
    return (await client.query(/* sql */`
      SELECT * FROM promotion_transactions
      WHERE transaction_id = $1
    `, [transactionId])).rows[0];
  }

  async findUserPayment ({ client, transactionId }) {
    return (await client.query(/* sql */`
      SELECT * 
      FROM user_payments
      WHERE transaction_id = $1
    `, [transactionId])).rows[0];
  }

  async getSession ({ client, secret }) {
    return (await client.query(/* sql */`
      SELECT * FROM sessions WHERE SECRET = $1 AND logged = TRUE;
    `, [secret])).rows[0];
  }

  async login ({ client, userId, secret }) {
    return client.query(/* sql */`
      INSERT INTO sessions (user_id, secret) VALUES($1, $2) ON CONFLICT (user_id)
      DO UPDATE
      SET logged = TRUE,
      secret = $2;
    `, [userId, secret]);
  }

  async getUserByAPI ({ client, apiKey }) {
    return (await client.query(/* sql */`
      SELECT id FROM users 
      WHERE api_key = $1; 
    `, [apiKey])).rows[0];
  }

  async logout ({ client, secret }) {
    return client(/* sql */`
      UPDATE Session
      SET logged = false
      WHERE secret = $1
    `, [secret]);
  }

  async getJoinedClassified ({ client, entityId }) {
    return (await client.query(/* sql */`
      SELECT 
      cl.price,
      cl.creator_id,
      cl.entity_id,
      cl.title, 
      cl.description, 
      cl.quantity, 
      cl.created_at as classified_date, 
      c.created_at as comment_date, 
      c.body,
      c.user_id,
      u.username,
      cl.picture 
      FROM classifieds cl
      LEFT JOIN comments c on c.classified_entity = cl.entity_id
      LEFT JOIN users as u ON u.id = c.user_id
      WHERE cl.entity_id = $1 AND closed_at IS NULL
    `, [entityId])).rows;
  }

  async getClassifiedsByType ({ client, type, offset, limit }) {
    return (await client.query(/* sql */`
      SELECT COUNT(*) OVER (), c.*, u.*, p.status as st FROM classifieds c
      LEFT JOIN promotions as p ON p.classified_entity = c.entity_id
      INNER JOIN users u ON u.id = c.creator_id
      WHERE type = $1 AND c.closed_at IS NULL
      LIMIT $3 OFFSET $2
    `, [type, offset, limit])).rows;
  }

  async getClassified ({ client, entityId }) {
    return (await client.query(/* sql */`
      SELECT * FROM classifieds cl
      WHERE entity_id = $1 AND closed_at IS NULL
    `, [entityId])).rows[0];
  }

  async createComment ({ client, userId, classifiedsEntity, body }) {
    return client.query(/* sql */`
      INSERT INTO comments(user_id,classified_entity, body)
      VALUES($1,$2,$3)
    `, [userId, classifiedsEntity, body]);
  }

  async createClassified ({ client, title, entityId, userId, description, picture, price, quantity, type }) {
    // eslint-disable-next-line no-return-await
    return (await client.query(/* sql */`
      INSERT INTO classifieds (title,creator_id,description,picture,price,quantity, entity_id, type)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING entity_id
    `, [title, userId, description, picture, price, quantity, entityId, type])).rows[0];
  }

  async updateClassified ({ client, entityId, title, description, price, quantity, type, picture, userId }) {
    return client.query(/* sql */`
      UPDATE classifieds SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        price = COALESCE($4, price),
        quantity = COALESCE($5, quantity),
        picture = COALESCE($6, picture),
        type = COALESCE($7, type)
      WHERE entity_id = $1 AND creator_id = $8;
    `, [entityId, title, description, price, quantity, picture, type, userId]);
  }

  async deleteClassified ({ client, entityId }) {
    return client.query(/* sql */`
      UPDATE classifieds SET
        closed_at = NOW()
      WHERE entity_id = $1 AND closed_at IS NULL
    `, [entityId]);
  }

  async getUserSenderTransactions ({ client, userId }) {
    return (await client.query(/* sql */`
      SELECT * FROM user_transactions as ut
      INNER JOIN user_payments as up ON up.id = ut.user_payment_id
      INNER JOIN users as u ON up.sender = u.id
      WHERE ut.sender = $1
    `, [userId])).rows;
  }

  async getUserRecipantTransactions ({ client, userId }) {
    return (await client.query(/* sql */`
      SELECT * FROM user_transactions as ut
      INNER JOIN user_payments as up ON up.id = ut.user_payment_id
      INNER JOIN users as u ON up.recipant = u.id
      WHERE ut.recipant = $1
    `, [userId])).rows;
  }

  async getPromotionTransactions ({ client, userId }) {
    return (await client.query(/* sql */`
    SELECT * FROM promotion_transactions as pt
    INNER JOIN promotions as p ON p.transaction_id = pt.transaction_id
    WHERE sender = $1
  `, [userId])).rows;
  }

  async getPromotedClassifieds ({ client, offset, limit }) {
    return (await client.query(/* sql */`
      SELECT DISTINCT 
      c.entity_id,
      c.created_at,
      u.id,
      c.title,
      c.description,
      c.picture,
      c.quantity,
      u.username,
      u.email,
      p.status,
      c.price
      FROM classifieds as c
      INNER JOIN users u ON u.id = c.creator_id
      INNER JOIN promotions p ON p.classified_entity = c.entity_id
      WHERE c.closed_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $1
    `, [offset, limit])).rows;
  }

  async getClassifiedCount ({ client }) {
    return (await client.query(/* sql */`
      SELECT COUNT(*) FROM classifieds;
    `)).rows[0].count;
  }

  async getPayment ({ client, transactionId, userId }) {
    return (await client.query(/* sql */`
      SELECT 
      up.id, 
      up.transaction_id,
      c.quantity,
      up.quantity as order_quantity,
      up.classified_entity
      FROM user_payments as up
      INNER JOIN user_transactions ut ON up.id = ut.user_payment_id
      INNER JOIN classifieds c ON c.entity_id = up.classified_entity
      WHERE up.transaction_id = $1 AND ut.recipant = $2;
    `, [transactionId, userId])).rows[0];
  }

  async prepareUserPayment ({ client, paymentId, token, PayerID }) {
    return (await client.query(/* sql */`
      UPDATE user_payments
      SET token = $2,
        payer_id = $3
      WHERE transaction_id = $1
      RETURNING id
    `, [paymentId, token, PayerID])).rows[0];
  }

  async setUserTransactionState ({ client, id, state }) {
    return client.query(/* sql */`
      UPDATE user_transactions
      SET state = $2
      WHERE user_payment_id = $1;
    `, [id, state]);
  }

  async createUserTransaction ({ client, userPaymentId, from, to, state, amount }) {
    return client.query(/* sql */`
      INSERT INTO user_transactions(user_payment_id,sender,recipant,state,amount)
      VALUES($1,$2,$3,$4,$5)
    `, [userPaymentId, from, to, state, amount]);
  }

  async createPayout ({ client, transactionId, amount, userId }) {
    return client.query(/* sql */`
      INSERT INTO user_payouts(transaction_id, recipiant, amount) VALUES ($1,$2,$3)
    `, [transactionId, userId, amount]);
  }

  async createPayment ({ client, transactionId, from, state, amount, quantity, entityId }) {
    return (await client.query(/* sql */`
      INSERT INTO user_payments(transaction_id,sender,state,amount, quantity, classified_entity)
      VALUES($1,$2,$3,$4,$5,$6)
      RETURNING id
    `, [transactionId, from, state, amount, quantity, entityId])).rows[0];
  }

  async setQuantity ({ client, entityId, quantity }) {
    return client.query(/* sql */`
      UPDATE classifieds
      SET quantity = $2
      WHERE entity_id = $1;
    `, [entityId, quantity]);
  }

  async setPaymentState ({ client, transactionId, state }) {
    return (await client.query(/* sql */`
      UPDATE user_payments
      SET state = $2
      WHERE transaction_id = $1
      RETURNING id
  `, [transactionId, state])).rows[0].id;
  }

  async stopSession ({ client, userId }) {
    return client.query(/* sql */`
      UPDATE sessions
      SET logged = false
      WHERE user_id = $1
    `, [userId]);
  }

  async createIndexes ({ client }) {
    return client.query(/* sql */`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS trgm_idx
      ON classifieds
      USING gin (type gin_trgm_ops);
    `);
  }

  async createTables ({ client }) {
    return client.query(/* sql */ `
      BEGIN;
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username text,
        password text,
        email text UNIQUE,
        gender text,
        api_key text UNIQUE,
        created_at timestamp DEFAULT NOW(),
        deleted_at timestamp DEFAULT NULL
      );
      CREATE TABLE IF NOT EXISTS classifieds (
        id SERIAL PRIMARY KEY,
        entity_id text UNIQUE,
        creator_id int NOT NULL REFERENCES users (id),
        title text,
        description text,
        picture bytea,
        status text DEFAULT 'open',
        price NUMERIC,
        quantity int,
        type text,
        created_at date DEFAULT NOW(),
        closed_at date DEFAULT NULL
      );
      
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        user_id int NOT NULL REFERENCES users (id),
        classified_entity text NOT NULL REFERENCES classifieds (entity_id),
        body text,
        created_at timestamp DEFAULT NOW(),
        deleted timestamp DEFAULT null 
      );
      
      CREATE TABLE IF NOT EXISTS promotion_transactions (
        id SERIAL PRIMARY KEY,
        transaction_id TEXT UNIQUE NOT NULL,
        state TEXT NOT NULL,
        sender int NOT NULL REFERENCES users (id),
        created_at timestamp DEFAULT NOW(),
        payer_id TEXT,
        token TEXT,
        amount NUMERIC NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_transactions(
        id SERIAL PRIMARY KEY,
        sender int NOT NULL REFERENCES users (id),
        recipant int NOT NULL REFERENCES users (id),
        approved_at timestamp DEFAULT NULL,
        state TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        user_payment_id int,
        user_payout_id int,
        created_at timestamp DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS user_payments(
        id SERIAL PRIMARY KEY,
        transaction_id TEXT UNIQUE NOT NULL,
        state TEXT NOT NULL,
        sender int NOT NULL REFERENCES users (id),
        created_at timestamp DEFAULT NOW(),
        payer_id TEXT,
        token TEXT,
        amount NUMERIC NOT NULL,
        quantity int NOT NULL,
        classified_entity TEXT REFERENCES classifieds (entity_id)
      );
      CREATE TABLE IF NOT EXISTS user_payouts(
        id SERIAL PRIMARY KEY,
        transaction_id TEXT UNIQUE NOT NULL,
        state TEXT NOT NULL,
        recipiant int NOT NULL REFERENCES users (id),
        created_at timestamp DEFAULT NOW(),
        amount NUMERIC NOT NULL
      );
      CREATE TABLE IF NOT EXISTS accounts(
        id SERIAL PRIMARY KEY,
        user_id int REFERENCES users (id),
        account_number text NOT NULL,
        created_at timestamp DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS promotions(
        id SERIAL PRIMARY KEY,
        transaction_id TEXT REFERENCES  promotion_transactions(transaction_id),
        classified_entity text  REFERENCES classifieds(entity_id),
        start_date timestamp DEFAULT NOW(),
        end_date timestamp NOT NULL,
        status TEXT
      );
      CREATE TABLE IF NOT EXISTS operations (
        id SERIAL PRIMARY KEY,
        action text
      );
      
      CREATE TABLE IF NOT EXISTS recources  (
        id SERIAL PRIMARY KEY,
        name text
      );
      
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name text,
        opertionId int NOT NULL UNIQUE REFERENCES operations (id),
        resourceId int NOT NULL UNIQUE REFERENCES recources (id)
      );
      
      CREATE TABLE IF NOT EXISTS personels ( 
        id SERIAL PRIMARY KEY,
        username text,
        email text,
        created_at timestamp DEFAULT NOW(),
        deleted_at timestamp DEFAULT NULL,
        roleId int NOT NULL REFERENCES roles (id)
      );
      CREATE TABLE IF NOT EXISTS sessions(
        id SERIAL PRIMARY KEY,
        user_id int UNIQUE NOT NULL REFERENCES users (id),
        secret text UNIQUE,
        logged boolean,
        created_at timestamp DEFAULT NOW()
      );

      DROP TRIGGER IF EXISTS upt_cls_quant ON classifieds;

      CREATE OR REPLACE FUNCTION upt_cls()
        RETURNS trigger AS $$
      BEGIN
        IF NEW.quantity = 0 THEN
          UPDATE classifieds SET closed_at = NOW()
          WHERE id = NEW.id;
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;

      CREATE TRIGGER upt_cls_quant
        AFTER UPDATE OF quantity
        ON classifieds
        FOR EACH ROW
        EXECUTE PROCEDURE upt_cls();
      COMMIT;`);
  }
}
module.exports = Db;
