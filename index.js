const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const host = 'https://e70f28bd.ngrok.io';

const Promotion = require('./Promotion');
const RPC = require('./RPCService');

const DbManager = require('./DbManager');
const PaypalManager = require('./paypal');
const dbManager = new DbManager();
const paypalManager = new PaypalManager('sandbox', process.env.PAYPAL_KEY, process.env.PAYPAL_SECRET);
const promotionManager = new Promotion(paypalManager, dbManager, host);
const rpc = new RPC(dbManager, promotionManager);

app.use(express.static('public'));
app.set('view engine', 'pug');
app.use(cookieParser());

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(fileUpload());
const loginware = async (req, res, next) => {
	if (req.cookies.sessionToken) {
		try{
			let ses = await dbManager.findSession(req.cookies.sessionToken);

			if (ses) {
				if (ses.rows[0]) {
					req.authenticated = true;
					req.userId = ses.rows[0].user_id;
				}
				next();
			} else {
				res.redirect('/login');
				return;
			}
		}catch(e){
			console.log(e);
			res.authenticated = false;
			res.redirect('/login');
		}
	} else {
		res.redirect('/login');
		return;
	}
}
app.get('/promo', loginware, async(req, res) => {
	try{
		let rows = await dbManager.getUserClassfieds(req.userId);
		res.render('promo', { classifieds: rows.rows, auth: req.authenticated });
	}catch(e){
		res.render('general_error', { error: 'There was a problemm please try again later.' });
	}
});
app.get('/shipments/my', loginware, async (req, res) => {
	try{
		let rows = await dbManager.getShipments(req.userId);
		res.render('shipments', { classifieds: rows.rows, auth: req.authenticated });
	}catch(e){
		console.log(e)
		res.render('general_error', { error: 'There was a problemm please try again later.' });
	}
});
app.get('/promo/success', loginware, async(req, res) => {
	try{
	await dbManager.prepareTransaction(req.query.paymentId, req.query.token, req.query.PayerID);
		let rows = await dbManager.getPromotions(req.query.paymentId);
		if (rows.rows) {
			res.render('promo_success', { classifieds: rows.rows, auth: req.authenticated });
			return;
		}
		res.render('general_error', { error: 'There was a problem preparing your transactions!' });
	}catch(e){
		res.render('general_error', { error: 'There was a problem preparing your transactions!' });
	}
});
app.get('/buy/success', loginware, async(req, res) => {
	try{
		let r = await dbManager.prepareUserPayment(req.query.paymentId, req.query.token, req.query.PayerID);
		await dbManager.setUserTransactionState(r.rows[0].id, 'buyer_approved');
		res.render('buy_success', { auth: req.authenticated });
	}catch(e){
		console.log(e);
		res.render('general_error', { error: 'There was a problem preparing your transactions!' });
	}
});
app.get('/', loginware, (req, res) => {
	res.redirect('/list');
});
app.post('/rpc', async (req, res) => {
	res.setHeader('Content-Type', 'application/json-rpc');
	if (req.headers['content-type'] != 'application/json' && req.headers['content-type'] != 'application/json-rpc') {
		console.log('here?')
		res.send({ "jsonrpc": "2.0", "error": { "code": -32700, "message": "Invalid Request" }, "id": null });
	}else{
		try{
			let result = await rpc.execute(req.body);
			res.send(result);
		}catch(e){
			console.log(e);
		}
	}
});
app.post('/confrim', loginware, async (req, res) => {
	try{
		switch (req.body.event_type) {
			case 'PAYMENTS.PAYMENT.CREATED':
				if (req.body.resource.state === 'created') {
					if (req.body.resource.intent === 'order') {
						let r = await dbManager.findUserPayment(req.body.resource.id);
						if (r.rows && r.rows[0]) {
							const payerId = r.rows[0].payerId
							const transactionId = r.rows[0].transaction_id
							if (transactionId === req.body.resource.id) {
								const t = await paypalManager.execute(req.body.resource.id, payerId, req.body.resource.transactions[0].amount.total);
								let r = await dbManager.setPaymentState(req.body.resource.id, t.state);
								await dbManager.setUserTransactionState(r.rows[0].id, 'order_placed');
							}
						}
						
					} else {
						await dbManager.setTransactionState(req.body.resource.id, req.body.resource.state);
						let r = await dbManager.findTransaction(req.body.resource.id);
						if (r.rows && r.rows[0]) {
							const payerId = r.rows[0].payerId
							const transactionId = r.rows[0].transaction_id
							if (transactionId === req.body.resource.id) {
								await paypalManager.execute(transactionId, payerId, req.body.resource.transactions[0].amount.total);
							}
						}
					}
				}
				break
			case 'PAYMENT.AUTHORIZATION.CREATED':
				const transactionId = req.body.resource.parent_payment
				const auth = await paypalManager.getPaymentAuthoriztaion(req.body.resource.id);
				if (auth.state !== 'captured') {
					await paypalManager.capturePayment(req.body.resource.id, req.body.resource.amount.total);
					let r = await dbManager.setTransactionState(transactionId, 'completed');
					await dbManager.setPromotionStatus(transactionId, 'authorized');
				}
				break
		}
	}catch(e){
		console.log(e)
	}
});

app.get('/promo/error', loginware, (req, res) => {
	res.render('general_error', { error: 'Ther was a problem with your transaction. Please try again later' })
});

app.post('/promo', loginware, async (req, res) => {
	const classifiedKeys = Object.keys(req.body).filter(k => k !== 'date');
	try{
		let link = await promotionManager.createPromotion(req.body.date, classifiedKeys, req.userId);
		res.redirect(link);
	}catch(e){
		console.log(e)
		res.send({ error: 'There was a problem with craeting yout transaction. Please try again' });
	}
});
app.post('/calculate', loginware, (req, res) => {
	res.send(calcPromotion(req.body.date, req.body.classifieds));
});
app.get('/profile', loginware, (req,res)=>{
	dbManager.getUser(req.userId).then((r)=>{
		console.log(r.rows)
		res.render('profile', {profile: r.rows[0], auth: req.authenticated})
	})
})
app.get('/register', (req, res) => {
	if (req.authenticated) { res.redirect('/list') }
	res.render('register', { auth: req.authenticated });
});
app.post('/register', loginware, async(req, res) => {
	if (req.authenticated) { res.redirect('/list') }
	if (req.body.name.length !== 0 && req.body.password.length !== 0 && req.body.email.length !== 0) {
		let api_key = crypto.randomBytes(30).toString('hex');
		try{
			await dbManager.createUser(req.body.name, req.body.password, req.body.email, req.body.gender, api_key);
			res.redirect('/login');
		}catch(e){
			console.log(e)
			res.render('general_error', { error: 'There was a problem try again later!' });
		}
	}
});
app.post('/comment/new', loginware, async (req, res) => {
	try{	
		await dbManager.createComment(req.userId, req.body.entity, req.body.comment);
		res.send({});
	}catch(e) {
		console.log(e)
		res.send({ error: 'there was a problem please try again later' });
	}
});
app.get('/classified/new', loginware, (req, res) => {
	res.render('create', { auth: req.authenticated });
});
app.post('/buy/:id', loginware, async(req, res) => {
	const quantity = Number(req.body.quantity);
	if (quantity <= 0) {
		res.send({ error: 'Invalid quantity' });
		return
	}
	try{
		let r = await dbManager.getClassified(req.params.id);
		const classified = r.rows[0]

		if (quantity > classified.quantity) {
			res.send({ error: 'Invalid quantity' });
			return
		}
		var payment = {
			intent: 'order',
			payer: {
				payment_method: 'paypal'
			},
			redirect_urls: {
				return_url: host + '/buy/success',
				cancel_url: host + '/buy/error'
			},
			transactions: [{
				item_list: {
					items: [{
						name: 'item',
						sku: 'item',
						price: classified.price,
						currency: 'USD',
						quantity: quantity
					}]
				},
				amount: {
					currency: 'USD',
					total: classified.price * quantity
				},
				description: 'Order for ' + classified.title
			}]
		}
		const transaction = await paypalManager.createPay(payment);
		let p = await dbManager.createPayment(transaction.id, req.userId, transaction.state, Number(transaction.transactions[0].amount.total), quantity, classified.entity_id);
		await dbManager.createUserTransaction(p.rows[0].id, req.userId, classified.creator_id, 'awaiting_buyer_consent', Number(transaction.transactions[0].amount.total));
		
		res.send(transaction.links.filter(l => l.method === 'REDIRECT')[0].href);
	}catch(e){
		console.log(e)
		res.render('general_error', { error: 'There was a problem with craeting yout transaction. Please try again' });
	}
});
app.post('/ship', loginware, async (req, res) => {
	try {
		const pRows = await dbManager.getPayment(req.body.payment_id, req.userId);
		if (pRows.rows.length === 0) { res.send({ error: 'No payments found!' }) };

		const payment = pRows.rows[0]
		const tr = await paypalManager.getPayment(payment.transaction_id);
		if (tr.transactions[0].related_resources[0].order.state === 'COMPLETED') {
			await dbManager.setUserTransactionState(payment.id, 'order_completed');
			await dbManager.setQuantity(payment.classified_entity, payment.quantity - payment.order_quantity);
			res.send('Transaction Completed');
		} else {
			const r = await dbManager.setPaymentState(payment.transaction_id, tr.transactions[0].related_resources[0].order.state);
			const t = await paypalManager.orderAuthorize(tr.transactions[0].related_resources[0].order.id, tr.transactions[0].amount.total);

			await dbManager.setPaymentState(payment.transaction_id, t.state);
			await paypalManager.captureOrder(tr.transactions[0].related_resources[0].order.id, tr.transactions[0].amount.total);
			await dbManager.setUserTransactionState(r.rows[0].id, 'order_completed');
			await dbManager.setQuantity(payment.id, payment.quantity - payment.order_quantity);
			res.send('Transaction Completed');
		}
	} catch (e) {
		console.log(e)
		res.send({ error: 'There was an error. Please try again later' });
	}
});
app.get('/classified/:id', loginware, async (req, res) => {
	try{
		let r = await dbManager.getJoinedClassified(req.params.id);
		if (r.rowCount === 0) {
			res.render('general_error', { error: 'Classified not found!' });
		} else {
			if (r.rows[0].picture) {
				r.rows[0].picture = Buffer.from(r.rows[0].picture).toString('base64');
			}
			res.render('classified', { c: r.rows[0], comments: r.rows.filter(r => r.comment_date !== null), auth: req.authenticated });
		}
	}catch(e){
		res.render('general_error', { error: 'Classified not found!' });
	}
});
app.get('/logout', loginware, async(req, res) => {
	if (req.userId) {
		try{
			await dbManager.stopSession(req.userId);
			res.clearCookie('sessionToken');
			res.redirect('/list');
		}catch(e){
			res.render('general_error', { error: 'There was an error! Please try again later!' })
		}
	}
});
app.get('/login', (req, res) => {
	if (req.authenticated) { res.redirect('/list'); return; }
	
	res.render('login', { auth: req.authenticated });
});
app.get('/list', loginware, async (req, res) => {
	try{
		let rows = await dbManager.getClassfiedPromotion();
		const formatted = OneDToTwoD(rows.rows, 3);
		rows.rows.sort((a, b) => {
			if (a.status === 'authorized') {
				return 1;
			} else if (b.status === 'authorized') {
				return -1;
			}
		});
		for (const row of rows.rows) {
			if (row.picture) {
				row.picture = Buffer.from(row.picture).toString('base64');
			}
		}
		res.render('list', { classifieds: formatted, auth: req.authenticated });
	}catch(e){
		console.log(e);
		res.render('general_error', { error: 'There was an error! Please try again later!' });
	}
});

app.post('/classified', loginware, async (req, res) => {
	try{
		for (const prop in req.body) {
			if (req.body[prop].length === 0) {
				res.render('create', { error: prop + ' can not be empty', auth: req.authenticated });
			}
		}
		console.log(req.files)
		await dbManager.createClassified(req.body.title,
			crypto.randomBytes(10).toString('hex'),
			req.userId, req.body.description,
			req.files.picture.data,
			req.body.price,
			req.body.quantity);
		res.redirect('/list');
	}catch(e){
		console.log(e)
		res.render('general_error', { error: 'There was an error! Please try again later!' });
	}
});
app.post('/login', async (req, res) => {
	try{
		dbManager.authenticateUser(req.body.name, req.body.password, async(status) => {
			if (status.authenticated) {
				const secret = crypto.randomBytes(30).toString('hex');
				await dbManager.login(status.user.id, secret);
				res.cookie('sessionToken', secret).redirect('/list');
			} else {
				res.render('login', { error: status.message, auth: req.authenticated });
			}
		});
	}catch(e){
		console.log(e)
		res.render('general_error', { error: 'There was an error! Please try again later!' });
	}
});

dbManager.createTables()
	.then(() => {
		console.log('Tables created successful!')
		app.listen(port, () => {
			console.log('App working and listening on port ' + port)
		});
	});

function OneDToTwoD(array, lenght) {
	const result = []
	const cont = array.slice(0);
	while (cont[0]) {
		result.push(cont.splice(0, lenght));
	}
	return result
};

function calcPromotion(date, classifieds) {
	const days = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));

	if (isNaN(days) || days <= 0) {
		return ({ error: 'The period musts be at least one day' });
	} else if (!classifieds || classifieds <= 0) {
		return ({ error: 'Please select a classified!' });
	} else {
		return ({ value: ((days * 2 * classifieds) / bgn2dollarRate).toFixed(2) });
	}
}
