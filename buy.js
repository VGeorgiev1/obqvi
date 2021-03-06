const assert = require('./assert').assert;
class Buy {
  constructor (db, paypal, host) {
    this.db = db;
    this.host = host;
    this.paypal = paypal;
  }

  async buy (buyerId, entityId, quantity, callback, errorback) {
    const classified = await this.db.getClassified({ entityId });
    if (quantity > classified.quantity) {
      // eslint-disable-next-line standard/no-callback-literal
      callback({ error: 'Invalid quantity' });
    }

    const payment = {
      intent: 'order',
      payer: {
        payment_method: 'paypal'
      },
      redirect_urls: {
        return_url: this.host + '/buy/success',
        cancel_url: this.host + '/buy/error'
      },
      transactions: [{
        item_list: {
          items: [{
            name: 'Order for ' + classified.title,
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

    this.db.tx(async (client) => {
      const transaction = await this.paypal.createPay(payment);

      assert(transaction != null, 'transaction is null');
      if (classified.quantity - quantity === 0) {
        await this.db.closeClassified({ entityId: classified.entity_id });
      }
      await this.db.setQuantity({ entityId: classified.entity_id, quantity: classified.quantity - quantity });

      const amount = classified.price * quantity;
      const p = await this.db.createPayment(
        {
          client,
          transactionId: transaction.id,
          from: buyerId,
          state: transaction.state,
          amount,
          quantity,
          entityId: classified.entity_id
        }
      );

      await this.db.createUserTransaction(
        {
          client,
          userPaymentId: p.id,
          from: buyerId,
          to: classified.creator_id,
          state: 'awaiting_buyer_consent',
          amount
        }
      );

      callback(transaction);
    }, errorback);
  }

  async ship (transactionId, userId, callback, errorback) {
    const payment = await this.db.getPayment({ transactionId, userId });
    if (!payment) { errorback({ error: 'No payments found!' }); return; }

    const trId = payment.transaction_id;
    const pay = await this.paypal.getPayment({ transactionId: trId });

    assert(pay != null, 'transaction is not defined!');
    assert(typeof pay === 'object', 'transaction is not aa object');
    const transaction = pay.transactions[0];
    const order = transaction.related_resources[0].order;

    const orderId = order.id;
    const total = transaction.amount.total;
    const state = order.state;

    payment.entityId = payment.classified_entity;

    this.db.tx(async (client) => {
      if (state === 'COMPLETED') {
        await this.db.setUserTransactionState({ client, id: payment.id, state: 'order_completed' });
        callback();
        return;
      } else {
        const payId = await this.db.setPaymentState({ transactionId: trId, state: state });
        const transaction = await this.paypal.orderAuthorize({ orderId, total });

        await this.db.setPaymentState({ client, transactionId: trId, state: transaction.state });
        await this.paypal.captureOrder({ client, orderId, total });
        await this.db.setUserTransactionState({ client, id: payId, state: 'order_completed' });
        const user = await this.db.getUser({ userId });
        await this.paypal.payout({ email: user.email });
      }
      callback();
    }, errorback);
  }
}

module.exports = Buy;
