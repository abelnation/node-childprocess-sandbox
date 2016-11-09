var net = require('net');
var child_process = require('child_process');

var PROC_NAME = process.env.PROC_NAME || 'PARENT';
var MAX_DELAY = 1000;

var PING = 'ping';
var PONG = 'pong';

function log(msg) {
	console.log('' + PROC_NAME + ': ' + msg);
}

function randInt(max) {
	return Math.floor(max * Math.random());
}

function child() {

	log('start');

	process.on('message', function(m) {
		log('<- ' + m);
		setTimeout(function() {
			log('-> ' + PONG);
			process.send(PONG);
		}, randInt(MAX_DELAY));
	});
}

function parent() {

	log('start');

	var child = child_process.fork('./child-process-messages.js', [], {
		// update proc name
		env: {
			PROC_NAME: 'CHILD',
		},
	});
	
	child.on('message', function(m) {
		log('<- ' + m);
		setTimeout(function() {
			log('-> ' + PING);
			child.send(PING);
		}, randInt(MAX_DELAY));
	})

	// start it off
	child.send(PING);
}

log('starting...');
if (PROC_NAME === 'CHILD') {
	child();
} else if (PROC_NAME === 'PARENT') {
	parent();
}

function spin() {
	setTimeout(spin, 500);
}
spin();
