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
var Request = require('./app/models/contactrequest');
var Message = require('./app/models/message');

var fs = require('fs');
var multiparty = require('multiparty');
var request = require('request');
var usernameFromToken;

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
                console.log('path=========', filePath);
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
                usernameFromToken = decoded;
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
    if (queryForSearch == ''){
        console.log('null query!!!!!')
        res.send({
            users:[],
            query: queryForSearch});
    } else {
        console.log('userNameFromToken ==== ', usernameFromToken);


        User.find({$and: [{ username: new RegExp(queryForSearch, 'i')}, { username: {$ne: usernameFromToken}}]}/*{ $in: query}*/, function (err, users) {
            console.log('result search---', users);

            res.send({
                users: users,
                query: queryForSearch
            });
        });
    }
});

//------------------------------------------------------------------//
//Contacts API//
//------------------------------------------------------------------//

apiRoutes.post('/contact-requests/*', function(req, res) {
    console.log('IN CAONTACT_REQUEST');
    console.log('connected to CONTACT REQUEST ---', req.params[0]);
    var exist = 0;
    var date = new Date();
    var createdAt = date.getUTCFullYear() + '-' + date.getUTCMonth()+1 + '-'  + date.getUTCDate() + '-'  + date.getUTCHours()
        + '-' + date.getMinutes();

    Request.findOne({$and: [{sender: usernameFromToken}, {receiver: req.params[0]}]}, function(err, result){
        if (result){
            console.log('such request exist');
        } else{
            console.log('no such request');
            User.findOne({username: usernameFromToken}, function(err, user){

                console.log('user.friends------', user.friends);
                for (var i = 0; i < user.friends.length; i++){
                    if (req.params[0] == user.friends[i]){
                        console.log('obje ==== name');
                        exist = 1;
                        break;
                    }
                }

                if (exist == 1){
                    res.send({success: false});
                } else {
                    var newRequest = new Request({
                        sender: usernameFromToken,
                        receiver: req.params[0],
                        createdAt: createdAt
                    });

                    // save the sample user
                    newRequest.save(function(err) {
                        if (err) throw err;

                        console.log('Request saved successfully');

                        res.json({
                            success: true
                        });
                    });
                }
            });
        }
    });
});

apiRoutes.get('/contact-requests/sent', function(req, res){
    console.log('USERNAME in get REQUESTS === ', usernameFromToken);
    console.log('contact-requests/sent--------');
    var result = [];


    Request.find({sender: usernameFromToken}, function(err,contactreq){
        contactreq.forEach(function (obje){
            User.findOne({username: obje.receiver}, function(err, user){
                /*console.log('findOneRequest: ', user);*/
                result.push({isFromUs: true,
                user: user,
                createdAt: obje.createdAt
                });
                if (result.length == contactreq.length) {
                    console.log('result size: ', result.length + '  ' + contactreq.length);
                    res.send({
                        requests: result
                    })

                }
            });
            console.log('found requests: ', obje.receiver);
        });
        });
});


apiRoutes.get('/contact-requests/received', function(req, res){
    console.log('USERNAME in get REQUESTS === ', usernameFromToken);
    console.log('contact-requests/received--------');
    var result = [];


    Request.find({receiver: usernameFromToken}, function(err,contactreq){
        contactreq.forEach(function (obje){
            User.findOne({username: obje.sender}, function(err, user){
                /*console.log('findOneRequest: ', user);*/
                result.push({isFromUs: false,
                    user: user,
                    createdAt: obje.createdAt
                });
                if (result.length == contactreq.length) {
                    console.log('result size: ', result.length + '  ' + contactreq.length);
                    res.send({
                        requests: result
                    })

                }
            });
            console.log('found requests: ', obje.receiver);
        });
    });
});

apiRoutes.put('/contact-requests/*', function(req, res) {
    console.log('IN Contact_REQUEST_response');
    console.log('connected to CONTACT Response to REQUEST ---', req.body.response);

    if (req.body.response == 'accept'){
        User.update({username : usernameFromToken}, {$push:{friends: req.params[0]}}, function (next){
            User.update({username: req.params[0]}, {$push:{friends: usernameFromToken}}, function (next){
                Request.remove({$and: [{sender: req.params[0]}, {receiver: usernameFromToken}]}, function(next){
                    res.json({
                        success: true
                    })
                });
            });

        });
    } else {
        Request.remove({$and: [{sender: req.params[0]}, {receiver: usernameFromToken}]}, function(next){
            res.json({
                success: true
            })
        });
    }
});

apiRoutes.get('/contacts', function(req, res){
    console.log('contacts GET--------', usernameFromToken);
    var result = [];

    User.findOne({username: usernameFromToken}, function(err,user){
        user.friends.forEach(function (obje){
            User.findOne({username: obje}, function(err, userToSend){
                console.log('findOneRequest: ', userToSend);
                result.push(userToSend);
                if (result.length == user.friends.length) {
                    console.log('result size: ', result.length + '  ' + user.friends.length);
                    res.send({
                        contacts: result
                    })

                }
            });
        });
    });
});


apiRoutes.delete('/contacts/*', function(req, res) {
    console.log('IN Contact_DELETE');

    User.update({username : usernameFromToken}, {$pull:{friends: req.params[0]}}, function (next){
        User.update({username: req.params[0]}, {$pull:{friends: usernameFromToken}}, function (next){
                res.json({
                    success: true
                })
        });
    });
});

//---------------------------------//
//Message API//
//---------------------------------//

apiRoutes.post('/messages', function(req, res) {
    console.log('connected /messages POST---');
    // создаем форму
    var form = new multiparty.Form();
    //здесь будет храниться путь с загружаемому файлу, его тип и размер
    var uploadFile = {uploadPath: '', type: '', size: 0};
    //максимальный размер файла
    var maxSize = 20 * 1024 * 1024; //20MB
    //поддерживаемые типы(в данном случае это картинки формата jpeg,jpg и png)
    var supportMimeTypes = ['image/jpg', 'image/jpeg', 'image/png'];
    //массив с ошибками произошедшими в ходе загрузки файла
    var errors = [];
    var filePath;
    var fileName;
    var receiver;
    var message;
    var createdAt;
    console.log('Message from url === ', req.part);

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
            console.log('path=========', filePath + ' RECEIVER == ' + receiver);


            var newMessage = new Message({
                sender: usernameFromToken,
                recipient: receiver,
                imageUrl: filePath,
                longMessage: message,
                createdAt: createdAt,
                isRead: false
            });

            // save the sample user
            newMessage.save(function(err, message) {
                if (err) throw err;

                console.log('Message saved successfully --', message);

                res.json({
                    message: message
                });
            });

        }
        else {
            //сообщаем что все плохо и какие произошли ошибки
            res.send({status: 'bad', errors: errors});
        }
    });

    form.on('field', function(err, field) {
         console.log('on FIELD -- TO ' + field);
        if (message == null) {
            message = field;
            console.log('MESSAGE -------', message);
        } else {
            receiver = field;
            console.log('on receiver  ' + receiver);
        }
    });


    // при поступление файла
    form.on('part', function(part) {

        console.log('RECEIVER==');
        //читаем его размер в байтах
        uploadFile.size = part.byteCount;
        console.log('uploadFile.size ', uploadFile.size );
        //читаем его тип
        uploadFile.type = part.headers['content-type'];
        console.log('uploadFile.type', uploadFile.type);
        var date = new Date();

        createdAt = date.getUTCFullYear() + '-' + date.getUTCMonth()+1 + '-'  + date.getUTCDate() + '-'  + date.getUTCHours()
            + '-' + date.getMinutes();
        var formatedDate = createdAt + "-" + date.getSeconds();


        fileName = usernameFromToken + "_" + receiver + "_" + formatedDate;
        console.log('fileName in PART === ', fileName);
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

apiRoutes.get('/messages', function(req, res) {
    console.log('messages/RECEIVED--------');
    var result = [];

    var urlq = req.url;
    console.log('url----', urlq);
    var url_parts = url.parse(urlq, true);
    console.log('url_parts----', url_parts);
    var query = url_parts.query;
    var includeSent = query.includeSent;
    console.log('--includeSend ', includeSent);
    var includeReceived = query.includeReceived;
    console.log('--includeReceived ', includeReceived);
    var contactName = query.contactId;

    if (includeSent == "true") {
        console.log('includeSent');

        if (includeReceived == "true"){
            console.log('includeSent && includeReceived');
            Message.find({sender: {$in: [usernameFromToken, contactName]}}, function(err,messages){
                var mLength = messages.length;
                console.log('MESSAGES LENGTH', messages.length);
                messages.forEach(function (obje){
                    if (obje.sender == usernameFromToken){
                        console.log('NAME===', usernameFromToken);// i sender
                        User.findOne({username: obje.recipient}, function(err, user){
                            console.log('MessageID: ', obje._id);
                            result.push({
                                _id: obje._id,
                                createdAt: obje.createdAt,
                                shortMessage: '',
                                longMessage: obje.longMessage,
                                imageUrl: obje.imageUrl,
                                otherUser: user,
                                isFromUs: true,
                                isSelected: false,
                                isRead: obje.isRead
                            });
                            if (result.length == mLength) {
                                console.log('result size: ', result.length + '  ' + messages.length);
                                res.send({
                                    messages: result
                                })
                            }
                        });
                    } else if (obje.sender == contactName) {
                        console.log('NAME===', contactName);// i recipient
                        User.findOne({username: obje.sender}, function(err, user){
                            console.log('MessageID: ', obje._id);
                            result.push({
                                _id: obje._id,
                                createdAt: obje.createdAt,
                                shortMessage: '',
                                longMessage: obje.longMessage,
                                imageUrl: obje.imageUrl,
                                otherUser: user,
                                isFromUs: false,   ///////CHANGE
                                isSelected: false, ///////CHANGE
                                isRead: obje.isRead
                            });
                            if (result.length == mLength) {
                                console.log('result size: ', result.length + '  ' + messages.length);
                                res.send({
                                    messages: result
                                })
                            }
                    });}


                });
            });

        } else {
            Message.find({sender: usernameFromToken}, function(err,messages){
                messages.forEach(function (obje){
                    User.findOne({username: obje.recipient}, function(err, user){
                        console.log('MessageID: ', obje._id);
                        result.push({
                            _id: obje._id,
                            createdAt: obje.createdAt,
                            shortMessage: '',
                            longMessage: obje.longMessage,
                            imageUrl: obje.imageUrl,
                            otherUser: user,
                            isFromUs: true,
                            isSelected: false,
                            isRead: obje.isRead
                        });
                        if (result.length == messages.length) {
                            console.log('result size: ', result.length + '  ' + messages.length);
                            res.send({
                                messages: result
                            })

                        }
                    });
                });
            });
        };




    } else if (includeReceived == "true") {
        console.log('includeReceived');
        Message.find({recipient: usernameFromToken}, function(err,messages){
            messages.forEach(function (obje){
                User.findOne({username: obje.sender}, function(err, user){
                    console.log('MessageID: ', obje._id);
                    result.push({
                        _id: obje._id,
                        createdAt: obje.createdAt,
                        shortMessage: '',
                        longMessage: obje.longMessage,
                        imageUrl: obje.imageUrl,
                        otherUser: user,
                        isFromUs: false,
                        isSelected: false,
                        isRead: obje.isRead
                    });
                    if (result.length == messages.length) {
                        console.log('result size: ', result.length + '  ' + messages.length);
                        res.send({
                            messages: result
                        })

                    }
                });
            });
        });
    }




});


apiRoutes.delete('/messages/*', function(req, res){
    console.log('messages/delete--------', req.params[0]);
    var result = [];


    Message.remove({_id: req.params[0]}, function(next){
        console.log('DELETED SUCCSESS');
        res.json({
            success: true
        })
    });
});

apiRoutes.put('/messages/*/is-read', function(req, res){
    console.log('messages/IS-READ--------', req.params[0]);
    var result = [];

    Message.update({_id: req.params[0]}, {isRead: true}, function(next){
        console.log('ISREAD SUCCSESS');
        res.json({
            success: true
        })
    });
});

// apply the routes to our application with the prefix /api
app.use('/api', apiRoutes);
// =======================
// start the server ======
// =======================
app.listen(port);
console.log('Magic happens at http://localhost:' + port);