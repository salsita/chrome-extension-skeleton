## Skeleton for Google Chrome extensions

* includes awesome messaging module
* webpack-based build system
* full ES6 support with Babel 6
* linting using eslint with airbnb configuration
* use node.js libraries
* unit-tests in mocha
* CircleCI friendly

### Installation:

    git clone git@github.com:salsita/chrome-extension-skeleton.git

    # in case you don't have webpack yet:
    sudo npm install -g webpack

### Build instructions:

To install dependencies:

    cd chrome-extension-skeleton
    npm install

Then to start a developing session (with watch), run:

    npm start

To start a unit testing session (with watch):

    npm test

To check code for linting errors:

    npm run lint


To build production code + crx:

    npm run build

To run unit tests in CI scripts:

    npm run test:ci


### Directory structure:

    /build             # this is where your extension (.crx) will end up,
                       # along with unpacked directories of production and
                       # develop build (for debugging)

    /src
        /css           # CSS files
        /html          # HTML files
        /images        # image resources

        /js            # entry-points for browserify, requiring node.js `modules`

            /libs      # 3rd party run-time libraries, excluded from JS-linting
            /modules   # node.js modules (and corresponding mocha
                       #   unit tests spec files)

        manifest.json  # skeleton manifest file, `name`, `description`
                       #   and `version` fields copied from `package.json`       

    /webpack           # webpack configuration files

    .babelrc           # Babel configuration
    .eslintrc          # options for JS-linting
    circle.yml         # integration with CircleCI
    mykey.pem          # certificate file, YOU NEED TO GENERATE THIS FILE, see below
    package.json       # project description file (name, version, dependencies, ...)


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

4. When developing, write unit-tests, use `npm test` to check that
your code passes unit-tests and `npm run lint` to check for linting errors.

5. When ready to try out the extension in the browser, use `npm start` to
build it. In `build` directory you'll find develop version of the extension in
`dev` subdirectory (with source maps), and production (uglified)
version in `prod` directory. The `.crx` packed version is created from
`prod` sources.

6. When done developing, publish the extension and enjoy it (profit!).

Use any 3rd party libraries you need (both for run-time and for development /
testing), use regular npm node.js modules (that will be installed into
`node_modules` directory). These libraries will be encapsulated in the resulting
code and will NOT conflict even with libraries on pages where you inject the
resulting JS scripts to (for content scripts).

For more information, please check also README.md files in subdirectories.

### Under the hood:

If you want to understand better the structure of the code and how it really
works, please check the following sources (note: these resources are out of date, with respect to the build system and ES6):

* [introductory blog post](https://blog.javascripting.com/2014/06/18/the-chrome-extension-skeleton-building-modular-extensions-with-grunt-and-browserify/),
* [blog post on messaging system](https://blog.javascripting.com/2014/08/11/the-chrome-extension-skeleton-messaging-system/),
* or this [overall prezi](http://prezi.com/yxj7zs7ixlmw/chrome-extension-skeleton/).
