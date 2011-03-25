// Notes from Kris Zyp:
//
// This is based on the CommonJS spec for promises: <http://wiki.commonjs.org/wiki/Promises>.
// Includes convenience functions for promises, much of this is taken from Tyler Close's ref_send 
// and Kris Kowal's work on promises.
//
// MIT License

module.exports = exports = new (require("events").EventEmitter);
exports.errorTimeout = 100;

/**
 * Default constructor that creates a self-resolving Promise. Not all promise implementations
 * need to use this constructor.
 */
exports.Promise = Promise;
function Promise(canceller){};

/**
 * Promise implementations must provide a "then" function.
 */
Promise.prototype.then = function(resolvedCallback, rejectCallback, progressCallback){
	throw new TypeError("The Promise base class is abstract, this function must be implemented by the Promise implementation");
};

/**
 * If an implementation of a promise can be cancelled, it may add this function
 */
 // Promise.prototype.cancel = function(){
 // };

Promise.prototype.get = function(propertyName){
	return this.then(function(value){
		return value[propertyName];
	});
};

Promise.prototype.put = function(propertyName, value){
	return this.then(function(object){
		return object[propertyName] = value;
	});
};

Promise.prototype.call = function(functionName /*, args */){
	var args = Array.prototype.slice.call(arguments, 1);
	return this.then(function(value){
		return value[functionName].apply(value, args);
	});
};

Promise.prototype.done = Promise.prototype.success = function(resolvedCallback){
	return this.then(resolvedCallback);
};

Promise.prototype.fail = Promise.prototype.error = function(rejectCallback){
	return this.then(null, rejectCallback);
};

Promise.prototype.progress = function(progressCallback){
	return this.then(null, null, progressCallback);
};

exports.Deferred = Deferred;
function Deferred(canceller){
	var result, fulfilled, isError, waiting = [], handled;
	var promise = this.promise = new Promise();
	
	this.resolve = function(value){
		notifyAll(value);
	};
	
	var reject = this.reject = function(error, ignoreUnhandled){
		isError = true;
		notifyAll(error);
		if(!ignoreUnhandled && !handled){
			setTimeout(function(){
				if(!handled){
					exports.emit("error", error);
				}
			}, exports.errorTimeout);
		}
		return handled;
	};
	
	this.progress = function(update){
		// Note: `waiting` can be appended to whilst executing progress callbacks.
		for(var i = 0; i < waiting.length; i++){
			var progress = waiting[i].progress;
			progress && progress(update);
		}
	};
	
	this.then = promise.then = function(/*Function?*/resolvedCallback, /*Function?*/rejectCallback, /*Function?*/progressCallback){
		var returnDeferred = new Deferred(promise.cancel);
		var listener = {
			resolved: resolvedCallback,
			error: rejectCallback,
			progress: progressCallback,
			deferred: returnDeferred
		};
		// Enqueue listener if we're fulfilled but still calling our own callbacks, else call immediately.
		// This behavior is undefined in the specification but is the behavior from Dojo 1.5 and 1.6.
		if(fulfilled && !waiting){
			notify(listener);
		}else{
			waiting.push(listener);
		}
		return returnDeferred.promise;
	};
	
	if(canceller){
		this.cancel = promise.cancel = function(){
			if(!fulfilled){
				var error = canceller();
				if(error === undefined){
					error = new CancelError;
				}
				if(!fulfilled){
					reject(error);
				}
			}
		};
	}
	
	var timeout;
	this.timeout = function(ms){
		if(ms === undefined || timeout !== undefined){
			return timeout;
		}
		
		timeout = ms;
		setTimeout(function(){
			if(!fulfilled){
				if(promise.cancel){
					promise.cancel(new TimeoutError);
				}else{
					reject(new TimeoutError);
				}
			}
		}, ms);
		return promise;
	};
	
	Object.freeze(promise);
	
	function notifyAll(value){
		if(fulfilled){
			throw new Error("This deferred has already been resolved");
		}
		result = value;
		fulfilled = true;
		// Note: `waiting` can be appended to whilst executing notifying listeners.
		for(var i = 0; i < waiting.length; i++){
			notify(waiting[i]);	
		}
		// We're no longer processing listeners, clear the list so they can be garbage collected.
		waiting = null;
	}
	
	function notify(listener){
		var func = (isError ? listener.error : listener.resolved);
		if(func){
			handled = true;
			try{
				var newResult = func(result);
				if(newResult && typeof newResult.then === "function"){
					newResult.then(listener.deferred.resolve, listener.deferred.reject);
					return;
				}
				listener.deferred.resolve(newResult);
			}catch(e){
				listener.deferred.reject(e);
			}
		}else{
			if(isError){
				handled = listener.deferred.reject(result, true);
			}else{
				listener.deferred.resolve(result);
			}
		}
	}
};

/**
 * This can be used to conviently resolve a promise with auto-handling of errors:
 * setTimeout(deferred.resolverCallback(function(){
 *   return doSomething();
 * }), 100);
 */
Deferred.prototype.resolverCallback = function(callback){
	return function(){
		try{
			this.resolve(callback());
		}catch(e){
			this.reject(e);
		}
	}.bind(this);
};

exports.defer = defer;
function defer(canceller){
	return new Deferred(canceller);
}

exports.resolved = resolved;
function resolved(value){
	var deferred = new Deferred;
	deferred.resolve(value);
	return deferred.promise;
}

exports.rejected = rejected;
function rejected(error){
	var deferred = new Deferred;
	deferred.reject(error);
	return deferred.promise;
}

exports.TimeoutError = TimeoutError;
function TimeoutError(){
	Error.apply(this, arguments);
}
require("util").inherits(TimeoutError, Error);

exports.CancelError = CancelError;
function CancelError(){
	Error.apply(this, arguments);
}
require("util").inherits(CancelError, Error);

exports.when = when;
function when(value, resolvedCallback, rejectCallback, progressCallback){
	if(value && typeof value.then === "function"){
		return value.then(resolvedCallback, rejectCallback, progressCallback);
	}else{
		return resolved(value).then(resolvedCallback, rejectCallback, progressCallback);
	}
}

/**
 * This is convenience function for catching synchronously and asynchronously thrown
 * errors. This is used like when() except you execute the initial action in a callback:
 * whenCall(function(){
 *   return doSomethingThatMayReturnAPromise();
 * }, successHandler, errorHandler);
 */
exports.whenCall = function(initialCallback, resolvedCallback, rejectCallback, progressCallback){
	try{
		return when(initialCallback(), resolvedCallback, rejectCallback, progressCallback);
	}catch(e){
		return rejected(e).then(null, rejectCallback);
	}
};

function perform(value, async, sync){
	try{
		if(value && typeof value.then === "function"){
			value = async(value);
		}else{
			value = sync(value);
		}
		if(value && typeof value.then === "function"){
			return value;
		}
		return resolved(value);
	}catch(e){
		return rejected(value);
	}
}

/**
 * Gets the value of a property in a future turn.
 * @param target	promise or value for target object
 * @param property		name of property to get
 * @return promise for the property value
 */
exports.get = function(target, property){
	return perform(target,
			function(target){ return target.get(property); },
			function(target){ return target[property]; });
};

/**
 * Invokes a method in a future turn.
 * @param target	promise or value for target object
 * @param methodName		name of method to invoke
 * @param args		array of invocation arguments
 * @return promise for the return value
 */
exports.call = function(target, methodName, args){
	return perform(target,
			function(target){ return target.call(methodName, args); },
			function(target){ return target[methodName].apply(target, args); });
};

/**
 * Sets the value of a property in a future turn.
 * @param target	promise or value for target object
 * @param property		name of property to set
 * @param value	 new value of property
 * @return promise for the return value
 */
exports.put = function(target, property, value){
	return perform(target,
			function(target){ return target.put(property, value); },
			function(target){ return target[property] = value; });
};

/**
 * Takes an array of promises and returns a promise that is fulfilled once all
 * the promises in the array are fulfilled
 * @param array	The array of promises
 * @return the promise that is fulfilled when all the array is fulfilled, resolved to the array of results
 */
exports.all = all;
function all(array){
	if(!(array instanceof Array)){
		array = Array.prototype.slice.call(arguments);
	}
	
	var promises, results = [];
	var fulfilled;
	var waiting = array.length;
	var deferred = new Deferred(function(){
		promises.forEach(function(promise){ promise.cancel && promise.cancel(); });
		promises = results = null;
	});
	
	if(waiting === 0){
		deferred.resolve(results);
	}else{
		promises = array.map(function(promise, index){
			return when(promise,
					function(value){
						if(!fulfilled){
							results[index] = value;
							waiting--;
							if(waiting === 0){
								fulfilled = true;
								deferred.resolve(results);
							}
						}
					},
					function(error){
						if(!fulfilled){
							deferred.reject(error);
						}
					});
		});
	}
	
	return deferred.promise;
};

/**
 * Takes a hash of promises and returns a promise that is fulfilled once all
 * the promises in the hash keys are fulfilled
 * @param hash	The hash of promises
 * @return the promise that is fulfilled when all the hash keys is fulfilled, resolved to the hash of results
 */
exports.allKeys = function(hash){
	var keys = Object.keys(hash);
	var promises = keys.map(function(key){ return hash[key]; });
	return all(promises).then(function(values){
		return keys.reduce(function(result, key, index){
			result[key] = values[index];
			return result;
		}, {});
	});
};

/**
 * Takes an array of promises and returns a promise that is fulfilled when the first 
 * promise in the array of promises is fulfilled
 * @param array	The array of promises
 * @return a promise that is fulfilled with the value of the value of first promise to be fulfilled
 */
exports.first = function(array){
	if(!(array instanceof Array)){
		array = Array.prototype.slice.call(arguments);
	}
	
	var fulfilled;
	var deferred = new Deferred(function(){
		promises.forEach(function(promise){ promise.cancel && promise.cancel(); });
		promises = null;
	});
	var promises = array.map(function(promise){
		return when(promise,
				function(value){
					if(!fulfilled){
						fulfilled = true;
						deferred.resolve(value);
					}
				},
				function(error){
					if(!fulfilled){
						fulfilled = true;
						deferred.reject(error);
					}
				});
	});
	return deferred.promise;
};

/**
 * Takes an array of asynchronous functions (that return promises) and 
 * executes them sequentially. Each funtion is called with the return value of the last function
 * @param array	The array of function
 * @param startingValue The value to pass to the first function
 * @return the value returned from the last function
 */
exports.seq = function(array, startingValue){
	array = array.slice(); // make a copy
	
	var cancelled = false;
	var deferred = new Deferred(function(){
		cancelled = true;
		array = null;
	});
	function next(value){
		if(cancelled){
			return;
		}
		
		var nextAction = array.shift();
		if(nextAction){
			try{
				when(nextAction(value), next, deferred.reject);
			}catch(e){
				deferred.reject(e);
			}
		}else{
			deferred.resolve(value);
		}
	}
	next(startingValue);
	return deferred.promise;
};

/**
 * Delays for a given amount of time and then fulfills the returned promise.
 * @param milliseconds The number of milliseconds to delay
 * @return A promise that will be fulfilled after the delay
 */
exports.delay = function(ms){
	var cancelled = false;
	var deferred = new Deferred(function(){ cancelled = true; });
	setTimeout(function(){ !cancelled && deferred.resolve(); }, ms);
	return deferred.promise;
};

/**
 * Runs a function that takes a callback, but returns a Promise instead.
 * @param func	 node compatible async function which takes a callback as its last argument
 * @return promise for the return value from the callback from the function
 */
exports.execute = function(asyncFunction){
	var args = Array.prototype.slice.call(arguments, 1);

	var deferred = new Deferred;
	args.push(function(error, result){
		if(error){
			deferred.reject(error);
		}else{
			if(arguments.length > 2){
				// if there are multiple success values, we return an array
				deferred.resolve(Array.prototype.slice.call(arguments, 1));
			}else{
				deferred.resolve(result);
			}
		}
	});
	try{
		asyncFunction.apply(this, args);
	}catch(e){
		deferred.reject(e);
	}
	return deferred.promise;
};

/**
 * Converts a Node async function to a promise returning function
 * @param func	 node compatible async function which takes a callback as its last argument
 * @return A function that returns a promise
 */
exports.convertAsync = function(asyncFunction, callbackNotDeclared){
	var arity = asyncFunction.length;
	return function(){
		var deferred = new Deferred;
		if(callbackNotDeclared === true){
			arity = arguments.length + 1;
		}
		arguments.length = arity;
		arguments[arity - 1] = function(error, result){
			if(error){
				deferred.reject(error);
			}else{
				if(arguments.length > 2){
					// if there are multiple success values, we return an array
					deferred.resolve(Array.prototype.slice.call(arguments, 1));
				}else{
					deferred.resolve(result);
				}
			}
		};
		try{
			asyncFunction.apply(this, arguments);
		}catch(e){
			deferred.reject(e);
		}
		return deferred.promise;
	};
};