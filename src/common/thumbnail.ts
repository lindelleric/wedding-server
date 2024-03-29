// node-thumbnail
// (c) 2012-2017 Honza Pokorny
// Licensed under BSD
// https://github.com/honza/node-thumbnail

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

import imageSize from 'image-size';
import jimp from 'jimp';
import async from 'async';
import jo from 'jpeg-autorotate';
// const async = require('async');

const _ = require('lodash');

let options,
    queue: async.AsyncQueue<any>,
    defaults,
    done,
    extensions,
    createQueue,
    run,
    resizer,
    isValidFilename;

defaults = {
    prefix: '',
    suffix: '_thumb',
    digest: false,
    hashingType: 'sha1',
    // width: 800,
    height: 300,
    concurrency: os.cpus().length,
    quiet: false,
    overwrite: false,
    skip: false,
    ignore: false, // Ignore unsupported format
    logger: message => console.log(message) // eslint-disable-line no-console
};

extensions = ['.jpg', '.jpeg', '.png'];

resizer = async (options, callback) => {
    const fileIn = fs.readFileSync(options.srcPath);

    return jo.rotate(fileIn, {quality: 100}).then(({buffer}) => {
        return jimp.read(buffer)
            .then((file) => {
                file.write(options.srcPath);
                file
                    .resize(jimp.AUTO, options.height, jimp.RESIZE_BICUBIC)
                    .write(options.dstPath, (err, result) => {
                        callback(result, err);
                    });
            })
            .catch((err) => {
                let message = err.message + options.srcPath;
                return callback(null, message);
            }
        );
    }).catch(() => {
        return jimp.read(options.srcPath)
            .then((file) => {
                file
                    .resize(jimp.AUTO, options.height, jimp.RESIZE_BICUBIC)
                    .write(options.dstPath, (err, result) => {
                        callback(result, err);
                    });
            })
            .catch((err) => {
                let message = err.message + options.srcPath;
                return callback(null, message);
            }
        );
    });
}

isValidFilename = file => extensions.includes(path.extname(file).toLowerCase());

const evalCustomExtension = (customExtension, srcPath) => {
    if (extensions.includes(customExtension)) {
        return customExtension;
    }

    return path.extname(srcPath);
};

createQueue = (settings, resolve, reject) => {
    const finished = [];

    queue = async.queue((task: any, callback) => {
    if (settings.digest) {
        const hash = crypto.createHash(settings.hashingType);
        const stream = fs.ReadStream(task.options.srcPath);

        stream.on('data', d => hash.update(d));

        stream.on('end', () => {
        const d = hash.digest('hex');

        task.options.dstPath = path.join(
            settings.destination,
            d +
            '_' +
            settings.height +
            evalCustomExtension(settings.extension, task.options.srcPath)
        );

        const fileExists = fs.existsSync(task.options.dstPath);
        if (settings.skip && fileExists) {
            finished.push(task.options);
            callback();
        } else if (settings.overwrite || !fileExists) {
            resizer(task.options, (_, err) => {
            if (err) {
                callback(err);
                return reject(err);
            }
            finished.push(task.options);
            callback();
            });
        }
        });
    } else {
        const name = task.options.srcPath;
        const ext = path.extname(name);
        const base = task.options.basename || path.basename(name, ext);

        task.options.dstPath = path.join(
        settings.destination,
        settings.prefix +
            base +
            settings.suffix +
            evalCustomExtension(settings.extension, name)
        );

        const fileExists = fs.existsSync(task.options.dstPath);
        if (settings.skip && fileExists) {
        finished.push(task.options);
        callback();
        } else if (settings.overwrite || !fileExists) {
        resizer(task.options, (_, err) => {
            if (err) {
            callback(err);
            return reject(err);
            }
            finished.push(task.options);
            callback();
        });
        }
    }
    }, settings.concurrency);

    queue.drain(() => {
    if (done) {
        done(finished, null);
    }

    resolve(finished, null);

    if (!settings.quiet) {
        settings.logger('All items have been processed.');
    }
    });
};

run = (settings, resolve, reject) => {
    let images;

    const warnIfContainsDirectories = images => {
    let dirs = images.filter(image => image.isDirectory());
    dirs.map(dir => {
        if (!settings.quiet) {
        settings.logger(`Warning: '${dir.name}' is a directory, skipping...`);
        }
    });
    return images.filter(image => image.isFile()).map(image => image.name);
    };

    if (fs.statSync(settings.source).isFile()) {
    images = [path.basename(settings.source)];
    settings.source = path.dirname(settings.source);
    } else {
    images = fs.readdirSync(settings.source, { withFileTypes: true });
    images = warnIfContainsDirectories(images);
    }

    const invalidFilenames = _.filter(images, _.negate(isValidFilename));
    const containsInvalidFilenames = _.some(invalidFilenames);

    if (containsInvalidFilenames && !settings.ignore) {
    const files = invalidFilenames.join(', ');
    return reject('Your source directory contains unsupported files: ' + files);
    }

    createQueue(settings, resolve, reject);

    _.each(images, image => {
    if (isValidFilename(image)) {
        options = {
        srcPath: path.join(settings.source, image),
        height: settings.height,
        basename: settings.basename
        };
        queue.push({ options: options }, () => {
        if (!settings.quiet) {
            settings.logger('Processing ' + image);
        }
        });
    }
    });
};

export const thumb = (options, callback?) =>
    new Promise((resolve, reject) => {
    const settings = _.defaults(options, defaults);

    // options.args is present if run through the command line
    if (options.args) {
        if (options.args.length !== 2) {
        options.logger('Please provide a source and destination directories.');
        return;
        }

        options.source = options.args[0];
        options.destination = options.args[1];
    }

    settings.height = parseInt(settings.height, 10);

    const sourceExists = fs.existsSync(options.source);
    const destExists = fs.existsSync(options.destination);
    let errorMessage;

    if (sourceExists && !destExists) {
        errorMessage =
        "Destination '" + options.destination + "' does not exist.";
    } else if (destExists && !sourceExists) {
        errorMessage = "Source '" + options.source + "' does not exist.";
    } else if (!sourceExists && !destExists) {
        errorMessage =
        "Source '" +
        options.source +
        "' and destination '" +
        options.destination +
        "' do not exist.";
    }

    if (errorMessage) {
        options.logger(errorMessage);

        if (callback) {
        callback(null, new Error(errorMessage));
        }

        reject(new Error(errorMessage));
    }

    if (callback) {
        done = callback;
    }

    run(settings, resolve, reject);
    });


export const cli = options => {
    thumb(options).catch(error => {
    options.logger('ERROR: ' + error);
    process.exit(1);
    });
};
