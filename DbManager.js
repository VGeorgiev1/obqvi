const Client = require('pg').Client;
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
	createUser(username, password, email,gender){
		return this.client.query(/*sql*/`
			INSERT INTO "users"(username,password,email,gender) VALUES($1,$2,$3,$4);
			`, [username,password,email,gender])
	}
	logUser(user_id,secret){
		return this.client.query(/*sql*/`
			BEGIN;
			INSERT INTO sessions (user_id, secret) VALUES($1, $2) ON CONFLICT (user_id)
			DO UPDATE
			SET secret = $2
			COMMIT;
		`, [user_id, secret])
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
		  CREATE TABLE IF NOT EXISTS "sessions"(
			id int PRIMARY KEY,
			"user_id" int UNIQUE REFERENCES "users" ("id"),
			"secret" TEXT UNIQUE,
			"logged" BOOLEAN,
			"created_at" timestamp DEFAULT NOW()
		  );
		  CREATE TABLE IF NOT EXISTS "classifieds" (
			"id" SERIAL PRIMARY KEY,
			"creator_id" int NOT NULL REFERENCES "users" ("id"),
			"title" text,
			"description" text,
			"picture_path" text,
			"status" text,
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
		  COMMIT`)
	}
}
module.exports = Dbmanager;