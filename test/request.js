var http = require("http"),
		https = require("https"),
		parseUrl = require("url").parse,
		promise = require("../lib/promise"),
		LazyArray = require("../lib/lazy-array"),
		request = require("../lib/request");

function shouldntYieldSuccess(test, done){
	return function(){
		test.ok(false, "Shouldn't yield success!");
		done && test.done();
	};
}

function shouldntYieldError(test, done){
	return function(){
		test.ok(false, "Shouldn't yield an error!");
		done && test.done();
	};
}

exports.http = require("nodeunit").testCase({
	setUp: function(callback){
		this._server = http.createServer(function(req, res){
			this.handleRequest && this.handleRequest(req, res);
		}.bind(this));
		this._server.listen(function(){
			var address = this._server.address();
			this.hostname = address.address;
			this.port = address.port;
			callback();
		}.bind(this));
	},
	
	tearDown: function(callback){
		this._server.on("close", function(){
			delete this._server;
			delete this.hostname;
			delete this.port;
			delete this.handleRequest;
			callback();
		}.bind(this)).close();
	},
	
	"missing options": function(test){
		var tthrows = test["throws"].bind(test); // lint fail
		tthrows(function(){ request(); });
		tthrows(function(){ request({ method: "GET" }); }); // no protocol
		tthrows(function(){ request({ method: "GET", protocol: "fake:" }); }); // invalid protocol
		tthrows(function(){ request({ method: "GET", protocol: "http:" }); }); // no hostname
		test.done();
	},
	
	"simple GET": function(test){
		this.handleRequest = function(req, res){
			test.equal(req.url, "/foo/bar");
			res.writeHead(200);
			res.end();
		};
	
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			pathname: "/foo/bar"
		}).then(function(response){
			test.equal(response.status, 200);
			test.done();
		}, shouldntYieldError(test, true));
	},
	
	"href parsing": function(test){
		this.handleRequest = function(req, res){
			test.equal(req.url, "/foo/bar?baz=thud");
			res.writeHead(200);
			res.end();
		};
	
		request({
			method: "GET",
			href: "http://" + this.hostname + ":" + this.port + "/foo/bar?baz=thud"
		}).then(function(response){
			test.equal(response.status, 200);
			test.done();
		}, shouldntYieldError(test, true));
	},
	
	"request headers": function(test){
		this.handleRequest = function(req, res){
			test.equal(req.headers.foo, "bar");
			res.end();
		};
	
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			headers: { foo: "bar" }
		}).then(function(response){
			test.done();
		}, shouldntYieldError(test, true));
	},
	
	"auto-set host for 'localhost'": function(test){
		this.handleRequest = function(req, res){
			test.equal(req.headers.host, "localhost:" + this.port); // Since we're on a non-standard port, the port gets added
			test.done();
			res.end();
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: "localhost", // Assumed to exist and point to the current machine
			port: this.port
		}).then(null, shouldntYieldError(test, true));
	},
	
	"regular host passing": function(test){
		this.handleRequest = function(req, res){
			test.equal(req.headers.host, "promised-io");
			test.done();
			res.end();
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			headers: { host: "promised-io" }
		}).then(null, shouldntYieldError(test, true));
	},
	
	"regular host passing, mixed header case": function(test){
		this.handleRequest = function(req, res){
			test.equal(req.headers.host, "promised-io");
			test.done();
			res.end();
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			headers: { HoSt: "promised-io" }
		}).then(null, shouldntYieldError(test, true));
	},
	
	"empty host, hostname is an IP address": function(test){
		this.handleRequest = function(req, res){
			test.equal(req.headers.host, "");
			test.done();
			res.end();
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port
		}).then(null, shouldntYieldError(test, true));
	},
	
	"passing query string": function(test){
		this.handleRequest = function(req, res){
			var parsed = parseUrl(req.url);
			test.equal(parsed.query, "foo=bar");
			res.end();
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			query: "foo=bar"
		}).then(function(response){
			test.done();
		}, shouldntYieldError(test, true));
	},
	
	"passing query array": function(test){
		this.handleRequest = function(req, res){
			var parsed = parseUrl(req.url);
			test.equal(parsed.query, "foo=bar&baz=");
			res.end();
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			query: ["foo", "bar", "baz", ""]
		}).then(function(response){
			test.done();
		}, shouldntYieldError(test, true));
	},
	
	"passing query array, skip undefined": function(test){
		this.handleRequest = function(req, res){
			var parsed = parseUrl(req.url);
			test.equal(parsed.query, "foo=bar&baz=");
			res.end();
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			query: ["foo", "bar", "baz", "", "thud", undefined]
		}).then(function(response){
			test.done();
		}, shouldntYieldError(test, true));
	},
	
	"passing query array, throw for illegal value": function(test){
		test["throws"](function(){
			request({
				method: "GET",
				protocol: "http:",
				hostname: this.hostname,
				port: this.port,
				query: ["foo", "bar", "baz", "", "thud", {}]
			});
		});
		test.done();
	},
	
	"passing query object": function(test){
		this.handleRequest = function(req, res){
			var parsed = parseUrl(req.url);
			test.equal(parsed.query, "foo=bar&baz=");
			res.end();
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			query: { foo: "bar", baz: "" }
		}).then(function(response){
			test.done();
		}, shouldntYieldError(test, true));
	},
	
	"passing query object, skip undefined": function(test){
		this.handleRequest = function(req, res){
			var parsed = parseUrl(req.url);
			test.equal(parsed.query, "foo=bar&baz=");
			res.end();
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			query: { foo: "bar", baz: "", thud: undefined }
		}).then(function(response){
			test.done();
		}, shouldntYieldError(test, true));
	},
	
	"passing query object, throw for illegal value": function(test){
		test["throws"](function(){
			request({
				method: "GET",
				protocol: "http:",
				hostname: this.hostname,
				port: this.port,
				query: { foo: "bar", baz: "", thud: {} }
			});
		});
		test.done();
	},
	
	"passing query overrides href query": function(test){
		this.handleRequest = function(req, res){
			var parsed = parseUrl(req.url);
			test.equal(parsed.query, "foo=bar");
			res.end();
		};
		
		request({
			method: "GET",
			href: "http://" + this.hostname + ":" + this.port + "/foo/bar?baz=thud",
			query: "foo=bar"
		}).then(function(response){
			test.done();
		}, shouldntYieldError(test, true));
	},
	
	"timeout": function(test){
		this.handleRequest = function(req, res){
			// Don't respond
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			timeout: 1 // Timeout after 1 millisecond
		}).then(shouldntYieldSuccess(test, true), function(error){
			test.ok(error instanceof promise.TimeoutError);
			test.done();
		});
	},
	
	"default timeout": function(test){
		var originalTimeout = request.requestTimeout;
		request.requestTimeout = 1;
		this.handleRequest = function(req, res){
			// Don't respond
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port
		}).then(shouldntYieldSuccess(test, true), function(error){
			test.ok(error instanceof promise.TimeoutError);
			test.done();
			request.requestTimeout = originalTimeout;
		});
	},
	
	"no timeout": function(test){
		this.handleRequest = function(req, res){
			// Don't respond
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			timeout: 0
		}).then(shouldntYieldSuccess(test), shouldntYieldError(test));
		
		setTimeout(function(){ test.done(); }, 10);
	},
	
	"cancel aborts request to server": function(test){
		this.handleRequest = function(req, res){
			var closed = false;
			req.on("close", function(){
				closed = true;
			});
			
			requestPromise.cancel();
			// Wait a bit for Node's internal state to process the abortion of the request.
			setTimeout(function(){
				test.ok(closed);
				res.end();
				test.done();
			}, 10);
		};
		
		var requestPromise = request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port
		}).then(shouldntYieldSuccess(test), function(error){
			test.ok(error instanceof promise.CancelError);
		});
	},
	
	"post body": function(test){
		var sentBody = "hello world";
		var receivedBody = "";
		this.handleRequest = function(req, res){
			req.on("data", function(chunk){ receivedBody += chunk; });
			req.on("end", function(){
				res.end();
				test.equal(receivedBody, sentBody);
				test.done();
			});
		};
		
		request({
			method: "POST",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			body: [sentBody]
		}).then(null, shouldntYieldError(test));
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
		this.handleRequest = function(req, res){
			sendNext();
			req.on("data", function(chunk){
				receivedBody += chunk;
				sendNext();
			});
			req.on("end", function(){
				res.end();
				test.equal(receivedBody, sentBody);
				test.done();
			});
		};
		
		request({
			method: "POST",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			body: lazyBody
		}).then(null, shouldntYieldError(test));
	},
	
	"cancel posting lazy body": function(test){
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
		this.handleRequest = function(req, res){
			sendNext();
			req.on("data", function(chunk){
				receivedBody += chunk;
				// Note, client already sent one more packet, so we'll have a body length of 6 when we get closed.
				if(receivedBody.length === 5){
					requestPromise.cancel();
				}
				sendNext();
			});
			req.on("close", function(){
				test.equal(receivedBody, sentBody.substring(0, 6));
				test.done();
			});
		};
		
		var requestPromise = request({
			method: "POST",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			body: lazyBody
		}).then(shouldntYieldSuccess(test), function(error){
			test.ok(error instanceof promise.CancelError);
		});
	},
	
	"receive body": function(test){
		var sentBody = "hello world";
		var sendNext;
		this.handleRequest = function(req, res){
			var chars = sentBody.split("");
			sendNext = function(){
				if(chars.length){
					res.write(chars.shift());
				}else{
					res.end();
				}
			};
			sendNext();
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
	
	"cancel whilst receiving body": function(test){
		var sentBody = "hello world";
		var sendNext;
		this.handleRequest = function(req, res){
			var chars = sentBody.split("");
			sendNext = function(){
				if(chars.length){
					res.write(chars.shift());
				}else{
					res.end();
				}
			};
			sendNext();
			
			req.on("close", function(){
				test.ok(requestCancelled);
				test.done();
			});
		};
		
		var requestCancelled = false;
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port
		}).then(function(response){
			var receivedBody = "";
			var bodyPromise = response.body.forEach(function(chunk){
				receivedBody += chunk;
				if(receivedBody.length === 5){
					bodyPromise.cancel();
				}else{
					sendNext();
				}
			}).then(shouldntYieldSuccess(test), function(error){
				test.ok(error instanceof promise.CancelError);
				test.equal(receivedBody, sentBody.substring(0, 5));
				requestCancelled = true;
			});
		});
	},
	
	"whilst receiving body, server aborts": function(test){
		var sentBody = "hello world";
		var sendNext;
		this.handleRequest = function(req, res){
			var chars = sentBody.substring(0, 5).split("");
			sendNext = function(){
				if(chars.length){
					res.write(chars.shift());
				}else{
					res.destroy();
				}
			};
			sendNext();
		};
		
		var requestCancelled = false;
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
			}).then(shouldntYieldSuccess(test), function(error){
				test.ok(error instanceof request.AbortError);
				test.equal(receivedBody, sentBody.substring(0, 5));
				test.done();
			});
		});
	},
	
	"no encoding for receiving body --> buffer": function(test){
		var sentBody = "hello world";
		this.handleRequest = function(req, res){
			res.end(sentBody);
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port
		}).then(function(response){
			var chunks = [];
			response.body.forEach(function(chunk){
				chunks.push(chunk);
			}).then(function(){
				test.equal(chunks.length, 1);
				test.ok(chunks[0] instanceof Buffer);
				test.equal(chunks[0].toString(), sentBody);
				test.done();
			}, shouldntYieldError(test, true));
		});
	},
	
	"utf8 encoding for receiving body": function(test){
		var sentBody = "hello world";
		this.handleRequest = function(req, res){
			res.end(sentBody);
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			encoding: "utf8"
		}).then(function(response){
			var chunks = [];
			response.body.forEach(function(chunk){
				chunks.push(chunk);
			}).then(function(){
				test.equal(chunks.length, 1);
				test.equal(typeof chunks[0], "string");
				test.equal(chunks[0], sentBody);
				test.done();
			}, shouldntYieldError(test, true));
		});
	},
	
	"base64 encoding for receiving body": function(test){
		var sentBody = "hello world";
		this.handleRequest = function(req, res){
			res.end(sentBody);
		};
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			encoding: "base64"
		}).then(function(response){
			var chunks = [];
			response.body.forEach(function(chunk){
				chunks.push(chunk);
			}).then(function(){
				test.equal(chunks.length, 1);
				test.equal(typeof chunks[0], "string");
				test.equal(chunks[0], new Buffer(sentBody).toString("base64"));
				test.done();
			}, shouldntYieldError(test, true));
		});
	},
	
	"header {Expect: 100-continue} continue": function(test){
		var sentBody = "hello world";
		this._server.on("checkContinue", function(req, res){
			res.writeContinue();
			
			var receivedBody = "";
			req.on("data", function(chunk){ receivedBody += chunk; });
			req.on("end", function(){
				res.end();
				test.equal(receivedBody, sentBody);
				test.done();
			});
		});
		
		request({
			method: "POST",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			headers: { expect: "100-continue" },
			body: [sentBody]
		});
	},
	
	"option checkContinue: continue": function(test){
		var sentBody = "hello world";
		this._server.on("checkContinue", function(req, res){
			res.writeContinue();
			
			var receivedBody = "";
			req.on("data", function(chunk){ receivedBody += chunk; });
			req.on("end", function(){
				res.end();
				test.equal(receivedBody, sentBody);
				test.done();
			});
		});
		
		request({
			method: "POST",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			checkContinue: true,
			body: [sentBody]
		});
	},
	
	"option checkContinue: no continue": function(test){
		this._server.on("checkContinue", function(req, res){
			res.writeHead(400);
			res.end();
		});
		
		var triedSending = false;
		request({
			method: "POST",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			checkContinue: true,
			body: new LazyArray({
				some: function(){
					triedSending = true;
					return promise.defer().promise;
				}
			})
		}).then(function(response){
			test.ok(!triedSending);
			test.done();
		}, shouldntYieldError(test, true));
	},
	
	"pass agent, max 1 connection": function(test){
		var concurrent = 0;
		this.handleRequest = function(req, res){
			test.equal(concurrent, 0);
			concurrent++;
			setTimeout(function(){
				concurrent--;
				res.end();
			}, 10);
		};
		
		var agent = http.getAgent(this.hostname, this.port);
		agent.maxSockets = 1;
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			agent: agent
		}).error(shouldntYieldError(test));
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			agent: agent
		}).then(function(){
			test.done();
		}, shouldntYieldError(test, true));
	},
	
	"pass agent, max 2 connections": function(test){
		var concurrent = 0;
		this.handleRequest = function(req, res){
			test.ok(concurrent <= 1);
			concurrent++;
			setTimeout(function(){
				concurrent--;
				res.end();
			}, 10);
		};
		
		var agent = http.getAgent(this.hostname, this.port);
		agent.maxSockets = 2;
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			agent: agent
		}).error(shouldntYieldError(test));
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			agent: agent
		}).error(shouldntYieldError(test));
		
		request({
			method: "GET",
			protocol: "http:",
			hostname: this.hostname,
			port: this.port,
			agent: agent
		}).then(function(){
			test.done();
		}, shouldntYieldError(test, true));
	}
});

var Key = "-----BEGIN RSA PRIVATE KEY-----\n\
MIICWwIBAAKBgQDpSso4Sj9mb80cx2hG3FIXyllr8fQ5nEccNESk3VkNSiyQdFYq\n\
0mm9l2xutmptNMt6Qb7+vnofy/yvJddWYsMszvxa6K9zPspAilzYLVq2gk7RhgJb\n\
uvWuuZcZgCH+AWJSt09J1Ncs0V62zEETkEW2FddzdnvET6FyvWrD/ij8MwIDAQAB\n\
AoGASSfJx+MIhI/UiwzA10+pcopihiYGRraJ2f9N80Dx9ufml5nTl3QJ8oj0WLdd\n\
Ikem8vyA7xM96pCl+Sptn0ozF1WoPhbpZqPeG9Aa5XktZfyzqqpnoRjSrUezn3Gd\n\
i2cew922UMq1A8fxetiCybufEv5jDHsLYzGIpto8C4FA8NkCQQD9Edd2MC5MdsSH\n\
ngp4cFGErtWdV80Nbpj/VjCAj0Gn7/gC/CTugLF2P3afdr61IQNkrFF/hIesToeE\n\
+J3YK5n/AkEA6/5SrUmGFHX+Z++HA2uIQTUcyBAmHBWwb7z0C2hFLeIUZGZL46l5\n\
vLFr7GSn6bhg24Voqx4shRSnpMi6JONVzQJAQvk1zFFz70h/OmTY4IbZDAQ5BCr4\n\
WVWrp+dnbp57AbbALAoOvA/S5zhkbE9AqS7TdxEjgFvSjAc8VjR1kX/4gQJAX+G1\n\
r6g2rKuAELR184LGGlA9AF/nS/PX+p4XvWbA7LJ1PJF/deEOkAa55ZLD0ibSW35p\n\
l1SsG+nXbxEK6B/hZQJACxevNJcjZ1/CmZToVXB+MWu4YMjmSzeh4nd2P6j9TwAB\n\
Dy2MxGrs7WuctmQ4ChVFxPsyEqoHhjCPd6f6PKWJGg==\n\
-----END RSA PRIVATE KEY-----";

var Cert = "-----BEGIN CERTIFICATE-----\n\
MIICITCCAYqgAwIBAgIJAPlr3WmPn00XMA0GCSqGSIb3DQEBBQUAMBYxFDASBgNV\n\
BAoTC1Byb21pc2VkLUlPMB4XDTExMDMyNzE4MDgzNVoXDTEzMTIyMDE4MDgzNVow\n\
FjEUMBIGA1UEChMLUHJvbWlzZWQtSU8wgZ8wDQYJKoZIhvcNAQEBBQADgY0AMIGJ\n\
AoGBAOlKyjhKP2ZvzRzHaEbcUhfKWWvx9DmcRxw0RKTdWQ1KLJB0VirSab2XbG62\n\
am00y3pBvv6+eh/L/K8l11ZiwyzO/Fror3M+ykCKXNgtWraCTtGGAlu69a65lxmA\n\
If4BYlK3T0nU1yzRXrbMQROQRbYV13N2e8RPoXK9asP+KPwzAgMBAAGjdzB1MB0G\n\
A1UdDgQWBBSoR570D2tBanLarpEs7XPTeTPHjjBGBgNVHSMEPzA9gBSoR570D2tB\n\
anLarpEs7XPTeTPHjqEapBgwFjEUMBIGA1UEChMLUHJvbWlzZWQtSU+CCQD5a91p\n\
j59NFzAMBgNVHRMEBTADAQH/MA0GCSqGSIb3DQEBBQUAA4GBAGnCbR9ypbCK7vS8\n\
RzmIX1vAiJUXeYbnhwPCUkU449WT4sTwVulos4vJQsA7/78jFEYpy+WRCY76i2Q3\n\
BxjKMsynaOs+Qu8jvSP2yX+26LHsUum+VyNJL2rU9qU8P1nTTwWPGVYNSB5Aw59C\n\
dombP3WmXrsuksGRsdtgkVZsFRS/\n\
-----END CERTIFICATE-----";

var Key2 = "-----BEGIN RSA PRIVATE KEY-----\n\
MIICXQIBAAKBgQDRdRjz8qwx9x/bBT5JDm7T43cCET7rfhywuyVXkU9F+rlgq25h\n\
knjXToeQnjKpwoxvQeo2zcJi8urC5CqPMatezj+tZBBZZ1y30y1ayKO5Q+Rsxsak\n\
JRf8suWq/MKtPRLapmNe5fzV6VXUPw6QmJ0MAmzcWbrleQlxad5w5OedLwIDAQAB\n\
AoGAEqvPh59wPhv7WPjErpp8wqKaLzL+WtupDw//qiin2mMZN0bQ1h3Ka9byOq//\n\
cCaJgjlr+WqqE0v4JVtVd+JDlkyfBzV+HqVGt7p8vXTq1iVKa0yjsTbFsuFuO1F2\n\
sPoXsapGG/62mzGT6FVXxLkn6pmK8zCBOEV59ikSZfL1obECQQDqNtvMqDCevjMQ\n\
lWUORIqLY72JYFErDFXEuHlICcr48WXwu5VPik1T3vwZYaoRmGZ5G8Fvr2jOMS6u\n\
e9IinNnbAkEA5PC5jg8Fqn+f9rg23EavHAnRMsBs/F8wekQfk9s4S6NwPcWpTLb8\n\
Qx7xrwE1XS9tHoB8qHinZ+BtXjK5KsdcPQJAWgi2m8i3z/4bkS9sxnxQqd6wmKOe\n\
8CZwvguQC8I/9UyOvGjPr+DhcvFQBc3GW7czBTFHPdC3QDQl1ssgb0/OawJBAK/Q\n\
ch83SBmkgxr8Yx0Mp0N4ApDgF5JEI71xfXKVwojLzdGSby57xARjyiSkX+/dEQaA\n\
k7rpVV4/ip3xhCPnD90CQQC/ptJCYQDtsexzAq0s3Dxs9efZSFuSk1YRn9thGy+5\n\
tbNzaSNuAX64N1AN2Vy44+kkLgJY+ZEMFFctanHqEiWR\n\
-----END RSA PRIVATE KEY-----";

var Cert2 = "-----BEGIN CERTIFICATE-----\n\
MIICITCCAYqgAwIBAgIJAIij3mHVHzSdMA0GCSqGSIb3DQEBBQUAMBYxFDASBgNV\n\
BAoTC1Byb21pc2VkLUlPMB4XDTExMDMyNzE4MjE1OFoXDTEzMTIyMDE4MjE1OFow\n\
FjEUMBIGA1UEChMLUHJvbWlzZWQtSU8wgZ8wDQYJKoZIhvcNAQEBBQADgY0AMIGJ\n\
AoGBANF1GPPyrDH3H9sFPkkObtPjdwIRPut+HLC7JVeRT0X6uWCrbmGSeNdOh5Ce\n\
MqnCjG9B6jbNwmLy6sLkKo8xq17OP61kEFlnXLfTLVrIo7lD5GzGxqQlF/yy5ar8\n\
wq09EtqmY17l/NXpVdQ/DpCYnQwCbNxZuuV5CXFp3nDk550vAgMBAAGjdzB1MB0G\n\
A1UdDgQWBBTwlYLsOuDLWw3D9iQWte5gLmrzWjBGBgNVHSMEPzA9gBTwlYLsOuDL\n\
Ww3D9iQWte5gLmrzWqEapBgwFjEUMBIGA1UEChMLUHJvbWlzZWQtSU+CCQCIo95h\n\
1R80nTAMBgNVHRMEBTADAQH/MA0GCSqGSIb3DQEBBQUAA4GBAAEViV3ZsItEuPPh\n\
UZ7yC9iQqaGRFkT4jbnWRLwDl7xEbIS8Uii6za6lAlNFmmKTepKw8b3Kivmld5Ou\n\
1I9hJqVC3qy4o3H5h0OWR1itF03APGBpyxI0BkXdX3P+R1AkiOxMFyMgtl1hcpOO\n\
r9aTMqxguWRtsfw+aFwAp+bni7s4\n\
-----END CERTIFICATE-----";

exports.https = require("nodeunit").testCase({
	setUp: function(callback){
		this._server = https.createServer({ key: Key, cert: Cert }, function(req, res){
			this.handleRequest(req, res);
		}.bind(this));
		this._server.listen(function(){
			var address = this._server.address();
			this.hostname = address.address;
			this.port = address.port;
			callback();
		}.bind(this));
	},
	
	tearDown: function(callback){
		this._server.on("close", function(){
			delete this._server;
			delete this.hostname;
			delete this.port;
			delete this.handleRequest;
			callback();
		}.bind(this)).close();
	},
	
	"verification failure": function(test){
		var receivedRequest = false;
		this.handleRequest = function(req, res){
			receivedRequest = true;
			res.end();
		};
	
		request({
			method: "GET",
			protocol: "https:",
			hostname: this.hostname,
			port: this.port,
			pathname: "/foo/bar"
		}).then(shouldntYieldSuccess(test, true), function(error){
			test.ok(!receivedRequest);
			test.ok(error instanceof request.SecureError);
			test.done();
		});
	},
	
	"insecure, ignore verification failure": function(test){
		this.handleRequest = function(req, res){
			test.equal(req.url, "/foo/bar");
			res.writeHead(200);
			res.end();
		};
	
		request({
			method: "GET",
			protocol: "https:",
			hostname: this.hostname,
			port: this.port,
			pathname: "/foo/bar",
			InSeCUrE_useUnverifiedServer_iNsEcUrE: true
		}).then(function(response){
			test.equal(response.status, 200);
			test.done();
		}, shouldntYieldError(test, true));
	}
});