
const paypal = require('paypal-rest-sdk');
const events = require('./paypal_events');
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
        if (!webhooks.webhooks[0]) {
          paypal.notification.webhook.create(createWebhookJson, (err, webhook) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(webhook);
          });
        }
        paypal.notification.webhook.del(webhooks.webhooks[0].id, (err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
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

  execute ({ transactionId, payerId, total }) {
    return new Promise((resolve, reject) => {
      const executePaymentJson = {
        payer_id: payerId,
        transactions: [{
          amount: {
            currency: 'USD',
            total: total
          }
        }]
      };
      paypal.payment.execute(transactionId, executePaymentJson, function (err, payment) {
        if (err) {
          reject(err);
          return;
        }
        resolve(payment);
      });
    });
  }

  getPaymentAuthoriztaion (transactionId) {
    return new Promise((resolve, reject) => {
      paypal.authorization.get(transactionId, (err, auth) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(auth);
      });
    });
  }

  capturePayment ({ transactionId, total }) {
    return new Promise((resolve, reject) => {
      paypal.authorization.capture(transactionId, { amount: { total: total, currency: 'USD' }, is_final_capture: true }, (err, auth) => {
        if (err) {
          console.log(err);
          reject(err);
          return;
        }
        resolve(auth);
      });
    });
  }

  orderAuthorize ({ orderId, total }) {
    return new Promise((resolve, reject) => {
      paypal.order.authorize(orderId, { amount: { total, currency: 'USD' } }, function (err, auth) {
        if (err) {
          reject(err);
          return;
        }
        resolve(auth);
      });
    });
  }

  captureOrder ({ orderId, total }) {
    return new Promise((resolve, reject) => {
      paypal.order.capture(orderId, { amount: { total, currency: 'USD' }, is_final_capture: true }, (err, auth) => {
        if (err) {
          reject(err);
        } else {
          resolve(auth);
        }
      });
    });
  }

  getPayment ({ transactionId }) {
    return new Promise((resolve, reject) => {
      paypal.payment.get(transactionId, (err, auth) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(auth);
      });
    });
  }

  getOrderAuthorization (transactionId) {
    return new Promise((resolve, reject) => {
      paypal.order.get(transactionId, (err, auth) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(auth);
      });
    });
  }
}
module.exports = Paypal;
