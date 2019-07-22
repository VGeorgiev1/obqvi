

module.exports={
    createClassified: {
        "tittle" : "string",
        "entity_id": "string",
        "description": "string",
        "quantity": "number",
        "picture": Buffer
    },
    validate(method, obj, strictArgs){
        if(this[method]){
            if(strictArgs && (Object.keys(this[method]).length != Object.keys(obj).length)){
                return false
            }
            for(let prop in obj){
                let type = this[method][prop];
                if(typeof obj[prop] == 'object' && type instanceof Object){
                    if(!(obj[prop] instanceof type)){
                        return false;
                    }
                }else{
                    if(typeof obj[prop] != type){
                        return false;
                    }
                }
            }
            return true;
        }else{
            return false;
        }
    }
}