const Client = require('pg').Client;
const bcrypt = require('bcrypt');
const saltRounds = 10;

class Dbmanager{
	constructor(){
		this.client = new Client({
			user: 'postgres',
			host: 'localhost',
			database: 'store',
			password: 'kon4etobon4eto',
			port: 5432,
		});
		this.client.connect();
	}
	async createUser(username, password, email,gender, callback){
		let hash = await bcrypt.hash(password, saltRounds)
		this.client.query(/*sql*/`
			INSERT INTO "users"(username,password,email,gender) VALUES($1,$2,$3,$4);
			`, [username,hash,email,gender]).then((r,err) => {
				if(callback){
					callback(r,err)
				}
			})
	}
	createPromotion(transaction_id,classified_id,end_date,status){
		return this.client.query(/*sql*/`
			INSERT INTO "promotions"(transaction_id,classified_entity,end_date, status)
			VALUES($1,$2,TO_TIMESTAMP($3, 'MM/DD/YYYY'),$4);
		`,[transaction_id,classified_id,end_date,status])
	}
	getUserClassfieds(user_id){
		return this.client.query(/*sql*/`
			SELECT cl.id, cl.entity_id, cl.title FROM "classifieds" as cl
			LEFT JOIN "promotions" as p ON p.classified_entity = cl.entity_id
			WHERE creator_id = $1; 
		`,[user_id])
	}
	authenticateUser(username,password, callback){
		this.client.query(/*sql*/`
			SELECT * FROM "users" WHERE username = $1
		`, [username]).then((res,err) => {
			if(!res.rows[0]){
				callback({authenticated:false, message: 'Wrong username!'})
				return;
			}else{
				let status = {}
				bcrypt.compare(password, res.rows[0].password).then((err, r) => {
					if(!r){
						status = {authenticated:false, message: 'Wrong password!'}
					}
					status = {authenticated: true, message: '', user: res.rows[0]}
					callback(status)
					return;
				})
			}
		})
	}
	getTransaction(transaction_id){
		return this.client.query(/*sql*/`
			SELeCT * FROM "promotion_transactions"
			WHERE transaction_id = $1
		`, [transaction_id])	
	}
	createTransaction(transaction_id, state, sender_id, amount){
		return this.client.query(/*sql*/`
			INSERT INTO "promotion_transactions"(transaction_id, state,sender_id, amount) VALUES($1,$2,$3,$4)
		`, [transaction_id, state,sender_id,amount])
	}
	prepareTransaction(transaction_id,token, payer_id){
		return this.client.query(/*sql*/`
			UPDATE promotion_transactions
			SET payer_id = $1,
			token = $2
			WHERE transaction_id = $3; 
		`, [payer_id, token, transaction_id])
	}
	setTransactionState(transaction_id, state){
		return this.client.query(/*sql*/`
			UPDATE promotion_transactions
			SET state = $2
			WHERE transaction_id = $1 
		`,[transaction_id,state])
	}
	setPromotionStatus(transaction_id, state){
		return this.client.query(/*sql*/`
			UPDATE promotions
			SET status = $1
			WHERE transaction_id = $2
		`,[state, transaction_id])
	}
	createUserPayment(){

	}
	getPromotions(transaction_id){
		return this.client.query(/*sql*/`
			SELECT * FROM "promotions"
			WHERE transaction_id = $1 AND status = 'awaiting_auth'
		`,[transaction_id])
	}
	findTransaction(transaction_id){
		return this.client.query(/*sql*/`
			SELECT * FROM promotion_transactions
			WHERE transaction_id = $1
		`,[transaction_id])
	}
	findUserPayment(transaction_id){
		return this.client.query(/*sql*/`
			SELECT * FROM user_payments
			WHERE transaction_id = $1
		`,[transaction_id])
	}
	findSession(secret){
		return this.client.query(/*sql*/`
			SELECT * FROM sessions WHERE SECRET = $1 AND logged = TRUE;
		`, [secret])
	}
	login(user_id, secret){
		return this.client.query(/*sql*/`
			INSERT INTO sessions (user_id, secret) VALUES($1, $2) ON CONFLICT (user_id)
			DO UPDATE
			SET logged = TRUE,
			secret = $2;
		`, [user_id, secret]);
	}
	logout(secret){
		return this.client(/*sql*/`
			UPDATE Session
			SET logged = false
			WHERE secret = $1
		`, [secret])
	}
	getJoinedClassified(entity_id){
		return this.client.query(/*sql*/`
			SELECT cl.price,cl.entity_id, cl.title, cl.description, cl.quantity, cl.created_at as classified_date, c.created_at as comment_date, c.body,c.user_id,u.username,cl.picture_path FROM classifieds cl
			LEFT JOIN "comments" c on c.classified_entity = cl.entity_id
			LEFT JOIN "users" as u ON u.id = c.user_id
			WHERE cl.entity_id = $1
		`, [entity_id])
	}
	getClassified(entity_id){
		return this.client.query(/*sql*/`
			SELECT cl.price,cl.creator_id, cl.entity_id, cl.title, cl.description, cl.quantity, cl.created_at as classified_date,cl.picture_path FROM classifieds cl
			WHERE cl.entity_id = $1
		`, [entity_id])
	}
	createComment(user_id, classifieds_entity, body){
		return this.client.query(/*sql*/`
			INSERT INTO "comments"(user_id,classified_entity, body)
			VALUES($1,$2,$3)
		`, [user_id, classifieds_entity, body])
	}
	createClassified(title,entity_id,creator,description,picture_path,price,quantity){
		return this.client.query(/*sql*/`
			INSERT INTO "classifieds" (title,creator_id,description,picture_path,price,quantity, entity_id)
			VALUES($1,$2,$3,$4,$5, $6,$7)
		`, [title,creator,description,picture_path,price,quantity, entity_id])
	}
	getClassfiedPromotion(){
		return this.client.query(/*sql*/`
			SELECT c.entity_id as c_id,u.id,c.title,c.description,c.picture_path,c.quantity,u.username,u.email,p.status FROM "classifieds" as c
			INNER JOIN "users" u ON u.id = c.creator_id
			LEFT JOIN "promotions" p ON p.classified_entity = c.entity_id
			WHERE p.status = 'authorized' OR p.status IS NULL;
		`)
	}
	prepareUserPayment(paymentId, token, payerId){
		return this.client.query(/*sql*/`
			UPDATE "user_payments"
			SET token = $2,
				payer_id = $3
			WHERE transaction_id = $1
			RETURNING id
		`,[paymentId, token, payerId])
	}
	setUserTransactionState(transaction_id,state){
		return this.client.query(/*sql*/`
			UPDATE "user_transactions"
			SET state = $2
			WHERE id = $1
		`,[transaction_id,state])
	}
	createUserTransaction(user_payment_id,sender,recipant,state,amount){
		return this.client.query(/*sql*/`
			INSERT INTO "user_transactions"(user_payment_id,sender,recipant,state,amount)
			VALUES($1,$2,$3,$4,$5)
		`,[user_payment_id,sender,recipant,state,amount])
	}
	createPayment(transaction_id, sender_id, state, amount){
		return this.client.query(/*sql*/`
			INSERT INTO "user_payments"(transaction_id,sender_id,state,amount)
			VALUES($1,$2,$3,$4)
			RETURNING id
		`,[transaction_id, sender_id, state, amount])
	}
	stopSession(user_id){
		return this.client.query(/*sql*/`
			UPDATE "sessions"
			SET logged = false
			WHERE user_id = $1
		`, [user_id])
	}
	createTables(){
		return this.client.query( /*sql*/ `
		  BEGIN;
		  CREATE TABLE IF NOT EXISTS "users" (
			"id" SERIAL PRIMARY KEY,
			"username" text,
			"password" text,
			"email" text UNIQUE,
			"gender" text,
			"created_at" timestamp DEFAULT NOW(),
			"deleted_at" timestamp DEFAULT NULL
		  );
		  CREATE TABLE IF NOT EXISTS "classifieds" (
			"id" SERIAL PRIMARY KEY,
			"entity_id" text UNIQUE,
			"creator_id" int NOT NULL REFERENCES "users" ("id"),
			"title" text,
			"description" text,
			"picture_path" text,
			"status" text DEFAULT 'open',
			"price" NUMERIC NOT NULL,
			"quantity" int,
			"created_at" date DEFAULT NOW(),
			"closed_at" date DEFAULT NULL
		  );
		  
		  CREATE TABLE IF NOT EXISTS "comments" (
			"id" SERIAL PRIMARY KEY,
			"user_id" int NOT NULL REFERENCES "users" ("id"),
			"classified_entity" text NOT NULL REFERENCES "classifieds" ("entity_id"),
			"body" text,
			"created_at" timestamp DEFAULT NOW(),
			"deleted" timestamp DEFAULT null 
		  );
		  
		  CREATE TABLE IF NOT EXISTS "promotion_transactions" (
			"id" SERIAL PRIMARY KEY,
			"transaction_id" TEXT UNIQUE NOT NULL,
			"state" TEXT NOT NULL,
			"sender_id" int NOT NULL REFERENCES "users" ("id"),
			"created_at" timestamp DEFAULT NOW(),
			"payer_id" TEXT,
			"token" TEXT,
			"amount" NUMERIC NOT NULL
		  );
		  CREATE TABLE IF NOT EXISTS "user_transactions"(
			"id" SERIAL PRIMARY KEY,
			"sender" int NOT NULL REFERENCES "users" ("id"),
			"recipant" int NOT NULL REFERENCES "users" ("id"),
			"approved_at" timestamp DEFAULT NULL,
			"state" TEXT NOT NULL,
			"amount" NUMERIC NOT NULL,
			"user_payment_id" int,
			"user_payout_id" int,
			"created_at" timestamp DEFAULT NOW()
		  );
		  CREATE TABLE IF NOT EXISTS "user_payments"(
			"id" SERIAL PRIMARY KEY,
			"transaction_id" TEXT UNIQUE NOT NULL,
			"state" TEXT NOT NULL,
			"sender_id" int NOT NULL REFERENCES "users" ("id"),
			"created_at" timestamp DEFAULT NOW(),
			"payer_id" TEXT,
			"token" TEXT,
			"amount" NUMERIC NOT NULL
		  );
		  CREATE TABLE IF NOT EXISTS "user_payouts"(
			"id" SERIAL PRIMARY KEY,
			"transaction_id" TEXT UNIQUE NOT NULL,
			"state" TEXT NOT NULL,
			"recipiant" int NOT NULL REFERENCES "users" ("id"),
			"created_at" timestamp DEFAULT NOW(),
			"amount" NUMERIC NOT NULL
		  );
		  CREATE TABLE IF NOT EXISTS "accounts"(
			"id" SERIAL PRIMARY KEY,
			"user_id" int REFERENCES "users" ("id"),
			"account_number" text NOT NULL,
			"created_at" timestamp DEFAULT NOW()
		  );
		  CREATE TABLE IF NOT EXISTS "promotions"(
			  "id" SERIAL PRIMARY KEY,
			  "transaction_id" TEXT REFERENCES  "promotion_transactions"("transaction_id"),
			  "classified_entity" text  REFERENCES "classifieds"("entity_id"),
			  "start_date" timestamp DEFAULT NOW(),
			  "end_date" timestamp NOT NULL,
			  "status" TEXT
		  );
		  CREATE TABLE IF NOT EXISTS "operations" (
			"id" SERIAL PRIMARY KEY,
			"action" text
		  );
		  
		  CREATE TABLE IF NOT EXISTS "recources"  (
			"id" SERIAL PRIMARY KEY,
			"name" text
		  );
		  
		  CREATE TABLE IF NOT EXISTS "roles" (
			"id" SERIAL PRIMARY KEY,
			"name" text,
			"opertionId" int NOT NULL UNIQUE REFERENCES "operations" ("id"),
			"resourceId" int NOT NULL UNIQUE REFERENCES "recources" ("id")
		  );
		  
		  CREATE TABLE IF NOT EXISTS "personels" ( 
			"id" SERIAL PRIMARY KEY,
			"username" text,
			"email" text,
			"created_at" timestamp DEFAULT NOW(),
			"deleted_at" timestamp DEFAULT NULL,
			"roleId" int NOT NULL REFERENCES "roles" ("id")
		  );
		  CREATE TABLE IF NOT EXISTS "sessions"(
			  "id" SERIAL PRIMARY KEY,
			  "user_id" int UNIQUE NOT NULL REFERENCES "users" ("id"),
			  "secret" text UNIQUE,
			  "logged" boolean,
			  "created_at" timestamp DEFAULT NOW()
		  );
		  COMMIT`)
	}
}
module.exports = Dbmanager;