const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;
const DbManager= require('./DbManager');
const db_mannager = new DbManager();
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

app.use(bodyParser.urlencoded({extended: true}));
app.set('view engine', 'pug');
app.use(express.static('public'));
app.use(cookieParser());

const loginware = function (req, res, next) {
    if(req.cookies.sessionToken){
        db_mannager.findSession(req.cookies.sessionToken).then((ses,err)=>{
            if(err){
                req.authenticated = false
            }
            if(ses && ses.rows[0].exists){
                req.authenticated = ses.rows[0].exists
            }else{
                next()
            }
        })  
    }else{
        next();
    }
}
app.use(loginware)

app.get('/register', (req,res)=>{
    res.render('register');
})
app.post('/register', (req,res)=>{
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
app.get('/login', (req,res)=>{
    res.render('login')
})
app.get('/list', (req,res)=>{
    res.send('ok')
})
app.post('/login', async(req,res)=>{
    let status = db_mannager.authenticateUser(req.body.name,req.body.password, (status)=>{
        console.log(status)
        if(status.authenticated){
            let secret = crypto.randomBytes(30).toString("hex")
            db_mannager.login(status.user.id, secret)
            .then((r,err)=>{
                res.cookie('sessionToken' , secret).redirect('/list')
            })
        }else{
            res.render('login', {error: status.message})
        }
    })
})
db_mannager.createTables().then(()=>{
    console.log('Tables created successful!')
    app.listen(port, ()=>{
        console.log('App working and listening on port ' + port)
    })
})