/**
 * @module
 * @description Directly exports the LazyArray class, but also makes it available via the <code>LazyArray</code> property.
 */

var when = require("./promise").when;

module.exports = exports = LazyArray;
/** @property */
exports.LazyArray = LazyArray;

/**
 * Provides a lazy array interface.
 * @class
 */
function LazyArray(hasSomeAndLength){
	return new SomeWrapper(hasSomeAndLength);
};
LazyArray.prototype = [];

/**
 * Lazily return the first item in the array.
 * @function
 * @param array Regular array or lazy array
 * @return A promise for the first item
 */
LazyArray.first = first;
function first(array){
	return get(array, 0);
};

/**
 * Lazily return the last item in the array.
 * @function
 * @param array Regular array or lazy array
 * @return A promise for the last item
 */
LazyArray.last = last;
function last(array){
	return get(array, array.length-1);
};

/**
 * Lazily retrieve an item from the array.
 * @function
 * @param array Regular array or lazy array
 * @param {integer} index
 * @return A promise for the item
 */
LazyArray.get = get;
function get(array, index){
	var result, i = 0;
	return when(array.some(function(item){
		if(i == index){
			result = item;
			return true;
		}
		i++;
	}),
	function(){
		return result;
	});
};

var testProto = {};
var testProto2 = testProto.__proto__ = testProto2;
var mutableProto = testProto.__proto__ === testProto2;
function SomeWrapper(hasSomeAndLength){
	if(mutableProto){
		hasSomeAndLength.source = hasSomeAndLength;
		hasSomeAndLength.__proto__ = SomeWrapper.prototype;
		return hasSomeAndLength;
	}
	this.source = hasSomeAndLength;
	if(hasSomeAndLength.length){
		this.length = hasSomeAndLength.length;
	}
	this.totalCount = hasSomeAndLength.totalCount;
}
SomeWrapper.prototype = LazyArray.prototype;

/**
 * @function
 * @param {function} callback
 */
LazyArray.prototype.some = function(callback){
	this.source.some(callback);
};

/**
 * @function
 * @param {function} fn
 * @param {object} thisObj
 */
LazyArray.prototype.filter = function(fn, thisObj){
	var results = [];
	return when(this.source.some(function(item){
		if(fn.call(thisObj, item)){
			results.push(item);
		}
	}), function(){
		return results;
	});
};

/**
 * @function
 * @param {function} fn
 * @param {object} thisObj
 */
LazyArray.prototype.every = function(fn, thisObj){
	return when(this.source.some(function(item){
		if(!fn.call(thisObj, item)){
			return true;
		}
	}), function(result){return !result;});
};

/**
 * @function
 * @param {function} fn
 * @param {object} thisObj
 */
LazyArray.prototype.forEach = function(fn, thisObj){
	return this.source.some(function(item){
		fn.call(thisObj, item);
	});
};

/**
 * @function
 * @param someOther Another (lazy) array
 */
LazyArray.prototype.concat = function(someOther){
	var source = this.source;
	return new SomeWrapper({
		length: source.length + someOther.length,
		some: function(fn, thisObj){
			return when(source.some(fn, thisObj), function(result){
				return result || someOther.some(fn, thisObj);
			});
		}
	});
};

/**
 * @function
 * @param {function} mapFn
 * @param {object} mapThisObj
 */
LazyArray.prototype.map = function(mapFn, mapThisObj){
	var source = this.source;
	return new SomeWrapper({
		length: source.length,
		some: function(fn,thisObj){
			return source.some(function(item){
				return fn.call(thisObj, mapFn.call(mapThisObj, item));
			});
		}
	});
};

/**
 * Convert the lazy array to a real array.
 * @function
 * @param {function} mapFn
 * @param {object} mapThisObj
 */
LazyArray.prototype.toRealArray = function(mapFn, mapThisObj){
	var array = [];
	return when(this.source.some(function(item){
		array.push(item);
	}), function(){
		return array;
	});
};

/**
 * @function
 */
LazyArray.prototype.join = function(){
	var args = arguments;
	return when(this.toRealArray(), function(realArray){
		return Array.prototype.join.apply(realArray, args);
	});
};

/**
 * @function
 */
LazyArray.prototype.sort = function(){
	var args = arguments;
	return when(this.toRealArray(), function(realArray){
		return Array.prototype.sort.apply(realArray, args);
	});
};

/**
 * @function
 */
LazyArray.prototype.reverse = function(){
	var args = arguments;
	return when(this.toRealArray(), function(realArray){
		return Array.prototype.reverse.apply(realArray, args);
	});
};

/**
 * @function
 * @param {integer} index
 */
LazyArray.prototype.get = function(index){
	var result, i = 0;
	return when(this.source.some(function(item){
		if(i == index){
			result = item;
			return true;
		}
		i++;
	}), function(){
		return result;
	});
};

/**
 * @function
 * @param {integer} index
 */
LazyArray.prototype.item = LazyArray.prototype.get;

/**
 * @function
 */
LazyArray.prototype.toSource = function(){
	var serializedParts = [];
	return when(this.source.some(function(item){
		serializedParts.push(item && item.toSource());
	}), function(){
		return '[' + serializedParts.join(",") + ']';
	});
};

/**
 * @function
 */
LazyArray.prototype.toJSON = function(){
	var loadedParts = [];
	return when(this.source.some(function(item){
		loadedParts.push(item);
	}), function(){
		return loadedParts;
	});
};