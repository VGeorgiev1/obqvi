const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const sharp = require('sharp');

const host = 'https://e70f28bd.ngrok.io';
const assert = require('./assert');

const PROMOTION = require('./promotion');
const RPC = require('./rpc_service');
const DB = require('./db');
const PAYPAL = require('./paypal');

const db = new DB();
const paypal = new PAYPAL('sandbox', process.env.PAYPAL_KEY, process.env.PAYPAL_SECRET);
const promotion = new PROMOTION(paypal, db, host);
const rpc = new RPC(db, promotion);

const app = express();
const port = 3000;

app.use(express.static('public'));
app.set('view engine', 'pug');
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(fileUpload());

const wrapper = fn => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (e) {
    console.log(e.message);
    res.render('general_error', { error: 'Something went wrong please try again later' });
  }
};
const loginware = wrapper(async (req, res, next) => {
  if (!req.cookies.sessionToken) {
    res.redirect('/login');
    return;
  }
  const ses = await db.getSession(req.cookies.sessionToken);
  if (!ses) {
    res.redirect('/login');
    return;
  }
  req.authenticated = true;
  req.userId = ses.user_id;
  next();
});

app.get('/promo', loginware, wrapper(async (req, res) => {
  const rows = await db.getUserClassfieds(req.userId);
  assert(rows !== undefined, 'Ads for promos are undefined!');
  res.render('promo', { classifieds: rows, auth: req.authenticated });
}));

app.get('/shipments/my', loginware, wrapper(async (req, res) => {
  const rows = await db.getShipments(req.userId);
  assert(rows !== undefined, 'Shipments are undefined');
  res.render('shipments', { classifieds: rows.rows, auth: req.authenticated });
}));

app.get('/promo/success', loginware, wrapper(async (req, res) => {
  await db.prepareTransaction(req.query);
  const promotions = await db.getPromotions(req.query.paymentId);
  assert(promotions !== undefined, 'Promotion is undefined');
  res.render('promo_success', { classifieds: promotions, auth: req.authenticated });  
}));

app.get('/buy/success', loginware, wrapper(async (req, res) => {
  db.tx(async () => {
    const r = await db.prepareUserPayment(req.query);
    await db.setUserTransactionState({ id: r.id, state: 'buyer_approved' });
    res.render('buy_success', { auth: req.authenticated });
  });
}));

app.get('/', wrapper((req, res) => {
  res.redirect('/list/1');
}));

app.post('/rpc', wrapper(async (req, res) => {
  res.setHeader('Content-Type', 'application/json-rpc');
  if (req.headers['content-type'] !== 'application/json' && req.headers['content-type'] !== 'application/json-rpc') {
    res.send({ jsonrpc: '2.0', error: { code: -32700, message: 'Invalid Request' }, id: null });
  } else {
    const result = await rpc.execute(req.body);
    res.send(result);
  }
}));

app.post('/confrim', loginware, wrapper(async (req, res) => {
  if (paypal.events[req.body.event_type]) {
    paypal.events[req.body.event_type](db, paypal, req.body.resource);
  }
}));

app.get('/promo/error', loginware, (req, res) => {
  res.render('general_error', { error: 'Ther was a problem with your transaction. Please try again later' });
});

app.post('/promo', loginware, wrapper(async (req, res) => {
  const classifiedKeys = Object.keys(req.body).filter(k => k !== 'date');

  const link = await promotion.createPromotion({ to: req.body.date, keys: classifiedKeys, userId: req.userId });
  res.redirect(link);
}));

app.post('/calculate', loginware, wrapper((req, res) => {
  res.send(promotion.calcPromotion({ to: req.body.date, classifiedsCount: req.body.classifieds }));
}));

app.get('/profile', loginware, wrapper(async (req, res) => {
  const user = await db.getUser(req.userId);
  assert(user !== undefined, 'user is undefined');
  console.log(user);
  res.render('profile', { profile: user, auth: req.authenticated });
}));

app.get('/register', wrapper((req, res) => {
  if (req.authenticated) { res.redirect('/list'); }
  res.render('register', { auth: req.authenticated });
}));

app.post('/register', wrapper(async (req, res) => {
  if (req.body.username.length !== 0 && req.body.password.length !== 0 && req.body.email.length !== 0) {
    req.body.apiKey = crypto.randomBytes(30).toString('hex');
    await db.createUser(req.body);
    res.redirect('/login');
  }
}));

app.post('/comment/new', loginware, wrapper(async (req, res) => {
  await db.createComment({ userId: req.userId, classifiedsEntity: req.body.entity, body: req.body.comment });
  res.send();
}));

app.get('/classified/new', loginware, wrapper((req, res) => {
  res.render('create', { auth: req.authenticated });
}));

app.post('/buy/:id', loginware, wrapper(async (req, res) => {
  const quantity = Number(req.body.quantity);
  if (quantity <= 0) {
    res.send({ error: 'Invalid quantity' });
    return;
  }
  const classified = await db.getClassified(req.params.id);

  if (quantity > classified.quantity) {
    res.send({ error: 'Invalid quantity' });
    return;
  }
  const payment = {
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
  };
  db.tx(async () => {
    const transaction = await paypal.createPay(payment);
    assert(transaction !== undefined);
    const amount = classified.price * quantity;
    const p = await db.createPayment(
      {
        transactionId: transaction.id,
        from: req.userId,
        state: transaction.state,
        amount,
        quantity,
        entityId: classified.entityId
      }
    );
    await db.createUserTransaction(
      {
        userPaymentId: p.id,
        from: req.userId,
        to: classified.creator_id,
        status: 'awaiting_buyer_consent',
        amount
      }
    );
    res.send(transaction.links.filter(l => l.method === 'REDIRECT')[0].href);
  });
}));

app.post('/ship', loginware, wrapper(async (req, res) => {
  const payment = await db.getPayment({ transactionId: req.body.payment_id, userId: req.userId });
  if (!payment) { res.send({ error: 'No payments found!' }); }

  const transactionId = payment.transaction_id;
  const tr = await paypal.getPayment(transactionId);
  assert(tr !== undefined, 'transaction is not defined!');
  assert(typeof tr === 'object', 'transaction is not aa object');

  const orderId = tr.transactions[0].related_resources[0].order.id;
  const total = tr.transactions[0].amount.total;
  const state = tr.transactions[0].related_resources[0].order.state;

  payment.quantity -= payment.order_quantity;

  db.tx(async () => {
    if (state === 'COMPLETED') {
      await db.setUserTransactionState({ id: payment.id, state: 'order_completed' });
      await db.setQuantity(payment);
      res.send('Transaction Completed');
    } else {
      const r = await db.setPaymentState({ transactionId, state: state });
      const t = paypal.orderAuthorize({ orderId, total });
      await db.setPaymentState({ transactionId, state: t.state });
      await paypal.captureOrder({ orderId, total });
      await db.setUserTransactionState({ id: r.id, state: 'order_completed' });
      await db.setQuantity(payment);
      res.send('Transaction Completed');
    }
  });
}));

app.get('/classified/:id', loginware, wrapper(async (req, res) => {
  const classified = await db.getJoinedClassified(req.params.id);
  assert(classified !== undefined, 'classified are not defined');
  if (classified[0].picture) {
    classified[0].picture = Buffer.from(classified[0].picture).toString('base64');
  }
  res.render('classified', { c: classified[0], comments: classified.filter(r => r.comment_date !== null), auth: req.authenticated });
}));
app.get('/logout', loginware, wrapper(async (req, res) => {
  await db.stopSession(req.userId);
  res.clearCookie('sessionToken');
  res.redirect('/list');
}));

app.get('/login', wrapper((req, res) => {
  if (req.authenticated) { res.redirect('/list'); return; }
  res.render('login', { auth: req.authenticated });
}));

app.post('/classified', loginware, wrapper(async (req, res) => {
  for (const prop in req.body) {
    if (req.body[prop].length === 0) {
      res.render('create', { error: prop + ' can not be empty', auth: req.authenticated });
    }
  }

  req.body.userId = req.userId;
  req.body.picture = req.files.picture.data;
  req.body.picture = await sharp(req.body.picture).resize(500, 500).toBuffer();
  req.body.entityId = crypto.randomBytes(10).toString('hex');
  await db.createClassified(req.body);
  res.redirect('/list/1');
}));

app.post('/login', wrapper(async (req, res) => {
  const status = await db.authenticateUser({ username: req.body.name, password: req.body.password });
 
  if (!status.authenticated) {
    res.render('login', { error: status.message, auth: req.authenticated });
    return;
  }
  const secret = crypto.randomBytes(30).toString('hex');
  await db.login({ userId: status.user.id, secret });
  res.cookie('sessionToken', secret).redirect('/list');
}));

app.get('/list/:id', loginware, wrapper(async (req, res) => {
  assert(req.params.id >= 1, 'page not correct'); 
  const promotions = await db.getClassfiedPromotion((req.params.id - 1) * 30, 30);
  const rowCount = +(await db.getClassifiedCount());
  assert(promotion !== undefined, 'promotions are undefined!');
  assert(rowCount !== undefined, 'row count is undefined');
  assert(typeof rowCount === 'number', 'row count is not a number');

  promotions.sort((a, b) => {
    if (a.status === 'authorized') {
      return 1;
    } else if (b.status === 'authorized') {
      return -1;
    }
  });
  promotions.filter(r => r.picture).map(r => r.picture = Buffer.from(r.picture).toString('base64'));
  const formatted = OneDToTwoD(promotions, 3);
  res.render('list', { classifieds: formatted, auth: req.authenticated, page: req.params.id, maxPage: Math.ceil(rowCount / 30) });
}));

db.createTables()
  .then(() => {
    console.log('Tables created successful!');
    app.listen(port, () => {
      console.log('App working and listening on port ' + port);
    });
  });

function OneDToTwoD (array, lenght) {
  const result = [];
  const cont = array.slice(0);
  while (cont[0]) {
    result.push(cont.splice(0, lenght));
  }
  return result;
}
