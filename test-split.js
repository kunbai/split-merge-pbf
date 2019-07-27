const path = require('path')
var FfmpegCommand = require('fluent-ffmpeg')
var fileName = 'SampleVideo_1280x720_30mb.mp4'
var command = new FfmpegCommand(path.join(__dirname, '/sample', fileName))

FfmpegCommand.ffprobe(path.join(__dirname, '/sample', fileName), function(err, metadata) {
    if(err) console.error(err)
    console.dir(metadata)
})


command.seekInput(10)
  .duration(3)
//.inputOptions('-hwaccel vaapi')
//.inputOptions('-hwaccel_output_format vaapi')
//.inputOptions('-vaapi_device /dev/dri/renderD128')
//.videoCodec("h264_vaapi")
 .videoCodec('libx264')
  .audioCodec('aac')
  .on('start', function(commandLine) {    
    console.log('Spawned Ffmpeg with command: ' + commandLine)
  })
  .on('progress', function(progress) {
     if (progress.percent % 10 === 0)
       console.log('Processing: ' + progress.percent + '% done')
  })
  .on('codecData', function(data) {
    console.info('Input Codec is ' + data.audio + ' audio ' +
      'with ' + data.video + ' video');
  })
  .on('error', function(err, stdout, stderr) {
    console.error('Cannot process video: ' + err.message)    
  })
  .on('end', function(stdout, stderr) {
    console.info('Spliting succeeded: ')
  })
  .output(path.join(__dirname, '/result', Date.now() + '-' + fileName))
  .renice(15)
  .run()