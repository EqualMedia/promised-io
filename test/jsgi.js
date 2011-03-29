var request = require("../request"),
		promise = require("../promise"),
		jsgi = require("../jsgi"),
		LazyArray = require("../lazy-array");

promise.detectUnhandled = 10;

var OK = { status: 200, headers: {}, body: [] };

module.exports = require("nodeunit").testCase({
	setUp: function(ready){
		this._server = jsgi.createServer(function(request){
			return this.handleRequest(request);
		}.bind(this));
		this._server.listen(function(){
			var address = this._server.address();
			this.hostname = address.address;
			this.port = address.port;
			ready();
		}.bind(this));
	},
	
	tearDown: function(ready){
		this._server.on("close", function(){
			delete this._server;
			delete this.hostname;
			delete this.port;
			delete this.handleRequest;
			ready();
		}.bind(this)).close();
	},
	
	"simple request": function(test){
		this.handleRequest = function(request){
			test.equal(request.protocol, "http:");
			test.equal(request.scheme, "http:");
			test.equal(request.host, this.hostname + ":" + this.port);
			test.equal(request.hostname, this.hostname);
			test.equal(request.port, this.port);
			test.equal(request.pathInfo, "/foo/bar");
			test.equal(request.pathname, "/foo/bar");
			test.equal(request.queryString, "baz=thud");
			test.equal(request.query, "baz=thud");
			test.done();
			return OK;
		};
		
		request({ protocol: "http:", hostname: this.hostname, port: this.port, pathname: "/foo/bar", query: "baz=thud" });
	},
	
	"modifying request": function(test){
		this.handleRequest = function(request){
			request.protocol = "test:";
			test.equal(request.protocol, "test:");
			test.equal(request.scheme, "test:");
			request.hostname = "test";
			test.equal(request.hostname, "test");
			test.equal(request.host, "test:" + this.port);
			request.port = 42;
			test.equal(request.port, 42);
			test.equal(request.host, "test:42");
			request.host = "foo:99";
			test.equal(request.host, "foo:99");
			test.equal(request.hostname, "foo");
			test.equal(request.port, 99);
			request.pathname = "/ha!";
			test.equal(request.pathInfo, "/ha!");
			test.equal(request.pathname, "/ha!");
			request.queryString = "test=yup";
			test.equal(request.queryString, "test=yup");
			test.equal(request.query, "test=yup");
			var expected = {};
			request.query = expected;
			test.equal(request.queryString, "test=yup");
			test.strictEqual(request.query, expected);
			request.queryString = "foo=bar";
			test.equal(request.queryString, "foo=bar");
			test.strictEqual(request.query, expected);
			test.done();
			return OK;
		};
		
		request({ protocol: "http:", hostname: this.hostname, port: this.port, pathname: "/foo/bar", query: "baz=thud" });
	},
	
	"100-continue, auto-sent": function(test){
		var sentBody = false;
		var strBody = "hello world";
		
		this.handleRequest = function(request){
			test.ok(!sentBody);
			return promise.when(request.body.join(""), function(body){
				test.ok(sentBody);
				test.equal(body, strBody);
				test.done();
				return OK;
			});
		};
		
		request({
			method: "POST",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			body: new LazyArray({
				some: function(callback){
					sentBody = true;
					callback(strBody);
					return promise.resolved();
				}
			}),
			checkContinue: true
		});
	},
	
	"100-continue, explicit": function(test){
		var shouldSendBody = false;
		var sendingBodyDeferred = promise.defer();
		
		this.handleRequest = function(request){
			setTimeout(function(){
				shouldSendBody = true;
				request.writeContinue();
			}, 10);
			return sendingBodyDeferred.promise;
		};
		
		request({
			method: "POST",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			body: new LazyArray({
				some: function(callback){
					test.ok(shouldSendBody);
					callback("");
					sendingBodyDeferred.resolve(OK);
					test.done();
					return promise.resolved();
				}
			}),
			checkContinue: true
		});
	},
	
	"no body for GET": function(test){
		this.handleRequest = function(request){
			test.strictEqual(request.body, undefined);
			test.done();
			return OK;
		};
		
		request({ protocol: "http:", hostname: this.hostname, port: this.port });
	},
	
	"no body for DELETE": function(test){
		this.handleRequest = function(request){
			test.strictEqual(request.body, undefined);
			test.done();
			return OK;
		};
		
		request({ method: "DELETE", protocol: "http:", hostname: this.hostname, port: this.port });
	},
	
	"no body for HEAD": function(test){
		this.handleRequest = function(request){
			test.strictEqual(request.body, undefined);
			test.done();
			return OK;
		};
		
		request({ method: "HEAD", protocol: "http:", hostname: this.hostname, port: this.port });
	},
	
	"post lazy body": function(test){
		var sentBody = "hello world";
		var sendNext;
		var lazyBody = (function(body){
			var chars = sentBody.split("");
			var deferred = promise.defer();
			var fulfilled = false;
			
			return new LazyArray({
				some: function(callback){
					sendNext = function(){
						if(chars.length){
							callback(chars.shift());
						}else if(!fulfilled){
							deferred.resolve();
							fulfilled = true;
						}
					};
					// Sent something immediately
					sendNext();
					return deferred.promise;
				}
			});
		})(sentBody);
		
		var receivedBody = "";
		this.handleRequest = function(request){
			sendNext();
			return promise.when(request.body.forEach(function(chunk){
				receivedBody += chunk;
				sendNext();
			}), function(){
				test.equal(receivedBody, sentBody);
				test.done();
				return OK;
			});
		};
		
		request({
			method: "POST",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			body: lazyBody
		});
	},
	
	"receive body": function(test){
		var sentBody = "hello world";
		var sendNext;
		this.handleRequest = function(request){
			var chars = sentBody.split("");
			var deferred = promise.defer();
			return {
				status: 200,
				headers: {},
				body: new LazyArray({
					some: function(write){
						sendNext = function(){
							if(chars.length){
								write(chars.shift());
							}else{
								deferred.resolve();
							}
						};
						sendNext();
						return deferred.promise;
					}
				})
			};
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port
		}).then(function(response){
			var receivedBody = "";
			response.body.forEach(function(chunk){
				receivedBody += chunk;
				sendNext();
			}).then(function(){
				test.equal(receivedBody, sentBody);
				test.done();
			});
		});
	},
	
	"emit errors": function(test){
		var expected = {};
		this.handleRequest = function(){
			throw expected;
		};
		
		this._server.once("error", function(error){
			test.strictEqual(error, expected);
			test.done();
		});
		
		request({ protocol: "http:", hostname: this.hostname, port: this.port });
	},
	
	"abort request": function(test){
		var cancelled = false;
		this.handleRequest = function(){
			var deferred = promise.defer(function(error){
				cancelled = true;
				test.ok(error instanceof jsgi.ClosedError);
			});
			setTimeout(function(){
				requestPromise.cancel();
			}, 10);
			return deferred.promise;
		};
		
		var requestPromise = request({ protocol: "http:", hostname: this.hostname, port: this.port });
		setTimeout(function(){
			test.ok(cancelled);
			test.done();
		}, 20);
	}
});