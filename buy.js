const assert = require('./assert');
class Buy {
  constructor (db, paypal, host) {
    this.db = db;
    this.host = host;
    this.paypal = paypal;
  }

  async buy (buyerId, entityId, quantity, callback, errorback) {
    const classified = await this.db.getClassified(entityId);
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

    this.db.tx(async () => {
      const transaction = await this.paypal.createPay(payment);

      assert(transaction != null);

      const amount = classified.price * quantity;
      const p = await this.db.createPayment(
        {
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

    payment.quantity -= payment.order_quantity;
    payment.entityId = payment.classified_entity;

    this.db.tx(async () => {
      if (state === 'COMPLETED') {
        await this.db.setUserTransactionState({ id: payment.id, state: 'order_completed' });
        await this.db.setQuantity(payment);

        callback();
        return;
      } else {
        const payId = await this.db.setPaymentState({ transactionId: trId, state: state });
        const transaction = await this.paypal.orderAuthorize({ orderId, total });

        await this.db.setPaymentState({ transactionId: trId, state: transaction.state });
        await this.paypal.captureOrder({ orderId, total });
        await this.db.setUserTransactionState({ id: payId, state: 'order_completed' });
        await this.db.setQuantity(payment);
      }
      callback();
    }, errorback);
  }
}

module.exports = Buy;
