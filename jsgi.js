/**
 * Implement a JSGI server according to <a href="http://wiki.commonjs.org/wiki/JSGI/Level0/A/Draft2">http://wiki.commonjs.org/wiki/JSGI/Level0/A/Draft2</a>.
 * Supports both HTTP and HTTPS servers.
 * @module jsgi
 */

var parseUrl = require("url").parse,
		http = require("http"),
		https = require("https"),
		whenCall = require("./promise").whenCall,
		when = require("./promise").when,
		defer = require("./promise").defer,
		LazyArray = require("./lazy-array");

/**
 * Create a new server. You need to call <code>listen</code> on the server manually.
 * Emits <code>error</code> for exceptions raised while handling the request, but always
 * tries to respond with a 500 error.
 * @function
 * @param {function} app JSGI application
 * @param {object} secureOptions If passed, creates a HTTPS server with the options.
 */
exports.createServer = function(app, secureOptions){
	app = new Listener(app, function(error){
		try{
			server.emit("error", error);
		}catch(_){
			process.nextTick(function(){ throw error; });
		}
	});
	
	var server = secureOptions ? https.createServer(secureOptions) : http.createServer();
	server.on("checkContinue", app);
	server.on("request", app);
	return server;
};

/**
 * Class for errors thrown when a client connection is closed.
 * @class
 * @extends Error
 */
exports.ClosedError = ClosedError;
function ClosedError(message){
	var tmp = Error.apply(this, arguments);
	tmp.name = "ClosedError";
	tmp.message = message || "The inbound connection was closed.";
	Object.keys(tmp).reduce(function(error, key){
		error[key] = tmp[key];
		return error;
	}, this);
};
require("util").inherits(ClosedError, Error);

/**
 * Creates a listener for Node's server requests, invoking a JSGI application.
 * @class
 * @param {function} app JSGI application
 * @param {function} emitError Called for exceptions raised by the application.
 */
exports.Listener = Listener;
function Listener(app, emitError){
	return function(request, stream){
		var closed = false;
		var jsgiRequest = new Request(request, stream.writeContinue.bind(stream));
		var promise = whenCall(function(){ return app(jsgiRequest); }, function(response){
			jsgiRequest.writeContinue();
			return sendResponse(stream, response);
		}).then(null, function(error){
			if(closed){
				return;
			}
			
			emitError && emitError(error);
			try{
				stream.writeHead(500);
				stream.end("An unknown error occured.");
			}catch(error){
				emitError && emitError(error);
			}
		});
		promise.cancel && request.on("close", function(){
			closed = true;
			promise.cancel(new ClosedError);
		});
	};
}

var DefaultPorts = {
	"http:": 80,
	"https:": 443
};

function Request(originalRequest, writeContinue){
	var expectContinue = originalRequest.headers.expect === "100-continue";
	
	var parsed = parseUrl(originalRequest.url);
	var host = originalRequest.headers.host;
	var parts = host.split(":");
	var hostname = parts[0];
	var port = parts[1];
	var query;
	
	var request = Object.create(originalRequest, {
		pathname: {
			enumerable: true,
			get: function(){ return this.pathInfo; },
			set: function(v){ return this.pathInfo = v; }
		},
		
		query: {
			enumerable: true,
			get: function(){ return query || this.queryString; },
			set: function(v){
				if(typeof v === "string"){
					return this.queryString = v;
				}else{
					return query = v;
				}
			}
		},
		
		host: {
			enumerable: true,
			get: function(){ return host; },
			set: function(v){
				host = v;
				var parts = host.split(":");
				hostname = parts[0];
				port = parts[1];
				return host;
			}
		},
		
		hostname: {
			enumerable: true,
			get: function(){ return hostname; },
			set: function(v){
				host = v + ":" + port;
				return hostname = v;
			}
		},
		
		port: {
			enumerable: true,
			get: function(){ return port; },
			set: function(v){
				host = hostname + ":" + v;
				return port = v;
			}
		},
		
		protocol: {
			enumerable: true,
			get: function(){ return this.scheme; },
			set: function(v){ return this.scheme = v; }
		}
	});
	
	request.method = originalRequest.method;
	request.scriptName = "";
	request.pathInfo = parsed.pathname;
	request.queryString = parsed.query;
	request.scheme = "http:";
	request.headers = originalRequest.headers;
	request.jsgi = {
		version: [0, 3],
		multithread: false,
		multiprocess: true,
		async: true,
		runOnce: false,
		errors: {
			print: console.log,
			flush: function(){}
		}
	};
	request.env = {};
	request.remoteAddr = request.socket.remoteAddress;
	request.version = [originalRequest.httpVersionMajor, originalRequest.httpVersionMinor];
	
	request.writeContinue = function(){
		if(expectContinue){
			writeContinue();
			expectContinue = false;
		}
	};
	
	if(request.method !== "GET" && request.method !== "DELETE" && request.method !== "HEAD"){
		var bodyCancelled = false;
		var bodyDeferred = defer(function(){ bodyCancelled = true; });
		var buffer = [];
		var dataCallbacks = [buffer.push.bind(buffer)];
		request.input = request.body = new LazyArray({
			some: function(callback){
				request.writeContinue();
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
		
		originalRequest.on("data", function(chunk){ sendData(chunk); });
		originalRequest.on("end", function(){ bodyDeferred.resolve(); });
	}
	
	return request;
}

function sendResponse(stream, response){
	stream.writeHead(response.status, response.headers);
	return when(response.body.forEach(function(chunk){
		stream.write(chunk);
	}), end, end);
	
	function end(){
		stream.end();
	}
}