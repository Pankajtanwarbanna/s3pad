const constant  = require('./constants');

const logger = (type, message) => {
    console.log(constant.COLOR[type], `[s3pad] ${message}`); 
}

module.exports = logger; 