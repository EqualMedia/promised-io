/**
 * Promise-based HTTP requests, using the JSGI standard objects. Directly exports the request method but also makes it available as a property.
 * @module
 */

var http = require("http"),
		https = require("https"),
		parseUrl = require("url").parse,
		inherits = require("util").inherits,
		promise = require("./promise"),
		LazyArray = require("./lazy-array");

module.exports = exports = request;
/**
 * Default time in milliseconds to wait before the request is considered to have timed out.
 * @property
 * @type {integer}
 */
exports.requestTimeout = 20000;

/**
 * Class to define errors thrown when a request is aborted.
 * @class
 * @extends Error
 */
exports.AbortError = AbortError;
function AbortError(){
	Error.apply(this, arguments);
};
inherits(AbortError, Error);

/**
 * Class to define errors thrown when the remote server's credentials could not be verified (when using HTTPS).
 * @class
 * @extends Error
 */
exports.SecureError = SecureError;
function SecureError(){
	Error.apply(this, arguments);
};
inherits(SecureError, Error);

var DefaultPorts = {
	"http:": 80,
	"https:": 443
};

function request(options){
	var method, scheme, host, port, pathInfo, queryString, headers, body, timeout;
	
	if(options.url){
		var parsed = parseUrl(options.url);
		scheme = parsed.protocol;
		host = parsed.hostname;
		port = parsed.port || DefaultPorts[scheme];
		pathInfo = parsed.pathname || "/";
		queryString = parsed.query;
	}else{
		scheme = options.scheme;
		host = options.host;
		port = options.port || DefaultPorts[scheme];
		pathInfo = options.pathInfo || "/";
		queryString = options.queryString || "";
	}
	method = options.method || "GET";
	headers = options.headers || {};
	body = options.body;
	if(options.checkContinue){
		headers.expect = "100-continue";
	}
	if(headers.expect === "100-continue" && !body){
		body = [];
	}
	timeout = typeof options.timeout === "undefined" || typeof options.timeout !== "number" ? exports.requestTimeout || 0 : Math.max(0, options.timeout);
	
	if(!method){
		throw new Error("Expecting 'method' option to be specified.");
	}
	if(!scheme){
		throw new Error("Expecting 'scheme' option to be specified.");
	}else if(!DefaultPorts[scheme]){
		throw new Error("Unknown scheme '" + scheme + "'.");
	}
	if(!host){
		throw new Error("Expecting 'host' option to be specified.");
	}
	
	// Parse queryParams, overwriting queryString.
	if(options.queryParams){
		queryString = options.queryParams.reduce(function(str, param, index){
			if(index % 2){
				str += "=" + param;
			}else if(index === 0){
				str += param;
			}else{
				str += "&" + param;
			}
			return str;
		}, "");
	}
	
	var path = pathInfo;
	if(queryString){
		path += "?" + queryString;
	}
	if(scheme === "http:"){
		var req = http.request({
			method: method,
			host: host, port: port,
			path: path,
			headers: headers,
			agent: options.agent
		});
	}else{
		var req = https.request({
			method: method,
			host: host, port: port,
			path: path,
			headers: headers,
			agent: options.agent,
			key: options.key, cert: options.cert, ca: options.ca
		});
		req.socket.pair.on("secure", function(){
			if(!req.socket.authorized && options.InSeCUrE_useUnverifiedServer_iNsEcUrE !== true){
				deferred.reject(new SecureError(req.socket.authorizationError));
				closed = true;
				req.abort();
			}
		});
	}
	
	var deferred, bodyDeferred;
	var cancelled = false, bodyCancelled = false;
	var closed = false;
	var deferred = promise.defer(function(reason){
		if(!cancelled){
			cancelled = true;
			bodyDeferred && bodyDeferred.cancel();
			!closed && req.abort();
			if(reason instanceof promise.TimeoutError){
				return reason;
			}
		}
	});
	timeout && deferred.timeout(timeout);
	req.on("error", function(error){
		if(bodyDeferred && !bodyCancelled){
			bodyDeferred.reject(error);
		}else if(!cancelled){
			deferred.reject(error);
		}
	});
	req.on("close", function(){
		if(!closed){
			closed = true;
			deferred.reject(new AbortError);
		}
	});
	req.on("response", function(res){
		if(cancelled){ return; }
		
		var response = {
			status: res.statusCode,
			headers: res.headers,
			httpVersion: res.httpVersion,
			httpVersionMajor: res.httpVersionMajor,
			httpVersionMinor: res.httpVersionMinor,
			pause: res.pause.bind(res),
			resume: res.resume.bind(res)
		};
		
		bodyDeferred = promise.defer(function(){
			req.abort();
			bodyCancelled = true;
			buffer = sendData = body = null;
		});
		var buffer = [];
		var sendData = buffer.push.bind(buffer);
		var body = response.body = new LazyArray({
			some: function(callback){
				buffer.forEach(callback);
				sendData = callback;
				return bodyDeferred.promise;
			}
		});
		
		options.encoding && res.setEncoding(options.encoding);
		res.on("data", function(chunk){ !cancelled && sendData(chunk); });
		res.on("end", function(){ bodyDeferred.resolve(); });
		res.on("close", function(){ bodyDeferred.reject(new AbortError); });
		deferred.resolve(response);
	});
	
	if(body){
		if(headers.expect === "100-continue"){
			req.on("continue", function(){
				promise.when(body.forEach(function(chunk){ !cancelled && req.write(chunk); }), function(){ req.end(); });
			});
		}else{
			promise.when(body.forEach(function(chunk){ !cancelled && req.write(chunk); }), function(){ req.end(); });
			body = null;
		}
	}else{
		req.end();
	}
	
	// Clean up so potentially large objects don't hang around when no longer needed.
	delete options.headers;
	delete options.body;
	delete options.key;
	delete options.cert;
	delete options.queryParams;
	headers = null;
	
	// And return the promise.
	return deferred.promise;
};
/**
 * Perform the request.
 * @function
 * @param {RequestOptions} options
 * @returns A promise for the response.
 */
exports.request = request;

/**
 * @class
 * @private
 */
function RequestOptions(){
	/**
	 * HTTP method
	 * @type {string}
	 */
	this.method = "";
	/**
	 * URL scheme, <code>http:</code> or <code>https:</code>.
	 * @type {string}
	 */
	this.scheme = "";
	/**
	 * Host to connect to. <em>Does not automatically set the Host header!</em>.
	 * @type {string}
	 */
	this.host = "";
	/**
	 * Port to connect to. If not set, defaults to the standard port for the specified scheme.
	 * @type {integer}
	 */
	this.port = "";
	/**
	 * Request path.
	 * @type {string}
	 * @default /
	 */
	this.pathInfo = "/";
	/**
	 * List with keys and values to formulate a query string. If a key has no value, use an empty string. If defined,
	 * takes precedence over <code>queryString</code>.
	 * @type {object}
	 */
	this.queryParams = [];
	/**
	 * Query string for the request.
	 * @type {string}
	 */
	this.queryString = "";
	/**
	 * Shorthand for specifying scheme, host, port, pathInfo and queryString. Is parsed when specified, so providing
	 * the separate components will be more efficient. Takes precedence over the individual properties aside from <code>queryParams</code>.
	 * @type {string}
	 */
	this.url = "";
	/**
	 * Request headers. Use an array of strings as the value to send multiple headers with the same name.
	 * @type {object}
	 */
	this.headers = {};
	/**
	 * Request body, should be an array or a lazy array. Always sent if specified, irrespective of the request method.
	 * @type {array|LazyArray}
	 */
	this.body = [];
	/**
	 * Timeout detection, value is number of milliseconds before the request times out. Specify 0 for no timeout.
	 * By default uses <code>requestTimeout</code> value.
	 * @type {integer}
	 */
	this.timeout = 0;
	/**
	 * Specify which encoding should be used to parse the response body.
	 * @type {string}
	 */
	this.encoding = "";
	/**
	 * Send a <code>Expect: 100-continue</code> header for conditional delivery of a request body.
	 * @type {boolean}
	 * @default false
	 */
	this.checkContinue = false;
	/**
	 * Pass a request Agent to be used by the underlying Node API.
	 * @type {http.Agent|https.Agent}
	 */
	this.agent = null;
	/**
	 * Private key to use for HTTPS.
	 */
	this.key = null;
	/**
	 * Public x509 certificate to use for HTTPS.
	 */
	this.cert = null;
	/**
	 * An authority certificate or array of authority certificates to check the remote host against.
	 */
	this.ca = null;
	/**
	 * Override HTTPs security test, proceed with request even if the server could not be verified.
	 * This option key is intentionally hard to use, since you shouldn't.
	 * @type {boolean}
	 */
	this.InSeCUrE_useUnverifiedServer_iNsEcUrE = false;
};
