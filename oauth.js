/**
 * Implements an OAuth client around the request module.
 * @module oauth
 */

var parseUrl = require("url").parse,
		parseQueryString = require("querystring").parse,
		crypto = require("crypto"),
		when = require("./promise").when,
		request = require("./request");

function encodeRfc3986(str){
	return request._escapeQueryValue(str)
			.replace(/\!/g, "%21")
			.replace(/\'/g, "%27")
			.replace(/\(/g, "%28")
			.replace(/\)/g, "%29")
			.replace(/\*/g, "%2A");
}

function parseResponse(response){
	return response.body.join("").then(function(body){
		if(response.status == 200){
			return parseQueryString(body);
		}else{
			throw response;
		}
	});
}

/**
 * Implements an OAuth client according to RFC 5849.
 * @class
 * @param {string} identifier Client identifier
 * @param {string} secret Client shared-secret
 * @param {string} tempRequestUrl URL used to request temporary credentials
 * @param {string} tokenRequestUrl URL used to request token credentials
 * @param {string} callback URL the Service Provider redirects to after authorization. Defaults to <code>oob</code>
 * @param {string} version OAuth protocol version. Optional, but if present, must be set to <code>1.0</code>
 * @param {string} signatureMethod Method used to calculate the signature. Only <code>PLAINTEXT</code> and <code>HMAC-SHA1</code> are supported.
 * @param {function} nonceGenerator Helper method to generate nonces for the requests
 * @param {object} headers Default request headers
 */
exports.Client = Client;
function Client(identifier, secret, tempRequestUrl, tokenRequestUrl, callback, version, signatureMethod, nonceGenerator, headers){
	this.identifier = identifier;
	this.tempRequestUrl = tempRequestUrl;
	this.tokenRequestUrl = tokenRequestUrl;
	this.callback = callback || "oob";
	this.version = version || false;
	// _createSignature actually uses the variable, not the instance property
	this.signatureMethod = signatureMethod = signatureMethod || "HMAC-SHA1";
	this.generateNonce = nonceGenerator || exports._makeNonceGenerator(32);
	this.headers = headers || {};
	
	if(this.signatureMethod != "PLAINTEXT" && this.signatureMethod != "HMAC-SHA1"){
		throw new Error("Unsupported signature method: " + this.signatureMethod);
	}
	
	// We don't store the secrets on the instance itself, that way it can
	// be passed to other actors without leaking
	secret = encodeRfc3986(secret);
	this._createSignature = function(tokenSecret, baseString){
		if(baseString === undefined){
			baseString = tokenSecret;
			tokenSecret = "";
		}
		
		var key = secret + "&" + tokenSecret;
		if(signatureMethod == "PLAINTEXT"){
			return key;
		}else{
			return crypto.createHmac("SHA1", key).update(baseString).digest("base64");
		}
	};
}

var NonceChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
exports._makeNonceGenerator = function(nonceSize){
	var nonce = Array(nonceSize + 1).join("-").split("");
	var chars = NonceChars.split("");
	
	return function nonceGenerator(){
		return nonce.map(getRandomChar).join("");
	};
	
	function getRandomChar(){
		return chars[Math.floor(Math.random() * chars.length)];
	}
};

exports._getTimestamp = function(){
	return Math.floor(Date.now() / 1000).toString();
};

/**
 * Bind the client against a token credential. The resulting object can be used to make signed requests.
 * @function
 * @param {string} tokenIdentifier Token identifier
 * @param {string} tokenSecret The token shared-secret
 */
exports.Client.prototype.bind = function(tokenIdentifier, tokenSecret){
	var bound = {
		identifier: this.identifier,
		tokenIdentifier: tokenIdentifier,
		signatureMethod: this.signatureMethod,
		version: this.version,
		headers: this.headers,
		generateNonce: this.generateNonce
	};
	bound._createSignature = this._createSignature.bind(this, encodeRfc3986(tokenSecret));
	bound._createSignatureBase = this._createSignatureBase;
	bound._normalizeUrl = this._normalizeUrl;
	bound._collectOAuthParams = this._collectOAuthParams;
	bound._normalizeParams = this._normalizeParams;
	bound._signRequest = this._signRequest;
	bound.request = this.request;
	return bound;
};

/**
 * Wrapper around the <code>request</code> module, makes signed requests.
 * You can add the <code>oauth</code> object to the request options to add OAuth request parameters. These must include
 * the <code>oauth_</code> prefix.
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
	var requestParams = options.query.map(function(str){
		return queryIsEncoded ? decodeURIComponent(str) : str;
	});
	
	// Depending on the request content type, look for further request parameters in the body
	var parametersInBody = false;
	if(options.headers["content-type"] == "application/x-www-form-urlencoded"){
		parametersInBody = when(options.body.join(""), function(body){
			requestParams = requestParams.concat(request._queryToArray(body).map(decodeURIComponent));
			return true;
		});
	}
	
	// If there are no parameters in the body, and we're doing a POST or PUT, we'll put the query parameters into the body
	// instead.
	if(!parametersInBody && (options.method === "POST" || options.method === "PUT") && options.query.length && !options.headers["content-type"]){
		options.body = [request._queryArrayToString(options.query, queryIsEncoded)];
		delete options.query;
		options.headers["content-type"] = "application/x-www-form-urlencoded";
	}
	
	// Sign the request and then actually make it.
	return when(parametersInBody, function(){
		this._signRequest(options, requestParams);
		return request(options);
	}.bind(this));
};

Client.prototype._normalizeUrl = function(request){
	var normalized = request.protocol + "//" + request.hostname;
	if(request.protocol == "http:" && request.port && (request.port + "") != "80"){
		normalized += ":" + request.port;
	}
	if(request.protocol == "https:" && request.port && (request.port + "") != "443"){
		normalized += ":" + request.port;
	}
	return normalized + request.pathname;
};

Client.prototype._collectOAuthParams = function(options, requestParams){
	var oauthParams = {};
	if(options.oauth){
		for(var p in options.oauth){
			// Don't allow `options.oauth` to override standard values.
			// `oauth_token` and `oauth_version` are conditionally added,
			// the other parameters are always set. Hence we just test for
			// the first two.
			if(p != "oauth_token" && p != "oauth_version"){
				oauthParams[p] = options.oauth[p];
			}
		}
	}
	oauthParams.oauth_consumer_key = this.identifier;
	oauthParams.oauth_signature_method = this.signatureMethod;
	oauthParams.oauth_timestamp = exports._getTimestamp();
	oauthParams.oauth_nonce = this.generateNonce();
	if(this.tokenIdentifier){
		oauthParams.oauth_token = this.tokenIdentifier;
	}
	if(this.version){
		oauthParams.oauth_version = this.version;
	}
	Object.keys(oauthParams).forEach(function(key){
		requestParams.push(key, oauthParams[key]);
	});
	return oauthParams;
};

Client.prototype._normalizeParams = function(requestParams){
	// Encode requestParams
	return requestParams.map(encodeRfc3986)
			// Unflatten the requestParams for sorting
			.reduce(function(result, _, i, arr){
				if(i % 2 == 0){
					result.push(arr.slice(i, i + 2));
				}
				return result;
			}, [])
			// Sort the unflattened requestParams
			.sort(function(a, b){
				if(a[0] == b[0]){
					return a[1] < b[1] ? -1 : 1;
				}else{
					return a[0] < b[0] ? -1 : 1;
				}
			})
			// Concatenate
			.map(function(pair){ return pair.join("="); }).join("&");
};

Client.prototype._createSignatureBase = function(requestMethod, baseUri, params){
	return [requestMethod, baseUri, params].map(encodeRfc3986).join("&");
};

Client.prototype._signRequest = function(options, requestParams){
	// Calculate base URI string
	var baseUri = this._normalizeUrl(options);
	
	// Register OAuth parameters and add to the options parameters
	// Additional parameters can be specified via the `options.oauth` object
	var oauthParams = this._collectOAuthParams(options, requestParams);
	
	// Generate parameter string
	var params = this._normalizeParams(requestParams);
	
	// Sign the base string
	var baseString = this._createSignatureBase(options.method, baseUri, params);
	oauthParams.oauth_signature = this._createSignature(baseString);
	
	// Add Authorization header
	options.headers.authorization = "OAuth " + Object.keys(oauthParams).map(function(name){
		return encodeRfc3986(name) + "=\"" + encodeRfc3986(oauthParams[name]) + "\"";
	}).join(",");
	
	// Now the options object can be used to make a signed request
	return options;
};

/**
 * Obtain temporary credentials from the Service Provider.
 * @param {object} oauthParams OAuth parameters to include in the request
 * @param {string|array|object} extraParams Extra parameters to send along. Follows the same rules as the <code>query</code> option for <code>request</code>
 * @returns A promise for the credentials. If the server does not return with a 200 response, the promise is rejected with the server response.
 */
exports.Client.prototype.obtainTempCredentials = function(oauthParams, extraParams){
	oauthParams = oauthParams || {};
	if(this.callback && !oauthParams.oauth_callback){
		oauthParams.oauth_callback = this.oauth_callback;
	}
	
	return this.request({
		method: "POST",
		href: this.tempRequestUrl,
		oauth: oauthParams,
		query: extraParams || []
	}).then(parseResponse);
};

/**
 * Obtain token credentials from the Service Provider.
 * @param {string} tokenIdentifier Temporary credentials identifier
 * @param {string} tokenSecret Temporary credentials shared-secret
 * @param {string} verifierToken OAuth verifier token
 * @param {string|array|object} extraParams Extra parameters to send along. Follows the same rules as the <code>query</code> option for <code>request</code>
 * @returns A promise for the credentials. If the server does not return with a 200 response, the promise is rejected with the server response.
 */
exports.Client.prototype.obtainTokenCredentials = function(tokenIdentifier, tokenSecret, verifierToken, extraParams){
	return this.bind(tokenIdentifier, tokenSecret).request({
		method: "POST",
		href: this.tokenRequestUrl,
		oauth: { oauth_verifier: verifierToken },
		query: extraParams || []
	}).then(parseResponse);
};