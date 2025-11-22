
const gulp = require('gulp');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify-es').default;
const less = require('gulp-less');
const cleanCSS = require('gulp-clean-css');
const replace = require('gulp-replace');
const webp = require('gulp-webp');
const fs = require('fs');

gulp.task('post', function (callback) {
  let args = process.argv;
  let title = args[args.length - 1];
  let filename = new Date().toLocaleDateString('en-CA') + '-' + title.replace(/ /g, '-') + '.md';
  let content = '---\n' +
    'layout: post\n' +
    'title: ' + title + '\n' +
    'tags: []\n' +
    '---';
  console.log('[' + new Date().toLocaleTimeString('en-CA', {hour12: false}) + '] File created: _posts/' + filename);
  fs.writeFile(__dirname + '/../_posts/' + filename, content, callback);
});

gulp.task('js', function minijs() {
  return gulp.src(['js/partials/**.js'])
    .pipe(concat('main.min.js'))
    .pipe(uglify())
    .on('error', (err) => {
      console.log(err.toString())
    })
    .pipe(gulp.dest("js/"))
});

gulp.task("img", async function imging() {
  const imagemin = await import('gulp-imagemin');

  return gulp.src('img/**/*.{png,svg,jpg,webp,jpeg,gif}')
    .pipe(imagemin.default())
    .on('error', (err) => {
      console.log(err.toString())
    })
    .pipe(gulp.dest('img/'))
});

gulp.task('sharp_img', async function () {
  const responsive = await import('gulp-responsive');
  let settings = {
    quality: 85,
    progressive: true,
    compressionLevel: 6,
  };

  return gulp.src('img/**/*.{png,jpg,webp,jpeg}')
    .pipe(responsive({
      '**/*.*': settings,
      '*.*': settings,
    }))
    .pipe(gulp.dest('img'))
});

gulp.task('thumbnails', async function () {
  const responsive = await import('gulp-responsive');
  let settings = {
    width: '50%',
  };

  return gulp.src('img/feature-img/*')
    .pipe(responsive({
      '**/*.*': settings,
      '*.*': settings,
    }))
    .pipe(gulp.dest('img/thumbnails/feature-img'))
});


gulp.task('thumbnails-all', async function () {
  const responsive = await import('gulp-responsive');
  let settings = {
    width: '50%',
  };

  return gulp.src('img/*.{png,jpg,webp,jpeg}')
      .pipe(responsive({'*.*': settings}))
      .pipe(gulp.dest('img/thumbnails')) &&
    gulp.src('img/!(thumbnails)/*.{png,jpg,webp,jpeg}')
      .pipe(responsive({'**/*.*': settings}))
      .pipe(gulp.dest('img/thumbnails'))
});

gulp.task('webp', () =>
  gulp.src('img/**/*.{png,svg,jpg,jpeg,gif}')
    .pipe(webp({
      quality: 85,
      preset: 'photo',
      method: 6
    }))
    .pipe(gulp.dest('img'))
);

gulp.task('css', function minicss() {
  return gulp.src('css/vendor/bootstrap-iso.css')
    .pipe(cleanCSS())
    .on('error', (err) => {
      console.log(err.toString())
    })
    .pipe(concat('bootstrap-iso.min.css'))
    .pipe(gulp.dest('css/vendor/'));
});

gulp.task('isolate', function isolateBootstrap() {
  return gulp.src('css/bootstrap-iso.less')
    .pipe(less({strictMath: 'on'}))
    .pipe(replace('.bootstrap-iso html', ''))
    .pipe(replace('.bootstrap-iso body', ''))
    .pipe(gulp.dest('css/vendor/'));
});

gulp.task("isolate-bootstrap-css", gulp.series('isolate', 'css'));
gulp.task("default", gulp.series(gulp.parallel('js', 'css', 'img')));
