const Client = require('pg').Client;
const bcrypt = require('bcrypt');
const saltRounds = 10;

class Dbmanager{
	constructor(){
		this.client = new Client({
			user: 'postgres',
			host: 'localhost',
			database: 'store',
			password: 'password',
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
					callback(e,err)
				}
			})
	}
	getUserClassfieds(user_id){
		return this.client.query(/*sql*/`
			SELECT * FROM "classifieds" WHERE creator_id = $1
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
	findSession(secret){
		return this.client.query(/*sql*/`
			SELECT * FROM sessions WHERE SECRET = $1 AND logged = TRUE;
		`, [secret])
	}
	login(user_id, secret){
		return this.client.query(/*sql*/`
			INSERT INTO sessions (user_id, secret) VALUES($1, $2) ON CONFLICT (user_id)
			DO UPDATE
			SET logged = true, secret = $2;
		`, [user_id, secret]);
	}
	logout(secret){
		return this.client(/*sql*/`
			UPDATE Session
			SET logged = false
			WHERE secret = $1
		`, [secret])
	}
	createClassified(title,creator,description,picture_path,quantity){
		return this.client.query(/*sql*/`
			INSERT INTO "classifieds" (title,creator_id,description,picture_path,quantity)
			VALUES($1,$2,$3,$4,$5)
		`, [title,creator,description,picture_path,quantity])
	}
	getJoinedClassified(){
		return this.client.query(/*sql*/`
			SELECT c.id as c_id,u.id,c.title,c.description,c.picture_path,c.quantity,u.username,u.email FROM "classifieds" as c
			INNER JOIN "users" u ON u.id = c.creator_id
		`)
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
			"creator_id" int NOT NULL REFERENCES "users" ("id"),
			"title" text,
			"description" text,
			"picture_path" text,
			"status" text DEFAULT 'open',
			"quantity" int,
			"created_at" date DEFAULT NOW(),
			"closed_at" date DEFAULT NULL
		  );
		  
		  CREATE TABLE IF NOT EXISTS "comments" (
			"id" SERIAL PRIMARY KEY,
			"user_id" int NOT NULL REFERENCES "users" ("id"),
			"classifieds_id" int NOT NULL REFERENCES "classifieds" ("id"),
			"body" text,
			"created_at" timestamp DEFAULT NOW(),
			"deleted" timestamp DEFAULT null 
		  );
		  
		  CREATE TABLE IF NOT EXISTS "promotion_transactions" (
			"id" SERIAL PRIMARY KEY,
			"sender" int NOT NULL REFERENCES "users" ("id"),
			"created_at" timestamp DEFAULT NOW(),
			"amount" int NOT NULL
		  );
		  
		  CREATE TABLE IF NOT EXISTS "user_transactions"(
			"id" SERIAL PRIMARY KEY,
			"sender" int NOT NULL REFERENCES "users" ("id"),
			"recipant" int NOT NULL REFERENCES "users" ("id"),
			"approved_at" timestamp DEFAULT NULL,
			"created_at" timestamp DEFAULT NOW()
		  );
		  
		  CREATE TABLE IF NOT EXISTS "accounts"(
			"id" SERIAL PRIMARY KEY,
			"user_id" int REFERENCES "users" ("id"),
			"account_number" text NOT NULL,
			"created_at" timestamp DEFAULT NOW()
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