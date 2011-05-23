var ical = require('./ijp-0.5'), 
    md = require('./microdata-event'),
    fs = require('fs'),
    cradle = require('cradle'),
    crypto = require('crypto');

//Setup the DB connection
var eventsDb = new (cradle.Connection)('localhost','5984').database('togather_events');

//Saves new events to the database. This will create events if
//they don't exist or replace them if they do.
var save = function(newEvents, url, callback) {
    var eventsArray = exports.parse(newEvents);
    
    //Save this document to the database - id, data, callback
    eventsDb.save(eventsArray, function (err, res) {        
        if (callback) {
            callback(eventsArray);
        }
        
        console.log('saved');
    });
};

var sortByStart = function(a, b) {
  return (a.start.milliseconds - b.start.milliseconds);
};

//Get the events we've already stored for this url
exports.get = function(callback) {
    eventsDb.view('events/origin_url', 
        function (err, results) {
            var i, eventsArray = [];
            
            if (err) {
                console.log(err);
            } else {
                for (i=0; i<results.length; i++) {
                  results[i].value.start = new Date(Date.parse(results[i].value.start));
                  results[i].value.end = new Date(Date.parse(results[i].value.end));
                                    
                  eventsArray.push(results[i].value);
                }
                
                eventsArray.sort(sortByStart);
            }
            
            if (callback) {
              callback(eventsArray);
            }
        }
    );
};

exports.parseIcs = function(url, callback) {
  ical.fromURL(url, {}, function(err, newEvents){
    var uid,
        hash,
        eventsArray = [];

    newEvents = newEvents || {};

    if (err) {
      console.log(err);
    }

    for (uid in newEvents) {
      if (newEvents.hasOwnProperty(uid)) {
        //Create a hash of the UID to make it easier to look up
        //records from the database.
        hash = crypto.createHash('md5').update(uid).digest('hex');
        
        //Add origin url
        newEvents[uid].origin_url = url;
        
        //Add sync time
        newEvents[uid].synced_on = new Date();
        
        //Add couch id
        newEvents[uid]._id = hash;
        
        eventsArray.push(newEvents[uid]);
      }
    }
    
    eventsArray.sort(sortByStart);
    
    if (callback) {
      callback(eventsArray);
    }
  });
};

exports.parseMicrodata = function(url, callback) {
  md.fromUrl(url, function(evt){
    //Create a hash of the UID to make it easier to look up
    //records from the database.
    var hash = crypto.createHash('md5').update(url).digest('hex');
    
    //Add origin url
    evt.origin_url = url;
    
    //Add sync time
    evt.synced_on = new Date();
    
    //Add couch id
    evt._id = hash;
    
    if (callback) {
      callback([evt]);
    }
  });
};

exports.resetDb = function() {
  eventsDb.destroy(function() {
    eventsDb.create(function() {
      eventsDb.save('_design/events', {
        origin_url: {
          map: function (doc) {
            emit(doc.origin_url, doc);
          }
        }
      });
    });
  });
};


exports.addUrl = function(url, callback) {
  exports.parseMicrodata(url, function(newEvents) {
    save(newEvents, url, function(eventsArray){
      if (callback) {
        callback(eventsArray);
      }                
    });
  });
};


/*
exports.refresh = function() {
    eventsDb.destroy(function() {
        eventsDb.create(function() {
            eventsDb.save('_design/events', {
                origin_url: {
                    map: function (doc) {
                        emit(doc.origin_url, doc);
                    }
                }
            });

            //Each line of this file is an ics url
            fs.readFile('./ics_urls.txt', function (err, data) {
                var lines = data.toString().split('\n'),
                    url,
                    i;

                for (i=0; i<lines.length; i++) {
                    url = lines[i];
                    ical.fromURL(url, {}, function(err, newEvents){
                        newEvents = newEvents || {};

                        if (err) {
                            console.log(err);
                        }

                        save(newEvents, url );
                    });
                }
            });        
        });
    });
};
*/