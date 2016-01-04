var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// set up a mongoose model and pass it using module.exports
module.exports = mongoose.model('Message', new Schema({
    sender: String,
    recipient: String,
    imageUrl: String,
    message: String
}));