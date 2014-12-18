$(function(){

	var socket = null,
		clientId = null,
		nickname = null,
		serverAvatar = "logos/sympathy-icon.png",
		userPseudo = 'Joe',
		userAvatar = 'foo',
		url = 'undefined',
		currentRoom = null,
		$status = $('.status-writing'),
		// server information
		serverAddress = '127.0.0.1:3000',
		serverDisplayName = 'Sympathy World',

		tmplt = {
			room: [
				'<li data-roomId="${room}">',
					'<span class="icon">${peopleInside}</span> ${room}',
				'</li>'
			].join(""),
			client: [
				'<li data-clientId="${clientId}" class="cf">',
					'<div class="clientName">${nickname}</div>',
					'<div class="composing"></div>',
				'</li>'
			].join(""),
			message: [
				'<li style="list-style:none; clear:both;">',
					'<img src="${avatarURL}" alt="${sender}" style="width:5%; float:left; margin:0 5px 5px 0;"><div style="float:left; width:88%; margin-bottom:20px;"><span class=" time">${time}</span> - <span class="sender">${sender} </span><hr><p><span class="text">${text}</span></p></div>',
				'</li>'
			].join("")
		};

		var heartbeatInterval;
		var heartbeatCount = 0;

		connect();

	function bindDOMEvents(){

		$('.chat-input input').on('keydown', function(e){
			//socket.emit("writing", true);
			var key = e.which || e.keyCode;
			if(key == 13) { handleMessage(); }
		});

		$('.chat-submit button').on('click', function(){
			handleMessage();
		});

		$('.chat-rooms ul').on('scroll', function(){
			$('.chat-rooms ul li.selected').css('top', $(this).scrollTop());
		});

		$('#list-salon ul').on('click', 'li', function(){
			var room = $(this).attr('data-roomId');
			if(room != currentRoom){
				socket.emit('unsubscribe', { room: currentRoom });
				socket.emit('subscribe', { room: room });
			}
		});

		$('.people-connected ul').on('click', 'li', function(data){
			console.log($(this).children()[0].innerHTML);
			$('.chat-input input').val("@"+$(this).children()[0].innerHTML+',');
		});

	}

	function bindSocketEvents(){

		socket.on('connect', function(){

			$('#servertimedout').hide();
			//generateId();

			// var heartbeat = function heartbeatFn(){
	    //         //console.log('sending heartbeat ' + heartbeatCount);
	    //         socket.emit('heartbeat', heartbeatCount);
	    //         heartbeatCount += 1;
	    //     };
	    //     clearInterval(heartbeatInterval);
	    //     heartbeatInterval = setInterval(heartbeat, 1000);

			nickname = userPseudo;

			var userData = {nickname : nickname, avatar : userAvatar};

			localStorage.setObject('userData',userData);

			console.log(localStorage.getObject('userData'));

			socket.emit('connect', localStorage.getObject('userData'));

			console.log('Im connected');

		});

		socket.on('isWriting', function(data) {
			console.log('writing');
			$status.html('<p>' + data.value + "</p>");
		});

		socket.on('ready', function(data){

			$('.chat-input').focus();
			clientId = data.clientId;
		});

		socket.on('roomslist', function(data){
			for(var i = 0, len = data.rooms.length; i < len; i++){
				if(data.rooms[i] != ''){
					addRoom(data.rooms[i], false);
				}
			}
		});

		socket.on('chatmessage', function(data){
			console.log(data);
			var otherNickname = data.client.nickname;
			var otherAvatar = data.client.avatar;
			var message = data.message;

			insertMessage(otherNickname, message, true, false, false, otherAvatar);
		});

		socket.on('roomclients', function(data){

			console.table(data);

			$("#list-membre h3").text(data.room);

			addRoom(data.room, false);

			// set the current room
			setCurrentRoom(data.room);

			// announce a welcome message
			insertMessage(serverDisplayName, 'Bienvenue dans le salon ' + data.room, true, false, true, serverAvatar);
			$('.people-connected ul').empty();

			addClient({ nickname: nickname, clientId: clientId }, false, true);
			for(var i = 0, len = data.clients.length; i < len; i++){
				if(data.clients[i]){
					addClient(data.clients[i], false);
				}
			}

		});

		socket.on('initRoom', function(data){
			console.info(data);
			for (var i = 0; i < data.room.length; i++) {
				addRoom(data.room[i], false);
			};
		});

		socket.on('presence', function(data){
			if(data.state == 'online'){
				addClient(data.client, true);
			} else if(data.state == 'offline'){
				removeClient(data.client, true);
			}
		});

		socket.on('reconnect', function disconnectFn(data) {
	        console.log('reconnected');
	    });

	    socket.on('disconnect', function disconnectFn(data) {
	        console.log('disconnected');
	        clearInterval(heartbeatInterval);
	    });

	}

	function addRoom(name, announce){
		name = name.replace('/','');
		if($('#list-salon ul li[data-roomId="' + name + '"]').length == 0){
			$.tmpl(tmplt.room, { room: name}).appendTo('#list-salon ul');
		}
	}

	function addClient(client, announce, isMe){
		var $html = $.tmpl(tmplt.client, client);

		if(isMe){
			$html.addClass('me');
		}

		if(announce){
			insertMessage(serverDisplayName, client.nickname + ' viens de rejoindre la discussion', true, false, true, serverAvatar);
		}

		//check if this dude is already connected
		manageClientList();


		setInterval(function(){
			var seen = {};
			$('.people-connected ul li').each(function(){
				var txt = $(this).text();
				if (seen[txt]) {
					$(this).remove();
				} else {
					seen[txt] = true;
				}
			});
			console.log('has cleaned');
		}, 1000);

		$html.appendTo('.people-connected ul');

	}

	function removeClient(client, announce){
		manageClientList();

		$('.people-connected ul li[data-clientId="' + client.clientId + '"]').remove();

		if(announce){
			insertMessage(serverDisplayName, client.nickname + ' viens de quitter la discussion.', true, false, true, serverAvatar);
		}
	}

	function manageClientList() {
		$userList = $('.people-connected ul li').map(function(){
			return $(this).text();
		}).get();

		console.log(hasDuplicates($userList));
	}

	function setCurrentRoom(room){
		currentRoom = room;
		$('.list-salon ul li.selected').removeClass('selected');
		$('.list-salon ul li[data-roomId="' + room + '"]').toggleClass('selected');
		clearMessage();
	}

	function clearMessage(){
		return $('#windows-tchat ul').html(' ');
	}

	function handleMessage(){
		var message = $('.chat-input input').val().trim();
		if(message){
			socket.emit('chatmessage', { message: message, room: currentRoom });

			insertMessage(nickname, message, true, true, false, userAvatar);
			$('.chat-input input').val('');
		}
	}
	function insertMessage(sender, message, showTime, isMe, isServer, avatar, timeSended){

		var avatarURL = url + 'img/' + avatar;

		var $html = $.tmpl(tmplt.message, {
			sender: sender,
			text: message,
			avatarURL : avatarURL,
			time: showTime ? getTime(timeSended) : ''
		});

		if(isMe){
			$html.addClass('marker');
		}

		else if(isServer){
			$html.find('.sender').css('color', 'blue');
		}
		$html.appendTo('#windows-tchat ul');
		$('#windows-tchat').animate({ scrollTop: $('#windows-tchat ul').height() }, 100);
	}

	function getTime(time){
		var date = null;
		if (time) {
			date = new Date(time);
		}
		else {
			date = new Date();
		}
		return (date.getHours() < 10 ? '0' + date.getHours().toString() : date.getHours()) + ':' +
				(date.getMinutes() < 10 ? '0' + date.getMinutes().toString() : date.getMinutes());
	}

	function connect(){

		socket = io.connect(serverAddress, {
		  'reconnect': true,
		  'reconnection delay': 500,
		  'max reconnection attempts': 10
		});

		bindSocketEvents();
	}

	$(function(){
		bindDOMEvents();
	});

	function generateId(){
		var S4 = function () {
			return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
		};
		var connection_id =  (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
		localStorage.setItem('connection_id', connection_id);
		return connection_id;
	}

});

Storage.prototype.setObject = function(key, value) {
    this.setItem(key, JSON.stringify(value));
}

Storage.prototype.getObject = function(key) {
    var value = this.getItem(key);
    return value && JSON.parse(value);
}

function hasDuplicates(array) {
    var valuesSoFar = {};
    for (var i = 0; i < array.length; ++i) {
        var value = array[i];
        if (Object.prototype.hasOwnProperty.call(valuesSoFar, value)) {
            return true;
        }
        valuesSoFar[value] = true;
    }
    return false;
}
