var ini = require('ini');
var fs = require('fs');
var common = require('../common');
var connect = require('../connect');
const jwt = require("jsonwebtoken");
var upperCase = require('upper-case');
var crypto = require('crypto');
var hash = crypto.createHash('sha256');
var logger = require('./logger');

exports.authenticateUserWithCookie = (req, res, next) => {
  if(+common.rtl_sso) {
    res.cookie('access-key', req.query['access-key'], { httpOnly: true, sameSite: true, secure: true });
    res.set(
      {
        'Cache-Control': 'private, no-cache'
      }
    );
    res.redirect(301, '/rtl/');
  }
  else
  {
    res.status(404).json({
      message: "Login Failure!",
      error: "SSO not available"
    });
  }
};

exports.authenticateUser = (req, res, next) => {
  if(+common.rtl_sso) {
    const access_key = req.cookies['access-key'];
    res.clearCookie("access-key");
    // Replace access_key value from req.cookies['access-key'] to req.body.password to test SSO on http
    // const access_key = atob(req.body.password);
    if (common.cookie === access_key) {
      connect.refreshCookie(common.rtl_cookie_path);
      const token = jwt.sign(
        { user: 'Custom_User', lndConfigPath: common.nodes[0].lnd_config_path, macaroonPath: common.nodes[0].macaroon_path },
        common.secret_key
      );
      res.status(200).json({ token: token });
    } else {
      res.status(401).json({
        message: "Login Failure!",
        error: "SSO Authentication Failed!"
      });
    }
  } else {
    const password = req.body.password;
    if (common.multi_node_setup) {
      if (common.rtl_pass === password) {
        var rpcUser = 'Multi_Node_User';
        const token = jwt.sign(
          { user: rpcUser, lndConfigPath: common.nodes[0].lnd_config_path, macaroonPath: common.nodes[0].macaroon_path },
          common.secret_key
        );
        res.status(200).json({ token: token });
      } else {
        res.status(401).json({
          message: "Authentication Failed!",
          error: "Password Validation Failed!"
        });
      }
    } else {
      if(upperCase(common.node_auth_type) === 'CUSTOM') {
        if (common.rtl_pass === password) {
          var rpcUser = 'Single_Node_User';
          const token = jwt.sign(
            { user: rpcUser, lndConfigPath: common.nodes[0].lnd_config_path, macaroonPath: common.nodes[0].macaroon_path },
            common.secret_key
          );
          res.status(200).json({ token: token });
        } else {
          res.status(401).json({
            message: "Authentication Failed!",
            error: "Password Validation Failed!"
          });
        }
      } else {
        fs.readFile(common.nodes[0].lnd_config_path, 'utf8', function (err, data) {
          if (err) {
            logger.error('\r\nAuthenticate: 45: ' + JSON.stringify(Date.now()) + ': ERROR: LND Config Reading Failed!');
            err.description = 'You might be connecting RTL remotely to your LND node OR You might be missing rpcpass in your lnd.conf.';
            err.description = err.description + ' If the former modify the RTL.conf for remote setting.';
            err.description = err.description + ' If the later modify the lnd.conf to include rpcpass';
            res.status(500).json({
              message: "LND Config Reading Failed!",
              error: err
            });
          } else {
            const jsonLNDConfig = ini.parse(data);
            var rpcPass = '';
            if (undefined !== jsonLNDConfig.Bitcoind && undefined !== jsonLNDConfig.Bitcoind['bitcoind.rpcpass']) {
              rpcPass = jsonLNDConfig.Bitcoind['bitcoind.rpcpass'];
            } else if (undefined !== jsonLNDConfig['bitcoind.rpcpass']) {
              rpcPass = jsonLNDConfig['bitcoind.rpcpass'];
            }
            rpcPass = hash.update(rpcPass).digest('hex');
            if (rpcPass === password) {
              var rpcUser = (undefined !== jsonLNDConfig.Bitcoind && undefined !== jsonLNDConfig.Bitcoind['bitcoind.rpcuser']) ? jsonLNDConfig.Bitcoind['bitcoind.rpcuser'] : '';
              rpcUser = (rpcUser === '' && undefined !== jsonLNDConfig['bitcoind.rpcuser']) ? jsonLNDConfig['bitcoind.rpcuser'] : '';
              const token = jwt.sign(
                { user: rpcUser, lndConfigPath: common.nodes[0].lnd_config_path, macaroonPath: common.nodes[0].macaroon_path },
                common.secret_key
              );
              res.status(200).json({ token: token });
            } else {
              res.status(401).json({
                message: "Authentication Failed!",
                error: "Password Validation Failed!"
              });
            }
          }
        });
      }
    }
  }
};
