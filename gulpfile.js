const gulp = require('gulp')
const minifycss = require('gulp-clean-css')
const uglify = require('gulp-uglify')
const htmlmin = require('gulp-htmlmin')
const cssnano = require('gulp-cssnano')
const htmlclean = require('gulp-htmlclean')
const del = require('del')
const babel = require('gulp-babel')
const autoprefixer = require('gulp-autoprefixer')
const connect = require('gulp-connect')
const pug = require('gulp-pug')
const less = require('gulp-less')

const config = require('./config.json')

gulp.task('clean', function () {
	return del(['./dist/css/', './dist/js/'])
})

gulp.task('css', function () {
	return gulp
	.src('./src/css/*.less')
	.pipe(less().on('error', function(err) {
		console.log(err);
		this.emit('end');
	}))
	.pipe(minifycss({ compatibility: 'ie8' }))
	.pipe(autoprefixer({ overrideBrowserslist: ['last 2 version'] }))
	.pipe(cssnano({ reduceIdents: false }))
		.pipe(gulp.dest('./dist/css'))
})

gulp.task('html', function () {
	return gulp
		.src('./dist/index.html')
		.pipe(htmlclean())
		.pipe(htmlmin())
		.pipe(gulp.dest('./dist'))
})

gulp.task('js', function () {
	return gulp
		.src('./src/js/*.js')
		.pipe(babel({ presets: ['@babel/preset-env'] }))
		.pipe(uglify())
		.pipe(gulp.dest('./dist/js'))
})

gulp.task('pug', function () {
	return gulp
		.src('./src/index.pug')
		.pipe(pug({ data: config }))
		.pipe(gulp.dest('./dist'))
})

gulp.task('pug-blog', function () {
	return gulp
		.src('./src/blog.pug')
		.pipe(pug({ data: config }))
		.pipe(gulp.dest('./dist/blog'))
})

gulp.task('pug-about', function () {
	return gulp
		.src('./src/about.pug')
		.pipe(pug({ data: config }))
		.pipe(gulp.dest('./dist/about'))
})

gulp.task('assets', function () {
	return gulp
		.src(['./src/assets/**/*'])
		.pipe(gulp.dest('./dist/assets'));
})

gulp.task('html-blog', function () {
	return gulp
		.src('./dist/blog/blog.html')
		.pipe(htmlclean())
		.pipe(htmlmin())
		.pipe(gulp.dest('./dist/blog'))
})

gulp.task('html-about', function () {
	return gulp
		.src('./dist/about/about.html')
		.pipe(htmlclean())
		.pipe(htmlmin())
		.pipe(gulp.dest('./dist/about'))
})

gulp.task('rename-blog', function (done) {
	const fs = require('fs')
	const path = require('path')
	const src = path.join(__dirname, 'dist/blog/blog.html')
	const dest = path.join(__dirname, 'dist/blog/index.html')
	if (fs.existsSync(src)) {
		fs.renameSync(src, dest)
	}
	done()
})

gulp.task('rename-about', function (done) {
	const fs = require('fs')
	const path = require('path')
	const src = path.join(__dirname, 'dist/about/about.html')
	const dest = path.join(__dirname, 'dist/about/index.html')
	if (fs.existsSync(src)) {
		fs.renameSync(src, dest)
	}
	done()
})

gulp.task('build', gulp.series('clean', 'assets', 'pug', 'pug-blog', 'pug-about', 'css', 'js', 'html', 'html-blog', 'html-about', 'rename-blog', 'rename-about'))
gulp.task('default', gulp.series('build'))

gulp.task('watch', function () {
	gulp.watch('./src/components/*.pug', gulp.parallel('pug'))
	gulp.watch('./src/index.pug', gulp.parallel('pug'))
	gulp.watch('./src/css/**/*.scss', gulp.parallel(['css']))
	gulp.watch('./src/js/*.js', gulp.parallel(['js']))
	connect.server({
		root: 'dist',
		livereload: true,
		port: 8080
	})
})
