var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// set up a mongoose model and pass it using module.exports
module.exports = mongoose.model('Request', new Schema({
    sender: String,
    receiver: String,
    date: String
}));