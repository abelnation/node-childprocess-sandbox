var fs = require('fs');
var net = require('net');
var child_process = require('child_process');

var echoServer;
var echoConnections = [];

var cmdServer;
var cmdConnections = [];

var VERSION = 3

function log(msg) {
	console.log('' + process.env.INST_NUM + ' v' + VERSION + ': ' + msg);
}

function slog(socket, msg) {
	socket.write('' + process.env.INST_NUM + ' v' + VERSION + ': ' + msg + '\n');
}

function restart() {

	log('Forking new process...');
	var child;
	child = child_process.fork('./process-switchover-test.js', [], {
		// see: https://nodejs.org/api/child_process.html#child_process_options_detached
		detached: true,
		stdio: [ 'ignore', stdout, 'ignore', 'ipc' ],
		// update proc name
		env: {
			INST_NUM: (parseInt(process.env.INST_NUM) + 1),
		},
	});
	child.unref();

	child.on('message', function(m) {
		m = m.trim();
		log('process got msg: ' + m);
		
		if (m == 'CHILD_READY') {
			log('ready msg received');

			child.send('echoServer', echoServer);
			for (var i = 0; i < echoConnections.length; i++) {
				child.send('echoConnection', echoConnections[i]);
			}
			
			child.send('cmdServer', cmdServer);
			for (var i = 0; i < cmdConnections.length; i++) {
				child.send('cmdConnection', cmdConnections[i]);
			}
			
			log('will exit in 2000 ms');
			setTimeout(onExit, 2000);
		}
	});

}

function createServers() {
	log('createServers')
	echoServer = net.createServer().listen('5555');
	cmdServer = net.createServer().listen('5556');
}

function initEchoServer() {
	log('initEchoServer');
	// simple echo server
	echoServer.on('connection', initEchoSocket);
}

function initEchoSocket(socket) {
	echoConnections.push(socket);

	socket.setEncoding('utf8');
	socket.on('data', function(data) {
		data = data.trim();
		log('echo: ' + data);
		slog(socket, data);
	});
	slog(socket, 'connected');
}

function initCmdServer() {
	log('initCmdServer');

	// shutdown comm
	cmdServer.on('connection', initCmdSocket);
}

function initCmdSocket(socket) {
	cmdConnections.push(socket);

	socket.setEncoding('utf8');
	socket.on('data', function(cmd) {
		cmd = cmd.trim();
		log('cmd: ' + cmd);
		if (cmd == 'RESTART') {
			restart();
		} else {
			log('unknown cmd: ' + cmd);
			slog(socket, 'bad cmd: ' + cmd);
		}
	});
	slog(socket, 'connected');
}

if (!process.env.INST_NUM) {
	process.env.INST_NUM = 0;
}

// setup stdout to log to file
var stdout = fs.createWriteStream('./out.log', { flags: 'a' });
process.__defineGetter__('stdout', function() { return stdout; });

function onExit() {
	log('EXIT');
	process.exit(0);
}

log('START');
process.on('exit', onExit);
process.on('SIGINT', onExit);
process.on('SIGTERM', onExit);

if (process.send) {
	// child process, so assume migrating restart
	process.on('message', function(serverName, serverOrSocket) {
		log('process got msg: ' + serverName);
		switch(serverName) {
			case 'echoServer': 
				echoServer = serverOrSocket;
				initEchoServer();
				break;
			case 'echoConnection': 
				initEchoSocket(serverOrSocket);
				break;
			case 'cmdServer': 
				cmdServer = serverOrSocket;
				initCmdServer();
				break;
			case 'cmdConnection': 
				initCmdSocket(serverOrSocket);
				break;
		}

	});
	
	setTimeout(function() {
		log('sending ready message');
		process.send('CHILD_READY');
		log('waiting for servers...');
	}, 500);			
	
} else {

	log('creating servers');
	createServers();
	initEchoServer();
	initCmdServer();
}
