const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const sharp = require('sharp');

const assert = require('./assert').assert;
const userAssert = require('./userAssert').assert;

const host = 'https://d86bff45.ngrok.io';

const Promotion = require('./promotion');
const Rpc = require('./rpc_service');
const Db = require('./db');
const Paypal = require('./paypal');
const Buy = require('./buy');

const db = new Db();
const paypal = new Paypal('sandbox', process.env.PAYPAL_KEY, process.env.PAYPAL_SECRET);
const promotion = new Promotion(paypal, db, host);
const rpc = new Rpc(db, promotion);
const buy = new Buy(db, paypal, host);

const app = express();
const port = 3000;

app.set('view engine', 'pug');

app.use(express.static('public'));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(fileUpload());

const wrapper = fn => async (req, res, next) => {
  try {
    console.log(req.originalUrl);
    await fn(req, res, next);
  } catch (e) {
    console.log(e.stack);
    res.render('general_error', { error: 'Something went wrong please try again later' });
  }
};

const loginware = wrapper(async (req, res, next) => {
  if (!req.cookies.sessionToken) {
    res.redirect('/login');
    return;
  }
  const sess = await db.getSession({ secret: req.cookies.sessionToken });
  if (!sess) {
    res.redirect('/login');
    return;
  }
  req.authenticated = true;
  req.userId = sess.user_id;
  next();
});

app.get('/promo', loginware, wrapper(async (req, res) => {
  const rows = await db.getUserClassfieds({ userId: req.userId });

  assert(rows != null, 'Ads for promos are undefined!');

  res.render('promo', { classifieds: rows, auth: req.authenticated });
}));

app.get('/shipments', loginware, wrapper(async (req, res) => {
  const rows = await db.getShipments({ userId: req.userId });
  assert(rows != null, 'Shipments are undefined');
  res.render('shipments', { classifieds: rows, auth: req.authenticated });
}));

app.get('/promo/success', wrapper(async (req, res) => {
  await db.prepareTransaction(req.query);
  const promotions = await db.getPromotions({ transactionId: req.query.paymentId });
  assert(promotions != null, 'Promotion is undefined');
  res.render('promo_success', { classifieds: promotions, auth: req.authenticated });
}));

app.get('/buy/success', loginware, wrapper(async (req, res) => {
  db.tx(async (client) => {
    req.query.client = client;
    const r = await db.prepareUserPayment(req.query);

    await db.setUserTransactionState({
      id: r.id,
      state: 'buyer_approved'
    });

    res.render('buy_success', { auth: req.authenticated });
  }, (e) => {
    console.log(e);
    res.render('general_error', { error: 'There was a problem with your transaction. Please try again later' });
  });
}));

app.get('/', wrapper((req, res) => {
  res.redirect('/list/promoted/1');
}));

app.post('/rpc', wrapper(async (req, res) => {
  res.setHeader('Content-Type', 'application/json-rpc');
  if (req.headers['content-type'] !== 'application/json' &&
   req.headers['content-type'] !== 'application/json-rpc') {
    res.status(400);
    res.send({ jsonrpc: '2.0', error: { code: -32700, message: 'Invalid Request' }, id: null });
  } else {
    const result = await rpc.execute(req.body);
    res.status(result.httpStatus);
    res.send(result.response);
  }
}));

app.post('/confrim', wrapper(async (req, res) => {
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
  const user = await db.getUser({ userId: req.userId });

  assert(user != null, 'user is undefined');

  res.render('profile', { profile: user, auth: req.authenticated });
}));

app.get('/register', wrapper((req, res) => {
  if (req.authenticated) {
    res.redirect('/list/promoted/1');
  }

  res.render('register', { auth: req.authenticated });
}));

app.post('/register', wrapper(async (req, res) => {
  userAssert(req.body.username !== null, 'Username cannot be null');
  userAssert(req.body.email !== null, 'Username cannot be null');
  userAssert(req.body.password !== null, 'Username cannot be null');

  if (req.body.username.length > 0 && req.body.password.length !== 0 && req.body.email.length !== 0) {
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

  buy.buy(req.userId, req.params.id, quantity, (transaction) => {
    res.send(transaction.links.filter(l => l.method === 'REDIRECT')[0].href);
  }, (e) => {
    res.send({ error: 'Something went wrong please try again later' });
  });
}));

app.post('/ship', loginware, wrapper(async (req, res) => {
  buy.ship(req.body.payment_id, req.userId, () => {
    res.send('Transaction completed!');
  }, (e) => {
    console.log(e);
    res.send('There was a problem please try again later!');
  });
}));

app.get('/classified/:id', loginware, wrapper(async (req, res) => {
  const classified = await db.getJoinedClassified({ entityId: req.params.id });

  assert(classified != null, 'classified are not defined');
  console.log(classified[0].picture)
  if (classified[0].picture) {
    classified[0].picture = Buffer.from(classified[0].picture).toString('base64');
  }
  console.log(classified[0].picture)
  const templateObj = {
    c: classified[0],
    comments: classified.filter(r => r.comment_date !== null),
    auth: req.authenticated
  };

  res.render('classified', templateObj);
}));
app.get('/logout', loginware, wrapper(async (req, res) => {
  await db.stopSession({ userId: req.userId });
  res.clearCookie('sessionToken');
  res.redirect('/list/promoted/1');
}));

app.get('/login', wrapper((req, res) => {
  if (req.authenticated) { res.redirect('/list/promoted/1'); return; }
  res.render('login', { auth: req.authenticated });
}));

app.post('/classified', loginware, wrapper(async (req, res) => {
  for (const prop in req.body) {
    if (req.body[prop].length === 0) {
      res.render('create', { error: prop + ' can not be empty', auth: req.authenticated });
    }
  }
  req.body.userId = req.userId;

  if (req.files) {
    req.body.picture = req.files.picture.data;
    req.body.picture = await sharp(req.body.picture).resize(500, 500).toBuffer();
  }

  req.body.entityId = crypto.randomBytes(10).toString('hex');
  await db.createClassified(req.body);
  res.redirect(`/list/${req.body.type}/1`);
}));

app.post('/login', wrapper(async (req, res) => {
  userAssert(req.body.name !== null, 'Username cannot be null/undefined!');
  userAssert(req.body.password !== null, 'Password cannot be null/undefined!');

  const status = await db.authenticateUser({ username: req.body.name, password: req.body.password });

  if (!status.authenticated) {
    res.render('login', { error: status.message, auth: req.authenticated });
    return;
  }

  const secret = crypto.randomBytes(30).toString('hex');
  await db.login({ userId: status.user.id, secret });

  res.cookie('sessionToken', secret).redirect('/list/promoted/1');
}));
app.get('/list/:type/:id', loginware, async (req, res) => {
  assert(req.params.id != null);
  assert(+req.params.id >= 1, 'page not correct');
  assert(req.params.type != null);

  let classifieds = null;
  let rowCount = null;
  if (req.params.type !== 'promoted') {
    classifieds = await db.getClassifiedsByType({ type: req.params.type, offset: (req.params.id - 1) * 30, limit: 30 });

    classifieds.sort((a, b) => {
      if (a.status === 'authorized') {
        return 1;
      } else if (b.status === 'authorized') {
        return -1;
      }
    });
  } else {
    classifieds = await db.getPromotedClassifieds({ offset: (req.params.id - 1) * 30, limit: 30 });
  }

  if (classifieds[0]) {
    rowCount = +classifieds[0].count;
  }

  classifieds
    .filter(c => c.picture)
    .forEach(function (c) {
      c.picture = Buffer.from(c.picture).toString('base64');
    });

  classifieds
    .filter(c => c.description.length > 50)
    .forEach(function (c) {
      c.description = c.description.substring(0, 50) + '...';
    });

  const templateObj = {
    classifieds: OneDToTwoD(classifieds, 3),
    auth: req.authenticated,
    page: req.params.id,
    maxPage: Math.ceil(rowCount / 30),
    type: req.params.type,
    pages: [-10, -3, -2, -1, 0, 1, 2, 3, 10] // pagination rules
  };

  res.render('list', templateObj);
});

db.createTables()
  .then(() => {
    console.log('Tables created successful!');
    db.createIndexes().then(() => {
      console.log('Indexes created successful!');
      app.listen(port, () => {
        console.log('App working and listening on port ' + port);
      });
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
