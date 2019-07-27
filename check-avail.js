#!/usr/bin/env node
var Ffmpeg = require('fluent-ffmpeg')
Ffmpeg.getAvailableFormats(function(err, formats) {    
    console.log('Available formats:');
    console.dir(formats.mp4);
  }
)
Ffmpeg.getAvailableCodecs(function(err, codecs) {
  console.log('Available codecs:');
  console.dir(codecs.h264);
})

Ffmpeg.getAvailableEncoders(function(err, encoders) {
  console.log('Available encoders:');
  console.dir(encoders.h264)
})

Ffmpeg.getAvailableFilters(function(err, filters) {
  console.log("Available filters:");
  console.dir(filters.h264);
})
