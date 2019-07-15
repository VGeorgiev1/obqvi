
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
                    reject(err); 
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
        "return_url": "https://50a4d145.ngrok.io/buy/success",
        "cancel_url": "https://50a4d145.ngrok.io/buy/error"
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