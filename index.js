const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const port = 3000
const DbManager = require('./DbManager')
const PaypalManager = require('./paypal')
const dbManager = new DbManager()
const paypalManager = new PaypalManager('sandbox', process.env.PAYPAL_KEY, process.env.PAYPAL_SECRET)
const fileUpload = require('express-fileupload')
const cookieParser = require('cookie-parser')
const crypto = require('crypto')
const bgn2dollarRate = 1.74
const host = 'https://e70f28bd.ngrok.io'

app.use(express.static('public'))
app.set('view engine', 'pug')
app.use(cookieParser())

app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(fileUpload())
const loginware = function (req, res, next) {
  if (req.cookies.sessionToken) {
    dbManager.findSession(req.cookies.sessionToken)
      .then((ses, err) => {
        if (err) {
          req.authenticated = false
        }
        if (ses) {
          if (ses.rows[0]) {
            req.authenticated = true
            req.userId = ses.rows[0].user_id
          }
          next()
        } else {
          res.redirect('/login')
        }
      })
  } else {
    res.redirect('/login')
  }
}
app.get('/promo', loginware, (req, res) => {
  dbManager.getUserClassfieds(req.userId)
    .then((rows) => {
      console.log(rows.rows)
      res.render('promo', { classifieds: rows.rows, auth: req.authenticated })
    }).catch((e) => {
      console.log(e)
      res.render('general_error', { error: 'There was a problemm please try again later.' })
    })
})
app.get('/shipments/my', loginware, (req, res) => {
  dbManager.getShipments(req.userId)
    .then(rows => {
      res.render('shipments', { classifieds: rows.rows, auth: req.authenticated })
    })
})
app.get('/promo/success', loginware, (req, res) => {
  dbManager.prepareTransaction(req.query.paymentId, req.query.token, req.query.PayerID)
    .then(r => {
      dbManager.getPromotions(req.query.paymentId)
        .then((rows) => {
          if (rows.rows) {
            console.log(rows.rows)
            res.render('promo_success', { classifieds: rows.rows, auth: req.authenticated })
            return
          }
          res.render('general_error', { error: 'There was a problem preparing your transactions!' })
        })
    }).catch((e) => {
      res.render('general_error', { error: 'There was a problem preparing your transactions!' })
    })
})
app.get('/buy/success', loginware, (req, res) => {
  dbManager.prepareUserPayment(req.query.paymentId, req.query.token, req.query.PayerID)
    .then(r => {
      dbManager.setUserTransactionState(r.rows[0].id, 'buyer_approved').then(() => {
        res.render('buy_success', { auth: req.authenticated })
      }).catch(e => {
        console.log(e)
      })
    }).catch((e) => {
      console.log(e)
      res.render('general_error', { error: 'There was a problem preparing your transactions!' })
    })
})
app.get('/', (req, res) => {
  res.redirect('/list')
})
app.post('/rpc', (req,res)=>{
	res.setHeader('Content-Type', 'application/json-rpc');
	if(req.headers['content-type'] != 'application/json'|| req.headers['content-type'] != 'application/json-rpc'){
		res.send({"jsonrpc": "2.0", "error": {"code": -32700, "message": "Invalid Request"}, "id": null})
	}
})
app.post('/confrim', loginware, async (req, res) => {
  switch (req.body.event_type) {
    case 'PAYMENTS.PAYMENT.CREATED':
      if (req.body.resource.state === 'created') {
        if (req.body.resource.intent === 'order') {
          dbManager.findUserPayment(req.body.resource.id)
            .then(async (r) => {
              if (r.rows && r.rows[0]) {
                const payerId = r.rows[0].payerId
                const transactionId = r.rows[0].transaction_id
                if (transactionId === req.body.resource.id) {
                  try {
                    const t = await paypalManager.execute(req.body.resource.id, payerId, req.body.resource.transactions[0].amount.total)
                    dbManager.setPaymentState(req.body.resource.id, t.state)
                      .then((r) => {
                        dbManager.setUserTransactionState(r.rows[0].id, 'order_placed').catch(e => {
                          console.log(e)
                        })
                      }).catch(e => {
                        console.log(e)
                      })
                  } catch (e) {
                    console.log(e)
                  }
                }
              }
            })
        } else {
          dbManager.setTransactionState(req.body.resource.id, req.body.resource.state)
            .then(() => {
              dbManager.findTransaction(req.body.resource.id)
                .then(async (r) => {
                  if (r.rows && r.rows[0]) {
                    const payerId = r.rows[0].payerId
                    const transactionId = r.rows[0].transaction_id
                    if (transactionId === req.body.resource.id) {
                      try {
                        await paypalManager.execute(transactionId, payerId, req.body.resource.transactions[0].amount.total)
                      } catch (e) {
                        console.log(e)
                      }
                    }
                  }
                })
            })
        }
      }
      break
    case 'PAYMENT.AUTHORIZATION.CREATED':
      console.log(req.body)
      const transactionId = req.body.resource.parent_payment
      try {
        const auth = await paypalManager.getPaymentAuthoriztaion(req.body.resource.id)

        if (auth.state !== 'captured') {
          await paypalManager.capturePayment(req.body.resource.id, req.body.resource.amount.total)
          dbManager.setTransactionState(transactionId, 'completed')
            .then((r) => {
              console.log('transaction updated')
              dbManager.setPromotionStatus(transactionId, 'authorized')
                .then((r) => {
                  console.log('prmotions updated')
                })
            })
        }
      } catch (e) {
        console.log(e)
      }
      break
  }
})

app.get('/promo/error', loginware, (req, res) => {
  res.render('general_error', { error: 'Ther was a problem with your transaction. Please try again later' })
})

app.post('/promo', loginware, async (req, res) => {
  const classifiedKeys = Object.keys(req.body).filter(k => k !== 'date')
  const calculation = calcPromotion(req.body.date, classifiedKeys.length)
  if (calculation.error) {
    res.send(calculation)
    return
  }
  var payment = {
    intent: 'authorize',
    payer: {
      payment_method: 'paypal'
    },
    redirect_urls: {
      return_url: host + '/promo/success',
      cancel_url: host + '/promo/error'
    },
    transactions: [{
      amount: {
        total: calculation.value,
        currency: 'USD'
      },
      description: 'Classified promotions for: ' + Object.keys(req.body).filter(k => k !== 'date').join(', ')
    }]
  }
  const transaction = await paypalManager.createPay(payment)
  dbManager.createTransaction(transaction.id, transaction.state, req.userId, Number(transaction.transactions[0].amount.total))
    .then((r) => {
      const promises = []
      dbManager.getTransaction(transaction.id)
        .then(t => {
          for (const key of classifiedKeys) {
            if (req.body[key].lenght !== 1) {
              promises.push(dbManager.createPromotion(transaction.id, key, req.body.date, 'awaiting_auth')
                .catch(e => {
                  console.log(e)
                }))
            }
          }
          Promise.all(promises)
            .then(() => {
              res.redirect(transaction.links.filter(l => l.method === 'REDIRECT')[0].href)
            })
        })
    }).catch((e) => {
      console.log(e)
      res.render('promo', { error: 'There was a problem with craeting yout transaction. Please try again' })
    })
})
app.post('/calculate', loginware, (req, res) => {
  res.send(calcPromotion(req.body.date, req.body.classifieds))
})
app.get('/register', (req, res) => {
  if (req.authenticated) { res.redirect('/list') }
  res.render('register', { auth: req.authenticated })
})
app.post('/register', loginware, (req, res) => {
  if (req.authenticated) { res.redirect('/list') }
  if (req.body.name.length !== 0 && req.body.password.length !== 0 && req.body.email.length !== 0) {
    dbManager.createUser(req.body.name, req.body.password, req.body.email, req.body.gender, (r, err) => {
      if (err) {
        console.log(err)
        throw err
      }
      res.redirect('/login')
    })
  }
})
app.post('/comment/new', loginware, (req, res) => {
  dbManager.createComment(req.userId, req.body.entity, req.body.comment)
    .then((r) => {
      res.send({})
    }).catch(e => {
      console.log(e)
      res.send({ error: 'there was a problem please try again later' })
    })
})
app.get('/classified/new', loginware, (req, res) => {
  res.render('create', { auth: req.authenticated })
})
app.post('/buy/:id', loginware, (req, res) => {
  const quantity = Number(req.body.quantity)
  if (quantity <= 0) {
    res.send({ error: 'Invalid quantity' })
    return
  }
  dbManager.getClassified(req.params.id)
    .then(async (r) => {
      const classified = r.rows[0]

      if (quantity > classified.quantity) {
        res.send({ error: 'Invalid quantity' })
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
      const transaction = await paypalManager.createPay(payment)
      dbManager.createPayment(transaction.id, req.userId, transaction.state, Number(transaction.transactions[0].amount.total), quantity, classified.entity_id)
        .then((r) => {
          dbManager.createUserTransaction(r.rows[0].id, req.userId, classified.creator_id, 'awaiting_buyer_consent', Number(transaction.transactions[0].amount.total))
            .then((r) => {
              res.send(transaction.links.filter(l => l.method === 'REDIRECT')[0].href)
            })
        }).catch((e) => {
          console.log(e)
          res.render('general_error', { error: 'There was a problem with craeting yout transaction. Please try again' })
        })
    })
})
app.post('/ship', loginware, async (req, res) => {
  try {
    const pRows = await dbManager.getPayment(req.body.payment_id, req.userId)
    if (pRows.rows.length === 0) { res.send({ error: 'No payments found!' }) };

    const payment = pRows.rows[0]
    const tr = await paypalManager.getPayment(payment.transaction_id)
    if (tr.transactions[0].related_resources[0].order.state === 'COMPLETED') {
      await dbManager.setUserTransactionState(payment.id, 'order_completed')
      await dbManager.setQuantity(payment.classified_entity, payment.quantity - payment.order_quantity)
      res.send('Transaction Completed')
    } else {
      const r = await dbManager.setPaymentState(payment.transaction_id, tr.transactions[0].related_resources[0].order.state)
      const t = await paypalManager.orderAuthorize(tr.transactions[0].related_resources[0].order.id, tr.transactions[0].amount.total)

      await dbManager.setPaymentState(payment.transaction_id, t.state)
      await paypalManager.captureOrder(tr.transactions[0].related_resources[0].order.id, tr.transactions[0].amount.total)
      await dbManager.setUserTransactionState(r.rows[0].id, 'order_completed')
      await dbManager.setQuantity(payment.id, payment.quantity - payment.order_quantity)
      res.send('Transaction Completed')
    }
  } catch (e) {
    console.log(e)
    res.send({ error: 'There was an error. Please try again later' })
  }
})
app.get('/classified/:id', loginware, (req, res) => {
  dbManager.getJoinedClassified(req.params.id)
    .then((r) => {
      if (r.rowCount === 0) {
        res.render('general_error', { error: 'Classified not found!' })
      } else {
        r.rows[0].picture = Buffer.from(r.rows[0].picture).toString('base64')
        res.render('classified', { c: r.rows[0], comments: r.rows.filter(r => r.comment_date !== null), auth: req.authenticated })
      }
    }).catch(e => {
      console.log(e)
      res.render('general_error', { error: 'classified not found' })
    })
})
app.get('/logout', loginware, (req, res) => {
  if (req.userId) {
    dbManager.stopSession(req.userId)
      .then(() => {
        res.clearCookie('sessionToken')
        res.redirect('/list')
      })
  }
})
app.get('/login', loginware, (req, res) => {
  if (req.authenticated) { res.redirect('/list'); return }
  res.render('login', { auth: req.authenticated })
})
app.get('/list', loginware, (req, res) => {
  dbManager.getClassfiedPromotion()
    .then((rows) => {
      const formatted = OneDToTwoD(rows.rows, 3)
      rows.rows.sort((a, b) => {
        if (a.status === 'authorized') {
          return 1
        } else if (b.status === 'authorized') {
          return -1
        }
      })
      for (const row of rows.rows) {
        row.picture = Buffer.from(row.picture).toString('base64')
      }
      res.render('list', { classifieds: formatted, auth: req.authenticated })
    }).catch((e) => {
      console.log(e)
      res.render('general_error', { error: 'There was a problem. Please try again later' })
    })
})

app.post('/classified', loginware, (req, res) => {
  for (const prop in req.body) {
    if (req.body[prop].length === 0) {
      res.render('create', { error: prop + ' can not be empty', auth: req.authenticated })
    }
  }
  console.log(req.files)
  dbManager.createClassified(req.body.title,
    crypto.randomBytes(10).toString('hex'),
    req.userId, req.body.description,
    req.files.picture.data,
    req.body.price,
    req.body.quantity)
    .then(() => {
      res.redirect('/list')
    })
})
app.post('/login', async (req, res) => {
  if (req.authenticated) { res.redirect('/list'); return }
  dbManager.authenticateUser(req.body.name, req.body.password, (status) => {
    if (status.authenticated) {
      const secret = crypto.randomBytes(30).toString('hex')
      dbManager.login(status.user.id, secret)
        .then((r, err) => {
          res.cookie('sessionToken', secret).redirect('/list')
        })
    } else {
      res.render('login', { error: status.message, auth: req.authenticated })
    }
  })
})

dbManager.createTables()
  .then(() => {
    console.log('Tables created successful!')
    app.listen(port, () => {
      console.log('App working and listening on port ' + port)
    })
  })

function OneDToTwoD (array, lenght) {
  const result = []
  const cont = array.slice(0)
  while (cont[0]) {
    result.push(cont.splice(0, lenght))
  }
  return result
};

function calcPromotion (date, classifieds) {
  const days = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24))

  if (isNaN(days) || days <= 0) {
    return ({ error: 'The period musts be at least one day' })
  } else if (!classifieds || classifieds <= 0) {
    return ({ error: 'Please select a classified!' })
  } else {
    return ({ value: ((days * 2 * classifieds) / bgn2dollarRate).toFixed(2) })
  }
}
