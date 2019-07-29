#!/usr/bin/env node

/**
 * Module dependencies.
 */
const async = require('async')
const fs = require('fs')
var FfmpegCommand = require('fluent-ffmpeg')


const argv = process.argv
if (argv.length !== 3 && argv.length !== 4)
  console.error('usage: app search-dir [dest-dir]')

// get file list
const path = require('path')
const moment = require('moment')

const inputPath = path.resolve(__dirname, argv[2])
const stats = fs.lstatSync(inputPath)
if (!stats.isDirectory()) {
  console.error('error: argument must be directory')
  process.exit(0)
}

var outputPath = './'
if (argv[3]) {
  outputPath = path.resolve(__dirname, argv[3])
  const stats2 = fs.lstatSync(argv[3])
  if (!stats2.isDirectory()) {
    console.error('error: argument must be directory')
    process.exit(0)
  }
} else {
  outputPath = inputPath
}

async.waterfall([
  // get argunemts
  (wcallback) => {
    console.info(`Start searching dir: ${inputPath}`)
    fs.readdir(inputPath, (err, fileNames) => {
      return wcallback(err, fileNames)
    })
  },
  (fileNames, wcallback) => {
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
            // console.info(`Found file: ${movieFileName}`)
            target = {
              movieFileNamePath: path.join(inputPath, movieFileName),
              movieFileName: movieFileName,
              pureFileName: pureFileName,
              pbfFilePath: path.join(inputPath, fileName),
              outputFile: path.join(outputPath, 'clip-' + info.pureFileName + '.mp4')
            }
            targets.push(target)
            break;
          }
        }
      }
    })
    return wcallback(null, targets)
  },
  (targets, wcallback) => {
    // read pbf
    var splitTargets = []
    targets.forEach((target) => {
      // console.info(`Check PBF of "${target.movieFileName}"`)
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
        // console.log(splitInfo)
        splitTargets.push(target)
      }
    })

    return wcallback(null, splitTargets)
  },
  (splitTargets, wcallback) => {
    FfmpegCommand.getAvailableEncoders(function(err, encoders) {
      console.log('Available encoders:')
      var flagVAAPI = false
      if (encoders.h264_vaapi) {
        flagVAAPI = true
      }
      return wcallback(null, splitTargets, flagVAAPI)
    })
  },
  (splitTargets, flagVAAPI, wcallback) => {
    async.forEachSeries(splitTargets, (info, ecallback) => {
      async.waterfall([
        (wcallback2) => {
          FfmpegCommand.ffprobe(info.movieFileNamePath, function(err, metadata) {
            if (err) wcallback2(err)
            // console.dir(metadata)
            return wcallback2(null, metadata)
          })
        },
        (metadata, wcallback2) => {
          var flagH264 = false
          metadata.streams.forEach((meta) => {
            if (meta.codec_name === 'h264') flagH264 = true
          })

          async.forEachSeries(info.splitInfo, (spInfo, ecallback2) => {
            if(fs.existsSync(info.outputFile)){
              console.info('There is file already: ' + info.outputFile)
              return ecallback2()
            } 

            var command = new FfmpegCommand(info.movieFileNamePath)
            command.seekInput(spInfo.start)
              .duration(spInfo.end)

            if (flagH264 && flagVAAPI) {
              command.inputOptions('-hwaccel vaapi')
                .inputOptions('-hwaccel_output_format vaapi')
                .inputOptions('-vaapi_device /dev/dri/renderD128')
                .videoCodec("h264_vaapi")
            } else {
              command.videoCodec('libx264')
            }

            command
              .audioCodec('aac')
              .on('start', function(commandLine) {
                console.log('$ Spawned Ffmpeg with command: ' + commandLine)
                console.info('Start Spliting: ' + spInfo.fileName)
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
                console.error('Cannot process video: ' + spInfo.fileName + ' | ' + err.message)
                return ecallback2()
              })
              .on('end', function(stdout, stderr) {
                console.info('Spliting succeeded: ' + spInfo.fileName)
                return ecallback2()
              })
              .output(path.join(outputPath, spInfo.fileName))
              .renice(15)
              .run()
          }, (err) => {
            return wcallback2(err)
          })
        },
        (wcallback2) => {
          var FfmpegCommand = require('fluent-ffmpeg')
          var outputFile = info.outputFile
          // console.log('!!!!!!' + outputFile)


          var listFileName = 'list' + info.pureFileName + '.txt'
          var listFilePath = path.join(outputPath, listFileName)

          info.splitInfo.forEach((spInfo) => {
            for (let i = 0, max = spInfo.repeat; i < max; i++) {
              var listItemStr = "file '" +
                path.join(outputPath, spInfo.fileName) +
                "'\r\n"
              // console.log('#####' + listItemStr)
              fs.appendFileSync(listFilePath, listItemStr)
            }
          })
          //ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4
          //ffmpeg('C:/path/to/list.txt').inputFormat('concat').mergeToFile('C:/path/to/out.mp4', 'C:/path/to/temp');
          var command = new FfmpegCommand(listFilePath)

          command
            .inputFormat('concat')
            .inputOptions(
              '-safe', '0'
            )
            // .output(outputFile)
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
              console.error('Cannot process video: ' + info.movieFileName + ' | ' + err.message)
              fs.unlink(listFilePath, (err) => {
                return wcallback2()
              })              
            })
            .on('end', function(stdout, stderr) {
              console.log('Merging succeeded: ' + info.movieFileName)
              fs.unlink(listFilePath, (err) => {
                return wcallback2()
              })
            })
            .mergeToFile(outputFile)
          /*
            info.splitInfo.forEach((spInfo) => {
              for (let i = 0, max = spInfo.repeat; i < max; i++) {              
                command.input(path.join(outputPath, spInfo.fileName))              
              }
            })
            

            
            command
              .videoCodec('libx264')
            command	          
              .audioCodec('aac')
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
                console.error('Cannot process video: ' + info.movieFileName + ' | ' + err.message)
                return wcallback2()
              })
              .on('end', function(stdout, stderr) {              
                console.log('Spliting succeeded: ' + info.movieFileName)
                return wcallback2()
              })
              .renice(15)
              .mergeToFile(outputFile)
              */
        },
        (wcallback2) => {
          async.forEachSeries(info.splitInfo, (spInfo, ecallback2) => {
            fs.unlink(path.join(outputPath, spInfo.fileName), (err) => {
              if (err) console.error(err)
              return ecallback2()
            })
          }, (err) => {
            return ecallback(err)
          })
        }
      ], (err) => {
        return wcallback2(err)
      })
    }, (err) => {
      return wcallback(err, splitTargets)
    })
  }
], (err) => {
  if (err) console.error(err)
  console.log('FIN!!!!!!!')
})


/*
const unlink = path =>
  new Promise((resolve, reject) =>
    fs.unlink(path, err => (err ? reject(err) : resolve()))
  )

const createIntermediate = file =>
  new Promise((resolve, reject) => {
    const out = `${Math.random()
      .toString(13)
      .slice(2)}.ts`

    ffmpeg(file)
      .outputOptions('-c', 'copy', '-bsf:v', 'h264_mp4toannexb', '-f', 'mpegts')
      .output(out)
      .on('end', () => resolve(out))
      .on('error', reject)
      .run()
  })

const concat = async (files, output) => {
  const names = await Promise.all(files.map(createIntermediate))
  const namesString = names.join('|')

  await new Promise((resolve, reject) =>
    ffmpeg(`concat:${namesString}`)
      .outputOptions('-c', 'copy', '-bsf:a', 'aac_adtstoasc')
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run()
  )

  names.map(unlink)
}

concat(['file1.mp4', 'file2.mp4', 'file3.mp4'], 'output.mp4').then(() =>
  console.log('done!')
)
*/




//ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4