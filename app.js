#!/usr/bin/env node

/**
 * Module dependencies.
 */



// console.log(process.argv)
const argv = process.argv
if (argv.length !== 3 && argv.length !== 4)
  console.error('usage: app search-dir [dest-dir]')

// get file list
const fs = require('fs')
const path = require('path')
const moment = require('moment')

const inputPath = path.resolve(__dirname, argv[2])
const stats = fs.lstatSync(inputPath)
if (!stats.isDirectory()) {
  console.error('error: argument must be directory')
}

var outputPath = './'
if (argv[3]) {
  const stats2 = fs.lstatSync(argv[3])
  if (!stats2.isDirectory()) {
    console.error('error: argument must be directory')
  }
} else {
  outputPath = inputPath
}

const fileNames = fs.readdirSync(inputPath)
console.info(`Start searching dir: ${inputPath}`)
// console.log(fileNames)

var targets = []
const supportExt = ['.mp4', '.avi', '.mkv', '.flv', '.mpg', '.mpeg', 'mov', 'wmv']
fileNames.forEach((fileName) => {
  var target = null
  if (path.extname(fileName) === '.pbf') {
    const pureFileName = path.basename(fileName, '.pbf')
    var movieFileName = null
    for (let i = 0, max = supportExt.length; i < max; i++) {
      if (fs.existsSync(path.join(inputPath, pureFileName + supportExt[i]))) {
        movieFileName = pureFileName + supportExt[i]
        console.info(`Found file: ${movieFileName}`)
        target = {
          movieFileNamePath: path.join(inputPath, movieFileName),
          movieFileName: movieFileName,
          pureFileName: pureFileName,
          pbfFilePath: path.join(inputPath, fileName)
        }
        targets.push(target)
        break;
      }
    }
  }
})

// read pbf
var splitTargets = []
targets.forEach((target) => {
  console.info(`Check PBF of "${target.movieFileName}"`)
  var pbfBuf = fs.readFileSync(target.pbfFilePath)
  var pbfStr = pbfBuf.toString('UCS-2')
  // console.log(pbfStr)
  // var pbfStream = fs.createReadStream(target.pbfFilePath, { encoding:'UCS-2' })

  var idxStart = pbfStr.search(/\[PlayRepeat\]/)
  if (idxStart === -1) return

  var repeatStr = pbfStr.substr(idxStart + "[PlayRepeat]".length)
  // var lines = repeatStr.split('/r/n')
  var lines = repeatStr.match(/[^\r\n]+/g)
  if (lines.length === 0) return

  var splitInfo = []

  lines.forEach((line, idx) => {
    // console.log(line)
    let tmInfo = line.split("=")[1]
    let tm = tmInfo.split('*')
    if (tm.length < 4) return
    let start = (tm[0] / 1000).toFixed(1)
    let end = ((tm[1] % 60000) / 1000).toFixed(1)
    splitInfo.push({
      fileName: target.pureFileName + '-clip-' + idx + '.mp4',
      start: start,
      end: end,
      repeat: parseInt(tm[2])
    })
  })

  if (splitInfo.length > 0) {
    console.info(`PBF of "${target.movieFileName}" has ${splitInfo.length} Repeat infomation.`)
    target.splitInfo = splitInfo
    console.log(splitInfo)
    splitTargets.push(target)
  } else {
    console.info(`PBF of "${target.movieFileName}" has No Repeat`)
  }
})

/*
MUST SEE https://github.com/fluent-ffmpeg/node-fluent-ffmpeg#specifying-multiple-outputs
*/
// var commands = []
// var commandIdx = 0
// var splitVideo = function(info) {
//   console.log(info)
//   var FfmpegCommand = require('fluent-ffmpeg')
//   var command = new FfmpegCommand(info.movieFileNamePath)  
//   info.splitInfo.forEach((spInfo, idx) => {        
//     command.seekInput(spInfo.start)
//       .duration(spInfo.end)
//       .videoCodec('libx264')
//       .audioCodec('aac')
//       .output(path.join(outputPath, spInfo.fileName))
//   })
//   command
//     .on('start', function(commandLine) {
//       console.log('Spawned Ffmpeg with command: ' + commandLine)
//     })
//     .on('progress', function(progress) {
//       console.log('Processing: ' + progress.percent + '% done')
//     })

//   // .run()
//   return spFiles
// }

var commands = []
var commandIdx = 0

var splitVideos2 = function(info) {
  var FfmpegCommand = require('fluent-ffmpeg')
  info.splitInfo.forEach((spInfo, idx) => {
    var command = new FfmpegCommand(info.movieFileNamePath)
    command.seekInput(spInfo.start)
      .duration(spInfo.end)
      .videoCodec('libx264')
      .audioCodec('aac')
      .on('start', function(commandLine) {
        // console.log('Spawned Ffmpeg with command: ' + commandLine)
        console.info('Start Spliting: ' + spInfo.fileName)
      })
      .on('progress', function(progress) {
        if (progress % 10 === 0)
          console.log('Processing: ' + progress.percent + '% done')
      })
      .on('codecData', function(data) {
        console.log('Input Codec is ' + data.audio + ' audio ' +
          'with ' + data.video + ' video');
      })
      .on('error', function(err, stdout, stderr) {
        commandIdx++
        if (commands[commandIdx]) {
          commands[commandIdx].run()
        }
        console.log('Cannot process video: ' + spInfo.fileName + ' | ' + err.message);
      })
      .on('end', function(stdout, stderr) {
        commandIdx++
        if (commands[commandIdx]) {
          commands[commandIdx].run()
        }
        console.log('Spliting succeeded: ' + spInfo.fileName);
      })
      .output(path.join(outputPath, spInfo.fileName))

    commands.push(command)
  })
}

var mergeVieo = function(info) {
  var FfmpegCommand = require('fluent-ffmpeg')
  var outputFile = path.join(outputPath, 'clip-' + info.pureFileName + '.mp4')
  var command = new FfmpegCommand()
  info.splitInfo.forEach((spInfo) => {
    for (let i = 0, max = spInfo.repeat; i < max; i++) {
      // console.log("hfsdhfkhsdkfiusd" + spInfo.fileName + '  | ' + i)
      command.input(path.join(outputPath,spInfo.fileName))
    }
  })

  command
  .on('start', function(commandLine) {
    // console.log('Spawned Ffmpeg with command: ' + commandLine)
    console.info('Start Merging: ' + info.movieFileName)
  })
  .on('progress', function(progress) {
    if (progress % 10 === 0)
      console.log('Processing: ' + progress.percent + '% done')
  })
  .on('codecData', function(data) {
    console.log('Input Codec is ' + data.audio + ' audio ' +
      'with ' + data.video + ' video');
  })
  .on('error', function(err, stdout, stderr) {
    commandIdx++
    if (commands[commandIdx]) {
      commands[commandIdx].mergeToFile()
    }
    console.log('Cannot process video: ' + info.movieFileName + ' | ' + err.message);
  })
  .on('end', function(stdout, stderr) {
    commandIdx++
    if (commands[commandIdx]) {
      commands[commandIdx].run()
    }
    console.log('Spliting succeeded: ' + info.movieFileName);
  })
  .output(outputFile)
  commands.push(command)
}

splitTargets.forEach((splitTarget) => {
  // console.info(`File: ${splitTarget.movieFileName}`)
  splitVideos2(splitTarget)  
})

// splitTargets.forEach(margeTarget=>{
//   mergeVieo(margeTarget)
// })

commands[commandIdx].run()