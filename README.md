## Skeleton for Google Chrome extensions

* includes awesome messaging module
* grunt-based build system
* node.js modules
* unit-tests in mocha
* CircleCI friendly

### Installation:

    git clone git@github.com:salsita/chrome-extension-skeleton.git
    
    # in case you don't have Grunt yet:
    sudo npm install -g grunt-cli

### Build instructions:

    cd chrome-extension-skeleton
    npm install
    grunt

### Directory structure:

    /build             # this is where your extension (.crx) will end up,
                       # along with unpacked directories of production and
                       # develop build (for debugging)
    
    /code
        /css           # CSS files
        /html          # HTML files
        /images        # image resources
    
        /js            # entry-points for browserify, requiring node.js `modules`
    
            /libs      # 3rd party run-time libraries, excluded from JS-linting
            /modules   # node.js modules (and corresponding mocha
                       #   unit tests spec files)
    
        manifest.json  # skeleton manifest file, `name`, `description`
                       #   and `version` fields copied from `package.json`
    
    Gruntfile.js       # grunt tasks (see below)
    circle.yml         # integration with CircleCI
    crxmake.sh         # official build script for packing Chromium extensions
    mykey.pem          # certificate file, YOU NEED TO GENERATE THIS FILE, see below
    lint-options.json  # options for JS-linting
    package.json       # project description file (name, version, dependencies, ...)

### Grunt tasks:

* `clean`: clean `build` directory
* `test`: JS-lint and mocha test, single run
* `test-cont`: continuous `test` loop
* default: `clean`, `test`, build step (copy all necessary files to `build`
  directory, browserify JS sources, prepare production version (using uglify),
  pack the `crx`, and copy the resulting `crx` to CircleCI artifacts directory
  (only when on CircleCI))

### After you clone:

1. In `package.json`, rename the project, description, version, add dependencies
and any other fields necessary.

2. Generate your .pem key and store it in the root as `mykey.pem` file. On
unix / mac, the command to generate the file is
`openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt > mykey.pem`.
Note: the generated file is in `.gitignore` file, it won't be (and should NOT
be) commited to the repository unless you know what you are doing.

3. Add content (HTML, CSS, images, JS modules), update `code/manifest.json`,
leave only JS entry-points you use (remove the ones you don't need).

4. When developing, write unit-tests, use `test-cont` Grunt task to check that
your JS code passes linting tests and unit-tests.

5. When ready to try out the extension in the browser, use default Grunt task to
build it. In `build` directory you'll find develop version of the extension in
`unpacked-dev` subdirectory (with source maps), and production (uglified)
version in `unpacked-prod` directory. The `.crx` packed version is created from
`unpacked-prod` sources.

6. When done developing, publish the extension and enjoy it (profit!).

Use any 3rd party libraries you need (both for run-time and for development /
testing), place them either to `code/js/libs`, in case the library is not an npm
module, or use regular npm node.js modules (that will be installed into
`node_modules` directory). These libraries will be encapsulated in the resulting
code and will NOT conflict even with libraries on pages where you inject the
resulting JS scripts to (for content scripts).

For more information, please check also README.md files in subdirectories.

### Under the hood:

If you want to understand better the structure of the code and how it really
works, please check the following sources:

* [introductory blog post](https://blog.javascripting.com/2014/06/18/the-chrome-extension-skeleton-building-modular-extensions-with-grunt-and-browserify/),
* [blog post on messaging system](https://blog.javascripting.com/2014/08/11/the-chrome-extension-skeleton-messaging-system/),
* or this [overall prezi](http://prezi.com/yxj7zs7ixlmw/chrome-extension-skeleton/).

### Legacy version

Before this version of the skeleton, we used [RequireJS](http://requirejs.org/)
modules, [jasmine-based](http://jasmine.github.io/) unit tests and older
`chrome.extension.{onMessage|sendMessage}` API for message exchange between
background and content scripts. This version is still available in
[legacy](https://github.com/salsita/chrome-extension-skeleton/tree/legacy)
branch here.
