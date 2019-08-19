module.exports = {
  'PAYMENTS.PAYMENT.CREATED': async (db, paypal, resource) => {
    const total = resource.transactions[0].amount.total;
    if (resource.intent === 'order') {
      console.log('order');
      const payment = await db.findUserPayment({ transactionId: resource.id });
      if (!payment) {
        return;
        // todo
      }
      const payerId = payment.payer_id;
      const transactionId = payment.transaction_id;
      const order = await paypal.getPayment({ transactionId });
      if (!order.transactions[0].related_resources[0] || order.transactions[0].related_resources[0].order.state !== 'COMPLETED') {
        db.tx(async (client) => {
          const t = await paypal.execute({ transactionId, payerId, total });
          const paymentId = await db.setPaymentState({ client, transactionId, state: t.state });
          console.log('Order executed!');
          console.log(paymentId);
          await db.setUserTransactionState({ client, id: paymentId, state: 'order_placed' });
        }, (e) => {
          console.log(e);
        });
      }
    } else {
      db.tx(async (client) => {
        resource.client = client;
        await db.setTransactionState(resource);
        const payment = await db.findTransaction({ client, transactionId: resource.id });
        if (!payment) {
          return;
        }
        const payerId = payment.payer_id;
        const transactionId = payment.transaction_id;
        await paypal.execute({ transactionId, payerId, total });
        console.log('Payment executed!');
      }, (e) => {
        console.log(e);
      });
    }
  },
  'PAYMENT.AUTHORIZATION.CREATED': async (db, paypal, resource) => {
    const transactionId = resource.parent_payment;
    const auth = await paypal.getPaymentAuthoriztaion(resource.id);
    if (auth.state !== 'captured') {
      db.tx(async (client) => {
        await paypal.capturePayment({ transactionId: resource.id, total: resource.amount.total });
        console.log('Payment captured!');
        await db.setTransactionState({ client, transactionId, state: 'completed' });
        await db.setPromotionStatus({ client, transactionId, state: 'authorized' });
      }, (e) => {
        console.log(e);
      });
    }
  },
  'PAYMENT.AUTHORIZATION.VOIDED': async (db, paypal, resource) => {
    console.log(resource);
  }

};
