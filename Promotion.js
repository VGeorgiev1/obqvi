class Promotion{
    constructor(paypalManager, db, host){
        this.paypalManager = paypalManager;
        this.db = db;
        this.host = host;
        this.bgn2dollarRate = 1.74;
    }
    async createPromotion({to,keys, userId}){
        const calculation = this.calcPromotion({to, classifiedsCount: keys.length})
        if (calculation.error) {
            throw new Error(calculation.error)
        }
        var payment = {
            intent: 'authorize',
            payer: {
              payment_method: 'paypal'
            },
            redirect_urls: {
              return_url: this.host + '/promo/success',
              cancel_url: this.host + '/promo/error'
            },
            transactions: [{
              amount: {
                total: calculation.value,
                currency: 'USD'
              },
              description: `Classified promotion for ${keys.lenght} promotion until ${to}`
            }]
        }
        const transaction = await this.paypalManager.createPay(payment)
        let transaction = {
            transactionId: transaction.id,
            state: transaction.state,
            userId,
            amount: Number(transaction.transactions[0].amount.total)
        }
        await this.db.createTransaction(transaction)
        const promises = []
        await this.db.getTransaction(transaction.id)
        for (const classifiedId of keys) {
            promises.push(this.db.createPromotion({transactionId: transaction.id, classifiedId, to, status:'awaiting_auth'}))
        }
        await Promise.all(promises)
        return transaction.links.filter(l => l.method === 'REDIRECT')[0].href

    }
    calcPromotion({to, classifiedsCount}){
        const days = Math.ceil((new Date(to) - new Date()) / (1000 * 60 * 60 * 24))

        if (isNaN(days) || days <= 0) {
            return ({ error: 'The period musts be at least one day' })
        } else if (!classifiedsCount || classifiedsCount <= 0) {
            return ({ error: 'Please select a classified!' })
        } else {
            return ({ value: ((days * 2 * classifiedsCount) / this.bgn2dollarRate).toFixed(2) })
        }
    }

}
module.exports = Promotion