const validator = require('./RPCParameters').validate;

class RPC{
    constructor(db_manager){
        this.version = '2.0';
        this.db_manager = db_manager;
        this.methods = {
            createClassified = async(obj) =>{
                await db_manager.createClassified(obj.tittle, obj.entity_id, obj.creator,obj.description,obj.picture, obj.price, obj.quantity)
            }
        }
        for(let method in this.methods) {
            let deffered = this.methods[method];
            this.methods[method] = (obj) =>{
                if(validator(obj)){
                    deffered(obj)
                }else{
                    //to do errors 
                }
            }
        }
    }
    response(res){
        if(res.error){
            return {
                "jsonrpc": this.version,
                "error": {"code": this.code, "message": errorMsg},
                "id": null
            }
        }else{
            return {
             "jsonrpc": this.version,
             "res": res.res,
             "id": res.id
            }
        }
    }
    createClassified(obj){
    }


}
let rpc = new RPC({'helllo': 2})

rpc.createClassified({
    "tittle" : "string",
    "entity_id": 'hello',
    "description": "hi",
    "quantity": 5,
    "picture": new Buffer([1,2,3])
})