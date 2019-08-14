const fs = require('fs');

let data = fs.readFileSync('./OO.png');
console.log(data.toString('base64'))
//console.log(Buffer.from(data.toString('base64'), 'base64'));