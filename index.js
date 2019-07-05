const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3000;
const DbManager= require('./DbManager');
const db_mannager = new DbManager();
const bcrypt = require('bcrypt');
const saltRounds = 10;

app.use(bodyParser.urlencoded({extended: true}));
app.set('view engine', 'pug');
app.use(express.static('public'));


app.get('/register', (req,res)=>{
    return res.render('register');
})
app.post('/register', (req,res)=>{
    console.log(req.body)
    if(req.body.name.length != 0 && req.body.password.length !=0 && req.body.email.length != 0){
        bcrypt.hash(req.body.password, saltRounds, (err, hash) => {
            if(err){
                console.log(err)
            }else{
                db_mannager.createUser(req.body.name,hash, req.body.email, req.body.gender)
                .then(res=>{
                    console.log(res)
                });
            }
        });
    }
})

db_mannager.createTables().then(()=>{
    console.log('Tables created successful!')
    app.listen(port, ()=>{
        console.log('App working and listening on port ' + port)
    })
})