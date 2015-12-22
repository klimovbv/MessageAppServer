var express     = require('express');
var app         = express();
var bodyParser  = require('body-parser');
var morgan      = require('morgan');
var mongoose    = require('mongoose');

var jwt    = require('jsonwebtoken'); // used to create, sign, and verify tokens
var config = require('./config'); // get our config file
var User   = require('./app/models/user'); // get our mongoose model

// =======================
// configuration =========
// =======================
var port = process.env.PORT || 8888; // used to create, sign, and verify tokens
mongoose.connect(config.database); // connect to database
app.set('superSecret', config.secret); // secret variable

// use body parser so we can get info from POST and/or URL parameters
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// use morgan to log requests to the console
app.use(morgan('dev'));

// =======================
// routes ================
// =======================
// basic route
app.get('/', function(req, res) {
    res.send('Hello! The API is at http://localhost:' + port + '/api');
});

// get an instance of the router for api routes
var apiRoutes = express.Router();

// route to authenticate a user (POST http://localhost:8080/api/authenticate)
apiRoutes.post('/token', function(req, res) {
    console.log('connected---');
    // find the user
    User.findOne({
        username: req.body.username
    }, function(err, user) {

        if (err) throw err;

        if (!user) {
            res.json({ success: false, message: 'Authentication failed. User not found.' });
        } else if (user) {

            // check if password matches
            if (user.password != req.body.password) {
                res.json({ success: false, message: 'Authentication failed. Wrong password.' });
            } else {

                // if user is found and password is right
                // create a token
                var token = jwt.sign(req.body.username, app.get('superSecret'), {
                    expiresIn: 1000 * 60 * 60 // expires in 24 hours
                });

                console.log('token !!!', token);

                // return the information including token as JSON
                /*res.send(token.json);*/
                res.json({
                    success: true,
                    message: 'Enjoy your token!',
                    token: token
                });
            }

        }

    });
});

//-----------------------------//
apiRoutes.post('/account', function(req, res) {
    console.log('connected to account register ---', req.body.username + ' / ' + req.body.email + ' / ' + req.body.password);
    var username = req.body.username;
    var displayname = req.body.displayname;
    var email = req.body.email;
    var password = req.body.password;

    var newUser = new User({
        username: username,
        email: email,
        displayname: username,
        password: password
    });

    // save the sample user
    newUser.save(function(err) {
        if (err) throw err;

        console.log('User saved successfully');

        var token = jwt.sign(username, app.get('superSecret'), {
            expiresIn: 1000 * 60 * 60 // expires in 24 hours
        });

        console.log('token !!!', token);
        res.json({
            success: true,
            username: username,
            displayname: username,
            email: email,
            token: token

        });
    });
});

apiRoutes.put('/account', function(req, res) {
    var displayname = req.body.displayname;
    var email = req.body.email;

    var token = req.body.token || req.query.token || req.headers['x-access-token'];
    jwt.verify(token, app.get('superSecret'), function(err, decoded) {
        if (err) {
            return res.json({ success: false, message: 'Failed to authenticate token.' });
        } else {
            // if everything is good, save to request for use in other routes
            User.update({
                username: decoded
            }, {$set: {displayname: displayname, email: email}}, function (err, itemsUpdated) {
                if (err) {
                    console.log(err);
                } else if (itemsUpdated) {
                    console.log('Updated successfully', itemsUpdated);
                    res.json({
                        displayname: displayname,
                        email: email
                    });
                } else {
                    console.log('User not found in DB');
                }
            });
        }
    });
});

apiRoutes.put('/password', function(req, res) {
    console.log('connected to account update prof ---', req.body.newPassword);

    var newPassword = req.body.newPassword;

    var token = req.body.token || req.query.token || req.headers['x-access-token'];
    jwt.verify(token, app.get('superSecret'), function(err, decoded) {
        if (err) {
            return res.json({ success: false, message: 'Failed to authenticate token.' });
        } else {
            // if everything is good, save to request for use in other routes
            User.update({
                username: decoded
            }, {$set: {password: newPassword}}, function (err, itemsUpdated) {
                if (err) {
                    console.log(err);
                } else if (itemsUpdated) {
                    console.log('Updated successfully', itemsUpdated);
                    res.json({
                        success: true
                    });
                } else {
                    console.log('User not found in DB');
                }
            });
        }
    });
});

// TODO: route middleware to verify a token
apiRoutes.use(function(req, res, next) {

    // check header or url parameters or post parameters for token
    var token = req.body.token || req.query.token || req.headers['x-access-token'];

    // decode token
    if (token) {

        // verifies secret and checks exp
        jwt.verify(token, app.get('superSecret'), function(err, decoded) {
            if (err) {
                return res.json({ success: false, message: 'Failed to authenticate token.' });
            } else {
                // if everything is good, save to request for use in other routes
                req.decoded = decoded;
                console.log(' decoded token ', decoded);
                next();
            }
        });

    } else {

        // if there is no token
        // return an error
        return res.status(403).send({
            success: false,
            message: 'No token provided.'
        });

    }
});

// route to show a random message (GET http://localhost:8080/api/)
apiRoutes.get('/', function(req, res) {
    res.json({ message: 'Welcome to the coolest API on earth!' });
});

// route to return all users (GET http://localhost:8080/api/users)
apiRoutes.get('/users', function(req, res) {
    User.find({}, function(err, users) {
        res.json(users);
    });
});

//get user for login with token
apiRoutes.get('/account', function(req, res) {
    var token = req.headers['x-access-token'];
    console.log('getting...', token);

    jwt.verify(token, app.get('superSecret'), function(err, decoded) {
        if (err) {
            return res.json({ success: false, message: 'Failed to authenticate token.' });
        } else {
            // if everything is good, save to request for use in other routes
            req.decoded = decoded;
            /*console.log(' decoded token ', decoded);*/

            User.findOne({
                username: decoded

            }, function(err, user) {

                if (err) throw err;

                if (!user) {
                    res.json({ success: false, message: 'Authentication failed. User not found.' });
                } else if (user) {
                    console.log(' decoded token username', decoded)

                    // return the information including token as JSON
                    res.json(user);
                }

            });

        }
    });

});



// apply the routes to our application with the prefix /api
app.use('/api', apiRoutes);
// =======================
// start the server ======
// =======================
app.listen(port);
console.log('Magic happens at http://localhost:' + port);