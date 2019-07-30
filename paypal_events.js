module.exports = {
  'PAYMENTS.PAYMENT.CREATED': async (db, paypal, resource) => {
    if (resource.intent === 'order') {
      const r = await db.findUserPayment(resource.id);
      if (!r) {
        return;
        // todo
      }
      const payerId = r.payer_id;
      const transactionId = r.transaction_id;
      const total = resource.transactions[0].amount.total;
      db.tx(async () => {
        const t = await paypal.execute({ transactionId, payerId, total });
        const r = await db.setPaymentState({ transactionId, state: t.state });
        await db.setUserTransactionState({ id: r.id, state: 'order_placed' });
      });
    } else {
      db.tx(async () => {
        await db.setTransactionState(resource);
        const r = await db.findTransaction(resource.id);
        if (!r) {
          return;
        }
        const payerId = r.payer_id;
        const transactionId = r.transaction_id;
        const total = resource.transactions[0].amount.total;
        await paypal.execute({ transactionId, payerId, total });
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
      });
    }
  }

};
