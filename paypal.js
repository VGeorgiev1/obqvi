
const paypal = require('paypal-rest-sdk');
class PaypalManager{
    constructor(mode,client_id,client_secret){
        paypal.configure({
            'mode': mode, //sandbox or live 
            'client_id': client_id, // please provide your client id here 
            'client_secret': client_secret // provide your client secret here 
        });
    }
    createPay( payment ){
        return new Promise( ( resolve , reject ) => {
            paypal.payment.create( payment , function( err , payment ) {
                if ( err ) {
                    reject(err); 
                }
                else {
                    resolve(payment); 
                }
            }); 
        });
    }
    createWebhooks(url, events){
        var create_webhook_json = {
            "url": url,
            "event_types": events
        };
        return new Promise( ( resolve , reject ) => {
            paypal.notification.webhook.list(async (error, webhooks) => {
                if (error) {
                    throw error;
                } else {
                    let cb = ()=>{
                        paypal.notification.webhook.create(create_webhook_json, function (error, webhook) {
                                if (error) {
                                    reject(error); 
                                } else {
                                    resolve(payment); 
                                }
                        });
                    }
                    if(webhooks.webhooks[0]){
                        paypal.notification.webhook.del(webhooks.webhooks[0].id, cb)
                    }else{
                        cb()
                    }
                }
            });
            
        })
    }
    getOrder(transaction_id){
        return new Promise( ( resolve , reject ) => {
            paypal.order.get(transaction_id, function (error, order) {
                if (error) {
                    console.log(error);
                    reject(error)
                } else {
                    resolve(order)
                }
            });
        })
    }
    execute(transaction_id, payer_id, amount){
        return new Promise( ( resolve , reject ) => {
            let execute_payment_json = {
                "payer_id": payer_id,
                "transactions": [{
                    "amount": {
                        "currency": "USD",
                        "total": amount
                    }
                }]
            };
            paypal.payment.execute(transaction_id, execute_payment_json, function (error, payment) {
                if (error) {
                    console.log(error.response);
                    reject(error); 
                } else {
                    resolve(payment); 
                }
            });
        })
    }
    getPaymentAuthoriztaion(transaction_id){
        return new Promise( ( resolve , reject ) => {
            paypal.authorization.get(transaction_id, (err, auth)=>{
                if (err) {
                    console.log(error.response);
                    reject(err); 
                } else {
                    resolve(auth); 
                }
            })
        })
    }

    capturePayment(transaction_id, amount){
        return new Promise( ( resolve , reject ) => {
            paypal.authorization.capture(transaction_id, {"amount": {total: amount, currency: "USD"}, "is_final_capture": true}, (error,auth)=>{
                if (error) {
                    console.log(error.response);
                    reject(err); 
                } else {
                    resolve(auth); 
                }
            })
        })
    }
    orderAuthorize(transaction_id, amount){
        return new Promise( ( resolve , reject ) => {
            paypal.order.authorize(transaction_id, {"amount": {total: amount, currency: "USD"}}, function (error, auth) {
                if (error) {
                    reject(error)
                } else {
                    resolve(auth)
                }
            });
        })
    }
    captureOrder(transaction_id, amount){
        return new Promise( ( resolve , reject ) => {
            paypal.order.capture(transaction_id, {"amount": {total: amount, currency: "USD"}, "is_final_capture": true}, (error,auth)=>{
                if (error) {
                    console.log(error.response);
                    reject(error); 
                } else {
                    resolve(auth); 
                }
            })
        })
    }
    getPayment(transaction_id){
        return new Promise( ( resolve , reject ) => {
            paypal.payment.get(transaction_id, (error,auth)=>{
                if (error) {
                    console.log(error.response);
                    reject(error); 
                } else {
                    resolve(auth); 
                }
            })
        })
    }
    getOrderAuthorization(transaction_id){
        return new Promise( ( resolve , reject ) => {
            console.log(transaction_id)
            paypal.order.get(transaction_id, (err, auth)=>{
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
let manager = new PaypalManager('sandbox', process.env.PAYPAL_KEY, process.env.PAYPAL_SECRET)
var payment = {
    "intent": "order",
    "payer": {
        "payment_method": "paypal"
    },
    "redirect_urls": {
        "return_url": "https://408be49f.ngrok.io/buy/success",
        "cancel_url": "https://408be49f.ngrok.io/buy/error"
    },
    "transactions": [{
        "item_list": {
            "items": [{
                "name": "item",
                "sku": "item",
                "price": "5",
                "currency": "USD",
                "quantity": "1"
            }]
        },
        "amount": {
            "currency": "USD",
            "total": "5"
        },
        "description": "Order for "
    }]
};
module.exports = PaypalManager;

//create payment
//get payment t.transactions[0].related_resources[0].orde.id
//authorize order
//capture order