var http = require('http');
var fs = require('fs');
var async = require('async');
var moment = require('moment');
var uuid = require('node-uuid');
var qiniu = require('qiniu');
var formidable = require('formidable');
var spawn = require('child_process').spawn;

var QINIU_CONFIG = require('./qiniu.config.js');

qiniu.conf.ACCESS_KEY = QINIU_CONFIG.access_key;
qiniu.conf.SECRET_KEY = QINIU_CONFIG.secret_key;

server = http.createServer(function (req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (req.url == '/upload') {
        //判断权限
        var startTimeMs = Date.now(), toPDFTimeMs, toImageTimeMs, uploadTimeMs;
        async.waterfall([
            function (next) {
                parseUploadFile(req, './tmp/', 'ppt,pptx', next);
            }, function (filePath, next) {
                //调用unoconv将ppt|pptx转成pdf
//                spawnProcess("/usr/bin/unoconv", ['-i', 'utf8', '-e', 'ReduceImageResolution=true', '-e', 'MaxImageResolution=150', '-e', 'UseLosslessCompression=true', filePath], function (err, code) {
//                    if (!!err || code != 0) {
//                        return res.end(JSON.stringify({code: 500, desc: 'unoconv failed with:' + err || code}));
//                    } else {
//                        toPDFTimeMs = Date.now() - startTimeMs;
//                        fs.unlink(filePath);
//                        next(null, filePath);
//                    }
//                });
                spawnProcess("libreoffice", ['--headless', '--invisible', '--convert-to', 'pdf', '--outdir', './tmp', filePath], function (err, code) {
                    if (!!err || code != 0) {
                        return res.end(JSON.stringify({code: 500, desc: 'libreoffice failed with:' + err || code}));
                    } else {
                        toPDFTimeMs = Date.now() - startTimeMs;
                        fs.unlink(filePath);
                        next(null, filePath);
                    }
                });
            }, function (filePath, next) {
                var pdfFilePath = filePath + '.pdf';
                var jpgFilePath = filePath + '.jpg';
                spawnProcess("convert", [pdfFilePath, jpgFilePath], function (err, code) {
                    if (!!err || code != 0) {
                        return res.end(JSON.stringify({code: 500, desc: 'convert failed with:' + err || code}));
                    } else {
                        toImageTimeMs = Date.now() - startTimeMs - toPDFTimeMs;
                        fs.unlink(pdfFilePath);
                        next(null, filePath);
                    }
                })
            }, function (filePath, next) {
                var page = 0, imageUrls = [], imagePath;

                //循环处理每一页对应的图片
                async.during(
                        function (cb) {
                            imagePath = (page == 0) ? filePath + '-0.jpg' : filePath + '-' + page + '.jpg';
                            fs.exists(imagePath, function (exists) {
                                if (exists) {
                                    return cb(null, exists);
                                } else {
                                    page = page++;
                                    imagePath = filePath + '-' + page + '.jpg';

                                    fs.exists(imagePath, function (exists) {
                                        return cb(null, exists);
                                    })
                                }
                            })
                        }, function (cb) {
                    var key = moment().format("YYYY-MM-DD") + "-" + uuid.v4() + '.jpg';

                    uploadToQiniu(imagePath, key, makeQiniuUploadToken(), function (err, ret) {
                        if (!err) {
                            fs.unlink(imagePath);
                            imageUrls.push(QINIU_CONFIG.domain + key + '?imageView2/0/h/540');
                        }

                        page++;
                        cb();
                    });
                }, function (err) {
                    uploadTimeMs = Date.now() - startTimeMs - toImageTimeMs - toPDFTimeMs;
                    next(err, imageUrls);
                });
            }], function (err, result) {
            if (!err)
                return res.end(JSON.stringify({code: 200, data: {
                        images: result,
                        duration: Date.now() - startTimeMs,
                        toPDFTimeMs: toPDFTimeMs,
                        toImageTimeMs: toImageTimeMs,
                        uploadTimeMs: uploadTimeMs
                    }}));
            else {
                return res.end(JSON.stringify({code: 500, desc: err}));
            }
        });
    } else {
        res.end('404');
    }
});

function spawnProcess(executor, processArguments, exitCallback) {
    if (typeof executor != 'string' || typeof processArguments != 'object') {
        return exitCallback(new Error('Invalid process inputs'));
    }

    var process = spawn(executor, processArguments);
    process.on('exit', function (code) {
        exitCallback(null, code);
    })
}

function parseUploadFile(req, uploadDir, acceptExtension, cb) {
    var form = new formidable.IncomingForm({uploadDir: "./tmp/"});
    form.uploadDir = uploadDir;

    form.on('file', function (file, value) {
        if (!value.name) {
            return cb(new Error('File can not be empty!'));
        }

        if (!checkFileExtension(value.name, acceptExtension)) {
            return cb(new Error('Invalid filename, ' + acceptExtension + ' required!'));
        }

        cb(null, value.path);
    })

    form.parse(req);
}

function checkFileExtension(filename, extensions) {
    extensions = extensions.split(',');
    var pattern = '\.(';
    for (var i = 0; i < extensions.length; i++) {
        if (0 != i) {
            pattern += '|';
        }
        pattern += extensions[i].trim();
    }
    pattern += ')$';
    return new RegExp(pattern, 'i').test(filename);
}

function makeQiniuUploadToken(expired_ms) {
    var putPolicy = new qiniu.rs.PutPolicy(QINIU_CONFIG.space);
    putPolicy.deadline = Date.now() / 1000 + expired_ms || 7200;
    return putPolicy.token();
}

function uploadToQiniu(localFile, key, uptoken, cb) {
    var extra = new qiniu.io.PutExtra();

    qiniu.io.putFile(uptoken, key, localFile, extra, function (err, ret) {
        if (!err) {
            cb(null, ret);
        } else {
            cb(err);
        }
    })
}

server.listen('4040');