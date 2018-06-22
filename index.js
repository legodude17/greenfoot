#! /usr/bin/env node
const execa = require('execa');
const chokidar = require('chokidar');
const log = require('signale');
const fs = require('fs').promises;
const path = require('path');
const pretty = require('pretty-time');

const NAME = path.basename(process.cwd());
const WORLD = process.argv[2];
const VERBOSE = process.argv[3] ? ['debug', 'd', 'v', 'verbose'].includes(process.argv[3].replace(/--?/, '')) : false;
const CLASSPATH = [
  '/Users/joshuab/.bin/greenfoot-lib/lib/bluejcore.jar',
  '/Users/joshuab/.bin/greenfoot-lib/lib/extensions/greenfoot.jar',
  '.'
].join(':');
let proc;

function format(str, n = 1) {
  if (VERBOSE) return str;
  const arr = str.split('\n').slice(0, n);
  return arr.length === 1 ? arr[0] : arr.join('\n');
}

function formatFailure(err) {
  return format(err.stderr);
}

function compile(file) {
  log.pending(`Compiling ${file}...`);
  const start = process.hrtime();
  return execa.shell(`javac -cp ${CLASSPATH} ${file}`)
    .then(res => {
      log.success(`Finished compiling ${file}.`, `(took ${pretty(process.hrtime(start))})`);
      return res;
    })
    .catch(err => {
      log.fatal(`Error encountered building ${file}`, formatFailure(err));
    });
}

function remove(file) {
  const classPath = `${file.replace('.java', '')}.class`;
  log.pending(`Removing ${classPath}`);
  const start = process.hrtime();
  return fs.unlink(classPath)
    .then(res => {
      log.success(`Finished removing ${classPath}.`, `(took ${pretty(process.hrtime(start))})`);
      return res;
    })
    .catch(err => {
      log.fatal(`Error encountered removing ${classPath}`, formatFailure(err.stack));
    });
}

function printOutput(str) {
  log.debug('Project gave output', format(str.toString()));
}

function run() {
  log.pending('Running project');
  if (proc) {
    log.info('Killing old project');
    proc.kill('SIGTERM');
  }
  proc = execa.shell(`java -cp ${CLASSPATH} greenfoot.export.GreenfootScenarioMain ${NAME} ${WORLD} /Users/joshuab/.bin/greenfoot-lib/lib/english/greenfoot/greenfoot-labels`);
  proc.stdout.on('data', printOutput);
  proc.stderr.on('data', printOutput);
  proc.then(() => {
    log.success('Ran project');
  }).catch(err => {
    if (err.killed) {
      log.info('Project killed');
      return;
    }
    log.fatal('Error running project:', format(err.stack));
  });
}

const watcher = chokidar.watch('*.java');

function reload() {
  return fs.readdir('.').then(arr => arr.filter(v => v.endsWith('.java')).forEach(file => watcher.add(file)));
}

log.watch('Watching your project');
watcher
  .on('add', compile)
  .on('change', compile)
  .on('unlink', remove);

process.stdin.on('data', () => reload().then(run));
