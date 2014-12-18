var express   = require('express'),
    app       = express(),
    server    = require('http').createServer(app),
    io        = require('socket.io').listen(server),
    port      = 3000;

var history     = null,
    clientCount = 0;


chatClients = new Object();


server.listen(process.env.VCAP_APP_PORT || port);

// assets route
app.use("/styles", express.static(__dirname + '/public/styles'));
app.use("/scripts", express.static(__dirname + '/public/scripts'));
app.use("/images", express.static(__dirname + '/public/images'));

// Cross Domain error hack
app.all('/*', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
});

// routing the index view
app.get('/', function (req, res) {
    res.sendfile(__dirname + '/public/index.html');
});

/* DATABASE CONFIGURATION */

// connection to the DB hosted on compose.io (mongoHQ)
var mongoose = require('mongoose');
mongoose.connect('mongodb://nodejitsu:a6dd7fff4cffa6ee5ae6c486a56ecabe@troup.mongohq.com:10029/nodejitsudb289756355');

var BDConnect = mongoose.connection;
BDConnect.on('error', console.error.bind(console, 'connection error:'));
BDConnect.once('open', function callback () {
  // yay!
});

var Schema = mongoose.Schema;

// création de la structure "message"
var messageSchema = new Schema({
    user: { type: String },
    avatar: { type: String},
    message: { type: String },
    room: {type: String},
    created: {type: Date, default: Date.now}
});

// création de la table "message"
var Chat = mongoose.model('message', messageSchema);
// end mongodb config



io.sockets.on('connection', function(socket){


    socket.set('clientCount', clientCount);
        console.log('new client: ' + clientCount);
        clientCount += 1;

    socket.on('connect', function(data){
        connect(socket, data);
    });

    socket.on('initroom', function(data){
        initRoom(data);
    });

    socket.on('chatmessage', function(data){
        chatmessage(socket, data);
    });

    socket.on('subscribe', function(data){
        subscribe(socket, data);
    });

    socket.on('unsubscribe', function(data){
        unsubscribe(socket, data);
    });

    socket.on('writing', function(data) {
        if (data) {
            socket.broadcast.emit('isWriting', {value:'est en train d\'écrire'});
        }
        else {
            socket.broadcast.emit('isWriting', {value:''});
        }
    });

    socket.on('refresh', function(){
        socket.emit('roomslist', { rooms: getRooms() });
    });

});

io.sockets.on('disconnect', function(){
    socket.get('clientCount', function (err, clientCount) {
        console.log('client disconnect: ' + clientCount);
    });

    disconnect(socket);
});

// create a client for the socket
function connect(socket, data){

  var currentRoomToken = data.currentRoomToken;

  data.clientId = generateId();

  chatClients[socket.id] = data;

  chatClients[socket.id].disconnected = false;

  subscribe(socket, { room: currentRoomToken });

  //socket.emit('initRoom', { room: salons });

  socket.emit('roomslist', { rooms: getRooms() });

}

function initRoom(data){
  console.log(data);
}

function disconnect(socket){

  console.log('Got disconnect!');

  var rooms = io.sockets.manager.roomClients[socket.id];

  console.table(rooms);

  /*
  for(var room in rooms){
    if(room && rooms[room]){
      unsubscribe(socket, { room: room });
        updatePresence(room, socket, 'offline');
    }
  }
  */



  //socket.broadcast.to(data.room).emit('presence', { client: chatClients[socket.id], state: 'offline', room: data.room });

  //socket.leave(data.room);

  chatClients[socket.id].disconnected = true;
  delete chatClients[socket.id];
}

function chatmessage(socket, data){

  var newMessage = new Chat({user: chatClients[socket.id].nickname, avatar: chatClients[socket.id].avatar, message: data.message, room: data.room});
  newMessage.save(function(err){
    if(err) throw err;
  });
  socket.broadcast.to(data.room).emit('chatmessage', { client: chatClients[socket.id], message: data.message, room: data.room });
}


function subscribe(socket, data){
  var rooms = getRooms();


  if(rooms.indexOf('/' + data.room) < 0){
    socket.broadcast.emit('addroom', { room: data.room});
  }

  socket.join(data.room);

  updatePresence(data.room, socket, 'online');

  chatClients[socket.id].activeRoom = data.room;

  var query = Chat.find({'room' : data.room}).limit(10).sort('-created');

  query.exec(function(err, docs){
    if(err) throw err;
    // socket.emit('ready', { clientId: data.clientId, history: docs });
    socket.emit('roomclients', { room: data.room, history: docs, clients: getClientsInRoom(socket.id, data.room), people: (parseInt(getClientsInRoom(socket.id, data.room).length) + 1) });
  });

}


function unsubscribe(socket, data){

  //updatePresence(data.room, socket, 'offline');

  socket.broadcast.to(data.room).emit('presence', { client: chatClients[socket.id], state: 'offline', room: data.room });

  socket.leave(data.room);

  // if(!countClientsInRoom(data.room)){
  //
  // }
}

function getRooms(){
  return Object.keys(io.sockets.manager.rooms);
}

function getClientsInRoom(socketId, room){
  var socketIds = io.sockets.manager.rooms['/' + room];
  var clients = [];

  if(socketIds && socketIds.length > 0){
    socketsCount = socketIds.lenght;

    for(var i = 0, len = socketIds.length; i < len; i++){

      if(socketIds[i] != socketId){
        clients.push(chatClients[socketIds[i]]);
      }
    }
  }

  return clients;
}

function countClientsInRoom(room){
  if(io.sockets.manager.rooms['/' + room]){
    return io.sockets.manager.rooms['/' + room].length;
  }
  return 0;
}


function updatePresence(room, socket, state){
  //room = room.replace('/','');

  socket.broadcast.to(room).emit('presence', { client: chatClients[socket.id], state: state, room: room });
}

//unique id generator
function generateId(){
  var S4 = function () {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  };
  return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
}

console.log('running on port %d...', port);
