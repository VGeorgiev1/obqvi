const Validator =  require('./RPCValidator');
let validator = new Validator();
const crypto = require('crypto')

class RPC{
    constructor(dbManager, promotionManager){
        this.version = '2.0';
        this.dbManager = dbManager;
        this.promotionManager = promotionManager
        this.methods = {
            createClassified:{
                strictParams: false,
                successMessage: "Classified created successfuly!",
                method: async(obj) =>{
                    obj.entity_id =  crypto.randomBytes(10).toString('hex')
                    return (await dbManager.createClassified(obj.tittle, obj.entity_id, obj.creator_id,obj.description,obj.picture, obj.price, obj.quantity)).rows[0].entity_id;
                }
            },
            calcPromotion:{
                strictParams: false,
                method: async(obj)=>{
                    return await promotionManager.calcPromotion(obj.date, obj.classifieds) 
                }
            },
            promoteClassified:{
                strictParams: false,
                method: async(obj)=>{
                    let link = await promotionManager.createPromotion(obj.date, obj.classifieds, obj.userId)
                    return link
                }
            }
        }
    }
    async execute(obj){
        let isValidJson = validator.validateJSON(obj)
        if(isValidJson.error){
            return this.reject(isValidJson)
        }
        let deffered = this.methods[obj.method].method;
        let strict = this.methods[obj.method].strictParams;
        let successMessage = this.methods[obj.method].successMessage;

        let res = validator.validateParameters(obj, strict)
        if(!res.error){
            try{
                let result = await deffered(obj.params)
                return this.response({id: obj.id, message: result})
            }catch(e){
                console.log(e)
                return this.reject(validator.errorCodes[4])
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