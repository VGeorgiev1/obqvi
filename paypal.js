
const paypal = require('paypal-rest-sdk');
const events = require('./PaypalDict');
class Paypal {
  constructor (mode, clientId, clientSecret) {
    paypal.configure({
      mode: mode, // sandbox or live
      client_id: clientId, // please provide your client id here
      client_secret: clientSecret // provide your client secret here
    });
    this.events = events;
  }

  createPay (payment) {
    return new Promise((resolve, reject) => {
      paypal.payment.create(payment, function (err, payment) {
        if (err) {
          reject(err);
          return;
        }
        resolve(payment);
      });
    });
  }

  createWebhooks (url, events) {
    const createWebhookJson = {
      url: url,
      event_types: events
    };
    return new Promise((resolve, reject) => {
      paypal.notification.webhook.list(async (err, webhooks) => {
        if (err) {
          throw err;
        }
        if (webhooks.webhooks[0]) {
          paypal.notification.webhook.del(webhooks.webhooks[0].id, (err) => {
            if (err) {
              reject(err);
            }
            resolve();
          });
        } else {
          paypal.notification.webhook.create(createWebhookJson, (err, webhook) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(webhook);
          });
        }
      });
    });
  }

  getOrder (transactionId) {
    return new Promise((resolve, reject) => {
      paypal.order.get(transactionId, function (err, order) {
        if (err) {
          reject(err);
          return;
        }
        resolve(order);
      });
    });
  }

  execute ({ transactionId, payerId, amount }) {
    return new Promise((resolve, reject) => {
      const executePaymentJson = {
        payer_id: payerId,
        transactions: [{
          amount: {
            currency: 'USD',
            total: amount
          }
        }]
      };
      paypal.payment.execute(transactionId, executePaymentJson, function (err, payment) {
        if (err) {
          console.log(err.response);
          reject(err);
        } else {
          resolve(payment);
        }
      });
    });
  }

  getPaymentAuthoriztaion (transactionId) {
    return new Promise((resolve, reject) => {
      paypal.authorization.get(transactionId, (err, auth) => {
        if (err) {
          console.log(err.response);
          reject(err);
        } else {
          resolve(auth);
        }
      });
    });
  }

  capturePayment ({ transactionId, amount }) {
    return new Promise((resolve, reject) => {
      paypal.authorization.capture(transactionId, { amount: { total: amount, currency: 'USD' }, is_final_capture: true }, (err, auth) => {
        if (err) {
          console.log(err.response);
          reject(err);
        } else {
          resolve(auth);
        }
      });
    });
  }

  orderAuthorize ({ oderId, total }) {
    return new Promise((resolve, reject) => {
      paypal.order.authorize(oderId, { amount: { total, currency: 'USD' } }, function (err, auth) {
        if (err) {
          reject(err);
        } else {
          resolve(auth);
        }
      });
    });
  }

  captureOrder ({ orderId, total }) {
    return new Promise((resolve, reject) => {
      paypal.order.capture(orderId, { amount: { total, currency: 'USD' }, is_final_capture: true }, (err, auth) => {
        if (err) {
          console.log(err.response);
          reject(err);
        } else {
          resolve(auth);
        }
      });
    });
  }

  getPayment (transactionId) {
    return new Promise((resolve, reject) => {
      paypal.payment.get(transactionId, (err, auth) => {
        if (err) {
          console.log(err.response);
          reject(err);
        } else {
          resolve(auth);
        }
      });
    });
  }

  getOrderAuthorization (transactionId) {
    return new Promise((resolve, reject) => {
      paypal.order.get(transactionId, (err, auth) => {
        if (err) {
          console.log(err.response);
          reject(err);
        } else {
          resolve(auth);
        }
      });
    });
  }
}
module.exports = Paypal;

// create payment
// get payment t.transactions[0].related_resources[0].orde.id
// authorize order
// capture order
