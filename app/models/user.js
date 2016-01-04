var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// set up a mongoose model and pass it using module.exports
module.exports = mongoose.model('User', new Schema({
    email: String,
    password: String,
    /*id: String,*/
    isContact: Boolean,
    displayName: String,
    username: String,
    avatarUrl: String,
    friends: Array

}));