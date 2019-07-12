const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;
const DbManager= require('./DbManager');
const db_mannager = new DbManager();
const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const paypal = require('paypal-rest-sdk');
const bgn2dollarRate = 1.74;
app.use(express.static('public'));
app.set('view engine', 'pug');
app.use(cookieParser());

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json())
app.use(fileUpload());

paypal.configure({
    'mode': 'sandbox', //sandbox or live 
    'client_id': process.env.PAYPAL_KEY, // please provide your client id here 
    'client_secret': process.env.PAYPAL_SECRET // provide your client secret here 
});

const loginware = function (req, res, next) {
    if(req.cookies.sessionToken){
        db_mannager.findSession(req.cookies.sessionToken).then((ses,err)=>{
            if(err){
                req.authenticated = false
            }
            if(ses){
                req.authenticated = true
                if(ses.rows[0]){
                    req.userId = ses.rows[0].user_id
                }
                next()
            }else{
                next()
            }
        })  
    }else{
        next();
    }
}
app.use(loginware)
app.get('/promo',(req,res) => {
    if(!req.authenticated){res.redirect('/login'); return}
    db_mannager.getUserClassfieds(req.userId)
    .then((rows)=>{
        res.render('promo', {classifieds: rows.rows, auth: req.authenticated})
    }).catch(()=>{
        res.render('general_error', {error: "There was a problemm please try again later."})
    })
})
app.get('/promo/success', (req,res)=>{
    db_mannager.prepareTransaction(req.query.paymentId, req.query.token, req.query.PayerID)
    .then(r=>{
        db_mannager.getPromotions(req.query.paymentId)
        .then((rows)=>{
            if(rows.rows){
                res.render('promo_success', {classifieds: rows.rows, auth: req.authenticated})
                return;
            }
            res.render('general_error', {error: "There was a problem preparing your transactions!"})
       })
    }).catch((e)=>{
        res.render('general_error', {error: "There was a problem preparing your transactions!"})
    })
})
app.get('/', (req,res)=>{
    res.redirect('/list')
    return;
})
app.post('/confrim' , (req,res)=>{
    switch(req.body.event_type){
        case "PAYMENTS.PAYMENT.CREATED":
            db_mannager.setTransactionState(req.body.resource.id, req.body.resource.state)
            .then(()=>{
                console.log(req.body)
                if(req.body.resource.state = 'created'){
                    db_mannager.findTransaction(req.body.resource.id).then((r)=>{    
                        if(r.rows && r.rows[0]){
                            let payer_id = r.rows[0].payer_id
                            let transaction_id = r.rows[0].transaction_id
                                if(transaction_id == req.body.resource.id){
                                var execute_payment_json = {
                                    "payer_id": payer_id,
                                    "transactions": [{
                                        "amount": {
                                            "currency": "USD",
                                            "total": req.body.resource.transactions[0].amount.total
                                        }
                                    }]
                                };
                                paypal.payment.execute(transaction_id, execute_payment_json, function (error, payment) {
                                    if (error) {
                                        console.log(error.response);
                                        throw error;
                                    } else {
                                        console.log(payment);
                                    }
                                });
                            }
                        }
                    });
                }
            });
            break;
        case "PAYMENT.AUTHORIZATION.CREATED":
            console.log(req.body)
            let transaction_id = req.body.resource.parent_payment
            paypal.authorization.get(req.body.resource.id, (err, auth)=>{
                if(err){
                    console.log(err)
                }else{
                    if(auth.state != 'captured'){
                        paypal.authorization.capture(req.body.resource.id, {amount: {total: req.body.resource.amount.total, currency: req.body.resource.amount.currency}}, function(error,auth){
                            if(error){
                                console.log(error)
                            }else{
                                db_mannager.setTransactionState(transaction_id, "completed").then((r)=>{
                                    console.log('transaction updated')
                                    db_mannager.setPromotionStatus(transaction_id, "authorized").then((r)=>{
                                        console.log('prmotions updated')
                                    })
                                })
                            }
                        })
                    }
                }
            })
            break;
    }
})

app.get('/promo/error', (req,res)=>{
    res.render('general_error', {error: "Ther was a problem with your transaction. Please try again later"});
})

app.post('/promo', (req,res)=>{
    console.log(req.body)
    let classifieds_keys = Object.keys(req.body).filter(k=>k!='date')
    let calculation = calcPromotion(req.body.date, classifieds_keys.length)
    if(calculation.error){
        res.send(calculation)
        return;
    }
    console.log(classifieds_keys)
    var payment = {
        "intent": "authorize",
        "payer": {
            "payment_method": "paypal"
        },
        "redirect_urls": {
            "return_url": "https://80fb30e0.ngrok.io/promo/success",
            "cancel_url": "https://80fb30e0.ngrok.io/promo/error"
        },
        "transactions": [{
            "amount": {
                "total": calculation.value,
                "currency": "USD"
            },
            "description": "Classified promotions for: " + Object.keys(req.body).filter(k=>k!='date').join(', ')
        }]
    }
    createPay( payment ) 
       .then( ( transaction ) => {
            db_mannager.createTransaction(transaction.id, transaction.state, req.userId, Number(transaction.transactions[0].amount.total))
            .then((r)=>{
                console.log(r)
                let promises = []
                db_mannager.getTransaction(transaction.id).then(t=>{
                    console.log(t)
                    for(let key of classifieds_keys){
                        console.log(transaction.id)
                        if(req.body[key].lenght != 1){
                            promises.push(db_mannager.createPromotion(transaction.id, Number(key), req.body.date, "awaiting_auth"))
                        }
                    }
                    Promise.all(promises).then(()=>{
                        res.redirect(transaction.links.filter(l=>l.method == 'REDIRECT')[0].href)
                    })
                })
            }).catch((e)=>{
                console.log(e)
                res.render('promo', {error: "There was a problem with craeting yout transaction. Please try again"});
            })
        })
        .catch( ( err ) => { 
            console.log( err.response ); 
            res.render('promo', {error: "There was a prolbem with creating your payment. Please try again."});
        });
})
app.post('/calculate', (req, res)=>{
    res.send(calcPromotion(req.body.date,req.body.classifieds))
})
app.get('/register', (req,res)=>{
    if(req.authenticated) {res.redirect('/list'); return}
    res.render('register', {auth: req.authenticated});
})
app.post('/register', (req,res)=>{
    if(req.authenticated) {res.redirect('/list'); return}
    if(req.body.name.length != 0 && req.body.password.length !=0 && req.body.email.length != 0){
        db_mannager.createUser(req.body.name,req.body.password, req.body.email, req.body.gender, (r,err) => {
            if(err){
                console.log(err)
                throw err;
            }
            res.redirect('/login')
        }) 
    }
})
app.get('/classified/my', (req,res)=>{
    
})
app.post('/comment/new', (req,res)=>{
    if(!req.authenticated) {res.send({error: "No authentication"})}
    db_mannager.createComment(req.userId, req.body.entity, req.body.comment).then((r)=>{
        res.send({})
    }).catch(e=>{
        console.log(e)
        res.send({error: "there was a problem please try again later"})
    })
})
app.get('/classified/new', (req,res)=>{
    if(!req.authenticated) {res.redirect('/login')};
    console.log('tf')
    res.render('create', {auth: req.authenticated})
})
app.get('/classified/:id', (req,res)=>{
    db_mannager.getClassified(req.params.id)
    .then((r)=>{
        if(r.rowCount == 0){
            res.render('general_error', {error: 'Classified not found!'})
        }else{
            let comments = []
            let classified = {}
            res.render('classified', {c:r.rows[0],comments: r.rows, auth: req.authenticated})
        }
    }).catch(e=>{
        console.log(e)
        res.render('general_error', {error: "classified not found"})
    })
})
app.get('/logout', (req,res)=>{
    if(!req.authenticated){res.redirect('/'); return}
    if(req.userId){
        db_mannager.stopSession(req.userId).then(()=>{
            res.clearCookie("sessionToken");
            res.redirect('/list')
        })
    }
})
app.get('/login', (req,res)=>{
    if(req.authenticated){res.redirect('/list'); return}
    res.render('login', {auth: req.authenticated})
})
app.get('/list', (req,res)=>{
    db_mannager.getJoinedClassified().then((rows)=>{
        let formatted = OneDToTwoD(rows.rows, 3)
        console.log(rows.rows.sort((a,b)=>{
            if(a.status == null){
                return 1;
            }else if(b.status == null){
                return -1;
            }
        }))

        res.render('list', {classifieds: formatted, auth: req.authenticated})
    }).catch((e)=>{
        console.log(e)
        res.render('general_error', {error:'There was a problem. Please try again later'})
    })
})

app.post('/classified', (req,res) => {
    if(!req.authenticated) {res.redirect('/login'); return}
    for(let prop in req.body){
        if(req.body[prop].length == 0){
            res.render('create', {error: prop + ' can not be empty', auth: req.authenticated})
        }
    }
    const extension = req.files.picture.name.substring(req.files.picture.name.lastIndexOf('.')+1);
    const name = crypto.randomBytes(15).toString('hex')+ '.' + extension
    const path = `/images/${name}`
    req.files.picture.mv('./public' + path, function(error) {
        if(error){
            console.log(error);
            return res.render('create', {error: 'Cant move img', auth: req.authenticated});
        }
        db_mannager.createClassified(req.body.title,crypto.randomBytes(10).toString('hex'),req.userId, req.body.description,path, req.body.quantity)
        .then(()=>{
            res.redirect('/list')
        })
    });
})
app.post('/login', async(req,res)=>{
    if(req.authenticated){res.redirect('/list'); return}
    let status = db_mannager.authenticateUser(req.body.name,req.body.password, (status)=>{
        if(status.authenticated){
            let secret = crypto.randomBytes(30).toString("hex")
            db_mannager.login(status.user.id, secret)
            .then((r,err)=>{
                res.cookie('sessionToken' , secret).redirect('/list')
            })
        }else{
            res.render('login', {error: status.message, auth: req.authenticated})
        }
    })
})
db_mannager.createTables().then(()=>{
    console.log('Tables created successful!')
    app.listen(port, ()=>{
        console.log('App working and listening on port ' + port)
    })
})
function OneDToTwoD(array,lenght){
    let result = []
    let cont = array.slice(0);
    while(cont[0]) { 
        result.push(cont.splice(0, lenght)); 
    }
    return result
};
var createPay = ( payment ) => {
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
function calcPromotion(date, classifieds){
    const days = Math.ceil((new Date(date)-new Date())/(1000*60*60*24));

    if(isNaN(days) || days <= 0) {
        return({error: 'The period musts be at least one day'})
    }else if(!classifieds || classifieds <=0){
        return({error: 'Please select a classified!'})
    }else{
        return({value : ((days * 2 * classifieds) / bgn2dollarRate).toFixed(2)})
    }
}