const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;
const DbManager= require('./DbManager');
const db_mannager = new DbManager();
const fileUpload = require('express-fileupload');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const paypal = require('paypal-rest-sdk')

app.use(express.static('public'));
app.set('view engine', 'pug');
app.use(cookieParser());
app.use(bodyParser.urlencoded({extended: true}));
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
                req.userId = ses.rows[0].user_id
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
        res.render('promo', {classifieds: rows.rows})
    })
})
app.post('/calc', (req, res)=>{

    const days = Math.ceil((new Date(req.body.date)-new Date())/(1000*60*60*24));
    

    res.send('ok')
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
        res.render('list', {classifieds: formatted, auth: req.authenticated})
    })
})
app.get('/classified/new', (req,res)=>{
    if(!req.authenticated) {res.redirect('/login')};
    res.render('create', {auth: req.authenticated})
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
        db_mannager.createClassified(req.body.title,req.userId, req.body.description,path, req.body.quantity)
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
	