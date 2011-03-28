/**
 * Promise-based HTTP requests, using Node/DOM standard properties. Directly exports the request method but also makes it available as a property.
 * @module
 */

var http = require("http"),
		https = require("https"),
		parseUrl = require("url").parse,
		inherits = require("util").inherits,
		isIP = require("net").isIP,
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
	var method, protocol, hostname, port, pathname, query, headers, body, timeout;
	
	if(options.href){
		var parsed = parseUrl(options.href);
		protocol = parsed.protocol;
		hostname = parsed.hostname;
		port = parsed.port || DefaultPorts[protocol];
		pathname = parsed.pathname || "/";
		query = parsed.query;
	}else{
		protocol = options.protocol;
		hostname = options.hostname;
		port = options.port || DefaultPorts[protocol];
		pathname = options.pathname || "/";
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
	
	if(!protocol){
		throw new Error("Expecting 'protocol' option to be specified.");
	}else if(!DefaultPorts[protocol]){
		throw new Error("Unknown protocol '" + protocol + "'.");
	}
	if(!hostname){
		throw new Error("Expecting 'hostname' option to be specified.");
	}
	
	headers = Object.keys(headers).reduce(function(lowercased, name){
		lowercased[name.toLowerCase()] = headers[name];
		return lowercased;
	}, {});
	
	if(!headers.host){
		// Always set a Host header, <http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.23>
		if(isIP(hostname)){
			headers.host = "";
		}else{
			headers.host = hostname;
			if(port !== DefaultPorts[protocol]){
				headers.host += ":" + port;
			}
		}
	}
	
	if(options.query && typeof options.query === "object"){
		var queryArr = options.query;
		if(!Array.isArray(options.query)){
			queryArr = Object.keys(options.query).reduce(function(arr, key){
				arr.push(key, options.query[key]);
				return arr;
			}, []);
		}
		
		query = "";
		for(var i = 0, l = queryArr.length; i < l; i += 2){
			switch(typeof queryArr[i] + typeof queryArr[i + 1]){
				case "stringstring":
				case "stringnumber":
				case "stringboolean":
				case "booleanstring":
				case "booleannumber":
				case "booleanboolean":
				case "numberstring":
				case "numbernumber":
				case "numberboolean":
					break;
				case "undefinedundefined":
				case "undefinedstring":
				case "undefinednumber":
				case "undefinedboolean":
				case "stringundefined":
				case "numberundefined":
				case "booleanundefined":
					continue;
				default:
					throw new Error("Passed query object contains a value that is not a string, number or a boolean. Can't serialize.");
			}
			
			if(i > 0){
				query += "&";
			}
			query += queryArr[i] + "=" + queryArr[i + 1];
		}
	}else if(typeof options.query === "string"){
		query = options.query;
	}
	
	var path = pathname;
	if(query){
		path += "?" + query;
	}
	if(protocol === "http:"){
		var req = http.request({
			method: method,
			hostname: hostname, port: port,
			path: path,
			headers: headers,
			agent: options.agent
		});
	}else{
		var req = https.request({
			method: method,
			hostname: hostname, port: port,
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
			buffer = dataCallbacks = body = null;
		});
		var buffer = [];
		var dataCallbacks = [buffer.push.bind(buffer)];
		var body = response.body = new LazyArray({
			some: function(callback){
				buffer.forEach(callback);
				dataCallbacks.push(callback);
				return bodyDeferred.promise;
			}
		});
		var sendData = function(chunk){
			if(!bodyCancelled){
				for(var i = 0, l = dataCallbacks.length; !bodyCancelled && i < l; i++){
					dataCallbacks[i](chunk);
				}
			}
		};
		
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
	 * URL protocol, <code>http:</code> or <code>https:</code>.
	 * @type {string}
	 */
	this.protocol = "";
	/**
	 * hostname to connect to. <em>Does not automatically set the hostname header!</em>.
	 * @type {string}
	 */
	this.hostname = "";
	/**
	 * Port to connect to. If not set, defaults to the standard port for the specified protocol.
	 * @type {integer}
	 */
	this.port = "";
	/**
	 * Request path.
	 * @type {string}
	 * @default /
	 */
	this.pathname = "/";
	/**
	 * Query for the request. If a string, used as-is. If an array, assumes first item to be the key name, the second to
	 * be the value, and so on. If an object, treats the object keys as key names and the values as values. Only accepts
	 * string, number and boolean value types. Ignores undefined values.
	 * @type {string|array|object}
	 */
	this.query = "";
	/**
	 * Shorthand for specifying protocol, hostname, port, pathname and query. Is parsed when specified, so providing
	 * the separate components will be more efficient. Takes precedence over the individual properties aside from <code>query</code>.
	 * @type {string}
	 */
	this.href = "";
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
	 * An authority certificate or array of authority certificates to check the remote hostname against.
	 */
	this.ca = null;
	/**
	 * Override HTTPs security test, proceed with request even if the server could not be verified.
	 * This option key is intentionally hard to use, since you shouldn't.
	 * @type {boolean}
	 */
	this.InSeCUrE_useUnverifiedServer_iNsEcUrE = false;
};
