/**
 * Implements an OAuth 2 client around the request module.
 * @module oauth2
 */

var parseQueryString = require("querystring").parse,
		request = require("./request");

function parseResponse(response){
	return response.body.join("").then(function(body){
		if(response.status == 200){
			try{
				// Assume JSON responses
				return JSON.parse(body);
			}catch(e){
				// But fall back to query strings
				return parseQueryString(body);
			}
		}else{
			throw response;
		}
	});
}

/**
* Implements an OAuth 2 client.
* @class
* @param {string} identifier Client identifier
* @param {string} secret Client shared-secret
* @param {string} authorizationUrl URL (excluding query string) from which an authorization code can be retrieved
* @param {string} accessTokenUrl URL used to request token credentials
* @param {string} accessTokenParam Parameter name for including the access token in the request. Defaults to 'oauth_token'.
* @param {object} headers Default request headers
*/
exports.Client = Client;
function Client(identifier, secret, authorizationUrl, accessTokenUrl, accessTokenParam, headers){
	this.identifier = identifier;
	this.secret = secret;
	this.authorizationUrl = authorizationUrl;
	this.accessTokenUrl = accessTokenUrl;
	this.accessTokenParam = accessTokenParam || "oauth_token";
	this.headers = headers || {};
}

/**
 * Bind the client against a token credential. The resulting object can be used to make signed requests.
 * @function
 * @param {string} accessToken Acces token
 */
exports.Client.prototype.bind = function(accessToken){
	var bound = {
		accessToken: accessToken,
		accessTokenParam: this.accessTokenParam,
		headers: this.headers
	};
	bound.request = this.request;
	return bound;
};

/**
 * Wrapper around the <code>request</code> module, makes signed requests.
 * @function
 * @returns A promise for the response.
 */
exports.Client.prototype.request = function(options){
	options = request._normalizeOptions(options);
	
	// Mix in default headers, but don't override
	Object.keys(this.headers).forEach(function(name){
		if(!options.headers.hasOwnProperty(name)){
			options.headers[name] = this.headers[name];
		}
	}, this);
	
	// Parse whatever the query is into an array we can use for storing the request parameters
	var queryIsEncoded = options.queryIsEncoded || typeof options.query === "string";
	options.query = request._queryToArray(options.query);
	// Try signing the request by adding the access token
	if(this.accessToken){
		options.query.push(this.accessTokenParam, this.accessToken);
	}
	
	// If there are no parameters in the body, and we're doing a POST or PUT, we'll put the query parameters into the body
	// instead.
	if(!options.headers["content-type"] && (options.method === "POST" || options.method === "PUT") && options.query.length){
		options.body = [request._queryArrayToString(options.query, queryIsEncoded)];
		delete options.query;
		options.headers["content-type"] = "application/x-www-form-urlencoded";
		options.headers["content-length"] = options.body[0].length;
	}
	
	return request(options);
};

/**
 * Obtain token credentials from the Service Provider.
 * @param {string} code Authorization code
 * @param {string} redirectUri The URL used to obtain the authorization code
 * @returns A promise for the credentials. If the server does not return with a 200 response, the promise is rejected with the server response.
 */
exports.Client.prototype.obtainTokenCredentials = function(code, redirectUri, grantType){
	var query = ["client_id", this.identifier, "client_secret", this.secret, "code", code, "redirect_uri", redirectUri];
	if(grantType){
		query.push("grant_type", grantType);
	}
	return this.request({
		method: "POST",
		href: this.accessTokenUrl,
		query: query
	}).then(parseResponse);
};

/**
 * Construct the authorization URL
 */
exports.Client.prototype.constructAuthorizationUrl = function(redirectUri, scope, extraParams){
	var query = ["client_id", this.identifier, "redirect_uri", redirectUri];
	if(scope){
		if(typeof scope === "object"){
			if(Array.isArray(scope)){
				scope = scope.join(",");
			}else{
				scope = Object.keys(scope).join(",");
			}
		}
		query.push("scope", scope);
	}
	if(extraParams){
		query = query.concat(request._queryToArray(extraParams));
	}
	return this.authorizationUrl + "?" + request._queryArrayToString(query);
};