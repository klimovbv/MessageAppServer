var express     = require('express');
var app         = express();
var bodyParser  = require('body-parser');
var morgan      = require('morgan');
var mongoose    = require('mongoose');
var http = require('http'),
    path = require('path');
var url = require('url');
var assert = require('assert');


var jwt    = require('jsonwebtoken'); // used to create, sign, and verify tokens
var config = require('./config'); // get our config file
var User   = require('./app/models/user'); // get our mongoose model

var fs = require('fs');
var multiparty = require('multiparty');
var request = require('request');

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
            console.log('user found', req.body.username);
            // check if password matches
            if (user.password != req.body.password) {
                res.json({ success: false, message: 'Authentication failed. Wrong password.' });
            } else {
                console.log('password correct----');
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

apiRoutes.put('/avatar', function(req, res) {
    console.log('connected /avatar---');
    // создаем форму
    var form = new multiparty.Form();
    //здесь будет храниться путь с загружаемому файлу, его тип и размер
    var uploadFile = {uploadPath: '', type: '', size: 0};
    //максимальный размер файла
    var maxSize = 20 * 1024 * 1024; //2MB
    //поддерживаемые типы(в данном случае это картинки формата jpeg,jpg и png)
    var supportMimeTypes = ['image/jpg', 'image/jpeg', 'image/png'];
    //массив с ошибками произошедшими в ходе загрузки файла
    var errors = [];

    var filePath;

    var token = req.body.token || req.query.token || req.headers['x-access-token'];

    var fileName = jwt.verify(token, app.get('superSecret'));

    //если произошла ошибка
    form.on('error', function(err){
        if(fs.existsSync(uploadFile.path)) {
            //если загружаемый файл существует удаляем его
            fs.unlinkSync(uploadFile.path);
            console.log('error');
        }
    });

    form.on('close', function() {
        //если нет ошибок и все хорошо
        if(errors.length == 0) {
            //сообщаем что все хорошо
            console.log('path=========', filePath);
            User.update({
                username: fileName
            }, {$set: {avatarUrl: filePath}}, function (err, itemsUpdated) {
                if (err) {
                    console.log(err);
                } else if (itemsUpdated) {
                    console.log('Updated successfully end', itemsUpdated);
                } else {
                    console.log('User not found in DB');
                }
            });
            res.json({url : filePath});
        }
        else {
            if(fs.existsSync(uploadFile.path)) {
                //если загружаемый файл существует удаляем его
                fs.unlinkSync(uploadFile.path);

                User.update({
                    username: fileName
                }, {$set: {avatarIrl: filePath}}, function (err, itemsUpdated) {
                    if (err) {
                        console.log(err);
                    } else if (itemsUpdated) {
                        console.log('Updated successfully exist', itemsUpdated);
                        res.json({
                            success: true
                        });
                    } else {
                        console.log('User not found in DB');
                    }
                });
            }
            //сообщаем что все плохо и какие произошли ошибки
            res.send({status: 'bad', errors: errors});
        }
    });

    // при поступление файла
    form.on('part', function(part) {
        //читаем его размер в байтах
        uploadFile.size = part.byteCount;
        //читаем его тип
        uploadFile.type = part.headers['content-type'];
        //путь для сохранения файла
        uploadFile.path = './files/' + fileName + '.jpeg'/*part.filename*/;
        filePath = 'http://192.168.0.101:8888/api/files/' + fileName + '.jpeg'/*part.filename*/;

        //проверяем размер файла, он не должен быть больше максимального размера
        if(uploadFile.size > maxSize) {
            errors.push('File size is ' + uploadFile.size + '. Limit is' + (maxSize / 1024 / 1024) + 'MB.');
        }

        //проверяем является ли тип поддерживаемым
        if(supportMimeTypes.indexOf(uploadFile.type) == -1) {
            errors.push('Unsupported mimetype ' + uploadFile.type);
        }

        //если нет ошибок то создаем поток для записи файла
        if(errors.length == 0) {
            var out = fs.createWriteStream(uploadFile.path);
            part.pipe(out);
        }
        else {
            //пропускаем
            //вообще здесь нужно как-то остановить загрузку и перейти к onclose
            part.resume();
        }
    });

    // парсим форму
    form.parse(req);

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
        displayName: username,
        password: password,
        /*id: '',*/
        avatarUrl: '',
        isContact: true
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
            displayName: username,
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
            }, {$set: {displayName: displayname, email: email}}, function (err, itemsUpdated) {
                if (err) {
                    console.log(err);
                } else if (itemsUpdated) {
                    console.log('Updated successfully', itemsUpdated);
                    res.json({
                        displayName: displayname,
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
/*apiRoutes.get('/users', function(req, res) {
    User.find({}, function(err, users) {
        res.json(users);
    });
});*/

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
                    console.log(' decoded token username', decoded);

                    // return the information including token as JSON
                    res.json(user);
                }

            });

        }
    });

});

apiRoutes.get('/files/*', function(req, res){
    console.log('request url', req.url);
    var file = __dirname + req.url;
    var filename = path.basename(file);
    /*var mimetype = mime.lookup(file);*/

    /*res.setHeader('Content-disposition', 'attachment; filename=' + filename);*/
    /*res.setHeader('Content-type', mimetype);*/

    var filestream = fs.createReadStream(file);
    filestream.pipe(res);

});

//--------------------------------------------------------//
//Contact Services//
//-------------------------------------------------------//
apiRoutes.get('/users', function(req, res) {
    var urlq = req.url;
    console.log('url----', urlq);
    var url_parts = url.parse(urlq, true);
    console.log('url_parts----', url_parts);
    var query = url_parts.query;
    console.log('query----', query.query);
    var queryForSearch = /*'/.*' + */query.query/* + '.*!/i'*/;
    console.log('queryForSearch ==== ', queryForSearch);

    /*var cursor = */User.find({username: new RegExp(queryForSearch, 'i')}/*{ $in: query}*/, function(err, users) {
        console.log('result search---', users);
        res.send({users: users,
        query: queryForSearch});

    });
    /*
    User.find({}, function(err, users) {
        res.json(users);
    });*/
});



// apply the routes to our application with the prefix /api
app.use('/api', apiRoutes);
// =======================
// start the server ======
// =======================
app.listen(port);
console.log('Magic happens at http://localhost:' + port);