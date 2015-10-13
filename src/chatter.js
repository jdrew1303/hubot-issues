var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var yaml = require('js-yaml');

function Chatter(robot) {
  this.robot = robot;

  this.context = [];
}

module.exports = Chatter;

Chatter.prototype.respond = function(expression, handler) {
  var self = this;
  if (Array.isArray(expression)) {
    expression.forEach(function(expr){
      self.respond(expr, handler);
    });
    return;
  }
  this.robot.respond(expression, function(res) {
    var args = res.match.slice();
    args[0] = res;
    handler.apply(self, args);
  });
};

Chatter.prototype.hear = function(expression, handler) {
  var self = this;
  if (Array.isArray(expression)) {
    expression.forEach(function(expr){
      self.hear(expr, handler);
    });
    return;
  }
  this.robot.hear(expression, function(res) {
    var args = res.match.slice();
    args[0] = res;
    handler.apply(self, args);
  });
};

Chatter.prototype.setContext = function(key, value, duration) {
  // can't remember context values for more than a day
  duration = duration || (24 * 3600 * 1000);
  if (typeof value === 'undefined') {
    value = true;
  }
  var entry = {
    key: key,
    value: value,
    expiration: new Date().getTime() + duration
  };

  this.context.push(entry);
  return entry;
};

Chatter.prototype.getContext = function(key) {
  var match;
  var matchLength = 0;
  var exactMatchLength = Object.keys(key).length;
  var now = new Date().getTime();

  function isMatch(entry) {
    for (var name in entry.key) {
      if (entry.key[name] !== key[name]) {
        return false;
      }
    }
    return true;
  }

  function isExpired(entry) {
    return entry.expiration && entry.expiration <= now;
  }

  for (var i = this.context.length - 1; i >= 0; i--) {
    var entry = this.context[i];
    if (isExpired(entry)) {
      this.context.splice(i, 1);
      i--;
      continue;
    }
    var keyLength = Object.keys(entry.key).length;
    if (keyLength < matchLength || !isMatch(entry)) {
      continue;
    }
    if (exactMatchLength === keyLength) {
      // exact match
      return entry;
    }
    match = entry;
    matchLength = keyLength;
  }
  return match;
};

Chatter.prototype.setReplyContext = function(message, name, value, duration) {
  if (message.message) {
    message = message.message;
  }
  return this.setContext({
    user: message.user.name,
    room: message.room,
    name: name,
  }, value, duration || 30000);
};

Chatter.prototype.getReplyContext = function(message, name) {
  if (message.message) {
    message = message.message;
  }
  return this.getContext({
    user: message.user.name,
    room: message.room,
    name: name,
  });
};

Chatter.prototype.setRoomContext = function(message, name, value, duration) {
  if (message.message) {
    message = message.message;
  }
  return this.setContext({
    room: message.room,
    name: name,
  }, value, duration || 30000);
};

Chatter.prototype.getRoomContext = function(message, name) {
  if (message.message) {
    message = message.message;
  }
  return this.getContext({
    room: message.room,
    name: name,
  });
};

function compileTemplate(text) {
  text = text.replace(/\s+/g, ' ').trim();
  return _.template(text);
}

Chatter.prototype.renderMessage = function(res, message, data) {
  if (!this.templates) {
    this.templates = yaml.safeLoad(fs.readFileSync(path.join(__dirname, 'messages.yaml'), 'utf8'));
    for (var name in this.templates) {
      this.templates[name] = this.templates[name].map(compileTemplate);
    }
  }
  var templateList = this.templates[message];
  var template;
  if (templateList) {
    template = templateList[Math.floor(Math.random(templateList.length))];
  } else {
    template = compileTemplate(message);
  }
  data = data || {};
  data.user = data.user || res.message.user.name;
  data.room = data.room || res.message.room;
  var output = template(data).trim();
  return output;
};

Chatter.prototype.send = function(res, message, data) {
  var text = this.renderMessage(res, message, data);
  return res.send(text);
};
