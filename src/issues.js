// Description:
//   hubot issue tracking
//
// Commands:
//   hubot how do you track issues? - Reply with instructions
//
// Author:
//  Benjamin Eidelman <beneidel@gmail.com>
//
module.exports = function(robot) {

  /* TODO:
    hubot utilities
    ===============

    response templates:
      - command to load another yaml file (robot "moods")

    demo page:
      - run on a web page, localstorage brain?, use a mock robot

    issue tracking
    ==============

    lists:
      - use emojis to save space

    state-machine pattern:
      - issue state change handlers
      - robot events for state changes
  */

  var _ = require('lodash');
  var BrainRepo = require('./brain-repo');
  var repo = new BrainRepo(robot, { key: 'hubotissues' });
  var Chatter = require('./chatter');
  var chatter = new Chatter(robot);

  /* introduction */

  chatter.hear([
    /that (?:looks like|seems|could be|is|might be) a bug$/i,
    /(?:it seems|maybe|I see|it seems|it looks(?: like)?)? ?(.*) (?:is|are|seems?|looks?)? broken\??$/i,
  ], function(res, thing) {
    if (/I found a bug(?:[, ]+)?([\s\S]+)$/i.test(res.match[0])) {
      // a bug that will be tracked
      return;
    }
    if (thing) {
      this.send(res, 'maybe you found a bug on', { thing: thing });
    } else {
      this.send(res, 'maybe you found a bug');
    }
    this.setReplyContext(res, 'maybefoundabug', true);
  });

  chatter.hear([
    /(yes|yes, please|please|how\?|would you\?|nice|go ahead|can you\?)$/i,
  ], function(res) {
    if (this.getReplyContext(res, 'maybefoundabug')) {
      this.send(res, 'say I found a bug');
    }
  });

  chatter.hear([
    /how (do|can) (I|you|we) (track|log|add|file|register|create) (issues|bugs|an issue|a bug)\?$/i,
  ], function(res) {
    this.send(res, 'say I found a bug');
  });

  /* creating */

  chatter.hear(/I found a bug(?:[, ]+)?([\s\S]+)$/i, function(res, description) {
    var issue = repo.create({
      description: description,
      author: res.message.user.name,
      state: 'pending'
    });
    this.setRoomContext(res, 'issueid', issue.id);
    this.send(res, 'issue created', { issue: issue });
  });

  /* listing */

  chatter.hear([
    /^(?:any )?blockers\?$/i,
    /^what's (?:broken|to be fixed|pending)\??$/i,
    /^(?:list|any|is there any|do we have|give me|which are)?(?: the|our)? ?(?:(.+)? )?(bugs|issues)\??$/i
  ], function(res, type) {
    type = type.trim().toLowerCase();
    var issues = repo.filter(function(issue){
      if (type) {
        if (issue.state === type) {
          return true;
        }
        if (issue.tags && issue.tags.indexOf(type) >= 0) {
          return true;
        }
      } else {
        return issue.type !== 'verified';
      }
    });

    if (issues.length < 1) {
      this.send(res, 'list empty', { type: type });
      return;
    }
    var issuesByState = _.groupBy(issues, 'state');
    var list = [];
    var states = Object.keys(issuesByState);
    _.sortBy(states, function(state) {
      switch(state) {
        case 'pending':
          return 0;
        case 'fixed':
          return 1;
        case 'verified':
          return 9;
        default:
          return 8;
      }
    });
    states.forEach(function(state){
      /* jshint loopfunc: true */
      var groupIssues = issuesByState[state];
      var group = {
        name: state,
        count: groupIssues.length
      };
      list.push(chatter.renderMessage(res, 'list group', {
        group: group
      }));
      if (state === 'pending') {
        _.sortBy(groupIssues, 'assignee');
      }
      groupIssues.forEach(function(issue) {
        list.push(chatter.renderMessage(res, 'list issue', {
          group: group,
          issue: issue,
          tags: stringifyTags(issue.tags)
        }));
      });
    });
    res.send(list.join('\n'));
  });

  /* assign */

  chatter.hear([
    /^\#?(\d+|that|it)( is|'s) mine$/i,
    /^(?:I'm )?(?:fixing|doing|taking care of|killing|with|on) \#?(\d+|that|it)$/i,
    /^I(?:'ll| will| can)? (?:fix|do|take care of|kill|try|debug|see|check) \#?(\d+|that|it)$/i
  ], function(res, id) {

    if (['that', 'it'].indexOf(id.toLowerCase()) >= 0) {
      var context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        id = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: id });
        return;
      }
    }

    var issue = repo.get(+id);
    if (!issue) {
      this.send(res, 'issue not found', { id: id });
      return;
    }
    if (issue.state !== 'pending') {
      this.send(res, 'cannot assign, issue is not pending', { issue: issue });
      return;
    }
    if (issue.assignee === res.message.user.name) {
      this.send(res, 'issue already assigned to you', { issue: issue });
      return;
    }
    if (issue.assignee) {
      this.send(res, 'issue already assigned to someone else', { issue: issue });
      return;
    }
    issue.assignee = res.message.user.name;
    repo.update(issue);
    this.setRoomContext(res, 'issueid', issue.id);
    this.send(res, 'issue assigned', { issue: issue });
  });

  chatter.hear([
    /^(?:I'm )?not (?:fixing|doing|taking care of|killing|with|on) \#?(\d+|that|it)(?: anymore)?$/i,
    /^(?:I )?(?:won't|can't) (?:fix|do|take care of|kill|try|debug|see|check) \#?(\d+|that|it)(?: anymore)?$/i
  ], function(res, id) {

    if (['that', 'it'].indexOf(id.toLowerCase()) >= 0) {
      var context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        id = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: id });
        return;
      }
    }

    var issue = repo.get(+id);
    if (!issue) {
      this.send(res, 'issue not found', { id: id });
      return;
    }
    if (issue.assignee !== res.message.user.name) {
      this.send(res, 'issue already not assigned to you', { issue: issue });
      return;
    }
    delete issue.assignee;
    repo.update(issue);
    this.setRoomContext(res, 'issueid', issue.id);
    this.send(res, 'issue unassigned', { issue: issue });
  });

  /* fixed */

  chatter.hear([
    /\#?(\d+|that|it)(?:'s| is)? (?:fixed|done|ok now|solved|gone)$/i,
    /(?:I(?:'ve| have) )?(?:fixed|done|took care of|killed|did) \#?(\d+|that|it)$/i,
  ], function(res, id) {

    if (['that', 'it'].indexOf(id.toLowerCase()) >= 0) {
      var context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        id = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: id });
        return;
      }
    }

    var issue = repo.get(+id);
    if (!issue) {
      this.send(res, 'issue not found', { id: id });
      return;
    }
    if (issue.state !== 'pending') {
      this.send(res, 'cannot fix, issue is not pending', { issue: issue });
      return;
    }
    if (issue.assignee && issue.assignee !== res.message.user.name) {
      this.send(res, 'issue was being fixed by someone else', { issue: issue });
    }
    issue.assignee = res.message.user.name;
    issue.state = 'fixed';
    repo.update(issue);
    this.setRoomContext(res, 'issueid', issue.id);
    this.send(res, 'issue fixed', { issue: issue });
  });

  /* clarification */

  chatter.hear([
    /^()(?:needs clarification|is unclear|is confusing)(?:[, ]+)?([\s\S]+)?$/i,
    /^\#?(\d+|that|it)(?:'s| is)? (?:needs clarification|unclear|confusing)(?:[, ]+)?([\s\S]+)?$/i,
  ], function(res, id, question) {

    if (!id) {
      id = 'that';
    }

    var context;
    if (['that', 'it'].indexOf(id.toLowerCase()) >= 0) {
      context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        id = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: id });
        return;
      }
    }

    var issue = repo.get(+id);
    if (!issue) {
      this.send(res, 'issue not found', { id: id });
      return;
    }
    this.setRoomContext(res, 'issueid', issue.id);
    if (question) {
      issue.log = issue.log || [];
      issue.log.push(res.message.user.name + '> ' + question);
      repo.update(issue);
      this.send(res, 'issue needs clarification, can author answer?', { issue: issue });
    } else {
      this.setReplyContext(res, 'needsClarificationId', issue.id);
      this.send(res, 'issue needs clarification, what\'s your question?', { issue: issue });
    }
  });

  chatter.hear([
    /^([\s\S]+)\?$/i,
  ], function(res, question) {

    var context = this.getReplyContext(res, 'needsClarificationId');
    if (context && context.value) {
      var issue = repo.get(context.value);
      if (issue) {
        issue.log = issue.log || [];
        issue.log.push(res.message.user.name + '> ' + question);
        repo.update(issue);
        this.send(res, 'issue needs clarification, can author answer?', { issue: issue });
      }
      this.setReplyContext(res, 'needsClarificationId', null);
    }
  });

  /* commenting */

  chatter.hear([
    /^()(?:also|and|but)(?:[, ]+)?([\s\S]+)?$/i,
    /^about \#?(\d+|that|it)(?:[, ]+)?([\s\S]+)?$/i,
  ], function(res, id, comment) {

    if (!id) {
      id = 'that';
    }

    var context;
    if (['that', 'it'].indexOf(id.toLowerCase()) >= 0) {
      context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        id = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: id });
        return;
      }
    }

    var issue = repo.get(+id);
    if (!issue) {
      this.send(res, 'issue not found', { id: id });
      return;
    }
    this.setRoomContext(res, 'issueid', issue.id);

    if (context && !res.match[1] && issue.author !== res.message.user.name) {
      // only author can comment using "also|and|but"
      return;
    }

    if (comment && comment.trim()) {
      issue.log = issue.log || [];
      issue.log.push(res.message.user.name + '> ' + comment);
      repo.update(issue);
      this.send(res, 'comment added', { issue: issue, comment: comment });
    } else {
      this.setReplyContext(res, 'addingCommentId', issue.id);
      this.send(res, 'comment, what?', { issue: issue });
    }
  });

  chatter.hear([
    /^([\s\S]+)$/i,
  ], function(res, comment) {

    if (/^()(?:also|and|but)(?:[, ]+)?([\s\S]+)?$/i.test(res.match[0]) ||
      /^about \#?(\d+|that|it)(?:[, ]+)?([\s\S]+)?$/i.test(res.match[0])) {
      return;
    }
    var context = this.getReplyContext(res, 'addingCommentId');
    if (!context || !context.value) {
      return;
    }
    if (/^nevermind|nothing|none$/i.test(comment.trim())) {
      this.setReplyContext(res, 'addingCommentId', null);
      return;
    }
    var issue = repo.get(context.value);
    if (issue) {
      issue.log = issue.log || [];
      issue.log.push(res.message.user.name + '> ' + comment);
      repo.update(issue);
      this.send(res, 'comment added', { issue: issue, comment: comment });
    }
    this.setReplyContext(res, 'addingCommentId', null);
  });

  /* tags */

  function parseTags(tagString) {
    if (!tagString) {
      return [];
    }
    return tagString.split(/(?:,|and)/gim).map(function(tag){
      return tag.toLowerCase().trim().replace(/^#/, '');
    }).filter(function(tag){
      return /\w/i.test(tag) &&
      !/^((?:a )?dup(?:licate)? of|same as)/.test(tag) &&
      [
        'pending', 'fixing', 'fixed', 'done', 'solved', 'ok now', 'gone', 'rejected', 'verified', 'dup', 'duplicate'
      ].indexOf(tag.replace(/^not /, '')) < 0;
    });
  }

  function stringifyTags(tags, prefix) {
    if (!tags) {
      return '';
    }
    if (typeof prefix === 'undefined') {
      prefix = '#';
    }
    if (tags.length < 2) {
      return prefix + tags[0];
    }
    return '#' + tags.slice(0, -1).join(', #') +
      ' and #' + tags[tags.length - 1];
  }

  chatter.hear([
    /^\#?(\d+|that|it) is ([\w\d \-',.#]+)?$/i,
  ], function(res, id, tagString) {

    var tags = parseTags(tagString);
    if (!tags || !tags.length) {
      return;
    }

    var context;
    if (['that', 'it'].indexOf(id.toLowerCase()) >= 0) {
      context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        id = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: id });
        return;
      }
    }

    var issue = repo.get(+id);
    if (!issue) {
      this.send(res, 'issue not found', { id: id });
      return;
    }
    this.setRoomContext(res, 'issueid', issue.id);
    var tagsChanged = false;
    tags.forEach(function(tag){
      if (/^not /.test(tag)) {
        for (var i = 0; i < issue.tags.length; i++) {
          if ('not ' + issue.tags[i] === tag) {
            issue.tags.splice(i, 1);
            i--;
            tagsChanged = true;
          }
        }
        if (issue.tags.length < 1) {
          delete issue.tags;
        }
      } else {
        issue.tags = issue.tags || [];
        issue.tags.push(tag);
        tagsChanged = true;
      }
    });
    if (tagsChanged) {
      repo.update(issue);
    }
    if (issue.tags && issue.tags.length) {
      this.send(res, 'issue tagged', { issue: issue, tags: stringifyTags(issue.tags) });
    } else {
      this.send(res, 'issue has no tags', { issue: issue });
    }
  });

  /* deleting */

  chatter.hear([
    /^dup(?:licate)?$/i,
    /^\#?(\d+|that|it)(?:'s| is)? (?:(?:a )?dup(?:licate)?)$/i,
  ], function(res, duplicateId) {

    if (!duplicateId) {
      duplicateId = 'that';
    }

    var context;
    if (['that', 'it'].indexOf(duplicateId.toLowerCase()) >= 0) {
      context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        duplicateId = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: duplicateId });
        return;
      }
    }

    this.setRoomContext(res, 'issueid', duplicateId);
    this.setReplyContext(res, 'duplicateId', duplicateId);
    this.send(res, 'duplicate of which?', { id: duplicateId });
  });

  chatter.hear([
    /^(?:dup(?:licate)? )?(of) \#?(\d+|that|it)$/i,
    /\#?(\d+|that|it)(?:'s| is)? (?:(?:a )?dup(?:licate)? of|same as) \#?(\d+|that|it)$/i,
  ], function(res, duplicateId, id) {

    var context;

    if (duplicateId.toLowerCase() === 'of') {
      context = this.getReplyContext(res, 'duplicateId');
      if (!context) {
        return;
      }
      duplicateId = context.value.toString();
    }

    if (['that', 'it'].indexOf(id.toLowerCase()) >= 0) {
      if (['that', 'it'].indexOf(duplicateId.toLowerCase()) >= 0) {
        this.send(res, 'that duplicate of that?', { duplicateRef: duplicateId, ref: id });
        return;
      }
      context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        id = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: id });
        return;
      }
    }
    if (['that', 'it'].indexOf(duplicateId.toLowerCase()) >= 0) {
      context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        duplicateId = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: duplicateId });
        return;
      }
    }

    if (+id === +duplicateId) {
      this.send(res, 'issue duplicate of itself?', { ref: id });
    }

    var issue = repo.get(+id);
    if (!issue) {
      this.send(res, 'issue not found', { id: id });
      return;
    }
    var duplicate = repo.get(+duplicateId);
    if (!duplicate) {
      this.send(res, 'issue not found', { id: duplicateId });
      return;
    }

    issue.log = issue.log || [];
    issue.log.push(duplicate.author + '> ' + duplicate.description + ' (ex #' + duplicate.id + ')');
    repo.update(issue);
    repo.delete(duplicate);

    this.setRoomContext(res, 'issueid', issue.id);
    this.send(res, 'issue duplicate deleted', { duplicate: duplicate, issue: issue });
  });

  /* issue details */

  chatter.hear([
    /^(?:(?:what|tell (?:me|us)|details) about )?\#?(\d+|that|it)(?: details| info)?\??$/i,
  ], function(res, id) {

    if (/^(\d+|that|it)$/.test(res.match[0])) {
      // just a number or word, it's probably not a question for me
      return;
    }
    var context;
    if (['that', 'it'].indexOf(id.toLowerCase()) >= 0) {
      context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        id = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: id });
        return;
      }
    }

    var issue = repo.get(+id);
    if (!issue) {
      this.send(res, 'issue not found', { id: id });
      return;
    }
    this.setRoomContext(res, 'issueid', issue.id);
    var output = [this.renderMessage(res, 'issue details', { issue: issue, tags: stringifyTags(issue.tags) })];
    if (issue.log) {
      issue.log.forEach(function(text){
        output.push(chatter.renderMessage(res, 'issue details log entry', { issue: issue, text: text }));
      });
    }
    res.send(output.join('\n'));
  });

  /* reject */

  chatter.hear([
    /\#?(\d+|that|it)(?:'s| is)?(?:not fixed|not done|not ok|not solved|not gone|rejected)$/i,
    /(?:I(?:'ve| have) )?(?:reject(?:ed)?) \#?(\d+|that|it)$/i,
  ], function(res, id) {

    if (['that', 'it'].indexOf(id.toLowerCase()) >= 0) {
      var context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        id = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: id });
        return;
      }
    }

    var issue = repo.get(+id);
    if (!issue) {
      this.send(res, 'issue not found', { id: id });
      return;
    }
    this.setRoomContext(res, 'issueid', issue.id);
    if (issue.state !== 'fixed') {
      this.send(res, 'cannot reject, issue is not fixed', { issue: issue });
      return;
    }
    issue.state = 'pending';
    repo.update(issue);
    if (issue.assignee && issue.assignee === res.message.user.name) {
      this.send(res, 'rejected your fix', { issue: issue });
    } else {
      this.send(res, 'rejected fix', { issue: issue });
    }
  });

  /* verify */

  chatter.hear([
    /\#?(\d+|that|it)(?:'s| is)? verified$/i,
    /(?:I(?:'ve| have) )?(?:verif(?:y|ied)) \#?(\d+|that|it)$/i,
  ], function(res, id) {

    if (['that', 'it'].indexOf(id.toLowerCase()) >= 0) {
      var context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        id = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: id });
        return;
      }
    }

    var issue = repo.get(+id);
    if (!issue) {
      this.send(res, 'issue not found', { id: id });
      return;
    }
    this.setRoomContext(res, 'issueid', issue.id);
    if (issue.author !== res.message.user.name) {
      this.send(res, 'only author can verify', { issue: issue });
    }
    if (issue.state !== 'fixed') {
      this.send(res, 'cannot verify, issue is not fixed', { issue: issue });
      return;
    }
    issue.state = 'verified';
    repo.update(issue);
    this.send(res, 'verified fix', { issue: issue });
  });

  /* delete */

  chatter.hear([
    /^(?:delete|kill) \#?(\d+|that|it)$/i,
  ], function(res, id) {

    if (['that', 'it'].indexOf(id.toLowerCase()) >= 0) {
      var context = this.getRoomContext(res, 'issueid');
      if (context && context.value) {
        id = context.value;
      } else {
        this.send(res, 'issue not found in context', { ref: id });
        return;
      }
    }

    var issue = repo.get(+id);
    if (!issue) {
      this.send(res, 'issue not found', { id: id });
      return;
    }
    this.setRoomContext(res, 'issueid', issue.id);
    repo.delete(issue);
    this.send(res, issue.author === res.message.user.name ?
      'issue deleted by author' : 'issue deleted', { issue: issue });
  });

  /* follow up */

  /* stats */


};
