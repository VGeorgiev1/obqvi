const Validator =  require('./RPCValidator');

const crypto = require('crypto')

class RPC{
    constructor(dbManager, promotionManager){
        this.version = '2.0';
        this.dbManager = dbManager;
        this.promotionManager = promotionManager
        this.methods = {
            createClassified:{
                strictParams: false,
                params:{
                    "tittle" : {type:"string", required: true},
                    "description": {type:"string", required: true},
                    "quantity": {type: "number"},
                    "price": {type:'number'},
                    "picture": {type: Buffer}
                },
                method: async(obj) =>{
                    obj.entity_id =  crypto.randomBytes(10).toString('hex')
                    return (await dbManager.createClassified(obj.tittle, obj.entity_id, obj.user_id,obj.description,obj.picture, obj.price, obj.quantity)).rows[0].entity_id;
                }
            },
            calcPromotion:{
                strictParams: false,
                params: {
                    "date" : {type: "string", required: true},
                    "classifieds": {type: "number", required: true}
                },
                method: async(obj)=>{
                    return await promotionManager.calcPromotion(obj.date, obj.classifieds) 
                }
            },
            promoteClassified:{
                strictParams: false,
                params: {
                    "date" : {type: "string", required: true},
                    "classifieds": {type: Array, required: true}
                },
                method: async(obj)=>{
                    let link = await promotionManager.createPromotion(obj.date, obj.classifieds, obj.user_id)
                    return link
                }
            }
        }
        this.validator = new Validator(this.methods, dbManager);
    }
    async execute(obj){
        
        let validJsonRes = this.validator.validateJSON(obj)
        if(validJsonRes.error){
            return this.reject(validJsonRes)
        }
        let validApiKeyRes = await this.validator.validateApiKey(obj.params.api_key)

        if(validApiKeyRes.error){
            return this.reject(validApiKeyRes)
        }
        
        let deffered = this.methods[obj.method].method;
        let strict = this.methods[obj.method].strictParams;
        let successMessage = this.methods[obj.method].successMessage;
        
        delete obj.params.api_key;
        let res = this.validator.validateParameters(obj, strict)
        if(!res.error){
            try{
                obj.params.user_id = validApiKeyRes
                let result = await deffered(obj.params)
                return this.response({id: obj.id, message: result})
            }catch(e){
                console.log(e)
                return this.reject(this.validator.errorCodes[4])
            }
        }else{
            return this.reject(res)
        }
    }
    reject(res){
        return {
            "jsonrpc": this.version,
            "error": {"code": res.error.code, "message": res.error.message},
            "id": null
        }
    }
    response(res){
        return {
            "jsonrpc": this.version,
            "result": res.message,
            "id": res.id
        }
    }
}

module.exports = RPC