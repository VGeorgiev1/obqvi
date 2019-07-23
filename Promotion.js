class Promotion{
    constructor(paypalManager, dbManager, host){
        this.paypalManager = paypalManager;
        this.dbManager = dbManager;
        this.host = host;
        this.bgn2dollarRate = 1.74;
    }
    async createPromotion(to,classifiedKeys, userId){
        const calculation = this.calcPromotion(to, classifiedKeys.length)
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
              description: `Classified promotion for ${classifiedKeys.lenght} promotion until ${to}`
            }]
        }
        const transaction = await this.paypalManager.createPay(payment)
        await this.dbManager.createTransaction(transaction.id, transaction.state, userId, Number(transaction.transactions[0].amount.total))
        const promises = []
        await this.dbManager.getTransaction(transaction.id)
        for (const key of classifiedKeys) {
            promises.push(this.dbManager.createPromotion(transaction.id, key, to, 'awaiting_auth'))
        }
        await Promise.all(promises)
        return transaction.links.filter(l => l.method === 'REDIRECT')[0].href

    }
    calcPromotion(date, classifieds){
        const days = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24))

        if (isNaN(days) || days <= 0) {
            return ({ error: 'The period musts be at least one day' })
        } else if (!classifieds || classifieds <= 0) {
            return ({ error: 'Please select a classified!' })
        } else {
            return ({ value: ((days * 2 * classifieds) / this.bgn2dollarRate).toFixed(2) })
        }
    }

}
module.exports = Promotion