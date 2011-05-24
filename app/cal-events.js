var ical = require('./ical'), 
    md = require('./microdata-event'),
    auth = require('./settings/auth'),
    fs = require('fs'),
    SimpleGeo = require('simplegeo-client').SimpleGeo,
    sg = new SimpleGeo(auth.simplegeo.key, auth.simplegeo.secret),
    cradle = require('cradle'),
    crypto = require('crypto');

//Setup the DB connection
var eventsDb = new (cradle.Connection)('togather.iriscouch.com','5984').database('togather_events');

//Saves new events to the database. This will create events if
//they don't exist or replace them if they do.
exports.save = function(events, callback) {    
    //Save this document to the database - id, data, callback
    eventsDb.save(events, function (err, res) {        
        if (callback) {
            callback(events);
        }
        
        console.log('saved');
    });
};

var sortByStart = function(a, b) {
  return (a.startDate.milliseconds - b.startDate.milliseconds);
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
  md.fromUrl(url, function(err, evt) {
    //Create a hash of the UID to make it easier to look up
    //records from the database.
    var hash = crypto.createHash('md5').update(url).digest('hex');
    
    //Add origin url
    evt.origin_url = url;
    
    //Set the url if it doesn't exist
    evt.url = evt.url || url;
        
    //Add sync time
    evt.synced_on = new Date();
    
    //Add couch id
    evt._id = hash;
    
    //Extract the TZ and Neighborhood, if we have any location data
    if (evt.streetAddress && evt.city) {
      
      //Query SimpleGeo for the context data
      sg.getContextByAddress(evt.streetAddress + ' ' + evt.city, function(err, data) {
        var i, j, feat, classifier;
        for (i=0; i<data.features.length; i++) {
          feat = data.features[i];
          
          if (feat.classifiers && feat.classifiers.length) {
            for(j=0; j<feat.classifiers.length; j++) {
              classifier = feat.classifiers[j];
                            
              if (classifier.category === 'Neighborhood') {
                evt.neighborhood = feat.name;
              }
              
              if (classifier.category === 'Time Zone') {
                evt.tzid = feat.name;
              }
            }
          }
        }
        
        console.log(evt);
        
        if (callback) {
          callback([evt]);
        }
      });
    } else {
      
      console.log(evt);
      
      if (callback) {
        callback([evt]);
      }
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