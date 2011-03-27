var promise = require("../lib/promise");

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

exports["resolved"] = function(test){
	var expected = {};
	promise.resolved(expected).then(function(value){
		test.strictEqual(value, expected, "Got the expected value");
		test.done();
	}, shouldntYieldError(test, true));
};

exports["rejected"] = function(test){
	var expected = {};
	promise.rejected(expected).then(shouldntYieldSuccess(test, true), function(value){
		test.strictEqual(value, expected, "Got the expected value");
		test.done();
	});
};

exports["simple then resolved"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.then(function(value){
		test.strictEqual(value, expected, "Got the expected value");
		test.done();
	}, shouldntYieldError(test, true));
	deferred.resolve(expected);
};

exports["simple then rejected"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.then(shouldntYieldSuccess(test, true), function(value){
		test.strictEqual(value, expected, "Got the expected value");
		test.done();
	});
	deferred.reject(expected);
};

exports["simple then progress"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.then(function(value){
		test.strictEqual(value, expected, "Got the expected value");
		test.done();
	}, shouldntYieldError(test, true), function(update){
		test.strictEqual("progress", update);
	});
	deferred.progress("progress");
	deferred.resolve(expected);
};

exports["then chaining"] = function(test){
	var deferred = promise.defer();
	var p1 = deferred.promise.then(function(v){ return v + 1; });
	var p2 = p1.then(function(v){ return v + 1; });
	p2.then(function(value){
		test.strictEqual(3, value, "Chain result is 3");
		test.done();
	}, shouldntYieldError(test, true));
	deferred.resolve(1);
};

exports["then chaining with promises"] = function(test){
	var deferred = promise.defer();
	var p1 = deferred.promise.then(function(v){ return promise.resolved(v + 1); });
	var p2 = p1.then(function(v){ return promise.resolved(v + 1); });
	p2.then(function(value){
		test.strictEqual(3, value, "Chain result is 3");
		test.done();
	}, shouldntYieldError(test, true));
	deferred.resolve(1);
};

exports["back and forth between errors"] = function(test){
	var deferred = promise.defer();
	deferred.promise.then(null, function(){
		return "ignore error and make it good";
	}).then(function(){
		throw "a new error";
	}).then(null, function(){
		return "ignore secod error and make it good again";
	}).then(function(){
		return "success";
	}).then(function(value){
		test.strictEqual(value, "success");
		test.done();
	}, shouldntYieldError(test, true));
	deferred.reject();
};

exports["then on deferred"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
	deferred.resolve(expected);
};

exports["deferred timeout"] = function(test){
	var deferred = promise.defer();
	deferred.timeout(0);
	deferred.promise.then(shouldntYieldSuccess(test, true), function(error){
		test.ok(error instanceof promise.TimeoutError, "Got a timeout error");
		test.done();
	});
};

exports["deferred timeout, resolved in time"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.timeout(0);
	deferred.promise.then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
	deferred.resolve(expected);
};

exports["deferred with canceller"] = function(test){
	var cancelled = false;
	var deferred = promise.defer(function(){
		cancelled = true;
	});
	deferred.promise.then(shouldntYieldSuccess(test, true), function(error){
		test.ok(cancelled);
		test.ok(error instanceof promise.CancelError);
		test.done();
	});
	deferred.promise.cancel();
};

exports["deferred with canceller, passing reason"] = function(test){
	var cancelled = false;
	var expected = {};
	var deferred = promise.defer(function(reason){
		cancelled = true;
		test.strictEqual(reason, expected);
	});
	deferred.promise.then(shouldntYieldSuccess(test, true), function(error){
		test.ok(cancelled);
		test.ok(error instanceof promise.CancelError);
		test.done();
	});
	deferred.promise.cancel(expected);
};

exports["deferred with canceller, returning custom error"] = function(test){
	var cancelled = false;
	var customError = {};
	var deferred = promise.defer(function(){
		cancelled = true;
		return customError;
	});
	deferred.promise.then(shouldntYieldSuccess(test, true), function(error){
		test.ok(cancelled);
		test.strictEqual(error, customError);
		test.done();
	});
	deferred.promise.cancel();
};

exports["deferred without canceller can't be canceled"] = function(test){
	var deferred = promise.defer();
	test.strictEqual(deferred.cancel, undefined);
	test.done();
};

exports["cancel from derived promise"] = function(test){
	var cancelled = false;
	var deferred = promise.defer(function(){
		cancelled = true;
	});
	deferred.promise.then(shouldntYieldSuccess(test, true), function(error){
		test.ok(cancelled);
		test.ok(error instanceof promise.CancelError);
		test.done();
	}).cancel();
};

exports["resolver callback"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
	deferred.resolverCallback(function(){
		return expected;
	})();
};

exports["resolver callback, with error"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.then(shouldntYieldSuccess(test, true), function(error){
		test.strictEqual(error, expected);
		test.done();
	});
	deferred.resolverCallback(function(){
		throw expected;
	})();
};

exports["get on promise"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.get("expected").then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
	deferred.resolve({ expected: expected });
};

exports["put on promise"] = function(test){
	var expected = {};
	var put = {};
	var deferred = promise.defer();
	deferred.promise.put("put", put).then(function(value){
		test.strictEqual(value, put);
		test.strictEqual(value, expected.put);
		test.done();
	}, shouldntYieldError(test, true));
	deferred.resolve(expected);
};

exports["call on promise"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.call("call", expected).then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
	deferred.resolve({ call: function(expected){ return expected; } });
};

exports["done shortcut"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.done(function(value){
		test.strictEqual(value, expected);
		test.done();
	});
	deferred.resolve(expected);
};

exports["success shortcut"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.success(function(value){
		test.strictEqual(value, expected);
		test.done();
	});
	deferred.resolve(expected);
};

exports["error shortcut"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.error(function(value){
		test.strictEqual(value, expected);
		test.done();
	});
	deferred.reject(expected);
};

exports["fail shortcut"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.fail(function(value){
		test.strictEqual(value, expected);
		test.done();
	});
	deferred.reject(expected);
};

exports["progress shortcut"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	deferred.promise.progress(function(value){
		test.strictEqual(value, expected);
		test.done();
	});
	deferred.progress(expected);
};

exports["emit unhandled"] = function(test){
	var expected = {};
	promise.defer().reject(expected);
	promise.once("error", function(error){
		test.strictEqual(error, expected);
		test.done();
	});
};

exports["when for promise"] = function(test){
	var expected = {};
	promise.when(promise.resolved(expected), function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["when for promise, rejected"] = function(test){
	var expected = {};
	promise.when(promise.rejected(expected), shouldntYieldSuccess(test, true), function(error){
		test.strictEqual(error, expected);
		test.done();
	});
};

exports["when for promise, with progress"] = function(test){
	var expected = {};
	var deferred = promise.defer();
	promise.when(deferred.promise, function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true), function(update){
		test.strictEqual("progress", update);
	});
	deferred.progress("progress");
	deferred.resolve(expected);
};

exports["when for non-promise"] = function(test){
	var expected = {};
	promise.when(expected, function(value){
		test.strictEqual(value, expected);
		test.done();
	});
};

exports["when returning promise"] = function(test){
	var expected = {};
	promise.when(expected).then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["whenCall"] = function(test){
	var expected = {};
	promise.whenCall(function(){ return expected; }, function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["whenCall, throwing error"] = function(test){
	var expected = {};
	promise.whenCall(function(){ throw expected; }, shouldntYieldSuccess(test, true), function(error){
		test.strictEqual(error, expected);
		test.done();
	});
};

exports["get for promise"] = function(test){
	var expected = {};
	promise.get(promise.resolved({ expected: expected }), "expected").then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["get for non-promise"] = function(test){
	var expected = {};
	promise.get({ expected: expected }, "expected").then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["call for promise"] = function(test){
	var expected = {};
	promise.call(promise.resolved({ call: function(){ return expected; } }), "call").then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["call for non-promise"] = function(test){
	var expected = {};
	promise.call({ call: function(){ return expected; } }, "call").then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["put for promise"] = function(test){
	var expected = {};
	var result = {};
	promise.put(promise.resolved(result), "put", expected).then(function(value){
		test.strictEqual(value, expected);
		test.strictEqual(result.put, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["put for non-promise"] = function(test){
	var expected = {};
	var result = {};
	promise.put(result, "put", expected).then(function(value){
		test.strictEqual(value, expected);
		test.strictEqual(result.put, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["all for mixed arguments"] = function(test){
	var expected = {};
	promise.all(promise.resolved(expected), expected, promise.resolved(expected), expected).then(function(values){
		test.strictEqual(values[0], expected);
		test.strictEqual(values[1], expected);
		test.strictEqual(values[2], expected);
		test.strictEqual(values[3], expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["all, 1st argument is array"] = function(test){
	var expected = {};
	promise.all([promise.resolved(expected), expected, promise.resolved(expected), expected]).then(function(values){
		test.strictEqual(values[0], expected);
		test.strictEqual(values[1], expected);
		test.strictEqual(values[2], expected);
		test.strictEqual(values[3], expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["all, rejected"] = function(test){
	var expected = {};
	promise.all(promise.rejected(expected), promise.rejected(expected)).then(shouldntYieldSuccess(test, true), function(error){
		test.strictEqual(error, expected);
		test.done();
	}).cancel();
};

exports["all, cancelled"] = function(test){
	promise.all(promise.defer()).then(shouldntYieldSuccess(test, true), function(error){
		test.ok(error instanceof promise.CancelError);
		test.done();
	}).cancel();
};

exports["allKeys"] = function(test){
	var expected = {};
	var hash = {
		foo: promise.resolved(expected),
		bar: promise.resolved(expected)
	};
	promise.allKeys(hash).then(function(hash){
		test.strictEqual(hash.foo, expected);
		test.strictEqual(hash.bar, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["allKeys, with rejection"] = function(test){
	var expected = {};
	var hash = {
		foo: promise.resolved(expected),
		bar: promise.rejected(expected)
	};
	promise.allKeys(hash).then(shouldntYieldSuccess(test, true), function(error){
		test.strictEqual(error, expected);
		test.done();
	});
};

exports["allKeys, with cancel"] = function(test){
	var expected = {};
	var hash = {
		foo: promise.resolved(expected),
		bar: promise.defer()
	};
	promise.allKeys(hash).then(shouldntYieldSuccess(test, true), function(error){
		test.ok(error instanceof promise.CancelError);
		test.done();
	}).cancel();
};

exports["first"] = function(test){
	var expected = {};
	promise.first(promise.defer(), promise.resolved(expected)).then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["first, 1st argument is array"] = function(test){
	var expected = {};
	promise.first([promise.defer(), promise.resolved(expected)]).then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["first, rejected"] = function(test){
	var expected = {};
	promise.first(promise.defer(), promise.rejected(expected)).then(shouldntYieldSuccess(test, true), function(error){
		test.strictEqual(error, expected);
		test.done();
	});
};

exports["first, cancelled"] = function(test){
	var expected = {};
	promise.first(promise.defer()).then(shouldntYieldSuccess(test, true), function(error){
		test.ok(error instanceof promise.CancelError);
		test.done();
	}).cancel();
};

exports["seq"] = function(test){
	promise.seq([
			function(v){ return v + 1; },
			function(v){ return v + 1; }
		], 1).then(function(value){
			test.strictEqual(value, 3);
			test.done();
		}, shouldntYieldError(test, true));
};

exports["seq, returning promises"] = function(test){
	promise.seq([
			function(v){ return promise.resolved(v + 1); },
			function(v){ return promise.resolved(v + 1); }
		], 1).then(function(value){
			test.strictEqual(value, 3);
			test.done();
		}, shouldntYieldError(test, true));
};

exports["seq, throwing error"] = function(test){
	var expected = {};
	promise.seq([
			function(v){ return v + 1; },
			function(v){ throw expected; }
		], 1).then(shouldntYieldSuccess(test, true), function(error){
			test.strictEqual(error, expected);
			test.done();
		});
};

exports["seq, cancelled"] = function(test){
	var halted = true;
	var deferred = promise.defer();
	promise.seq([
			function(v){ return deferred.promise; },
			function(v){ halted = false; }
		], 1).then(shouldntYieldSuccess(test, true), function(error){
			test.ok(error instanceof promise.CancelError);
			test.ok(halted);
			test.done();
		}).cancel();
	deferred.resolve();
};

exports["delay"] = function(test){
	var delayed = false;
	promise.delay(0).then(function(){
		test.ok(delayed);
		test.done();
	}, shouldntYieldError(test, true));
	delayed = true;
};

exports["delay, cancelled"] = function(test){
	promise.delay(0).then(shouldntYieldSuccess(test, true), function(error){
		test.ok(error instanceof promise.CancelError);
		test.done();
	}).cancel();
};

exports["execute"] = function(test){
	var expected = {};
	promise.execute(function(cb){ cb(null, expected); }).then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["execute, multiple values"] = function(test){
	var expected = {};
	promise.execute(function(cb){ cb(null, expected, expected); }).then(function(values){
		test.strictEqual(values[0], expected);
		test.strictEqual(values[1], expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["execute, with error"] = function(test){
	var expected = {};
	promise.execute(function(cb){ cb(expected); }).then(shouldntYieldSuccess(test, true), function(error){
		test.strictEqual(error, expected);
		test.done();
	});
};

exports["execute, can't be cancelled"] = function(test){
	test.strictEqual(promise.execute(function(){}).cancel, undefined);
	test.done();
};

exports["convertAsync"] = function(test){
	var expected = {};
	var async = function(expected, cb){ cb(null, expected); };
	var promising = promise.convertAsync(async);
	promising(expected).then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["convertAsync, multiple values"] = function(test){
	var expected = {};
	var async = function(expected, expected2, cb){ cb(null, expected, expected2); };
	var promising = promise.convertAsync(async);
	promising(expected, expected).then(function(values){
		test.strictEqual(values[0], expected);
		test.strictEqual(values[1], expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["convertAsync, with error"] = function(test){
	var expected = {};
	var async = function(expected, cb){ cb(expected); };
	var promising = promise.convertAsync(async);
	promising(expected).then(shouldntYieldSuccess(test, true), function(error){
		test.strictEqual(error, expected);
		test.done();
	});
};

exports["convertAsync without declared callback"] = function(test){
	var expected = {};
	var async = function(expected){ arguments[arguments.length - 1](null, expected); };
	var promising = promise.convertAsync(async, true);
	promising(expected).then(function(value){
		test.strictEqual(value, expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["convertAsync without declared callback, multiple values"] = function(test){
	var expected = {};
	var async = function(expected, expected2){ arguments[arguments.length - 1](null, expected, expected2); };
	var promising = promise.convertAsync(async, true);
	promising(expected, expected).then(function(values){
		test.strictEqual(values[0], expected);
		test.strictEqual(values[1], expected);
		test.done();
	}, shouldntYieldError(test, true));
};

exports["convertAsync without declared callback, with error"] = function(test){
	var expected = {};
	var async = function(expected){ arguments[arguments.length - 1](expected); };
	var promising = promise.convertAsync(async, true);
	promising(expected).then(shouldntYieldSuccess(test, true), function(error){
		test.strictEqual(error, expected);
		test.done();
	});
};