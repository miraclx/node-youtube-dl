'use strict'

const stream = require('stream')
const {promisify} = require('util');
const got = require('got')
const mkdirp = require('mkdirp')
const path = require('path')
const fs = require('fs')
const util = require('util')

const pipeline = promisify(stream.pipeline);

const [, , ...flags] = process.argv

const isWin = flags.includes('--platform=windows') || require('./util').isWin
const isOverwrite = flags.includes('--overwrite')

// First, look for the download link.
let dir, filePath
const defaultBin = path.join(__dirname, '..', 'bin')
const defaultPath = path.join(defaultBin, 'details')
const url = process.env.YOUTUBE_DL_DOWNLOAD_HOST || 'https://yt-dl.org/downloads/latest/youtube-dl'

function download (url, callback) {
  let status
  let newVersion

  // download the correct version of the binary based on the platform
  url = exec(url)

  got.get(url, { followRedirect: false })
    .then(function(res) {
      if (res.statusCode !== 302) {
        return callback(
          new Error(
            'Did not get redirect for the latest version link. Status: ' +
              res.statusCode
          )
        )
      }

      const url = res.headers.location
      newVersion = /yt-dl\.org\/downloads\/(\d{4}\.\d\d\.\d\d(\.\d)?)\/youtube-dl/.exec(
        url
      )[1]

      return pipeline(
          got.stream(url),
          fs.createWriteStream(filePath, { mode: 493 })
      );
    }).then(function(res) {
      callback(status, newVersion)
    })
    .catch(function(err) {
      return callback(err)
    })
}

const exec = path => (isWin ? path + '.exe' : path)

function createBase (binDir) {
  dir = binDir || defaultBin
  if (!fs.existsSync(dir)) {
    mkdirp.sync(dir)
    if (binDir) mkdirp.sync(defaultBin)
  }
  filePath = path.join(dir, exec('youtube-dl'))
}

function downloader (binDir, callback) {
  if (typeof binDir === 'function') {
    callback = binDir
    binDir = null
  }
  else if (!callback) {
    return util.promisify(downloader)(binDir)
  }

  createBase(binDir)

  // handle overwritin
  if (fs.existsSync(filePath)) {
    if (!isOverwrite) {
      return callback("File exists");
    }
    else {
      try {
        fs.unlinkSync(filePath);
      }
      catch (e) {
        callback(e);
      }
    }
  }

  download(url, function error (err, newVersion) {
    if (err) return callback(err)
    fs.writeFileSync(
      defaultPath,
      JSON.stringify({
        version: newVersion,
        path: binDir ? filePath : binDir,
        exec: exec('youtube-dl')
      }),
      'utf8'
    )
    return callback(null, 'Downloaded youtube-dl ' + newVersion)
  })
}

module.exports = downloader
