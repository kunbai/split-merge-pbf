#!/usr/bin/env node

/**
 * Module dependencies.
 */
const fs = require('fs')
const path = require('path')
const fsPromise = require('fs/promises')
const PROCESSED_FILES = './PROCESSED.json'
const TEMP_PATH = './tempFiles'
const SUPPORT_EXT = [
  '.mp4',
  '.avi',
  '.mkv',
  '.flv',
  '.mpg',
  '.mpeg',
  '.mov',
  '.wmv',
  '.FLV',
  '.MKV',
  '.MOV',
  '.AVI',
  '.MP4',
  '.asf',
  '.WMV',
  '.MPG',
  '.skm',
  '.k3g',
  '.ASF',
  '.SKM',
]

const FfmpegCommand = require('fluent-ffmpeg')
const { resolve } = require('dns')

const searchPBF = async function (dirPath, outputPath) {
  console.info(`Start searching dir: ${dirPath}`)
  let filePathList = []
  let fileNames = fs.readdirSync(dirPath)

  for (let fileName of fileNames) {
    const fstat = fs.lstatSync(path.resolve(dirPath, fileName))
    if (fstat.isDirectory()) {
      let subPath = path.resolve(dirPath, fileName)
      let fileNames2 = fs.readdirSync(subPath)

      for (let fileName2 of fileNames2) {
        filePathList.push(path.resolve(subPath, fileName2))
      }
    } else {
      filePathList.push(path.resolve(dirPath, fileName))
    }
  }

  let targets = []

  for (let fileName of filePathList) {
    if (path.extname(fileName) === '.pbf') {
      const pureFileName = path.basename(fileName, '.pbf')
      var movieFileName = null
      for (let i = 0, max = SUPPORT_EXT.length; i < max; i++) {
        if (fs.existsSync(path.resolve(path.dirname(fileName), pureFileName + SUPPORT_EXT[i]))) {
          movieFileName = pureFileName + SUPPORT_EXT[i]
          let target = {
            movieFileNamePath: path.resolve(path.dirname(fileName), movieFileName),
            movieFileName: movieFileName,
            pureFileName: pureFileName,
            pbfFilePath: fileName,
            outputFile: path.resolve(outputPath, `${pureFileName}-clip.mp4`),
          }
          targets.push(target)
          break
        }
      }
    }
  }

  return targets
}

const getPBFInfo = async function (target) {
  let pbfBuf = await fsPromise.readFile(target.pbfFilePath)

  let pbfStr = pbfBuf.toString('UCS-2')

  let idxStart = pbfStr.search(/\[PlayRepeat\]/)
  if (idxStart === -1) return null

  let repeatStr = pbfStr.substring(idxStart + '[PlayRepeat]'.length)

  let lines = repeatStr.match(/[^\r\n]+/g)
  if (lines.length === 0) return null

  var splitInfo = []
  var totalLen = 0

  let idx = 0
  for (let line of lines) {
    // console.log(line)
    let tmInfo = line.split('=')[1]
    let tm = tmInfo.split('*')
    if (tm.length < 4) {
      continue
    }

    let start = (tm[0] / 1000).toFixed(1)
    let end = ((tm[1] % 60000) / 1000).toFixed(1)

    splitInfo.push({
      fileName: target.pureFileName + '-clip-' + idx + '.mp4',
      start: start,
      end: end,
      repeat: parseInt(tm[2]),
    })

    idx++

    totalLen += end * parseInt(tm[2])
  }

  console.log('totalLen is ' + totalLen)

  if (totalLen > 10) {
    return splitInfo
  } else {
    // console.log('TOO SHORT')
    return null
  }
}

// GLOBAL valuables
let processedFileInfo = null

const getEncoders = function () {
  return new Promise((resolve, reject) => {
    FfmpegCommand.getAvailableEncoders(function (err, encoders) {
      if (err) return reject(err)

      return resolve(encoders)
    })
  })
}

const probeFile = function (filePath) {
  return new Promise((resolve, reject) => {
    FfmpegCommand.ffprobe(filePath, function (err, metadata) {
      if (err) return reject(err)
      return resolve(metadata)
    })
  })
}

const splitFile = function (movieFileNamePath, spInfo, flagH264, flagVAAPI) {
  return new Promise((resolve, reject) => {
    var command = new FfmpegCommand(movieFileNamePath)
    command.seekInput(spInfo.start).duration(spInfo.end)

    // if (flagH264 && flagVAAPI) {
    if (false) {
      command
        .inputOptions('-hwaccel vaapi')
        .inputOptions('-hwaccel_output_format vaapi')
        .inputOptions('-vaapi_device /dev/dri/renderD128')
        .videoCodec('h264_vaapi')
    } else {
      command.videoCodec('libx264')
    }

    command
      .audioCodec('aac')
      .on('start', function (commandLine) {
        // console.log('$ Spawned Ffmpeg with command: ' + commandLine)
        console.info('Start Split: ' + spInfo.fileName)
      })
      .on('progress', function (progress) {
        // if (progress.percent % 10 === 0) console.log('Processing: ' + progress.percent + '% done')
      })
      .on('codecData', function (data) {
        // console.info('Input Codec is ' + data.audio + ' audio ' + 'with ' + data.video + ' video')
      })
      .on('error', function (err, stdout, stderr) {
        console.error('Cannot process video: ' + spInfo.fileName + ' | ' + err.message)
        return reject(err)
      })
      .on('end', function (stdout, stderr) {
        console.info('Split succeeded: ' + spInfo.fileName)
        return resolve()
      })
      .output(path.resolve(TEMP_PATH, spInfo.fileName))
      .renice(15)
      .run()
  })
}

const concatFile = function (listFilePath, target) {
  return new Promise((resolve, reject) => {
    var command = new FfmpegCommand(listFilePath)

    command
      .inputFormat('concat')
      .inputOptions('-safe', '0')
      // .inputOptions('-i')
      // .output(outputFile)
      .on('start', function (commandLine) {
        console.log('Spawned Ffmpeg with command: ' + commandLine)
        console.info('Start Merging: ' + target.movieFileName)
      })
      .on('progress', function (progress) {
        if (progress % 10 === 0) console.log('Processing: ' + progress.percent + '% done')
      })
      .on('codecData', function (data) {
        // console.log('Input Codec is ' + data.audio + ' audio ' + 'with ' + data.video + ' video')
      })
      .on('error', function (err, stdout, stderr) {
        console.error('Cannot process video: ' + target.movieFileName + ' | ' + err.message)
        console.error(stdout)
        console.error(stderr)
        return reject(err)
      })
      .on('end', function (stdout, stderr) {
        console.log('Merging succeeded: ' + target.movieFileName)
        return resolve()
      })
      .mergeToFile(target.outputFile)
  })
}

const asyncFunc = async () => {
  // OPEN PROCESS FILE
  let dataStr = await fsPromise.readFile(PROCESSED_FILES, { encoding: 'utf-8', flag: 'a+' })

  if (!dataStr || dataStr.length === 0) {
    dataStr = '{"fileName":{}}'
  }
  processedFileInfo = JSON.parse(dataStr)

  // get arguments
  const argv = process.argv
  if (argv.length !== 3 && argv.length !== 4) console.error('usage: app search-dir [dest-dir]')

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

  // get targets
  const targets = await searchPBF(inputPath, outputPath)

  if (targets.length === 0) {
    console.log('Nothing to Convert')
    process.exit(0)
  }

  let encoders = await getEncoders()
  // console.log(encoders)s

  let flagVAAPI = false
  if (encoders.h264_vaapi) {
    console.log('This Encoder supports H.264 VAAPI')
    flagVAAPI = true
  }

  for (let target of targets) {
    console.log(`-Check File "${target.pureFileName}" for Converting`)

    if (processedFileInfo.fileName[target.pureFileName]) {
      console.log(`--File "${target.pureFileName}" has Converting History, Skip it`)
      continue
    }

    if (fs.existsSync(target.outputFile)) {
      console.log(`--File "${target.outputFile}" Already Exists`)
      // continue
    }

    let pbfInfo = await getPBFInfo(target)

    if (!pbfInfo) {
      console.log(`--File "${target.pureFileName}" has no Split Info`)
      continue
    }

    console.log(`--File "${target.pureFileName}" needs Split Converting`)
    target.splitInfo = pbfInfo

    let metadata = await probeFile(target.movieFileNamePath)
    var flagH264 = false
    metadata.streams.forEach((meta) => {
      if (meta.codec_name === 'h264') flagH264 = true
    })

    // console.log(metadata)

    // console.log(target)

    let listFileName = 'list-' + target.pureFileName + '.txt'
    let listFilePath = path.resolve(TEMP_PATH, listFileName)
    let listFileStr = ''

    for (let spInfo of target.splitInfo) {
      console.log(spInfo)
      await splitFile(target.movieFileNamePath, spInfo, flagH264, flagVAAPI)

      for (let i = 0, max = spInfo.repeat; i < max; i++) {
        var listItemStr = "file '" + path.resolve(TEMP_PATH, spInfo.fileName) + "'\r\n"
        listFileStr += listItemStr
      }

      fs.writeFileSync(listFilePath, listFileStr)
    }

    await concatFile(listFilePath, target)

    console.log(`--File "${target.pureFileName}" Converting Success`)

    await fsPromise.unlink(listFilePath)
    for (let spInfo of target.splitInfo) {
      await fsPromise.unlink(path.resolve(TEMP_PATH, spInfo.fileName))
    }

    processedFileInfo.fileName[target.pureFileName] = true
  }
}

asyncFunc()
  .then(() => {
    console.log('Converting Finished')
  })
  .catch((err) => {
    console.error(err)
  })
  .finally(() => {
    fsPromise
      .writeFile(PROCESSED_FILES, JSON.stringify(processedFileInfo), { encoding: 'utf-8', flag: 'w' })
      .then()
      .catch((er) => {
        console.error(er)
      })
  })
