module.exports = {
  'PAYMENTS.PAYMENT.CREATED': async (db, paypal, resource) => {
    const total = resource.transactions[0].amount.total;
    if (resource.intent === 'order') {
      const payment = await db.findUserPayment(resource.id);
      if (!payment) {
        return;
        // todo
      }
      const payerId = payment.payer_id;
      const transactionId = payment.transaction_id;
      const order = await paypal.getPayment({ transactionId });
      if (order.transactions[0].related_resources[0].order.state !== 'COMPLETED') {
        db.tx(async () => {
          const t = await paypal.execute({ transactionId, payerId, total });
          const r = await db.setPaymentState({ transactionId, state: t.state });
          await db.setUserTransactionState({ id: r.id, state: 'order_placed' });
        }, (e) => {
          console.log(e);
        });
      }
    } else {
      db.tx(async () => {
        await db.setTransactionState(resource);
        const payment = await db.findTransaction(resource.id);
        if (!payment) {
          return;
        }
        const payerId = payment.payer_id;
        const transactionId = payment.transaction_id;
        await paypal.execute({ transactionId, payerId, total });
      }, (e) => {
        console.log(e);
      });
    }
  },
  'PAYMENT.AUTHORIZATION.CREATED': async (db, paypal, resource) => {
    const transactionId = resource.parent_payment;
    const auth = await paypal.getPaymentAuthoriztaion(resource.id);
    if (auth.state !== 'captured') {
      db.tx(async () => {
        await paypal.capturePayment({ transactionId: resource.id, total: resource.amount.total });
        console.log('Payment captured!');
        await db.setTransactionState({ transactionId, state: 'completed' });
        await db.setPromotionStatus({ transactionId, state: 'authorized' });
      }, (e) => {
        console.log(e);
      });
    }
  }

};
