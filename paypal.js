
const paypal = require('paypal-rest-sdk');
const events = require('./PaypalDict'); 
class Paypal{
    constructor(mode,client_id,client_secret){
        paypal.configure({
            'mode': mode, //sandbox or live 
            'client_id': client_id, // please provide your client id here 
            'client_secret': client_secret // provide your client secret here 
        });
        this.events = events
    }
    createPay( payment ){
        return new Promise( ( resolve , reject ) => {
            paypal.payment.create( payment , function( err , payment ) {
                if ( err ) {
                    reject(err);
                    return; 
                }
                resolve(payment); 
                
            }); 
        });
    }
    createWebhooks(url, events){
        const createWebhookJson = {
            "url": url,
            "event_types": events
        };
        return new Promise( ( resolve , reject ) => {
            paypal.notification.webhook.list(async (error, webhooks) => {
                if (error) {
                    throw error;
                }
                if(webhooks.webhooks[0]){
                    paypal.notification.webhook.del(webhooks.webhooks[0].id, cb);
                }else{
                    paypal.notification.webhook.create(createWebhookJson, (error, webhook) => {
                        if (error) {
                            reject(error);
                            return;
                        }
                        resolve(payment); 
                    });
                }
            });
            
        })
    }
    getOrder(transactionId){
        return new Promise( ( resolve , reject ) => {
            paypal.order.get(transactionId, function (error, order) {
                if (error) {
                    reject(error);
                    return;
                } 
                resolve(order);
            });
        })
    }
    execute({transactionId, payerId, amount}){
        return new Promise( ( resolve , reject ) => {
            let executePaymentJson = {
                "payer_id": payerId,
                "transactions": [{
                    "amount": {
                        "currency": "USD",
                        "total": amount
                    }
                }]
            };
            paypal.payment.execute(transactionId, executePaymentJson, function (error, payment) {
                if (error) {
                    console.log(error.response);
                    reject(error); 
                } else {
                    resolve(payment); 
                }
            });
        })
    }
    getPaymentAuthoriztaion(transactionId){
        return new Promise( ( resolve , reject ) => {
            paypal.authorization.get(transactionId, (err, auth)=>{
                if (err) {
                    console.log(error.response);
                    reject(err); 
                } else {
                    resolve(auth); 
                }
            })
        })
    }

    capturePayment({transactionId, amount}){
        return new Promise( ( resolve , reject ) => {
            paypal.authorization.capture(transactionId, {"amount": {total: amount, currency: "USD"}, "is_final_capture": true}, (error,auth)=>{
                if (error) {
                    console.log(error.response);
                    reject(err); 
                } else {
                    resolve(auth); 
                }
            })
        })
    }
    orderAuthorize({oderId, total}){
        return new Promise( ( resolve , reject ) => {
            paypal.order.authorize(oderId, {"amount": {total, currency: "USD"}}, function (error, auth) {
                if (error) {
                    reject(error);
                } else {
                    resolve(auth);
                }
            });
        })
    }
    captureOrder({orderId, total}){
        return new Promise( ( resolve , reject ) => {
            paypal.order.capture(orderId, {"amount": {total, currency: "USD"}, "is_final_capture": true}, (error,auth)=>{
                if (error) {
                    console.log(error.response);
                    reject(error); 
                } else {
                    resolve(auth); 
                }
            })
        })
    }
    getPayment(transactionId){
        return new Promise( ( resolve , reject ) => {
            paypal.payment.get(transactionId, (error,auth)=>{
                if (error) {
                    console.log(error.response);
                    reject(error); 
                } else {
                    resolve(auth); 
                }
            })
        })
    }
    getOrderAuthorization(transactionId){
        return new Promise( ( resolve , reject ) => {
            paypal.order.get(transactionId, (err, auth)=>{
                if (err) {
                    console.log(err.response);
                    reject(err); 
                } else {
                    resolve(auth); 
                }
            })
        })
    }
}
module.exports = Paypal;

//create payment
//get payment t.transactions[0].related_resources[0].orde.id
//authorize order
//capture order