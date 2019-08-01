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
    const supportExt = ['.mp4', '.mkv', '.mpg', '.mpeg', 'mov', 'wmv']
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
              pbfFilePath: path.join(inputPath, fileName)
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
    var chapterTargets = []
    async.forEachSeries(targets, (target, ecallback) => {
      FfmpegCommand.ffprobe(target.movieFileNamePath, function(err, metadata) {
        if (err) ecallback(err)
        // console.dir(metadata)
        var flagH264 = false
        metadata.streams.forEach((meta) => {
          if (meta.codec_name === 'h264') flagH264 = true
        })
        if(!flagH264) return ecallback()

          // console.info(`Check PBF of "${target.movieFileName}"`)
        var pbfBuf = fs.readFileSync(target.pbfFilePath)
        var pbfStr = pbfBuf.toString('UCS-2')
        // console.log(pbfStr)
        // var pbfStream = fs.createReadStream(target.pbfFilePath, { encoding:'UCS-2' })

        var idxStart = pbfStr.search(/\[Bookmark\]/)
        var idxEnd = pbfStr.search(/\[PlayRepeat\]/)
        if (idxStart === -1) return
        if (idxEnd > -1) pbfStr = pbfStr.substr(0, idxEnd)      

        var repeatStr = pbfStr.substr(idxStart + "[Bookmark]".length)
        // var lines = repeatStr.split('/r/n')
        var lines = repeatStr.match(/[^\r\n]+/g)
        if (lines.length === 0) return

        var chapterInfo = []

        lines.forEach((line, idx) => {
          if(line.search(/^[0-9]*=[0-9]*\*/) > -1){
            chapterInfo.push(parseInt(line.split('=')[1].split('*')[0]))
          }
        })      
        if(chapterInfo.length > 0){
          let chapterFileName = 'chapter-' + Date.now()
          let chapterFilePath = path.join(outputPath, chapterFileName)
          fs.appendFileSync(chapterFilePath, ";FFMETADATA1\r\n\r\n")

          for(let i=0, max=chapterInfo.length; i < max; i++){
            fs.appendFileSync(chapterFilePath, "[CHAPTER]\r\nTIMEBASE=1/1000\r\n")            
            fs.appendFileSync(chapterFilePath, "START=" + chapterInfo[i] + "\r\n")
            if(i !== chapterInfo.length -1)
              fs.appendFileSync(chapterFilePath, "END=" + chapterInfo[i+1] + "\r\n")            
          }                    
          target.chapterFilePath = chapterFilePath
          chapterTargets.push(target)

          //ffmpeg -i [input] -i [chapter]] -map_metadata 1 -codec copy output2.mp4
          var command = new FfmpegCommand(target.movieFileNamePath)
          command
            .inputOptions('-i', chapterFilePath)
            .outputOptions('-map_metadata', '1')
            .outputOptions('-codec', 'copy')
          command.output(path.join(inputPath, target.movieFileName))            
          command
            .on('start', function(commandLine) {
              console.log('$ Spawned Ffmpeg with command: ' + commandLine)
              console.info('Start Chapter: ' + target.movieFileName)
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
              console.error('Cannot process video: ' + target.movieFileName + ' | ' + err.message)
              fs.unlink(chapterFilePath, (err)=>{
                if(err) console.error(err)
                return ecallback()
              })              
            })
            .on('end', function(stdout, stderr) {
              console.info('Chapter succeeded: ' + target.movieFileName)
              fs.unlink(chapterFilePath, (err)=>{
                if(err) console.error(err)
                return ecallback()
              })              
            })
            .run()          
        }else{
          return ecallback()
        }        
      })
    }    
    ,(err)=>{
      if(err) console.error(err)
      return wcallback(null, chapterTargets)
    })
  },
  (chapterTargets, wcallback) => {
    console.dir(chapterTargets)    
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