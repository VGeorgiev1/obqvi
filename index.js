const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
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
const wrapper = fn => async ( req, res ) => {
  try {
    await fn(req, res);
  } catch (e) {
    console.log(e.message);
    res.render('general_error', { error: 'Something went wrong please try again later' });
  }
};
const loginware = async (req, res, next) => {
  if (!req.cookies.sessionToken) {
    res.redirect('/login');
    return;
  }
  try {
    const ses = await db.getSession(req.cookies.sessionToken);
    if (!ses) {
      res.redirect('/login');
      return;
    }
    req.authenticated = true;
    req.userId = ses.user_id;
    next();
  } catch (e) {
    console.log(e);
    res.render('general_error', { error: 'There was a problemm please try again later.' });
  }
};

app.get('/promo', loginware, wrapper(async (req, res) => {
  const rows = await db.getUserClassfieds(req.userId);
  if (!rows) {
    res.render('general_error', { error: 'Classifieds not found!' });
  }
  res.render('promo', { classifieds: rows.rows, auth: req.authenticated });
}));

app.get('/shipments/my', loginware, wrapper(async (req, res) => {
  const rows = await db.getShipments(req.userId);
  if (!rows) {
    res.render('general_error', { error: 'Classifieds not found!' });
  }
  res.render('shipments', { classifieds: rows.rows, auth: req.authenticated });
}));

app.get('/promo/success', loginware, wrapper(async (req, res) => {
  await db.prepareTransaction(req.query);
  const promotions = await db.getPromotions(req.query.paymentId);
  if (!promotions) {
    res.render('promo_success', { classifieds: promotions, auth: req.authenticated });
    return;
  }
  res.render('general_error', { error: 'There was a problem preparing your transactions!' });
}));

app.get('/buy/success', loginware, wrapper(async (req, res) => {
  db.tx(async () => {
    const r = await db.prepareUserPayment(req.query);
    await db.setUserTransactionState({ id: r.id, state: 'buyer_approved' });
    res.render('buy_success', { auth: req.authenticated });
  });
}));

app.get('/', wrapper((req, res) => {
  res.redirect('/list');
}));

app.post('/rpc', wrapper(async (req, res) => {
  res.setHeader('Content-Type', 'application/json-rpc');
  if (req.headers['content-type'] !== 'application/json' && req.headers['content-type'] !== 'application/json-rpc') {
    console.log('here?');
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
  res.send(promotion.calcPromotion(req.body));
}));

app.get('/profile', loginware, wrapper(async (req, res) => {
  const user = await db.getUser(req.userId);
  if (!user) {
    res.render('general_error', { error: 'Classified not found!' });
  }
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
    const amount = Number(transaction.transactions[0].amount.total);
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
  if (!classified) {
    res.render('general_error', { error: 'Classified not found!' });
    return;
  }
  if (classified.picture) {
    classified.picture = Buffer.from(classified.picture).toString('base64');
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
  req.body.picture = req.files.picture.data;
  req.body.entityId = crypto.randomBytes(10).toString('hex');
  await db.createClassified(req.body);
  res.redirect('/list');
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

app.get('/list', loginware, wrapper(async (req, res) => {
  const promotions = await db.getClassfiedPromotion();
  if (!promotions) {
    res.render('general_error', { error: 'Classified not found!' });
    return;
  }
  const formatted = OneDToTwoD(promotions, 3);
  promotions.sort((a, b) => {
    if (a.status === 'authorized') {
      return 1;
    } else if (b.status === 'authorized') {
      return -1;
    }
  });
  promotions.filter(r => r.picture).map(r => r.picture = Buffer.from(r.picture).toString('base64'));
  console.log(promotions) 
  res.render('list', { classifieds: formatted, auth: req.authenticated });
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
