/**
 * @module delay
 * @description Timeouts and intervals that execute callbacks via promises. Directly exports <code>promise/delay</code>.
 */

var promiseDelay = require("./promise").delay,
		LazyArray = require("./lazy-array").LazyArray;

module.exports = exports = delay;
/**
 * Delays for a given amount of time and then fulfills the returned promise.
 * @function
 * @param {integer} ms The number of milliseconds to delay
 * @return A promise that will be fulfilled after the delay
 */
exports.delay = delay;

function delay(ms){
	return promiseDelay(ms);
}

/**
 * Returns a lazy array that iterates on every interval.
 * @param {integer} ms Length of each interval
 * @return A lazy array
 */
exports.schedule = function(ms){
	var callbacks = [];
	setInterval(function(){
		callbacks.forEach(function(callback){
			if(callback()){
				callbacks.splice(callbacks.indexOf(callback), 1);
			}
		});
	}, ms);
	return LazyArray({
		some: function(callback){
			callbacks.push(callback);
		}
	});
};