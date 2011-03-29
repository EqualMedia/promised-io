/**
 * Extends the <code>oauth</code> module to add an xAuth> implementation.
 * @module oauth+xauth
 */

var oauth = require("./oauth");
Object.keys(oauth).forEach(function(key){
	exports[key] = oauth[key];
});

/**
 * Obtain token credentials using xAuth.
 * @function
 * @param {oauth.Client} client OAuth Client instance
 * @param {string} username
 * @param {string} password
 * @param {string} mode
 */
exports.xauth = function(client, username, password, mode){
	return client.obtainTokenCredentials("", "", "", {
		x_auth_username: username,
		x_auth_password: password,
		x_auth_mode: mode
	});
};