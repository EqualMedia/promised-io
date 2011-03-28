var inherits = require("util").inherits;

/**
 * @module promise
 * @description
 * <p>Provides an implementation of promises with various utility functions.</p>
 *
 * <p>Notes from Kris Zyp:</p>
 *
 * <p><em>This is based on the CommonJS spec for promises: <a href="http://wiki.commonjs.org/wiki/Promises">http://wiki.commonjs.org/wiki/Promises</a>.
 * Includes convenience functions for promises, much of this is taken from Tyler Close's ref_send 
 * and Kris Kowal's work on promises.</em></p>
 *
 * <p><em>MIT License</em></p>
 *
 * <p>The module is an <code>EventEmitter</code> instance. It'll emit the <code>error</code> event
 * for unhandled exceptions thrown inside deferreds.
 */
module.exports = exports = new (require("events").EventEmitter);

/**
 * Amount of time to wait before emitting for unhandled errors.
 * @property
 * @type integer
 */
exports.unhandledTimeout = 100;

/**
 * Defines a base class for promises, though not all promise implementations need to extend
 * from this class.
 * @class
 * @param {function} [canceller] If defined, the promise becomes cancellable and will expose a "cancel" method. When cancelled, this function is invoked and can return an error value.
 */
exports.Promise = Promise;
function Promise(canceller){};

/**
 * Promise implementations must provide a "then" function. Use it to add callbacks to be run when the
 * promise is resolved or rejected. Callbacks can be added at any time during the promise lifecycle.
 * @param {function} [resolvedCallback] Called if the promise was fulfilled successfully. Receives the value.
 * @param {function} [rejectCallback] Called if the promise was rejected, receives an error value.
 * @param {function} [progressCallback] Called when the promise signals progress, receives the progress value.
 * @return A new promise
 */
exports.Promise.prototype.then = function(resolvedCallback, rejectCallback, progressCallback){
	throw new TypeError("The Promise base class is abstract, this function must be implemented by the Promise implementation");
};

/**
 * Gets the value of a property from the fulfilled promise value.
 * @param propertyName Name of property to get
 * @return Promise for the property value
 */
exports.Promise.prototype.get = function(propertyName){
	return this.then(function(value){
		return value[propertyName];
	});
};

/**
 * Sets the value of a property on the fulfilled promise value.
 * @param propertyName Name of property to set
 * @param value New value of property
 * @return Promise for the return value
 */
exports.Promise.prototype.put = function(propertyName, value){
	return this.then(function(object){
		return object[propertyName] = value;
	});
};

/**
 * Invokes a method on the fulfilled promise value.
 * @param methodName Name of method to invoke
 * @param [args] Array of invocation arguments
 * @return Promise for the return value
 */
exports.Promise.prototype.call = function(functionName /*, args*/){
	var args = Array.prototype.slice.call(arguments, 1);
	return this.then(function(value){
		return value[functionName].apply(value, args);
	});
};

/**
 * Shortcut for adding a fulfillment callback.
 * @param {function} resolvedCallback
 * @return A new promise
 */
exports.Promise.prototype.done = function(resolvedCallback){
	return this.then(resolvedCallback);
};

/**
 * Shortcut for adding a fulfillment callback.
 * @function
 * @param {function} resolvedCallback
 * @return A new promise
 */
exports.Promise.prototype.success = exports.Promise.prototype.done;

/**
 * Shortcut for adding an error callback.
 * @param {function} rejectCallback
 * @return A new promise
 */
exports.Promise.prototype.fail = function(rejectCallback){
	return this.then(null, rejectCallback);
};

/**
 * Shortcut for adding an error callback.
 * @function
 * @param {function} rejectCallback
 * @return A new promise
 */
exports.Promise.prototype.error = exports.Promise.prototype.fail;

/**
 * Shortcut for adding a progress callback.
 * @param {function} progressCallback
 * @return A new promise
 */
exports.Promise.prototype.progress = function(progressCallback){
	return this.then(null, null, progressCallback);
};

/**
 * Defines a base class for promises, though not all promise implementations need to extend
 * from this class.
 * @class
 * @param {function} [canceller] If defined, the promise becomes cancellable and will expose a "cancel" method. When cancelled, this function is invoked and can return an error value.
 */
exports.Deferred = Deferred;
function Deferred(canceller){
	var result, fulfilled, isError, waiting = [], handled;
	var promise = new Promise();
	/**
	 * A promise for the deferred value. Suitable for outside consumers.
	 * @property
	 */
	this.promise = promise;
	
	/**
	 * Resolve the deferred.
	 * @function
	 * @param [value]
	 */
	this.resolve = function(value){
		notifyAll(value);
	};
	
	/**
	 * Reject the deferred
	 * @function
	 * @param [error]
	 * @param {boolean} ignoreUnhandled If set to "true", the deferred won't try and detect whether the error is ever handled
	 */
	this.reject = function(error, ignoreUnhandled){
		isError = true;
		notifyAll(error);
		if(!ignoreUnhandled && !handled){
			setTimeout(function(){
				if(!handled){
					exports.emit("error", error);
				}
			}, exports.unhandledTimeout);
		}
		return handled;
	};
	var reject = this.reject;
	
	/**
	 * Send a progress update to the progress callbacks currently registered.
	 * @function
	 * @param [update]
	 */
	this.progress = function(update){
		// Note: `waiting` can be appended to whilst executing progress callbacks.
		for(var i = 0; i < waiting.length; i++){
			var progress = waiting[i].progress;
			progress && progress(update);
		}
	};
	
	/**
	 * Add callbacks to be run when the deferred is resolved or rejected.
	 * Callbacks can be added at any time during the deferred lifecycle.
	 * @function
	 * @param {function} [resolvedCallback] Called if the promise was fulfilled successfully. Receives the value.
	 * @param {function} [rejectCallback] Called if the promise was rejected, receives an error value.
	 * @param {function} [progressCallback] Called when the promise signals progress, receives the progress value.
	 * @return A new promise
	 */
	this.then = function(resolvedCallback, rejectCallback, progressCallback){
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
	promise.then = this.then;
	
	if(canceller){
		/**
		 * Send a signal back to the deferred that the consumer (of the promise) is no longer interested.
		 * Only available if deferred was created with a canceller function.
		 * @function
		 */
		this.cancel = function(reason){
			if(!fulfilled){
				var error = canceller(reason);
				if(error === undefined){
					error = new CancelError;
				}
				if(!fulfilled){
					reject(error);
				}
			}
		};
		promise.cancel = this.cancel;
	}
	
	var timeout;
	/**
	 * Define that the deferred will time out at a certain point, unless it's been fulfilled.
	 * The deferred will be rejected with a TimeoutError.
	 * @function
	 * @param {integer} ms Timeout in milliseconds
	 */
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
 * <pre><code>setTimeout(deferred.resolverCallback(function(){
 *   return doSomething();
 * }), 100);</code></pre>
 * @param {function} callback
 */
exports.Deferred.prototype.resolverCallback = function(callback){
	return function(){
		try{
			this.resolve(callback());
		}catch(e){
			this.reject(e);
		}
	}.bind(this);
};

/**
 * Create a new deferred.
 * @function
 * @param {function} [canceller]
 */
exports.defer = defer;
function defer(canceller){
	return new Deferred(canceller);
}

/**
 * Create a promise for a deferred that's already resolved
 * @function
 * @param value
 * @return The created promise
 */
exports.resolved = resolved;
function resolved(value){
	var deferred = new Deferred;
	deferred.resolve(value);
	return deferred.promise;
}

/**
 * Create a promise for a deferred that's already rejected
 * @function
 * @param error
 * @return The created promise
 */
exports.rejected = rejected;
function rejected(error){
	var deferred = new Deferred;
	deferred.reject(error);
	return deferred.promise;
}

/**
 * Class to define errors thrown when a deferred times out.
 * @class
 * @extends Error
 */
exports.TimeoutError = TimeoutError;
function TimeoutError(){
	Error.apply(this, arguments);
}
inherits(TimeoutError, Error);

/**
 * Class to define errors thrown when a deferred is cancelled and the canceller function
 * does not return any error value.
 * @class
 * @extends Error
 */
exports.CancelError = CancelError;
function CancelError(){
	Error.apply(this, arguments);
}
inherits(CancelError, Error);

/**
 * Irrespective of whether the value is a promise or not, will invoke the appropriate callbacks.
 * @function
 * @param value
 * @param {function} [resolvedCallback]
 * @param {function} [rejectCallback]
 * @param {function} [progressCallback]
 * @return A new promise
 */
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
 * <pre><code>whenCall(function(){
 *   return doSomethingThatMayReturnAPromise();
 * }, successHandler, errorHandler);</code></pre>
 * @param {function} initialCallback
 * @param {function} [resolvedCallback]
 * @param {function} [rejectCallback]
 * @param {function} [progressCallback]
 * @return A new promise
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
 * Gets the value of a property from the target or the target promise's fulfilled value.
 * @param target Promise or value for target object
 * @param property Name of property to get
 * @return Promise for the property value
 */
exports.get = function(target, property){
	return perform(target,
			function(target){ return target.get(property); },
			function(target){ return target[property]; });
};

/**
 * Invokes a method on the target object or the target promise's fulfilled value.
 * @param target Promise or value for target object
 * @param methodName Name of method to invoke
 * @param [args] Array of invocation arguments
 * @return Promise for the return value
 */
exports.call = function(target, methodName, args){
	return perform(target,
			function(target){ return target.call(methodName, args); },
			function(target){ return target[methodName].apply(target, args); });
};

/**
 * Sets the value of a property on the target or the target promises' fulfilled value.
 * @param target Promise or value for target object
 * @param property Name of property to set
 * @param value New value of property
 * @return Promise for the return value
 */
exports.put = function(target, property, value){
	return perform(target,
			function(target){ return target.put(property, value); },
			function(target){ return target[property] = value; });
};

/**
 * Takes an array of promises and returns a promise that is fulfilled once all
 * the promises in the array are fulfilled
 * @function
 * @param array The array of promises
 * @return the promise that is fulfilled when all the array is fulfilled, resolved to the array of results
 */
exports.all = all;
function all(array){
	if(!Array.isArray(array)){
		array = Array.prototype.slice.call(arguments);
	}
	
	var waiting = array.length;
	if(waiting === 0){
		return resolved([]);
	}
	
	var promises, results = [];
	var fulfilled;
	var deferred = new Deferred(function(){
		promises.forEach(function(promise){ promise.cancel && promise.cancel(); });
		promises = results = null;
	});
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
						fulfilled = true;
						deferred.reject(error);
					}
				});
	});
	
	array = null;
	return deferred.promise;
};

/**
 * Takes a hash of promises and returns a promise that is fulfilled once all
 * the promises in the hash keys are fulfilled
 * @param hash The hash of promises
 * @return The promise that is fulfilled when all the hash keys is fulfilled, resolved to the hash of results
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
 * @param array The array of promises
 * @return A promise that is fulfilled with the value of the value of first promise to be fulfilled
 */
exports.first = function(array){
	if(!Array.isArray(array)){
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
 * @param array The array of function
 * @param [startingValue] The value to pass to the first function
 * @return The value returned from the last function
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
 * @param {integer} ms The number of milliseconds to delay
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
 * @param {function} func Node compatible async function which takes a callback as its last argument
 * @return Promise for the return value from the callback from the function
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
 * @param {function} func Node compatible async function which takes a callback as its last argument
 * @param {boolean} [callbackNotDeclared] If the function does not define a callback method on it's arguments, pass <code>true</code>
 * @return A function that returns a promise when invoked.
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