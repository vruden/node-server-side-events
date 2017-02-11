var http = require('http'),
    fs = require('fs'),
    qs = require('querystring'),
    parse = require('url').parse;

var indexFile = fs.readFileSync('index.html');

var Clients = {
    _clients: [],
    count: 0,

    remove: function (clientId) {
        // Если клиента нет, то ничего не делаем
        var client = this._clients[clientId];
        if (!client) {
            return;
        }
        // Закрываем соединение
        client.res.end();
        // Удаляем клиента
        delete this._clients[clientId];
        this.count--;

        // Сообщаем всем оставшимся, что он вышел
        // Рассылаем сообщения от имени бота
        this.broadcast(client.name + ' offline', '@ChatBot', true);
    },

    add: function (clientId, res, name) {
        this._clients[clientId] = {res: res, name: name || 'anonymous'};
        this.count++;

        // Рассылаем сообщения от имени бота
        this.unicast(clientId, 'Hello, ' + name + '! Online ' + this.count, '@ChatBot', true);
        this.broadcast(name + ' online', '@ChatBot', true);
    },

    broadcast: function (message, name, isbot) {
        this._send(this._clients, message, name, isbot);
    },

    unicast: function (clientId, message, name, isbot) {
        var client = this._clients[clientId];
        if (!client) {
            return;
        }

        this._send([client], message, name, isbot);
    },

    _send: function (clients, message, name, isbot) {
        if (!message || !name) {
            return;
        }
        // Подготавливаем сообщение
        var data = JSON.stringify({
            message: message.substr(0, 1000),
            name: (name || 'anonymous').substr(0, 20),
            isbot: isbot || false
        });

        // Создаем новый буфер, чтобы при большом количестве клиентов
        // Отдача была более быстрой из-за особенностей архитектуры Node.js
        data = new Buffer("data: " + data + "\n\n", 'utf8');

        // Рассылаем всем
        clients.forEach(function (client) {
            client.res.write(data); // Отсылаем буфер
        });
    },

    generateClientId: function () {
        return this._clients.length;
    }
};

var Routes = {
    'GET /': function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/html; charset=UTF-8'});
        res.write(indexFile);
        res.end();
    },

    'GET /event': function (req, res) {
        var url = parse(req.url, true);
        var name = (url.query.name || 'anonymous').substr(0, 20);
        var clientId = Clients.generateClientId();

        // Шлем спец заголовок для EventSource
        res.writeHead(200, {'Content-Type': 'text/event-stream'});

        // Выставляем больший таймаут на сокет, иначе сокет запроется через 2 минуты
        req.socket.setTimeout(1000 * 60 * 60); // 1 Час
        // or
        // req.socket.setNoDelay(true);

        req.on('close', function () {
            Clients.remove(clientId);
        });

        Clients.add(clientId, res, name);
    },

    'POST /message': function (req, res) {
        var data = '';

        req.on('data', function (chunk) {
            data += chunk;
        });

        req.on('end', function () {
            data = qs.parse(data);

            // Рассылаем всем сообщение
            Clients.broadcast(data.message, data.name, false);
            res.writeHead(200);
            res.end();

        });
    },

    // page 404
    $: function (req, res) {
        res.writeHead(404);
        res.end();
    }
};

var httpServer = http.createServer(function (req, res) {
    var key = req.method + ' ' + parse(req.url).pathname;

    (Routes[key] || Routes.$)(req, res);
});

httpServer.listen(9090);
console.log('Online');