#!/usr/bin/env node

/**
 * Module dependencies.
 */



console.log(process.argv)
const argv = process.argv
if (argv.length !== 3)
  console.error('usage: app dirname')

// get file list
const fs = require('fs')
const path = require('path')

const inputPath = path.resolve(__dirname, argv[2])
const stats = fs.lstatSync(inputPath)
if (!stats.isDirectory()) {
  console.error('error: argument must be directory')
}

const fileNames = fs.readdirSync(inputPath)
var targets = []

fileNames.forEach((fileName) => {
      if (path.extname(fileName) === '.pbf') {
        console.log(fileName)
        const pureFileName = path.basename(fileName, '.pbf')
        const movieFileName = pureFileName + '.mp4'
        console.log(movieFileName)
        if (fs.existsSync(path.join(inputPath, movieFileName))) {
            var splitTarget = {
              movieFileNamePath: path.join(inputPath, movieFileName),
              movieFileName: movieFileName,
              pbfFilePath: path.join(inputPath, fileName)
            }
            targets.push(splitTarget)            
          }
        }
      })

console.log(targets)

// read pbf
targets.forEach((target)=>{
  var pbfBuf = fs.readFileSync(target.pbfFilePath)
  var pbfStr =  pbfBuf.toString('UCS-2')
  console.log(pbfStr)
  // var pbfStream = fs.createReadStream(target.pbfFilePath, { encoding:'UCS-2' })

  var idxStart = pbfStr.search(/\[PlayRepeat\]/)
  if(idxStart === -1) return

  var repeatStr = pbfStr.substr(idxStart + "[PlayRepeat]".length)
  
})