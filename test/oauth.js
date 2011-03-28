var oauth = require("../lib/oauth");

require("../lib/promise").detectUnhandled = 10;

exports.supportMethods = require("nodeunit").testCase({
	setUp: function(ready){
		this.client = new oauth.Client;
		ready();
	},
	
	tearDown: function(ready){
		delete this.client;
		ready();
	},
	
	"signature base string": function(test){
		var result = this.client._createSignatureBase("GET", "http://photos.example.net/photos",
				"file=vacation.jpg&oauth_consumer_key=dpf43f3p2l4k3l03&oauth_nonce=kllo9940pd9333jh&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1191242096&oauth_token=nnch734d00sl2jdk&oauth_version=1.0&size=original");
		test.equal(result, "GET&http%3A%2F%2Fphotos.example.net%2Fphotos&file%3Dvacation.jpg%26oauth_consumer_key%3Ddpf43f3p2l4k3l03%26oauth_nonce%3Dkllo9940pd9333jh%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1191242096%26oauth_token%3Dnnch734d00sl2jdk%26oauth_version%3D1.0%26size%3Doriginal");
		test.done();
	},
	
	"strip default ports in url normalization": function(test){
		test.equal(this.client._normalizeUrl({ protocol: "https:", hostname: "somehost.com", port: "443", pathname: "/foo/bar" }), "https://somehost.com/foo/bar");
		test.equal(this.client._normalizeUrl({ protocol: "http:", hostname: "somehost.com", port: "80", pathname: "/foo/bar" }), "http://somehost.com/foo/bar");
		test.done();
	},
	
	"leave non-default ports in url normalization": function(test){
		test.equal(this.client._normalizeUrl({ protocol: "https:", hostname: "somehost.com", port: "446", pathname: "/foo/bar" }), "https://somehost.com:446/foo/bar");
		test.equal(this.client._normalizeUrl({ protocol: "http:", hostname: "somehost.com", port: "81", pathname: "/foo/bar" }), "http://somehost.com:81/foo/bar");
		test.done();
	},
	
	"order request parameters by name": function(test){
		test.equal(this.client._normalizeParams(["z", "a", "a", "b", "1", "c"]), "1=c&a=b&z=a");
		test.done();
	},
	"if two parameter names are the same then order by the value": function(test){
		test.equal(this.client._normalizeParams(["z", "b", "z", "a", "1", "c"]), "1=c&z=a&z=b");
		test.done();
	},
	"the resulting parameters should be encoded and ordered as per <http://tools.ietf.org/html/rfc5849#section-3.1> (3.4.1.3.2)": function(test){
		var requestParams = [
			"b5", "=%3D",
			"c@", "",
			"a2", "r b",
			"oauth_consumer_key", "9djdj82h48djs9d2",
			"oauth_token", "kkk9d7dh3k39sjv7",
			"oauth_signature_method", "HMAC-SHA1",
			"oauth_timestamp", "137131201",
			"oauth_nonce", "7d8f3e4a",
			"c2", "",
			"a3", "a",
			"a3", "2 q"
		];
		test.equal(this.client._normalizeParams(requestParams), "a2=r%20b&a3=2%20q&a3=a&b5=%3D%253D&c%40=&c2=&oauth_consumer_key=9djdj82h48djs9d2&oauth_nonce=7d8f3e4a&oauth_signature_method=HMAC-SHA1&oauth_timestamp=137131201&oauth_token=kkk9d7dh3k39sjv7");
		test.done();
	}
});

exports.signing = require("nodeunit").testCase({
	setUp: function(ready){
		this.client = new oauth.Client("consumerkey", "consumersecret", null, null, null, "1.0", null, function(){ return "ybHPeOEkAUJ3k2wJT9Xb43MjtSgTvKqp"; });
		oauth._getTimestamp = function(){ return "1272399856"; };
		ready();
	},
	
	tearDown: function(ready){
		delete this.client;
		ready();
	},
	
	"Provide a valid signature when no token is present": function(test){
		var requestParams = ["bar", "foo"];
		var oauthParams = this.client._collectOAuthParams({}, requestParams);
		var params = this.client._normalizeParams(requestParams);
		var baseString = this.client._createSignatureBase("GET", "http://somehost.com:3323/foo/poop", params);
		var signature = this.client._createSignature(baseString);
		test.equal(signature, "7ytO8vPSLut2GzHjU9pn1SV9xjc=");
		test.done();
	},
	
	"Provide a valid signature when a token is present": function(test){
		var bound = this.client.bind("token", "");
		var requestParams = ["bar", "foo"];
		var oauthParams = bound._collectOAuthParams({}, requestParams);
		var params = bound._normalizeParams(requestParams);
		var baseString = bound._createSignatureBase("GET", "http://somehost.com:3323/foo/poop", params);
		var signature = bound._createSignature(baseString);
		test.equal(oauthParams.oauth_token, "token");
		test.equal(signature, "9LwCuCWw5sURtpMroIolU3YwsdI=");
		test.done();
	},
	
	"Provide a valid signature when a token and a token secret are present": function(test){
		var bound = this.client.bind("token", "tokensecret");
		var requestParams = ["bar", "foo"];
		var oauthParams = bound._collectOAuthParams({}, requestParams);
		var params = bound._normalizeParams(requestParams);
		var baseString = bound._createSignatureBase("GET", "http://somehost.com:3323/foo/poop", params);
		var signature = bound._createSignature(baseString);
		test.equal(signature, "zeOR0Wsm6EG6XSg0Vw/sbpoSib8=");
		test.done();
	},
	
	"All provided OAuth arguments should be concatenated correctly" : function(test){
		var options = this.client._signRequest({
			method: "GET",
			protocol: "http:",
			hostname: "somehost.com",
			port: "3323",
			pathname: "/foo/poop",
			headers: {}
		}, ["bar", "foo"]);
		test.equal(options.headers.authorization, 'OAuth oauth_consumer_key="consumerkey",oauth_signature_method="HMAC-SHA1",oauth_timestamp="1272399856",oauth_nonce="ybHPeOEkAUJ3k2wJT9Xb43MjtSgTvKqp",oauth_version="1.0",oauth_signature="7ytO8vPSLut2GzHjU9pn1SV9xjc%3D"'); 
		test.done();
	}
});
