const session = require('express-session');

module.exports = session({
    secret: 'miniTorqueSecret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
});
