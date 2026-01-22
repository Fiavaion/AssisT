import { c as commonjsRequire, g as getDefaultExportFromCjs } from "./_commonjs-dynamic-modules-C0OTmW6W.js";
function _mergeNamespaces(n, m) {
  for (var i = 0; i < m.length; i++) {
    const e = m[i];
    if (typeof e !== "string" && !Array.isArray(e)) {
      for (const k in e) {
        if (k !== "default" && !(k in n)) {
          const d = Object.getOwnPropertyDescriptor(e, k);
          if (d) {
            Object.defineProperty(n, k, d.get ? d : {
              enumerable: true,
              get: () => e[k]
            });
          }
        }
      }
    }
  }
  return Object.freeze(Object.defineProperty(n, Symbol.toStringTag, { value: "Module" }));
}
var runtime = { exports: {} };
var hasRequiredRuntime;
function requireRuntime() {
  if (hasRequiredRuntime) return runtime.exports;
  hasRequiredRuntime = 1;
  (function(module) {
    var runtime2 = (function(exports) {
      var Op = Object.prototype;
      var hasOwn = Op.hasOwnProperty;
      var defineProperty = Object.defineProperty || function(obj, key, desc) {
        obj[key] = desc.value;
      };
      var undefined$1;
      var $Symbol = typeof Symbol === "function" ? Symbol : {};
      var iteratorSymbol = $Symbol.iterator || "@@iterator";
      var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
      var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";
      function define(obj, key, value) {
        Object.defineProperty(obj, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true
        });
        return obj[key];
      }
      try {
        define({}, "");
      } catch (err) {
        define = function(obj, key, value) {
          return obj[key] = value;
        };
      }
      function wrap(innerFn, outerFn, self, tryLocsList) {
        var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
        var generator = Object.create(protoGenerator.prototype);
        var context = new Context(tryLocsList || []);
        defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) });
        return generator;
      }
      exports.wrap = wrap;
      function tryCatch(fn, obj, arg) {
        try {
          return { type: "normal", arg: fn.call(obj, arg) };
        } catch (err) {
          return { type: "throw", arg: err };
        }
      }
      var GenStateSuspendedStart = "suspendedStart";
      var GenStateSuspendedYield = "suspendedYield";
      var GenStateExecuting = "executing";
      var GenStateCompleted = "completed";
      var ContinueSentinel = {};
      function Generator() {
      }
      function GeneratorFunction() {
      }
      function GeneratorFunctionPrototype() {
      }
      var IteratorPrototype = {};
      define(IteratorPrototype, iteratorSymbol, function() {
        return this;
      });
      var getProto = Object.getPrototypeOf;
      var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
      if (NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol)) {
        IteratorPrototype = NativeIteratorPrototype;
      }
      var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype);
      GeneratorFunction.prototype = GeneratorFunctionPrototype;
      defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: true });
      defineProperty(
        GeneratorFunctionPrototype,
        "constructor",
        { value: GeneratorFunction, configurable: true }
      );
      GeneratorFunction.displayName = define(
        GeneratorFunctionPrototype,
        toStringTagSymbol,
        "GeneratorFunction"
      );
      function defineIteratorMethods(prototype) {
        ["next", "throw", "return"].forEach(function(method) {
          define(prototype, method, function(arg) {
            return this._invoke(method, arg);
          });
        });
      }
      exports.isGeneratorFunction = function(genFun) {
        var ctor = typeof genFun === "function" && genFun.constructor;
        return ctor ? ctor === GeneratorFunction || // For the native GeneratorFunction constructor, the best we can
        // do is to check its .name property.
        (ctor.displayName || ctor.name) === "GeneratorFunction" : false;
      };
      exports.mark = function(genFun) {
        if (Object.setPrototypeOf) {
          Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
        } else {
          genFun.__proto__ = GeneratorFunctionPrototype;
          define(genFun, toStringTagSymbol, "GeneratorFunction");
        }
        genFun.prototype = Object.create(Gp);
        return genFun;
      };
      exports.awrap = function(arg) {
        return { __await: arg };
      };
      function AsyncIterator(generator, PromiseImpl) {
        function invoke(method, arg, resolve, reject) {
          var record = tryCatch(generator[method], generator, arg);
          if (record.type === "throw") {
            reject(record.arg);
          } else {
            var result = record.arg;
            var value = result.value;
            if (value && typeof value === "object" && hasOwn.call(value, "__await")) {
              return PromiseImpl.resolve(value.__await).then(function(value2) {
                invoke("next", value2, resolve, reject);
              }, function(err) {
                invoke("throw", err, resolve, reject);
              });
            }
            return PromiseImpl.resolve(value).then(function(unwrapped) {
              result.value = unwrapped;
              resolve(result);
            }, function(error) {
              return invoke("throw", error, resolve, reject);
            });
          }
        }
        var previousPromise;
        function enqueue(method, arg) {
          function callInvokeWithMethodAndArg() {
            return new PromiseImpl(function(resolve, reject) {
              invoke(method, arg, resolve, reject);
            });
          }
          return previousPromise = // If enqueue has been called before, then we want to wait until
          // all previous Promises have been resolved before calling invoke,
          // so that results are always delivered in the correct order. If
          // enqueue has not been called before, then it is important to
          // call invoke immediately, without waiting on a callback to fire,
          // so that the async generator function has the opportunity to do
          // any necessary setup in a predictable way. This predictability
          // is why the Promise constructor synchronously invokes its
          // executor callback, and why async functions synchronously
          // execute code before the first await. Since we implement simple
          // async functions in terms of async generators, it is especially
          // important to get this right, even though it requires care.
          previousPromise ? previousPromise.then(
            callInvokeWithMethodAndArg,
            // Avoid propagating failures to Promises returned by later
            // invocations of the iterator.
            callInvokeWithMethodAndArg
          ) : callInvokeWithMethodAndArg();
        }
        defineProperty(this, "_invoke", { value: enqueue });
      }
      defineIteratorMethods(AsyncIterator.prototype);
      define(AsyncIterator.prototype, asyncIteratorSymbol, function() {
        return this;
      });
      exports.AsyncIterator = AsyncIterator;
      exports.async = function(innerFn, outerFn, self, tryLocsList, PromiseImpl) {
        if (PromiseImpl === void 0) PromiseImpl = Promise;
        var iter = new AsyncIterator(
          wrap(innerFn, outerFn, self, tryLocsList),
          PromiseImpl
        );
        return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function(result) {
          return result.done ? result.value : iter.next();
        });
      };
      function makeInvokeMethod(innerFn, self, context) {
        var state = GenStateSuspendedStart;
        return function invoke(method, arg) {
          if (state === GenStateExecuting) {
            throw new Error("Generator is already running");
          }
          if (state === GenStateCompleted) {
            if (method === "throw") {
              throw arg;
            }
            return doneResult();
          }
          context.method = method;
          context.arg = arg;
          while (true) {
            var delegate = context.delegate;
            if (delegate) {
              var delegateResult = maybeInvokeDelegate(delegate, context);
              if (delegateResult) {
                if (delegateResult === ContinueSentinel) continue;
                return delegateResult;
              }
            }
            if (context.method === "next") {
              context.sent = context._sent = context.arg;
            } else if (context.method === "throw") {
              if (state === GenStateSuspendedStart) {
                state = GenStateCompleted;
                throw context.arg;
              }
              context.dispatchException(context.arg);
            } else if (context.method === "return") {
              context.abrupt("return", context.arg);
            }
            state = GenStateExecuting;
            var record = tryCatch(innerFn, self, context);
            if (record.type === "normal") {
              state = context.done ? GenStateCompleted : GenStateSuspendedYield;
              if (record.arg === ContinueSentinel) {
                continue;
              }
              return {
                value: record.arg,
                done: context.done
              };
            } else if (record.type === "throw") {
              state = GenStateCompleted;
              context.method = "throw";
              context.arg = record.arg;
            }
          }
        };
      }
      function maybeInvokeDelegate(delegate, context) {
        var methodName = context.method;
        var method = delegate.iterator[methodName];
        if (method === undefined$1) {
          context.delegate = null;
          if (methodName === "throw" && delegate.iterator["return"]) {
            context.method = "return";
            context.arg = undefined$1;
            maybeInvokeDelegate(delegate, context);
            if (context.method === "throw") {
              return ContinueSentinel;
            }
          }
          if (methodName !== "return") {
            context.method = "throw";
            context.arg = new TypeError(
              "The iterator does not provide a '" + methodName + "' method"
            );
          }
          return ContinueSentinel;
        }
        var record = tryCatch(method, delegate.iterator, context.arg);
        if (record.type === "throw") {
          context.method = "throw";
          context.arg = record.arg;
          context.delegate = null;
          return ContinueSentinel;
        }
        var info = record.arg;
        if (!info) {
          context.method = "throw";
          context.arg = new TypeError("iterator result is not an object");
          context.delegate = null;
          return ContinueSentinel;
        }
        if (info.done) {
          context[delegate.resultName] = info.value;
          context.next = delegate.nextLoc;
          if (context.method !== "return") {
            context.method = "next";
            context.arg = undefined$1;
          }
        } else {
          return info;
        }
        context.delegate = null;
        return ContinueSentinel;
      }
      defineIteratorMethods(Gp);
      define(Gp, toStringTagSymbol, "Generator");
      define(Gp, iteratorSymbol, function() {
        return this;
      });
      define(Gp, "toString", function() {
        return "[object Generator]";
      });
      function pushTryEntry(locs) {
        var entry = { tryLoc: locs[0] };
        if (1 in locs) {
          entry.catchLoc = locs[1];
        }
        if (2 in locs) {
          entry.finallyLoc = locs[2];
          entry.afterLoc = locs[3];
        }
        this.tryEntries.push(entry);
      }
      function resetTryEntry(entry) {
        var record = entry.completion || {};
        record.type = "normal";
        delete record.arg;
        entry.completion = record;
      }
      function Context(tryLocsList) {
        this.tryEntries = [{ tryLoc: "root" }];
        tryLocsList.forEach(pushTryEntry, this);
        this.reset(true);
      }
      exports.keys = function(val) {
        var object = Object(val);
        var keys = [];
        for (var key in object) {
          keys.push(key);
        }
        keys.reverse();
        return function next() {
          while (keys.length) {
            var key2 = keys.pop();
            if (key2 in object) {
              next.value = key2;
              next.done = false;
              return next;
            }
          }
          next.done = true;
          return next;
        };
      };
      function values(iterable) {
        if (iterable) {
          var iteratorMethod = iterable[iteratorSymbol];
          if (iteratorMethod) {
            return iteratorMethod.call(iterable);
          }
          if (typeof iterable.next === "function") {
            return iterable;
          }
          if (!isNaN(iterable.length)) {
            var i = -1, next = function next2() {
              while (++i < iterable.length) {
                if (hasOwn.call(iterable, i)) {
                  next2.value = iterable[i];
                  next2.done = false;
                  return next2;
                }
              }
              next2.value = undefined$1;
              next2.done = true;
              return next2;
            };
            return next.next = next;
          }
        }
        return { next: doneResult };
      }
      exports.values = values;
      function doneResult() {
        return { value: undefined$1, done: true };
      }
      Context.prototype = {
        constructor: Context,
        reset: function(skipTempReset) {
          this.prev = 0;
          this.next = 0;
          this.sent = this._sent = undefined$1;
          this.done = false;
          this.delegate = null;
          this.method = "next";
          this.arg = undefined$1;
          this.tryEntries.forEach(resetTryEntry);
          if (!skipTempReset) {
            for (var name in this) {
              if (name.charAt(0) === "t" && hasOwn.call(this, name) && !isNaN(+name.slice(1))) {
                this[name] = undefined$1;
              }
            }
          }
        },
        stop: function() {
          this.done = true;
          var rootEntry = this.tryEntries[0];
          var rootRecord = rootEntry.completion;
          if (rootRecord.type === "throw") {
            throw rootRecord.arg;
          }
          return this.rval;
        },
        dispatchException: function(exception) {
          if (this.done) {
            throw exception;
          }
          var context = this;
          function handle(loc, caught) {
            record.type = "throw";
            record.arg = exception;
            context.next = loc;
            if (caught) {
              context.method = "next";
              context.arg = undefined$1;
            }
            return !!caught;
          }
          for (var i = this.tryEntries.length - 1; i >= 0; --i) {
            var entry = this.tryEntries[i];
            var record = entry.completion;
            if (entry.tryLoc === "root") {
              return handle("end");
            }
            if (entry.tryLoc <= this.prev) {
              var hasCatch = hasOwn.call(entry, "catchLoc");
              var hasFinally = hasOwn.call(entry, "finallyLoc");
              if (hasCatch && hasFinally) {
                if (this.prev < entry.catchLoc) {
                  return handle(entry.catchLoc, true);
                } else if (this.prev < entry.finallyLoc) {
                  return handle(entry.finallyLoc);
                }
              } else if (hasCatch) {
                if (this.prev < entry.catchLoc) {
                  return handle(entry.catchLoc, true);
                }
              } else if (hasFinally) {
                if (this.prev < entry.finallyLoc) {
                  return handle(entry.finallyLoc);
                }
              } else {
                throw new Error("try statement without catch or finally");
              }
            }
          }
        },
        abrupt: function(type, arg) {
          for (var i = this.tryEntries.length - 1; i >= 0; --i) {
            var entry = this.tryEntries[i];
            if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) {
              var finallyEntry = entry;
              break;
            }
          }
          if (finallyEntry && (type === "break" || type === "continue") && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc) {
            finallyEntry = null;
          }
          var record = finallyEntry ? finallyEntry.completion : {};
          record.type = type;
          record.arg = arg;
          if (finallyEntry) {
            this.method = "next";
            this.next = finallyEntry.finallyLoc;
            return ContinueSentinel;
          }
          return this.complete(record);
        },
        complete: function(record, afterLoc) {
          if (record.type === "throw") {
            throw record.arg;
          }
          if (record.type === "break" || record.type === "continue") {
            this.next = record.arg;
          } else if (record.type === "return") {
            this.rval = this.arg = record.arg;
            this.method = "return";
            this.next = "end";
          } else if (record.type === "normal" && afterLoc) {
            this.next = afterLoc;
          }
          return ContinueSentinel;
        },
        finish: function(finallyLoc) {
          for (var i = this.tryEntries.length - 1; i >= 0; --i) {
            var entry = this.tryEntries[i];
            if (entry.finallyLoc === finallyLoc) {
              this.complete(entry.completion, entry.afterLoc);
              resetTryEntry(entry);
              return ContinueSentinel;
            }
          }
        },
        "catch": function(tryLoc) {
          for (var i = this.tryEntries.length - 1; i >= 0; --i) {
            var entry = this.tryEntries[i];
            if (entry.tryLoc === tryLoc) {
              var record = entry.completion;
              if (record.type === "throw") {
                var thrown = record.arg;
                resetTryEntry(entry);
              }
              return thrown;
            }
          }
          throw new Error("illegal catch attempt");
        },
        delegateYield: function(iterable, resultName, nextLoc) {
          this.delegate = {
            iterator: values(iterable),
            resultName,
            nextLoc
          };
          if (this.method === "next") {
            this.arg = undefined$1;
          }
          return ContinueSentinel;
        }
      };
      return exports;
    })(
      // If this script is executing as a CommonJS module, use module.exports
      // as the regeneratorRuntime namespace. Otherwise create a new empty
      // object. Either way, the resulting object will be used to initialize
      // the regeneratorRuntime variable at the top of this file.
      module.exports
    );
    try {
      regeneratorRuntime = runtime2;
    } catch (accidentalStrictMode) {
      if (typeof globalThis === "object") {
        globalThis.regeneratorRuntime = runtime2;
      } else {
        Function("r", "regeneratorRuntime = r")(runtime2);
      }
    }
  })(runtime);
  return runtime.exports;
}
var getId;
var hasRequiredGetId;
function requireGetId() {
  if (hasRequiredGetId) return getId;
  hasRequiredGetId = 1;
  getId = (prefix, cnt) => `${prefix}-${cnt}-${Math.random().toString(16).slice(3, 8)}`;
  return getId;
}
var createJob;
var hasRequiredCreateJob;
function requireCreateJob() {
  if (hasRequiredCreateJob) return createJob;
  hasRequiredCreateJob = 1;
  const getId2 = requireGetId();
  let jobCounter = 0;
  createJob = ({
    id: _id,
    action,
    payload = {}
  }) => {
    let id = _id;
    if (typeof id === "undefined") {
      id = getId2("Job", jobCounter);
      jobCounter += 1;
    }
    return {
      id,
      action,
      payload
    };
  };
  return createJob;
}
var log = {};
var hasRequiredLog;
function requireLog() {
  if (hasRequiredLog) return log;
  hasRequiredLog = 1;
  let logging = false;
  log.logging = logging;
  log.setLogging = (_logging) => {
    logging = _logging;
  };
  log.log = (...args) => logging ? console.log.apply(this, args) : null;
  return log;
}
var createScheduler;
var hasRequiredCreateScheduler;
function requireCreateScheduler() {
  if (hasRequiredCreateScheduler) return createScheduler;
  hasRequiredCreateScheduler = 1;
  const createJob2 = requireCreateJob();
  const { log: log2 } = requireLog();
  const getId2 = requireGetId();
  let schedulerCounter = 0;
  createScheduler = () => {
    const id = getId2("Scheduler", schedulerCounter);
    const workers = {};
    const runningWorkers = {};
    let jobQueue = [];
    schedulerCounter += 1;
    const getQueueLen = () => jobQueue.length;
    const getNumWorkers = () => Object.keys(workers).length;
    const dequeue = () => {
      if (jobQueue.length !== 0) {
        const wIds = Object.keys(workers);
        for (let i = 0; i < wIds.length; i += 1) {
          if (typeof runningWorkers[wIds[i]] === "undefined") {
            jobQueue[0](workers[wIds[i]]);
            break;
          }
        }
      }
    };
    const queue = (action, payload) => new Promise((resolve, reject) => {
      const job = createJob2({ action, payload });
      jobQueue.push(async (w) => {
        jobQueue.shift();
        runningWorkers[w.id] = job;
        try {
          resolve(await w[action].apply(this, [...payload, job.id]));
        } catch (err) {
          reject(err);
        } finally {
          delete runningWorkers[w.id];
          dequeue();
        }
      });
      log2(`[${id}]: Add ${job.id} to JobQueue`);
      log2(`[${id}]: JobQueue length=${jobQueue.length}`);
      dequeue();
    });
    const addWorker = (w) => {
      workers[w.id] = w;
      log2(`[${id}]: Add ${w.id}`);
      log2(`[${id}]: Number of workers=${getNumWorkers()}`);
      dequeue();
      return w.id;
    };
    const addJob = async (action, ...payload) => {
      if (getNumWorkers() === 0) {
        throw Error(`[${id}]: You need to have at least one worker before adding jobs`);
      }
      return queue(action, payload);
    };
    const terminate = async () => {
      Object.keys(workers).forEach(async (wid) => {
        await workers[wid].terminate();
      });
      jobQueue = [];
    };
    return {
      addWorker,
      addJob,
      terminate,
      getQueueLen,
      getNumWorkers
    };
  };
  return createScheduler;
}
var isElectron_1;
var hasRequiredIsElectron;
function requireIsElectron() {
  if (hasRequiredIsElectron) return isElectron_1;
  hasRequiredIsElectron = 1;
  function isElectron() {
    if (typeof window !== "undefined" && typeof window.process === "object" && window.process.type === "renderer") {
      return true;
    }
    if (typeof process !== "undefined" && typeof process.versions === "object" && !!process.versions.electron) {
      return true;
    }
    if (typeof navigator === "object" && typeof navigator.userAgent === "string" && navigator.userAgent.indexOf("Electron") >= 0) {
      return true;
    }
    return false;
  }
  isElectron_1 = isElectron;
  return isElectron_1;
}
var getEnvironment;
var hasRequiredGetEnvironment;
function requireGetEnvironment() {
  if (hasRequiredGetEnvironment) return getEnvironment;
  hasRequiredGetEnvironment = 1;
  const isElectron = requireIsElectron();
  getEnvironment = (key) => {
    const env = {};
    if (typeof WorkerGlobalScope !== "undefined") {
      env.type = "webworker";
    } else if (isElectron()) {
      env.type = "electron";
    } else if (typeof document === "object") {
      env.type = "browser";
    } else if (typeof process === "object" && typeof commonjsRequire === "function") {
      env.type = "node";
    }
    if (typeof key === "undefined") {
      return env;
    }
    return env[key];
  };
  return getEnvironment;
}
var resolvePaths;
var hasRequiredResolvePaths;
function requireResolvePaths() {
  if (hasRequiredResolvePaths) return resolvePaths;
  hasRequiredResolvePaths = 1;
  const isBrowser = requireGetEnvironment()("type") === "browser";
  const resolveURL = isBrowser ? (s) => new URL(s, window.location.href).href : (s) => s;
  resolvePaths = (options) => {
    const opts = { ...options };
    ["corePath", "workerPath", "langPath"].forEach((key) => {
      if (options[key]) {
        opts[key] = resolveURL(opts[key]);
      }
    });
    return opts;
  };
  return resolvePaths;
}
var circularize;
var hasRequiredCircularize;
function requireCircularize() {
  if (hasRequiredCircularize) return circularize;
  hasRequiredCircularize = 1;
  circularize = (page) => {
    const blocks = [];
    const paragraphs = [];
    const lines = [];
    const words = [];
    const symbols = [];
    if (page.blocks) {
      page.blocks.forEach((block) => {
        block.paragraphs.forEach((paragraph) => {
          paragraph.lines.forEach((line) => {
            line.words.forEach((word) => {
              word.symbols.forEach((sym) => {
                symbols.push({
                  ...sym,
                  page,
                  block,
                  paragraph,
                  line,
                  word
                });
              });
              words.push({
                ...word,
                page,
                block,
                paragraph,
                line
              });
            });
            lines.push({
              ...line,
              page,
              block,
              paragraph
            });
          });
          paragraphs.push({
            ...paragraph,
            page,
            block
          });
        });
        blocks.push({
          ...block,
          page
        });
      });
    }
    return {
      ...page,
      blocks,
      paragraphs,
      lines,
      words,
      symbols
    };
  };
  return circularize;
}
var OEM;
var hasRequiredOEM;
function requireOEM() {
  if (hasRequiredOEM) return OEM;
  hasRequiredOEM = 1;
  OEM = {
    TESSERACT_ONLY: 0,
    LSTM_ONLY: 1,
    TESSERACT_LSTM_COMBINED: 2,
    DEFAULT: 3
  };
  return OEM;
}
const version = "5.1.1";
const require$$0 = {
  version
};
var defaultOptions;
var hasRequiredDefaultOptions$1;
function requireDefaultOptions$1() {
  if (hasRequiredDefaultOptions$1) return defaultOptions;
  hasRequiredDefaultOptions$1 = 1;
  defaultOptions = {
    /*
     * Use BlobURL for worker script by default
     * TODO: remove this option
     *
     */
    workerBlobURL: true,
    logger: () => {
    }
  };
  return defaultOptions;
}
var defaultOptions_1;
var hasRequiredDefaultOptions;
function requireDefaultOptions() {
  if (hasRequiredDefaultOptions) return defaultOptions_1;
  hasRequiredDefaultOptions = 1;
  const version2 = require$$0.version;
  const defaultOptions2 = requireDefaultOptions$1();
  defaultOptions_1 = {
    ...defaultOptions2,
    workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@v${version2}/dist/worker.min.js`
  };
  return defaultOptions_1;
}
var spawnWorker;
var hasRequiredSpawnWorker;
function requireSpawnWorker() {
  if (hasRequiredSpawnWorker) return spawnWorker;
  hasRequiredSpawnWorker = 1;
  spawnWorker = ({ workerPath, workerBlobURL }) => {
    let worker;
    if (Blob && URL && workerBlobURL) {
      const blob = new Blob([`importScripts("${workerPath}");`], {
        type: "application/javascript"
      });
      worker = new Worker(URL.createObjectURL(blob));
    } else {
      worker = new Worker(workerPath);
    }
    return worker;
  };
  return spawnWorker;
}
var terminateWorker;
var hasRequiredTerminateWorker;
function requireTerminateWorker() {
  if (hasRequiredTerminateWorker) return terminateWorker;
  hasRequiredTerminateWorker = 1;
  terminateWorker = (worker) => {
    worker.terminate();
  };
  return terminateWorker;
}
var onMessage;
var hasRequiredOnMessage;
function requireOnMessage() {
  if (hasRequiredOnMessage) return onMessage;
  hasRequiredOnMessage = 1;
  onMessage = (worker, handler) => {
    worker.onmessage = ({ data }) => {
      handler(data);
    };
  };
  return onMessage;
}
var send;
var hasRequiredSend;
function requireSend() {
  if (hasRequiredSend) return send;
  hasRequiredSend = 1;
  send = async (worker, packet) => {
    worker.postMessage(packet);
  };
  return send;
}
var loadImage_1;
var hasRequiredLoadImage;
function requireLoadImage() {
  if (hasRequiredLoadImage) return loadImage_1;
  hasRequiredLoadImage = 1;
  const readFromBlobOrFile = (blob) => new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = () => {
      resolve(fileReader.result);
    };
    fileReader.onerror = ({ target: { error: { code } } }) => {
      reject(Error(`File could not be read! Code=${code}`));
    };
    fileReader.readAsArrayBuffer(blob);
  });
  const loadImage = async (image) => {
    let data = image;
    if (typeof image === "undefined") {
      return "undefined";
    }
    if (typeof image === "string") {
      if (/data:image\/([a-zA-Z]*);base64,([^"]*)/.test(image)) {
        data = atob(image.split(",")[1]).split("").map((c) => c.charCodeAt(0));
      } else {
        const resp = await fetch(image);
        data = await resp.arrayBuffer();
      }
    } else if (typeof HTMLElement !== "undefined" && image instanceof HTMLElement) {
      if (image.tagName === "IMG") {
        data = await loadImage(image.src);
      }
      if (image.tagName === "VIDEO") {
        data = await loadImage(image.poster);
      }
      if (image.tagName === "CANVAS") {
        await new Promise((resolve) => {
          image.toBlob(async (blob) => {
            data = await readFromBlobOrFile(blob);
            resolve();
          });
        });
      }
    } else if (typeof OffscreenCanvas !== "undefined" && image instanceof OffscreenCanvas) {
      const blob = await image.convertToBlob();
      data = await readFromBlobOrFile(blob);
    } else if (image instanceof File || image instanceof Blob) {
      data = await readFromBlobOrFile(image);
    }
    return new Uint8Array(data);
  };
  loadImage_1 = loadImage;
  return loadImage_1;
}
var browser;
var hasRequiredBrowser;
function requireBrowser() {
  if (hasRequiredBrowser) return browser;
  hasRequiredBrowser = 1;
  const defaultOptions2 = requireDefaultOptions();
  const spawnWorker2 = requireSpawnWorker();
  const terminateWorker2 = requireTerminateWorker();
  const onMessage2 = requireOnMessage();
  const send2 = requireSend();
  const loadImage = requireLoadImage();
  browser = {
    defaultOptions: defaultOptions2,
    spawnWorker: spawnWorker2,
    terminateWorker: terminateWorker2,
    onMessage: onMessage2,
    send: send2,
    loadImage
  };
  return browser;
}
var createWorker;
var hasRequiredCreateWorker;
function requireCreateWorker() {
  if (hasRequiredCreateWorker) return createWorker;
  hasRequiredCreateWorker = 1;
  const resolvePaths2 = requireResolvePaths();
  const circularize2 = requireCircularize();
  const createJob2 = requireCreateJob();
  const { log: log2 } = requireLog();
  const getId2 = requireGetId();
  const OEM2 = requireOEM();
  const {
    defaultOptions: defaultOptions2,
    spawnWorker: spawnWorker2,
    terminateWorker: terminateWorker2,
    onMessage: onMessage2,
    loadImage,
    send: send2
  } = requireBrowser();
  let workerCounter = 0;
  createWorker = async (langs = "eng", oem = OEM2.LSTM_ONLY, _options = {}, config = {}) => {
    const id = getId2("Worker", workerCounter);
    const {
      logger,
      errorHandler,
      ...options
    } = resolvePaths2({
      ...defaultOptions2,
      ..._options
    });
    const resolves = {};
    const rejects = {};
    const currentLangs = typeof langs === "string" ? langs.split("+") : langs;
    let currentOem = oem;
    let currentConfig = config;
    const lstmOnlyCore = [OEM2.DEFAULT, OEM2.LSTM_ONLY].includes(oem) && !options.legacyCore;
    let workerResReject;
    let workerResResolve;
    const workerRes = new Promise((resolve, reject) => {
      workerResResolve = resolve;
      workerResReject = reject;
    });
    const workerError = (event) => {
      workerResReject(event.message);
    };
    let worker = spawnWorker2(options);
    worker.onerror = workerError;
    workerCounter += 1;
    const setResolve = (promiseId, res) => {
      resolves[promiseId] = res;
    };
    const setReject = (promiseId, rej) => {
      rejects[promiseId] = rej;
    };
    const startJob = ({ id: jobId, action, payload }) => new Promise((resolve, reject) => {
      log2(`[${id}]: Start ${jobId}, action=${action}`);
      const promiseId = `${action}-${jobId}`;
      setResolve(promiseId, resolve);
      setReject(promiseId, reject);
      send2(worker, {
        workerId: id,
        jobId,
        action,
        payload
      });
    });
    const load = () => console.warn("`load` is depreciated and should be removed from code (workers now come pre-loaded)");
    const loadInternal = (jobId) => startJob(createJob2({
      id: jobId,
      action: "load",
      payload: { options: { lstmOnly: lstmOnlyCore, corePath: options.corePath, logging: options.logging } }
    }));
    const writeText = (path, text, jobId) => startJob(createJob2({
      id: jobId,
      action: "FS",
      payload: { method: "writeFile", args: [path, text] }
    }));
    const readText = (path, jobId) => startJob(createJob2({
      id: jobId,
      action: "FS",
      payload: { method: "readFile", args: [path, { encoding: "utf8" }] }
    }));
    const removeFile = (path, jobId) => startJob(createJob2({
      id: jobId,
      action: "FS",
      payload: { method: "unlink", args: [path] }
    }));
    const FS = (method, args, jobId) => startJob(createJob2({
      id: jobId,
      action: "FS",
      payload: { method, args }
    }));
    const loadLanguage = () => console.warn("`loadLanguage` is depreciated and should be removed from code (workers now come with language pre-loaded)");
    const loadLanguageInternal = (_langs, jobId) => startJob(createJob2({
      id: jobId,
      action: "loadLanguage",
      payload: {
        langs: _langs,
        options: {
          langPath: options.langPath,
          dataPath: options.dataPath,
          cachePath: options.cachePath,
          cacheMethod: options.cacheMethod,
          gzip: options.gzip,
          lstmOnly: [OEM2.DEFAULT, OEM2.LSTM_ONLY].includes(currentOem) && !options.legacyLang
        }
      }
    }));
    const initialize = () => console.warn("`initialize` is depreciated and should be removed from code (workers now come pre-initialized)");
    const initializeInternal = (_langs, _oem, _config, jobId) => startJob(createJob2({
      id: jobId,
      action: "initialize",
      payload: { langs: _langs, oem: _oem, config: _config }
    }));
    const reinitialize = (langs2 = "eng", oem2, config2, jobId) => {
      if (lstmOnlyCore && [OEM2.TESSERACT_ONLY, OEM2.TESSERACT_LSTM_COMBINED].includes(oem2)) throw Error("Legacy model requested but code missing.");
      const _oem = oem2 || currentOem;
      currentOem = _oem;
      const _config = config2 || currentConfig;
      currentConfig = _config;
      const langsArr = typeof langs2 === "string" ? langs2.split("+") : langs2;
      const _langs = langsArr.filter((x) => !currentLangs.includes(x));
      currentLangs.push(..._langs);
      if (_langs.length > 0) {
        return loadLanguageInternal(_langs, jobId).then(() => initializeInternal(langs2, _oem, _config, jobId));
      }
      return initializeInternal(langs2, _oem, _config, jobId);
    };
    const setParameters = (params = {}, jobId) => startJob(createJob2({
      id: jobId,
      action: "setParameters",
      payload: { params }
    }));
    const recognize = async (image, opts = {}, output = {
      blocks: true,
      text: true,
      hocr: true,
      tsv: true
    }, jobId) => startJob(createJob2({
      id: jobId,
      action: "recognize",
      payload: { image: await loadImage(image), options: opts, output }
    }));
    const getPDF = (title = "Tesseract OCR Result", textonly = false, jobId) => {
      console.log("`getPDF` function is depreciated. `recognize` option `savePDF` should be used instead.");
      return startJob(createJob2({
        id: jobId,
        action: "getPDF",
        payload: { title, textonly }
      }));
    };
    const detect = async (image, jobId) => {
      if (lstmOnlyCore) throw Error("`worker.detect` requires Legacy model, which was not loaded.");
      return startJob(createJob2({
        id: jobId,
        action: "detect",
        payload: { image: await loadImage(image) }
      }));
    };
    const terminate = async () => {
      if (worker !== null) {
        terminateWorker2(worker);
        worker = null;
      }
      return Promise.resolve();
    };
    onMessage2(worker, ({
      workerId,
      jobId,
      status,
      action,
      data
    }) => {
      const promiseId = `${action}-${jobId}`;
      if (status === "resolve") {
        log2(`[${workerId}]: Complete ${jobId}`);
        let d = data;
        if (action === "recognize") {
          d = circularize2(data);
        } else if (action === "getPDF") {
          d = Array.from({ ...data, length: Object.keys(data).length });
        }
        resolves[promiseId]({ jobId, data: d });
      } else if (status === "reject") {
        rejects[promiseId](data);
        if (action === "load") workerResReject(data);
        if (errorHandler) {
          errorHandler(data);
        } else {
          throw Error(data);
        }
      } else if (status === "progress") {
        logger({ ...data, userJobId: jobId });
      }
    });
    const resolveObj = {
      id,
      worker,
      setResolve,
      setReject,
      load,
      writeText,
      readText,
      removeFile,
      FS,
      loadLanguage,
      initialize,
      reinitialize,
      setParameters,
      recognize,
      getPDF,
      detect,
      terminate
    };
    loadInternal().then(() => loadLanguageInternal(langs)).then(() => initializeInternal(langs, oem, config)).then(() => workerResResolve(resolveObj)).catch(() => {
    });
    return workerRes;
  };
  return createWorker;
}
var Tesseract;
var hasRequiredTesseract;
function requireTesseract() {
  if (hasRequiredTesseract) return Tesseract;
  hasRequiredTesseract = 1;
  const createWorker2 = requireCreateWorker();
  const recognize = async (image, langs, options) => {
    const worker = await createWorker2(langs, 1, options);
    return worker.recognize(image).finally(async () => {
      await worker.terminate();
    });
  };
  const detect = async (image, options) => {
    const worker = await createWorker2("osd", 0, options);
    return worker.detect(image).finally(async () => {
      await worker.terminate();
    });
  };
  Tesseract = {
    recognize,
    detect
  };
  return Tesseract;
}
var languages;
var hasRequiredLanguages;
function requireLanguages() {
  if (hasRequiredLanguages) return languages;
  hasRequiredLanguages = 1;
  languages = {
    AFR: "afr",
    AMH: "amh",
    ARA: "ara",
    ASM: "asm",
    AZE: "aze",
    AZE_CYRL: "aze_cyrl",
    BEL: "bel",
    BEN: "ben",
    BOD: "bod",
    BOS: "bos",
    BUL: "bul",
    CAT: "cat",
    CEB: "ceb",
    CES: "ces",
    CHI_SIM: "chi_sim",
    CHI_TRA: "chi_tra",
    CHR: "chr",
    CYM: "cym",
    DAN: "dan",
    DEU: "deu",
    DZO: "dzo",
    ELL: "ell",
    ENG: "eng",
    ENM: "enm",
    EPO: "epo",
    EST: "est",
    EUS: "eus",
    FAS: "fas",
    FIN: "fin",
    FRA: "fra",
    FRK: "frk",
    FRM: "frm",
    GLE: "gle",
    GLG: "glg",
    GRC: "grc",
    GUJ: "guj",
    HAT: "hat",
    HEB: "heb",
    HIN: "hin",
    HRV: "hrv",
    HUN: "hun",
    IKU: "iku",
    IND: "ind",
    ISL: "isl",
    ITA: "ita",
    ITA_OLD: "ita_old",
    JAV: "jav",
    JPN: "jpn",
    KAN: "kan",
    KAT: "kat",
    KAT_OLD: "kat_old",
    KAZ: "kaz",
    KHM: "khm",
    KIR: "kir",
    KOR: "kor",
    KUR: "kur",
    LAO: "lao",
    LAT: "lat",
    LAV: "lav",
    LIT: "lit",
    MAL: "mal",
    MAR: "mar",
    MKD: "mkd",
    MLT: "mlt",
    MSA: "msa",
    MYA: "mya",
    NEP: "nep",
    NLD: "nld",
    NOR: "nor",
    ORI: "ori",
    PAN: "pan",
    POL: "pol",
    POR: "por",
    PUS: "pus",
    RON: "ron",
    RUS: "rus",
    SAN: "san",
    SIN: "sin",
    SLK: "slk",
    SLV: "slv",
    SPA: "spa",
    SPA_OLD: "spa_old",
    SQI: "sqi",
    SRP: "srp",
    SRP_LATN: "srp_latn",
    SWA: "swa",
    SWE: "swe",
    SYR: "syr",
    TAM: "tam",
    TEL: "tel",
    TGK: "tgk",
    TGL: "tgl",
    THA: "tha",
    TIR: "tir",
    TUR: "tur",
    UIG: "uig",
    UKR: "ukr",
    URD: "urd",
    UZB: "uzb",
    UZB_CYRL: "uzb_cyrl",
    VIE: "vie",
    YID: "yid"
  };
  return languages;
}
var PSM;
var hasRequiredPSM;
function requirePSM() {
  if (hasRequiredPSM) return PSM;
  hasRequiredPSM = 1;
  PSM = {
    OSD_ONLY: "0",
    AUTO_OSD: "1",
    AUTO_ONLY: "2",
    AUTO: "3",
    SINGLE_COLUMN: "4",
    SINGLE_BLOCK_VERT_TEXT: "5",
    SINGLE_BLOCK: "6",
    SINGLE_LINE: "7",
    SINGLE_WORD: "8",
    CIRCLE_WORD: "9",
    SINGLE_CHAR: "10",
    SPARSE_TEXT: "11",
    SPARSE_TEXT_OSD: "12",
    RAW_LINE: "13"
  };
  return PSM;
}
var src;
var hasRequiredSrc;
function requireSrc() {
  if (hasRequiredSrc) return src;
  hasRequiredSrc = 1;
  requireRuntime();
  const createScheduler2 = requireCreateScheduler();
  const createWorker2 = requireCreateWorker();
  const Tesseract2 = requireTesseract();
  const languages2 = requireLanguages();
  const OEM2 = requireOEM();
  const PSM2 = requirePSM();
  const { setLogging } = requireLog();
  src = {
    languages: languages2,
    OEM: OEM2,
    PSM: PSM2,
    createScheduler: createScheduler2,
    createWorker: createWorker2,
    setLogging,
    ...Tesseract2
  };
  return src;
}
var srcExports = requireSrc();
const index = /* @__PURE__ */ getDefaultExportFromCjs(srcExports);
const index$1 = /* @__PURE__ */ _mergeNamespaces({
  __proto__: null,
  default: index
}, [srcExports]);
export {
  index$1 as i
};
//# sourceMappingURL=index-C7Jv7g1J.js.map
