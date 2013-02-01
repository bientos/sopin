var config = require('./config.json'),
var app = require('express');
var io = require('socket.io').listen(
	config.listen.port != undefined
	? config.listen.port : null);
var db = require('mongodb').MongoClient,
	crypt = require('crypto');
	
var WAITING  = 0, // waiting for be attended
	LOGING   = 1,
	SIGNED   = 2// logging user
;

var uiid = 0, chiid = 0;
var channels = {}, users = {};

// Database collections
var db_users, db_channels;
	
console.log('Starting chat...');

db.connect(config.db.host+'/'+config.db.name, function(err) {
	if(!err) {
		console.log("Connected to database server...");
		// "Fill" common database collections
		db_users    = db.collection('users');
		db_channels = db.collection('channels');
	}
});

io.sockets.on('connect', function(sck) {
	var uid = ++uuid;
	sck.user = {};
	sck.start_time = new Date();
	sck.user.status = WAITING;
	sck.user.takeable = true;
	sck.user.socket = sck;
	sck.user.name = (config.user.prefix != undefined
		? config.user.prefix : 'user') + uid;
	sck.uid = uid;
	// Fill user information, by default, nickname
	// is the socket id, so it cannot be repeated.
	users[uid] = sck.user;
	
	// Signing in, there are 2 options:
	// 	a) Customers fill their names.
	// 	b) Registerd users login in their accounts. 
	sck.on('login', function(data) {
		if(sck.user.status != LOGING) {
			// In this case, we validate session
			sck.user.status = LOGING;
			if(data.mail != undefined) {
				user = db_users.findOne({
					'mail' : data.mail.toString(),
					'pass' : crypt.createHash('sha1')
						.update(data.user.pass.toString())
						.digest('hex')
				});
				if(user) {
					// User will be dropped, and will renewed
					delete user['pass'];
					user['status'] = SIGNED;
					users[user.mykey] = user;
					sck.user = user;
					sck.user.socket = sck;
					sck.emit('login',{'status':'ok','uid':user['id']});
				} else {
					sck.emit('login',{'status' : 'invalid_login'});
					sck.user.status = WAITING;
				}
			}
			// But if no user, it will be a customer
			// who join looking for help.
			else {
				if(data.name != '') {
					sck.user.name = data.name;
					sck.emit('login',{'status' : 'ok'});
				} else {
					sck.emit('login',{'status' : 'invalid_name'});
				}
				sck.user.status = WAITING;
			}
		} else {
			sck.emit('login', {'status':'already_loging'});
		}
	});
	
	// Creating a channel is part of what a
	// signed-in user can do, so can accept one user.
	sck.on('create_channel', function(data) {
		if(!sck.user) {
			sck.emit('create_channel', {'status' : 'no_way'});
		} else {
			// Before we respond to client, we save it
			// on database, so users can restore their
			// created channels after a relogin.
			var chid = db_channels.insert({
				'name'       : ch.name,
				'start_time' : ch.date.toString(),
				'id_user'    : sck.user.mykey 
			});
			// we are creating the channel
			var ch = {
				'name' : data.name
					? data.name.toString()
					: ('channel'+chid.toString()),
				'start_time' : new Date(),
				'assistant'  : sck
			};
			channels[chid] = ch;
			sck.emit('create_channel',{
				'status'     : 'ok',
				'channel_id' : chid
			});
		}
	});
	
	// This command is called by assitance, if
	// a non-assistant try to use it, it will be rejected.
	sck.on('take_one', function(data) {
		// No user signed in, not taking anything.
		if(!sck.user) {
			sck.emit('take_one', {'status' : 'no_way'});
		} else if(!data.chid || !channels[data.chid]
		|| channels[data.chid].assistant != sck.user.id) {
			sck.emit('take_one', {'status' : 'no_way'});
		} else if(!data.uid && !users[data.uid]) {
			sck.emit('take_one', {'status' : 'no_way'});
		} else {
			us = users[data.uid];
			if(us.takeable) {
				// It is inmediattely changed its takeable
				// status tu 'false', so it cannot be taken
				// by other user (temporally). 
				us.takeable = false;
				if()
			} else {
				sck.emit('take_one',{'status' : 'already_taken'});
			}
		}
	});
});