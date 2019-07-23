
class RPCValidator{
    constructor(){
        this.errorCodes= [
            {error:{message: "Parse error!", code: -32700}, http_status: 500},
            {error:{message: "Invalid Request", code: -32600}, http_status: 400},
            {error:{message: "Method not found!", code: -32601}, http_status: 404},
            {error:{message: "Invalid params!", code: -32602}, http_status: 500},
            {error:{message: "Internal error!", code: -32603}, http_status: 500},
            {message: "Valid", http_status: 200}
        ]
        this.createClassified = {
            "tittle" : {type:"string", required: true},
            "creator_id": {type:"number", required: true},
            "description": {type:"string", required: true},
            "quantity": {type: "number"},
            "price": {type:'number'},
            "picture": {type: Buffer}
        }
        this.promoteClassified = {
            "date" : {type: "string", required: true},
            "userId": {type: 'number', required: true},
            "classifieds": {type: Array, required: true}
        }
        this.calcPromotion = {
            "date" : {type: "string", required: true},
            "classifieds": {type: "number", required: true}
        }
    }

    validateJSON(obj){
        try{
            JSON.stringify(obj);
            if(!obj.jsonrpc || obj.jsonrpc != '2.0' || !obj.method || !this[obj.method] || !obj.params || !obj.id){
                return this.errorCodes[1];
            }else{
                return this.errorCodes[5];
            }
        }catch(e){
            return this.errorCodes[0];
        }
    }
    validateParameters(obj, strictArgs){
        if(this[obj.method]){
            if(strictArgs && (Object.keys(this[obj.method]).length != Object.keys(obj.params).length)){
                return this.errorCodes[0];
            }
            let required = Object.keys(this[obj.method]).filter(k=>this[obj.method][k].required);
            for(let prop in obj.params){
                if(!this[obj.method][prop]) {
                    return this.errorCodes[3]
                }
                let type = this[obj.method][prop].type;
                if(typeof obj.params[prop] == 'object' && type instanceof Object){
                    if(!(obj.params[prop] instanceof type)){
                        return this.errorCodes[3];
                    }
                }else{
                    if(typeof obj.params[prop] != type){
                        return this.errorCodes[3];
                    }
                }
                if(this[obj.method][prop].required){
                    required.splice(required.indexOf(prop), 1)
                }
            }
            if(required.length == 0){
                return this.errorCodes[5];
            }else{
                return this.errorCodes[3];
            }
        }else{
            return this.errorCodes[2];
        }
    }
}

module.exports = RPCValidator

    