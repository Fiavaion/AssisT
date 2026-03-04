/*! @license DOMPurify 3.3.1 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.3.1/LICENSE */
const {
  entries,
  setPrototypeOf,
  isFrozen,
  getPrototypeOf,
  getOwnPropertyDescriptor
} = Object;
let {
  freeze,
  seal,
  create
} = Object;
let {
  apply,
  construct
} = typeof Reflect !== "undefined" && Reflect;
if (!freeze) {
  freeze = function freeze2(x2) {
    return x2;
  };
}
if (!seal) {
  seal = function seal2(x2) {
    return x2;
  };
}
if (!apply) {
  apply = function apply2(func, thisArg) {
    for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
      args[_key - 2] = arguments[_key];
    }
    return func.apply(thisArg, args);
  };
}
if (!construct) {
  construct = function construct2(Func) {
    for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
      args[_key2 - 1] = arguments[_key2];
    }
    return new Func(...args);
  };
}
const arrayForEach = unapply(Array.prototype.forEach);
const arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
const arrayPop = unapply(Array.prototype.pop);
const arrayPush = unapply(Array.prototype.push);
const arraySplice = unapply(Array.prototype.splice);
const stringToLowerCase = unapply(String.prototype.toLowerCase);
const stringToString = unapply(String.prototype.toString);
const stringMatch = unapply(String.prototype.match);
const stringReplace = unapply(String.prototype.replace);
const stringIndexOf = unapply(String.prototype.indexOf);
const stringTrim = unapply(String.prototype.trim);
const objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
const regExpTest = unapply(RegExp.prototype.test);
const typeErrorCreate = unconstruct(TypeError);
function unapply(func) {
  return function(thisArg) {
    if (thisArg instanceof RegExp) {
      thisArg.lastIndex = 0;
    }
    for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
      args[_key3 - 1] = arguments[_key3];
    }
    return apply(func, thisArg, args);
  };
}
function unconstruct(Func) {
  return function() {
    for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      args[_key4] = arguments[_key4];
    }
    return construct(Func, args);
  };
}
function addToSet(set, array) {
  let transformCaseFunc = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : stringToLowerCase;
  if (setPrototypeOf) {
    setPrototypeOf(set, null);
  }
  let l2 = array.length;
  while (l2--) {
    let element = array[l2];
    if (typeof element === "string") {
      const lcElement = transformCaseFunc(element);
      if (lcElement !== element) {
        if (!isFrozen(array)) {
          array[l2] = lcElement;
        }
        element = lcElement;
      }
    }
    set[element] = true;
  }
  return set;
}
function cleanArray(array) {
  for (let index = 0; index < array.length; index++) {
    const isPropertyExist = objectHasOwnProperty(array, index);
    if (!isPropertyExist) {
      array[index] = null;
    }
  }
  return array;
}
function clone(object) {
  const newObject = create(null);
  for (const [property, value] of entries(object)) {
    const isPropertyExist = objectHasOwnProperty(object, property);
    if (isPropertyExist) {
      if (Array.isArray(value)) {
        newObject[property] = cleanArray(value);
      } else if (value && typeof value === "object" && value.constructor === Object) {
        newObject[property] = clone(value);
      } else {
        newObject[property] = value;
      }
    }
  }
  return newObject;
}
function lookupGetter(object, prop) {
  while (object !== null) {
    const desc = getOwnPropertyDescriptor(object, prop);
    if (desc) {
      if (desc.get) {
        return unapply(desc.get);
      }
      if (typeof desc.value === "function") {
        return unapply(desc.value);
      }
    }
    object = getPrototypeOf(object);
  }
  function fallbackValue() {
    return null;
  }
  return fallbackValue;
}
const html$1 = freeze(["a", "abbr", "acronym", "address", "area", "article", "aside", "audio", "b", "bdi", "bdo", "big", "blink", "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup", "content", "data", "datalist", "dd", "decorator", "del", "details", "dfn", "dialog", "dir", "div", "dl", "dt", "element", "em", "fieldset", "figcaption", "figure", "font", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "img", "input", "ins", "kbd", "label", "legend", "li", "main", "map", "mark", "marquee", "menu", "menuitem", "meter", "nav", "nobr", "ol", "optgroup", "option", "output", "p", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "search", "section", "select", "shadow", "slot", "small", "source", "spacer", "span", "strike", "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "tr", "track", "tt", "u", "ul", "var", "video", "wbr"]);
const svg$1 = freeze(["svg", "a", "altglyph", "altglyphdef", "altglyphitem", "animatecolor", "animatemotion", "animatetransform", "circle", "clippath", "defs", "desc", "ellipse", "enterkeyhint", "exportparts", "filter", "font", "g", "glyph", "glyphref", "hkern", "image", "inputmode", "line", "lineargradient", "marker", "mask", "metadata", "mpath", "part", "path", "pattern", "polygon", "polyline", "radialgradient", "rect", "stop", "style", "switch", "symbol", "text", "textpath", "title", "tref", "tspan", "view", "vkern"]);
const svgFilters = freeze(["feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence"]);
const svgDisallowed = freeze(["animate", "color-profile", "cursor", "discard", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "foreignobject", "hatch", "hatchpath", "mesh", "meshgradient", "meshpatch", "meshrow", "missing-glyph", "script", "set", "solidcolor", "unknown", "use"]);
const mathMl$1 = freeze(["math", "menclose", "merror", "mfenced", "mfrac", "mglyph", "mi", "mlabeledtr", "mmultiscripts", "mn", "mo", "mover", "mpadded", "mphantom", "mroot", "mrow", "ms", "mspace", "msqrt", "mstyle", "msub", "msup", "msubsup", "mtable", "mtd", "mtext", "mtr", "munder", "munderover", "mprescripts"]);
const mathMlDisallowed = freeze(["maction", "maligngroup", "malignmark", "mlongdiv", "mscarries", "mscarry", "msgroup", "mstack", "msline", "msrow", "semantics", "annotation", "annotation-xml", "mprescripts", "none"]);
const text = freeze(["#text"]);
const html = freeze(["accept", "action", "align", "alt", "autocapitalize", "autocomplete", "autopictureinpicture", "autoplay", "background", "bgcolor", "border", "capture", "cellpadding", "cellspacing", "checked", "cite", "class", "clear", "color", "cols", "colspan", "controls", "controlslist", "coords", "crossorigin", "datetime", "decoding", "default", "dir", "disabled", "disablepictureinpicture", "disableremoteplayback", "download", "draggable", "enctype", "enterkeyhint", "exportparts", "face", "for", "headers", "height", "hidden", "high", "href", "hreflang", "id", "inert", "inputmode", "integrity", "ismap", "kind", "label", "lang", "list", "loading", "loop", "low", "max", "maxlength", "media", "method", "min", "minlength", "multiple", "muted", "name", "nonce", "noshade", "novalidate", "nowrap", "open", "optimum", "part", "pattern", "placeholder", "playsinline", "popover", "popovertarget", "popovertargetaction", "poster", "preload", "pubdate", "radiogroup", "readonly", "rel", "required", "rev", "reversed", "role", "rows", "rowspan", "spellcheck", "scope", "selected", "shape", "size", "sizes", "slot", "span", "srclang", "start", "src", "srcset", "step", "style", "summary", "tabindex", "title", "translate", "type", "usemap", "valign", "value", "width", "wrap", "xmlns", "slot"]);
const svg = freeze(["accent-height", "accumulate", "additive", "alignment-baseline", "amplitude", "ascent", "attributename", "attributetype", "azimuth", "basefrequency", "baseline-shift", "begin", "bias", "by", "class", "clip", "clippathunits", "clip-path", "clip-rule", "color", "color-interpolation", "color-interpolation-filters", "color-profile", "color-rendering", "cx", "cy", "d", "dx", "dy", "diffuseconstant", "direction", "display", "divisor", "dur", "edgemode", "elevation", "end", "exponent", "fill", "fill-opacity", "fill-rule", "filter", "filterunits", "flood-color", "flood-opacity", "font-family", "font-size", "font-size-adjust", "font-stretch", "font-style", "font-variant", "font-weight", "fx", "fy", "g1", "g2", "glyph-name", "glyphref", "gradientunits", "gradienttransform", "height", "href", "id", "image-rendering", "in", "in2", "intercept", "k", "k1", "k2", "k3", "k4", "kerning", "keypoints", "keysplines", "keytimes", "lang", "lengthadjust", "letter-spacing", "kernelmatrix", "kernelunitlength", "lighting-color", "local", "marker-end", "marker-mid", "marker-start", "markerheight", "markerunits", "markerwidth", "maskcontentunits", "maskunits", "max", "mask", "mask-type", "media", "method", "mode", "min", "name", "numoctaves", "offset", "operator", "opacity", "order", "orient", "orientation", "origin", "overflow", "paint-order", "path", "pathlength", "patterncontentunits", "patterntransform", "patternunits", "points", "preservealpha", "preserveaspectratio", "primitiveunits", "r", "rx", "ry", "radius", "refx", "refy", "repeatcount", "repeatdur", "restart", "result", "rotate", "scale", "seed", "shape-rendering", "slope", "specularconstant", "specularexponent", "spreadmethod", "startoffset", "stddeviation", "stitchtiles", "stop-color", "stop-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke", "stroke-width", "style", "surfacescale", "systemlanguage", "tabindex", "tablevalues", "targetx", "targety", "transform", "transform-origin", "text-anchor", "text-decoration", "text-rendering", "textlength", "type", "u1", "u2", "unicode", "values", "viewbox", "visibility", "version", "vert-adv-y", "vert-origin-x", "vert-origin-y", "width", "word-spacing", "wrap", "writing-mode", "xchannelselector", "ychannelselector", "x", "x1", "x2", "xmlns", "y", "y1", "y2", "z", "zoomandpan"]);
const mathMl = freeze(["accent", "accentunder", "align", "bevelled", "close", "columnsalign", "columnlines", "columnspan", "denomalign", "depth", "dir", "display", "displaystyle", "encoding", "fence", "frame", "height", "href", "id", "largeop", "length", "linethickness", "lspace", "lquote", "mathbackground", "mathcolor", "mathsize", "mathvariant", "maxsize", "minsize", "movablelimits", "notation", "numalign", "open", "rowalign", "rowlines", "rowspacing", "rowspan", "rspace", "rquote", "scriptlevel", "scriptminsize", "scriptsizemultiplier", "selection", "separator", "separators", "stretchy", "subscriptshift", "supscriptshift", "symmetric", "voffset", "width", "xmlns"]);
const xml = freeze(["xlink:href", "xml:id", "xlink:title", "xml:space", "xmlns:xlink"]);
const MUSTACHE_EXPR = seal(/\{\{[\w\W]*|[\w\W]*\}\}/gm);
const ERB_EXPR = seal(/<%[\w\W]*|[\w\W]*%>/gm);
const TMPLIT_EXPR = seal(/\$\{[\w\W]*/gm);
const DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/);
const ARIA_ATTR = seal(/^aria-[\-\w]+$/);
const IS_ALLOWED_URI = seal(
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
  // eslint-disable-line no-useless-escape
);
const IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
const ATTR_WHITESPACE = seal(
  /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g
  // eslint-disable-line no-control-regex
);
const DOCTYPE_NAME = seal(/^html$/i);
const CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);
var EXPRESSIONS = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  ARIA_ATTR,
  ATTR_WHITESPACE,
  CUSTOM_ELEMENT,
  DATA_ATTR,
  DOCTYPE_NAME,
  ERB_EXPR,
  IS_ALLOWED_URI,
  IS_SCRIPT_OR_DATA,
  MUSTACHE_EXPR,
  TMPLIT_EXPR
});
const NODE_TYPE = {
  element: 1,
  text: 3,
  // Deprecated
  progressingInstruction: 7,
  comment: 8,
  document: 9
};
const getGlobal = function getGlobal2() {
  return typeof window === "undefined" ? null : window;
};
const _createTrustedTypesPolicy = function _createTrustedTypesPolicy2(trustedTypes, purifyHostElement) {
  if (typeof trustedTypes !== "object" || typeof trustedTypes.createPolicy !== "function") {
    return null;
  }
  let suffix = null;
  const ATTR_NAME = "data-tt-policy-suffix";
  if (purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME)) {
    suffix = purifyHostElement.getAttribute(ATTR_NAME);
  }
  const policyName = "dompurify" + (suffix ? "#" + suffix : "");
  try {
    return trustedTypes.createPolicy(policyName, {
      createHTML(html2) {
        return html2;
      },
      createScriptURL(scriptUrl) {
        return scriptUrl;
      }
    });
  } catch (_2) {
    console.warn("TrustedTypes policy " + policyName + " could not be created.");
    return null;
  }
};
const _createHooksMap = function _createHooksMap2() {
  return {
    afterSanitizeAttributes: [],
    afterSanitizeElements: [],
    afterSanitizeShadowDOM: [],
    beforeSanitizeAttributes: [],
    beforeSanitizeElements: [],
    beforeSanitizeShadowDOM: [],
    uponSanitizeAttribute: [],
    uponSanitizeElement: [],
    uponSanitizeShadowNode: []
  };
};
function createDOMPurify() {
  let window2 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : getGlobal();
  const DOMPurify = (root) => createDOMPurify(root);
  DOMPurify.version = "3.3.1";
  DOMPurify.removed = [];
  if (!window2 || !window2.document || window2.document.nodeType !== NODE_TYPE.document || !window2.Element) {
    DOMPurify.isSupported = false;
    return DOMPurify;
  }
  let {
    document: document2
  } = window2;
  const originalDocument = document2;
  const currentScript = originalDocument.currentScript;
  const {
    DocumentFragment,
    HTMLTemplateElement,
    Node,
    Element,
    NodeFilter,
    NamedNodeMap = window2.NamedNodeMap || window2.MozNamedAttrMap,
    HTMLFormElement,
    DOMParser,
    trustedTypes
  } = window2;
  const ElementPrototype = Element.prototype;
  const cloneNode = lookupGetter(ElementPrototype, "cloneNode");
  const remove = lookupGetter(ElementPrototype, "remove");
  const getNextSibling = lookupGetter(ElementPrototype, "nextSibling");
  const getChildNodes = lookupGetter(ElementPrototype, "childNodes");
  const getParentNode = lookupGetter(ElementPrototype, "parentNode");
  if (typeof HTMLTemplateElement === "function") {
    const template = document2.createElement("template");
    if (template.content && template.content.ownerDocument) {
      document2 = template.content.ownerDocument;
    }
  }
  let trustedTypesPolicy;
  let emptyHTML = "";
  const {
    implementation,
    createNodeIterator,
    createDocumentFragment,
    getElementsByTagName
  } = document2;
  const {
    importNode
  } = originalDocument;
  let hooks = _createHooksMap();
  DOMPurify.isSupported = typeof entries === "function" && typeof getParentNode === "function" && implementation && implementation.createHTMLDocument !== void 0;
  const {
    MUSTACHE_EXPR: MUSTACHE_EXPR2,
    ERB_EXPR: ERB_EXPR2,
    TMPLIT_EXPR: TMPLIT_EXPR2,
    DATA_ATTR: DATA_ATTR2,
    ARIA_ATTR: ARIA_ATTR2,
    IS_SCRIPT_OR_DATA: IS_SCRIPT_OR_DATA2,
    ATTR_WHITESPACE: ATTR_WHITESPACE2,
    CUSTOM_ELEMENT: CUSTOM_ELEMENT2
  } = EXPRESSIONS;
  let {
    IS_ALLOWED_URI: IS_ALLOWED_URI$1
  } = EXPRESSIONS;
  let ALLOWED_TAGS = null;
  const DEFAULT_ALLOWED_TAGS = addToSet({}, [...html$1, ...svg$1, ...svgFilters, ...mathMl$1, ...text]);
  let ALLOWED_ATTR = null;
  const DEFAULT_ALLOWED_ATTR = addToSet({}, [...html, ...svg, ...mathMl, ...xml]);
  let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
    tagNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeNameCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    allowCustomizedBuiltInElements: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: false
    }
  }));
  let FORBID_TAGS = null;
  let FORBID_ATTR = null;
  const EXTRA_ELEMENT_HANDLING = Object.seal(create(null, {
    tagCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    },
    attributeCheck: {
      writable: true,
      configurable: false,
      enumerable: true,
      value: null
    }
  }));
  let ALLOW_ARIA_ATTR = true;
  let ALLOW_DATA_ATTR = true;
  let ALLOW_UNKNOWN_PROTOCOLS = false;
  let ALLOW_SELF_CLOSE_IN_ATTR = true;
  let SAFE_FOR_TEMPLATES = false;
  let SAFE_FOR_XML = true;
  let WHOLE_DOCUMENT = false;
  let SET_CONFIG = false;
  let FORCE_BODY = false;
  let RETURN_DOM = false;
  let RETURN_DOM_FRAGMENT = false;
  let RETURN_TRUSTED_TYPE = false;
  let SANITIZE_DOM = true;
  let SANITIZE_NAMED_PROPS = false;
  const SANITIZE_NAMED_PROPS_PREFIX = "user-content-";
  let KEEP_CONTENT = true;
  let IN_PLACE = false;
  let USE_PROFILES = {};
  let FORBID_CONTENTS = null;
  const DEFAULT_FORBID_CONTENTS = addToSet({}, ["annotation-xml", "audio", "colgroup", "desc", "foreignobject", "head", "iframe", "math", "mi", "mn", "mo", "ms", "mtext", "noembed", "noframes", "noscript", "plaintext", "script", "style", "svg", "template", "thead", "title", "video", "xmp"]);
  let DATA_URI_TAGS = null;
  const DEFAULT_DATA_URI_TAGS = addToSet({}, ["audio", "video", "img", "source", "image", "track"]);
  let URI_SAFE_ATTRIBUTES = null;
  const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, ["alt", "class", "for", "id", "label", "name", "pattern", "placeholder", "role", "summary", "title", "value", "style", "xmlns"]);
  const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
  let NAMESPACE = HTML_NAMESPACE;
  let IS_EMPTY_INPUT = false;
  let ALLOWED_NAMESPACES = null;
  const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [MATHML_NAMESPACE, SVG_NAMESPACE, HTML_NAMESPACE], stringToString);
  let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, ["mi", "mo", "mn", "ms", "mtext"]);
  let HTML_INTEGRATION_POINTS = addToSet({}, ["annotation-xml"]);
  const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, ["title", "style", "font", "a", "script"]);
  let PARSER_MEDIA_TYPE = null;
  const SUPPORTED_PARSER_MEDIA_TYPES = ["application/xhtml+xml", "text/html"];
  const DEFAULT_PARSER_MEDIA_TYPE = "text/html";
  let transformCaseFunc = null;
  let CONFIG = null;
  const formElement = document2.createElement("form");
  const isRegexOrFunction = function isRegexOrFunction2(testValue) {
    return testValue instanceof RegExp || testValue instanceof Function;
  };
  const _parseConfig = function _parseConfig2() {
    let cfg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
    if (CONFIG && CONFIG === cfg) {
      return;
    }
    if (!cfg || typeof cfg !== "object") {
      cfg = {};
    }
    cfg = clone(cfg);
    PARSER_MEDIA_TYPE = // eslint-disable-next-line unicorn/prefer-includes
    SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
    transformCaseFunc = PARSER_MEDIA_TYPE === "application/xhtml+xml" ? stringToString : stringToLowerCase;
    ALLOWED_TAGS = objectHasOwnProperty(cfg, "ALLOWED_TAGS") ? addToSet({}, cfg.ALLOWED_TAGS, transformCaseFunc) : DEFAULT_ALLOWED_TAGS;
    ALLOWED_ATTR = objectHasOwnProperty(cfg, "ALLOWED_ATTR") ? addToSet({}, cfg.ALLOWED_ATTR, transformCaseFunc) : DEFAULT_ALLOWED_ATTR;
    ALLOWED_NAMESPACES = objectHasOwnProperty(cfg, "ALLOWED_NAMESPACES") ? addToSet({}, cfg.ALLOWED_NAMESPACES, stringToString) : DEFAULT_ALLOWED_NAMESPACES;
    URI_SAFE_ATTRIBUTES = objectHasOwnProperty(cfg, "ADD_URI_SAFE_ATTR") ? addToSet(clone(DEFAULT_URI_SAFE_ATTRIBUTES), cfg.ADD_URI_SAFE_ATTR, transformCaseFunc) : DEFAULT_URI_SAFE_ATTRIBUTES;
    DATA_URI_TAGS = objectHasOwnProperty(cfg, "ADD_DATA_URI_TAGS") ? addToSet(clone(DEFAULT_DATA_URI_TAGS), cfg.ADD_DATA_URI_TAGS, transformCaseFunc) : DEFAULT_DATA_URI_TAGS;
    FORBID_CONTENTS = objectHasOwnProperty(cfg, "FORBID_CONTENTS") ? addToSet({}, cfg.FORBID_CONTENTS, transformCaseFunc) : DEFAULT_FORBID_CONTENTS;
    FORBID_TAGS = objectHasOwnProperty(cfg, "FORBID_TAGS") ? addToSet({}, cfg.FORBID_TAGS, transformCaseFunc) : clone({});
    FORBID_ATTR = objectHasOwnProperty(cfg, "FORBID_ATTR") ? addToSet({}, cfg.FORBID_ATTR, transformCaseFunc) : clone({});
    USE_PROFILES = objectHasOwnProperty(cfg, "USE_PROFILES") ? cfg.USE_PROFILES : false;
    ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false;
    ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false;
    ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false;
    ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false;
    SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false;
    SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false;
    WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false;
    RETURN_DOM = cfg.RETURN_DOM || false;
    RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false;
    RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false;
    FORCE_BODY = cfg.FORCE_BODY || false;
    SANITIZE_DOM = cfg.SANITIZE_DOM !== false;
    SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false;
    KEEP_CONTENT = cfg.KEEP_CONTENT !== false;
    IN_PLACE = cfg.IN_PLACE || false;
    IS_ALLOWED_URI$1 = cfg.ALLOWED_URI_REGEXP || IS_ALLOWED_URI;
    NAMESPACE = cfg.NAMESPACE || HTML_NAMESPACE;
    MATHML_TEXT_INTEGRATION_POINTS = cfg.MATHML_TEXT_INTEGRATION_POINTS || MATHML_TEXT_INTEGRATION_POINTS;
    HTML_INTEGRATION_POINTS = cfg.HTML_INTEGRATION_POINTS || HTML_INTEGRATION_POINTS;
    CUSTOM_ELEMENT_HANDLING = cfg.CUSTOM_ELEMENT_HANDLING || {};
    if (cfg.CUSTOM_ELEMENT_HANDLING && isRegexOrFunction(cfg.CUSTOM_ELEMENT_HANDLING.tagNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.tagNameCheck = cfg.CUSTOM_ELEMENT_HANDLING.tagNameCheck;
    }
    if (cfg.CUSTOM_ELEMENT_HANDLING && isRegexOrFunction(cfg.CUSTOM_ELEMENT_HANDLING.attributeNameCheck)) {
      CUSTOM_ELEMENT_HANDLING.attributeNameCheck = cfg.CUSTOM_ELEMENT_HANDLING.attributeNameCheck;
    }
    if (cfg.CUSTOM_ELEMENT_HANDLING && typeof cfg.CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements === "boolean") {
      CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = cfg.CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements;
    }
    if (SAFE_FOR_TEMPLATES) {
      ALLOW_DATA_ATTR = false;
    }
    if (RETURN_DOM_FRAGMENT) {
      RETURN_DOM = true;
    }
    if (USE_PROFILES) {
      ALLOWED_TAGS = addToSet({}, text);
      ALLOWED_ATTR = [];
      if (USE_PROFILES.html === true) {
        addToSet(ALLOWED_TAGS, html$1);
        addToSet(ALLOWED_ATTR, html);
      }
      if (USE_PROFILES.svg === true) {
        addToSet(ALLOWED_TAGS, svg$1);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.svgFilters === true) {
        addToSet(ALLOWED_TAGS, svgFilters);
        addToSet(ALLOWED_ATTR, svg);
        addToSet(ALLOWED_ATTR, xml);
      }
      if (USE_PROFILES.mathMl === true) {
        addToSet(ALLOWED_TAGS, mathMl$1);
        addToSet(ALLOWED_ATTR, mathMl);
        addToSet(ALLOWED_ATTR, xml);
      }
    }
    if (cfg.ADD_TAGS) {
      if (typeof cfg.ADD_TAGS === "function") {
        EXTRA_ELEMENT_HANDLING.tagCheck = cfg.ADD_TAGS;
      } else {
        if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) {
          ALLOWED_TAGS = clone(ALLOWED_TAGS);
        }
        addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
      }
    }
    if (cfg.ADD_ATTR) {
      if (typeof cfg.ADD_ATTR === "function") {
        EXTRA_ELEMENT_HANDLING.attributeCheck = cfg.ADD_ATTR;
      } else {
        if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) {
          ALLOWED_ATTR = clone(ALLOWED_ATTR);
        }
        addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
      }
    }
    if (cfg.ADD_URI_SAFE_ATTR) {
      addToSet(URI_SAFE_ATTRIBUTES, cfg.ADD_URI_SAFE_ATTR, transformCaseFunc);
    }
    if (cfg.FORBID_CONTENTS) {
      if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }
      addToSet(FORBID_CONTENTS, cfg.FORBID_CONTENTS, transformCaseFunc);
    }
    if (cfg.ADD_FORBID_CONTENTS) {
      if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
        FORBID_CONTENTS = clone(FORBID_CONTENTS);
      }
      addToSet(FORBID_CONTENTS, cfg.ADD_FORBID_CONTENTS, transformCaseFunc);
    }
    if (KEEP_CONTENT) {
      ALLOWED_TAGS["#text"] = true;
    }
    if (WHOLE_DOCUMENT) {
      addToSet(ALLOWED_TAGS, ["html", "head", "body"]);
    }
    if (ALLOWED_TAGS.table) {
      addToSet(ALLOWED_TAGS, ["tbody"]);
      delete FORBID_TAGS.tbody;
    }
    if (cfg.TRUSTED_TYPES_POLICY) {
      if (typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== "function") {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');
      }
      if (typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== "function") {
        throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');
      }
      trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
      emptyHTML = trustedTypesPolicy.createHTML("");
    } else {
      if (trustedTypesPolicy === void 0) {
        trustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
      }
      if (trustedTypesPolicy !== null && typeof emptyHTML === "string") {
        emptyHTML = trustedTypesPolicy.createHTML("");
      }
    }
    if (freeze) {
      freeze(cfg);
    }
    CONFIG = cfg;
  };
  const ALL_SVG_TAGS = addToSet({}, [...svg$1, ...svgFilters, ...svgDisallowed]);
  const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
  const _checkValidNamespace = function _checkValidNamespace2(element) {
    let parent = getParentNode(element);
    if (!parent || !parent.tagName) {
      parent = {
        namespaceURI: NAMESPACE,
        tagName: "template"
      };
    }
    const tagName = stringToLowerCase(element.tagName);
    const parentTagName = stringToLowerCase(parent.tagName);
    if (!ALLOWED_NAMESPACES[element.namespaceURI]) {
      return false;
    }
    if (element.namespaceURI === SVG_NAMESPACE) {
      if (parent.namespaceURI === HTML_NAMESPACE) {
        return tagName === "svg";
      }
      if (parent.namespaceURI === MATHML_NAMESPACE) {
        return tagName === "svg" && (parentTagName === "annotation-xml" || MATHML_TEXT_INTEGRATION_POINTS[parentTagName]);
      }
      return Boolean(ALL_SVG_TAGS[tagName]);
    }
    if (element.namespaceURI === MATHML_NAMESPACE) {
      if (parent.namespaceURI === HTML_NAMESPACE) {
        return tagName === "math";
      }
      if (parent.namespaceURI === SVG_NAMESPACE) {
        return tagName === "math" && HTML_INTEGRATION_POINTS[parentTagName];
      }
      return Boolean(ALL_MATHML_TAGS[tagName]);
    }
    if (element.namespaceURI === HTML_NAMESPACE) {
      if (parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName]) {
        return false;
      }
      if (parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName]) {
        return false;
      }
      return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName]);
    }
    if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && ALLOWED_NAMESPACES[element.namespaceURI]) {
      return true;
    }
    return false;
  };
  const _forceRemove = function _forceRemove2(node) {
    arrayPush(DOMPurify.removed, {
      element: node
    });
    try {
      getParentNode(node).removeChild(node);
    } catch (_2) {
      remove(node);
    }
  };
  const _removeAttribute = function _removeAttribute2(name, element) {
    try {
      arrayPush(DOMPurify.removed, {
        attribute: element.getAttributeNode(name),
        from: element
      });
    } catch (_2) {
      arrayPush(DOMPurify.removed, {
        attribute: null,
        from: element
      });
    }
    element.removeAttribute(name);
    if (name === "is") {
      if (RETURN_DOM || RETURN_DOM_FRAGMENT) {
        try {
          _forceRemove(element);
        } catch (_2) {
        }
      } else {
        try {
          element.setAttribute(name, "");
        } catch (_2) {
        }
      }
    }
  };
  const _initDocument = function _initDocument2(dirty) {
    let doc = null;
    let leadingWhitespace = null;
    if (FORCE_BODY) {
      dirty = "<remove></remove>" + dirty;
    } else {
      const matches = stringMatch(dirty, /^[\r\n\t ]+/);
      leadingWhitespace = matches && matches[0];
    }
    if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && NAMESPACE === HTML_NAMESPACE) {
      dirty = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + dirty + "</body></html>";
    }
    const dirtyPayload = trustedTypesPolicy ? trustedTypesPolicy.createHTML(dirty) : dirty;
    if (NAMESPACE === HTML_NAMESPACE) {
      try {
        doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
      } catch (_2) {
      }
    }
    if (!doc || !doc.documentElement) {
      doc = implementation.createDocument(NAMESPACE, "template", null);
      try {
        doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
      } catch (_2) {
      }
    }
    const body = doc.body || doc.documentElement;
    if (dirty && leadingWhitespace) {
      body.insertBefore(document2.createTextNode(leadingWhitespace), body.childNodes[0] || null);
    }
    if (NAMESPACE === HTML_NAMESPACE) {
      return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? "html" : "body")[0];
    }
    return WHOLE_DOCUMENT ? doc.documentElement : body;
  };
  const _createNodeIterator = function _createNodeIterator2(root) {
    return createNodeIterator.call(
      root.ownerDocument || root,
      root,
      // eslint-disable-next-line no-bitwise
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION,
      null
    );
  };
  const _isClobbered = function _isClobbered2(element) {
    return element instanceof HTMLFormElement && (typeof element.nodeName !== "string" || typeof element.textContent !== "string" || typeof element.removeChild !== "function" || !(element.attributes instanceof NamedNodeMap) || typeof element.removeAttribute !== "function" || typeof element.setAttribute !== "function" || typeof element.namespaceURI !== "string" || typeof element.insertBefore !== "function" || typeof element.hasChildNodes !== "function");
  };
  const _isNode = function _isNode2(value) {
    return typeof Node === "function" && value instanceof Node;
  };
  function _executeHooks(hooks2, currentNode, data) {
    arrayForEach(hooks2, (hook) => {
      hook.call(DOMPurify, currentNode, data, CONFIG);
    });
  }
  const _sanitizeElements = function _sanitizeElements2(currentNode) {
    let content = null;
    _executeHooks(hooks.beforeSanitizeElements, currentNode, null);
    if (_isClobbered(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    const tagName = transformCaseFunc(currentNode.nodeName);
    _executeHooks(hooks.uponSanitizeElement, currentNode, {
      tagName,
      allowedTags: ALLOWED_TAGS
    });
    if (SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(/<[/\w!]/g, currentNode.innerHTML) && regExpTest(/<[/\w!]/g, currentNode.textContent)) {
      _forceRemove(currentNode);
      return true;
    }
    if (currentNode.nodeType === NODE_TYPE.progressingInstruction) {
      _forceRemove(currentNode);
      return true;
    }
    if (SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(/<[/\w]/g, currentNode.data)) {
      _forceRemove(currentNode);
      return true;
    }
    if (!(EXTRA_ELEMENT_HANDLING.tagCheck instanceof Function && EXTRA_ELEMENT_HANDLING.tagCheck(tagName)) && (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName])) {
      if (!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName)) {
        if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName)) {
          return false;
        }
        if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(tagName)) {
          return false;
        }
      }
      if (KEEP_CONTENT && !FORBID_CONTENTS[tagName]) {
        const parentNode = getParentNode(currentNode) || currentNode.parentNode;
        const childNodes = getChildNodes(currentNode) || currentNode.childNodes;
        if (childNodes && parentNode) {
          const childCount = childNodes.length;
          for (let i2 = childCount - 1; i2 >= 0; --i2) {
            const childClone = cloneNode(childNodes[i2], true);
            childClone.__removalCount = (currentNode.__removalCount || 0) + 1;
            parentNode.insertBefore(childClone, getNextSibling(currentNode));
          }
        }
      }
      _forceRemove(currentNode);
      return true;
    }
    if (currentNode instanceof Element && !_checkValidNamespace(currentNode)) {
      _forceRemove(currentNode);
      return true;
    }
    if ((tagName === "noscript" || tagName === "noembed" || tagName === "noframes") && regExpTest(/<\/no(script|embed|frames)/i, currentNode.innerHTML)) {
      _forceRemove(currentNode);
      return true;
    }
    if (SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
      content = currentNode.textContent;
      arrayForEach([MUSTACHE_EXPR2, ERB_EXPR2, TMPLIT_EXPR2], (expr) => {
        content = stringReplace(content, expr, " ");
      });
      if (currentNode.textContent !== content) {
        arrayPush(DOMPurify.removed, {
          element: currentNode.cloneNode()
        });
        currentNode.textContent = content;
      }
    }
    _executeHooks(hooks.afterSanitizeElements, currentNode, null);
    return false;
  };
  const _isValidAttribute = function _isValidAttribute2(lcTag, lcName, value) {
    if (SANITIZE_DOM && (lcName === "id" || lcName === "name") && (value in document2 || value in formElement)) {
      return false;
    }
    if (ALLOW_DATA_ATTR && !FORBID_ATTR[lcName] && regExpTest(DATA_ATTR2, lcName)) ;
    else if (ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR2, lcName)) ;
    else if (EXTRA_ELEMENT_HANDLING.attributeCheck instanceof Function && EXTRA_ELEMENT_HANDLING.attributeCheck(lcName, lcTag)) ;
    else if (!ALLOWED_ATTR[lcName] || FORBID_ATTR[lcName]) {
      if (
        // First condition does a very basic check if a) it's basically a valid custom element tagname AND
        // b) if the tagName passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
        // and c) if the attribute name passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.attributeNameCheck
        _isBasicCustomElement(lcTag) && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(lcTag)) && (CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName) || CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.attributeNameCheck(lcName, lcTag)) || // Alternative, second condition checks if it's an `is`-attribute, AND
        // the value passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
        lcName === "is" && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(value))
      ) ;
      else {
        return false;
      }
    } else if (URI_SAFE_ATTRIBUTES[lcName]) ;
    else if (regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE2, ""))) ;
    else if ((lcName === "src" || lcName === "xlink:href" || lcName === "href") && lcTag !== "script" && stringIndexOf(value, "data:") === 0 && DATA_URI_TAGS[lcTag]) ;
    else if (ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA2, stringReplace(value, ATTR_WHITESPACE2, ""))) ;
    else if (value) {
      return false;
    } else ;
    return true;
  };
  const _isBasicCustomElement = function _isBasicCustomElement2(tagName) {
    return tagName !== "annotation-xml" && stringMatch(tagName, CUSTOM_ELEMENT2);
  };
  const _sanitizeAttributes = function _sanitizeAttributes2(currentNode) {
    _executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
    const {
      attributes
    } = currentNode;
    if (!attributes || _isClobbered(currentNode)) {
      return;
    }
    const hookEvent = {
      attrName: "",
      attrValue: "",
      keepAttr: true,
      allowedAttributes: ALLOWED_ATTR,
      forceKeepAttr: void 0
    };
    let l2 = attributes.length;
    while (l2--) {
      const attr = attributes[l2];
      const {
        name,
        namespaceURI,
        value: attrValue
      } = attr;
      const lcName = transformCaseFunc(name);
      const initValue = attrValue;
      let value = name === "value" ? initValue : stringTrim(initValue);
      hookEvent.attrName = lcName;
      hookEvent.attrValue = value;
      hookEvent.keepAttr = true;
      hookEvent.forceKeepAttr = void 0;
      _executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
      value = hookEvent.attrValue;
      if (SANITIZE_NAMED_PROPS && (lcName === "id" || lcName === "name")) {
        _removeAttribute(name, currentNode);
        value = SANITIZE_NAMED_PROPS_PREFIX + value;
      }
      if (SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|title|textarea)/i, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (lcName === "attributename" && stringMatch(value, "href")) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (hookEvent.forceKeepAttr) {
        continue;
      }
      if (!hookEvent.keepAttr) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(/\/>/i, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (SAFE_FOR_TEMPLATES) {
        arrayForEach([MUSTACHE_EXPR2, ERB_EXPR2, TMPLIT_EXPR2], (expr) => {
          value = stringReplace(value, expr, " ");
        });
      }
      const lcTag = transformCaseFunc(currentNode.nodeName);
      if (!_isValidAttribute(lcTag, lcName, value)) {
        _removeAttribute(name, currentNode);
        continue;
      }
      if (trustedTypesPolicy && typeof trustedTypes === "object" && typeof trustedTypes.getAttributeType === "function") {
        if (namespaceURI) ;
        else {
          switch (trustedTypes.getAttributeType(lcTag, lcName)) {
            case "TrustedHTML": {
              value = trustedTypesPolicy.createHTML(value);
              break;
            }
            case "TrustedScriptURL": {
              value = trustedTypesPolicy.createScriptURL(value);
              break;
            }
          }
        }
      }
      if (value !== initValue) {
        try {
          if (namespaceURI) {
            currentNode.setAttributeNS(namespaceURI, name, value);
          } else {
            currentNode.setAttribute(name, value);
          }
          if (_isClobbered(currentNode)) {
            _forceRemove(currentNode);
          } else {
            arrayPop(DOMPurify.removed);
          }
        } catch (_2) {
          _removeAttribute(name, currentNode);
        }
      }
    }
    _executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
  };
  const _sanitizeShadowDOM = function _sanitizeShadowDOM2(fragment) {
    let shadowNode = null;
    const shadowIterator = _createNodeIterator(fragment);
    _executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
    while (shadowNode = shadowIterator.nextNode()) {
      _executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
      _sanitizeElements(shadowNode);
      _sanitizeAttributes(shadowNode);
      if (shadowNode.content instanceof DocumentFragment) {
        _sanitizeShadowDOM2(shadowNode.content);
      }
    }
    _executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
  };
  DOMPurify.sanitize = function(dirty) {
    let cfg = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
    let body = null;
    let importedNode = null;
    let currentNode = null;
    let returnNode = null;
    IS_EMPTY_INPUT = !dirty;
    if (IS_EMPTY_INPUT) {
      dirty = "<!-->";
    }
    if (typeof dirty !== "string" && !_isNode(dirty)) {
      if (typeof dirty.toString === "function") {
        dirty = dirty.toString();
        if (typeof dirty !== "string") {
          throw typeErrorCreate("dirty is not a string, aborting");
        }
      } else {
        throw typeErrorCreate("toString is not a function");
      }
    }
    if (!DOMPurify.isSupported) {
      return dirty;
    }
    if (!SET_CONFIG) {
      _parseConfig(cfg);
    }
    DOMPurify.removed = [];
    if (typeof dirty === "string") {
      IN_PLACE = false;
    }
    if (IN_PLACE) {
      if (dirty.nodeName) {
        const tagName = transformCaseFunc(dirty.nodeName);
        if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
          throw typeErrorCreate("root node is forbidden and cannot be sanitized in-place");
        }
      }
    } else if (dirty instanceof Node) {
      body = _initDocument("<!---->");
      importedNode = body.ownerDocument.importNode(dirty, true);
      if (importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === "BODY") {
        body = importedNode;
      } else if (importedNode.nodeName === "HTML") {
        body = importedNode;
      } else {
        body.appendChild(importedNode);
      }
    } else {
      if (!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT && // eslint-disable-next-line unicorn/prefer-includes
      dirty.indexOf("<") === -1) {
        return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? trustedTypesPolicy.createHTML(dirty) : dirty;
      }
      body = _initDocument(dirty);
      if (!body) {
        return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : "";
      }
    }
    if (body && FORCE_BODY) {
      _forceRemove(body.firstChild);
    }
    const nodeIterator = _createNodeIterator(IN_PLACE ? dirty : body);
    while (currentNode = nodeIterator.nextNode()) {
      _sanitizeElements(currentNode);
      _sanitizeAttributes(currentNode);
      if (currentNode.content instanceof DocumentFragment) {
        _sanitizeShadowDOM(currentNode.content);
      }
    }
    if (IN_PLACE) {
      return dirty;
    }
    if (RETURN_DOM) {
      if (RETURN_DOM_FRAGMENT) {
        returnNode = createDocumentFragment.call(body.ownerDocument);
        while (body.firstChild) {
          returnNode.appendChild(body.firstChild);
        }
      } else {
        returnNode = body;
      }
      if (ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode) {
        returnNode = importNode.call(originalDocument, returnNode, true);
      }
      return returnNode;
    }
    let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
    if (WHOLE_DOCUMENT && ALLOWED_TAGS["!doctype"] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name)) {
      serializedHTML = "<!DOCTYPE " + body.ownerDocument.doctype.name + ">\n" + serializedHTML;
    }
    if (SAFE_FOR_TEMPLATES) {
      arrayForEach([MUSTACHE_EXPR2, ERB_EXPR2, TMPLIT_EXPR2], (expr) => {
        serializedHTML = stringReplace(serializedHTML, expr, " ");
      });
    }
    return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? trustedTypesPolicy.createHTML(serializedHTML) : serializedHTML;
  };
  DOMPurify.setConfig = function() {
    let cfg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
    _parseConfig(cfg);
    SET_CONFIG = true;
  };
  DOMPurify.clearConfig = function() {
    CONFIG = null;
    SET_CONFIG = false;
  };
  DOMPurify.isValidAttribute = function(tag, attr, value) {
    if (!CONFIG) {
      _parseConfig({});
    }
    const lcTag = transformCaseFunc(tag);
    const lcName = transformCaseFunc(attr);
    return _isValidAttribute(lcTag, lcName, value);
  };
  DOMPurify.addHook = function(entryPoint, hookFunction) {
    if (typeof hookFunction !== "function") {
      return;
    }
    arrayPush(hooks[entryPoint], hookFunction);
  };
  DOMPurify.removeHook = function(entryPoint, hookFunction) {
    if (hookFunction !== void 0) {
      const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);
      return index === -1 ? void 0 : arraySplice(hooks[entryPoint], index, 1)[0];
    }
    return arrayPop(hooks[entryPoint]);
  };
  DOMPurify.removeHooks = function(entryPoint) {
    hooks[entryPoint] = [];
  };
  DOMPurify.removeAllHooks = function() {
    hooks = _createHooksMap();
  };
  return DOMPurify;
}
var purify = createDOMPurify();
function getDOMPurify() {
  if (!window.DOMPurify) {
    throw new Error("[Sanitize] DOMPurify not available. Ensure content-simple.js loaded first.");
  }
  return window.DOMPurify;
}
function sanitizeHTML(dirtyHTML, config = {}) {
  if (!dirtyHTML || typeof dirtyHTML !== "string") {
    return "";
  }
  const defaultConfig = {
    ALLOWED_TAGS: [
      "b",
      "i",
      "u",
      "em",
      "strong",
      "a",
      "p",
      "br",
      "span",
      "div",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "img",
      "code",
      "pre",
      "blockquote",
      "button",
      "input",
      "label",
      "select",
      "option",
      "textarea",
      "svg",
      "g",
      "defs",
      "use",
      "path",
      "circle",
      "rect",
      "line",
      "polygon",
      "polyline",
      "text",
      "tspan",
      "marker",
      "small",
      "mark",
      "del",
      "ins",
      "sub",
      "sup",
      "style"
    ],
    ALLOWED_ATTR: [
      "href",
      "target",
      "rel",
      "src",
      "alt",
      "title",
      "class",
      "id",
      "style",
      "data-*",
      "aria-*",
      "role",
      "width",
      "height",
      "type",
      "value",
      "placeholder",
      "name",
      "viewBox",
      "d",
      "fill",
      "stroke",
      "stroke-width",
      "cx",
      "cy",
      "r",
      "x",
      "y",
      "x1",
      "y1",
      "x2",
      "y2",
      "points",
      // Form-related attributes
      "selected",
      "disabled",
      "checked",
      "readonly",
      "required",
      "multiple",
      "size",
      "for",
      "min",
      "max",
      "step",
      "maxlength",
      "minlength",
      "pattern",
      "autocomplete",
      "autofocus"
    ],
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_DOM_IMPORT: false
  };
  const mergedConfig = { ...defaultConfig, ...config };
  return getDOMPurify().sanitize(dirtyHTML, mergedConfig);
}
function sanitizeURL(url) {
  if (!url || typeof url !== "string") {
    return "";
  }
  const trimmedURL = url.trim().toLowerCase();
  if (trimmedURL.startsWith("javascript:") || trimmedURL.startsWith("data:") || trimmedURL.startsWith("vbscript:")) {
    console.warn("[Sanitize] Blocked dangerous URL protocol:", url);
    return "";
  }
  return url.trim();
}
const DEFAULT_SHORTCUTS = {
  // TTS Controls
  tts_play_pause: "Ctrl+Shift+Space",
  tts_stop: "Ctrl+Shift+S",
  // Reading & Accessibility
  ocr_activate: "Alt+O",
  reading_mode_toggle: "Alt+R",
  reading_mode_exit: "Escape",
  dictionary_lookup: "Alt+Shift+D",
  text_stats_toggle: "Ctrl+Shift+W",
  highlight_menu_toggle: "Ctrl+Shift+H",
  // Writing Tools
  sticky_note_create: "Alt+N",
  translation_toggle: "Alt+T",
  // Display Modes
  focus_mode_toggle: "Alt+F",
  reading_guide_toggle: "Alt+G",
  screen_overlay_toggle: "Alt+Shift+O",
  dyslexia_mode_toggle: "Alt+Y"
};
const SHORTCUT_LABELS = {
  // TTS Controls
  tts_play_pause: "TTS: Play/Pause",
  tts_stop: "TTS: Stop",
  // Reading & Accessibility
  ocr_activate: "OCR: Activate Screenshot",
  reading_mode_toggle: "Reading Mode: Toggle",
  reading_mode_exit: "Reading Mode: Exit",
  dictionary_lookup: "Dictionary: Lookup Selected Text",
  text_stats_toggle: "Text Statistics: Toggle Display",
  highlight_menu_toggle: "Highlight Menu: Toggle",
  // Writing Tools
  sticky_note_create: "Sticky Notes: Create New Note",
  translation_toggle: "Translation: Toggle",
  // Display Modes
  focus_mode_toggle: "Focus Mode: Toggle",
  reading_guide_toggle: "Reading Guide: Toggle",
  screen_overlay_toggle: "Screen Overlay: Toggle",
  dyslexia_mode_toggle: "Dyslexia Mode: Toggle"
};
const CHROME_RESERVED_SHORTCUTS = [
  // Tab management
  "Ctrl+T",
  "Ctrl+W",
  "Ctrl+Shift+T",
  "Ctrl+Tab",
  "Ctrl+Shift+Tab",
  "Ctrl+1",
  "Ctrl+2",
  "Ctrl+3",
  "Ctrl+4",
  "Ctrl+5",
  "Ctrl+6",
  "Ctrl+7",
  "Ctrl+8",
  "Ctrl+9",
  // Window management
  "Ctrl+N",
  "Ctrl+Shift+N",
  "Alt+F4",
  // Navigation
  "Ctrl+L",
  "Ctrl+K",
  "Alt+D",
  "Alt+Left",
  "Alt+Right",
  "Backspace",
  // Page actions
  "Ctrl+R",
  "Ctrl+Shift+R",
  "F5",
  "Ctrl+F5",
  "Ctrl+P",
  "Ctrl+S",
  // Browser functions
  "Ctrl+H",
  "Ctrl+J",
  "Ctrl+Shift+Delete",
  "Ctrl+Shift+B",
  // Text editing (common)
  "Ctrl+A",
  "Ctrl+C",
  "Ctrl+V",
  "Ctrl+X",
  "Ctrl+Z",
  "Ctrl+Y",
  "Ctrl+F",
  "Ctrl+G",
  // DevTools
  "F12",
  "Ctrl+Shift+I",
  "Ctrl+Shift+J",
  "Ctrl+Shift+C",
  // Zoom
  "Ctrl+Plus",
  "Ctrl+Minus",
  "Ctrl+0",
  // Miscellaneous
  "Ctrl+O",
  "Ctrl+U",
  "Ctrl+D"
];
const CHROME_SHORTCUT_DESCRIPTIONS = {
  // Tab management
  "Ctrl+T": "Open new tab",
  "Ctrl+W": "Close current tab",
  "Ctrl+Shift+T": "Reopen closed tab",
  "Ctrl+Tab": "Switch to next tab",
  "Ctrl+Shift+Tab": "Switch to previous tab",
  "Ctrl+1": "Switch to tab 1",
  "Ctrl+2": "Switch to tab 2",
  "Ctrl+3": "Switch to tab 3",
  "Ctrl+4": "Switch to tab 4",
  "Ctrl+5": "Switch to tab 5",
  "Ctrl+6": "Switch to tab 6",
  "Ctrl+7": "Switch to tab 7",
  "Ctrl+8": "Switch to tab 8",
  "Ctrl+9": "Switch to last tab",
  // Window management
  "Ctrl+N": "Open new window",
  "Ctrl+Shift+N": "Open incognito window",
  "Alt+F4": "Close window",
  // Navigation
  "Ctrl+L": "Focus address bar",
  "Ctrl+K": "Search from address bar",
  "Alt+D": "Focus address bar",
  "Alt+Left": "Go back",
  "Alt+Right": "Go forward",
  Backspace: "Go back",
  // Page actions
  "Ctrl+R": "Reload page",
  "Ctrl+Shift+R": "Hard reload page",
  F5: "Reload page",
  "Ctrl+F5": "Hard reload page",
  "Ctrl+P": "Print page",
  "Ctrl+S": "Save page",
  // Browser functions
  "Ctrl+H": "Open history",
  "Ctrl+J": "Open downloads",
  "Ctrl+Shift+Delete": "Clear browsing data",
  "Ctrl+Shift+B": "Toggle bookmarks bar",
  // Text editing (common)
  "Ctrl+A": "Select all",
  "Ctrl+C": "Copy",
  "Ctrl+V": "Paste",
  "Ctrl+X": "Cut",
  "Ctrl+Z": "Undo",
  "Ctrl+Y": "Redo",
  "Ctrl+F": "Find in page",
  "Ctrl+G": "Find next",
  // DevTools
  F12: "Open DevTools",
  "Ctrl+Shift+I": "Open DevTools",
  "Ctrl+Shift+J": "Open DevTools Console",
  "Ctrl+Shift+C": "Inspect element",
  // Zoom
  "Ctrl+Plus": "Zoom in",
  "Ctrl+Minus": "Zoom out",
  "Ctrl+0": "Reset zoom",
  // Miscellaneous
  "Ctrl+O": "Open file",
  "Ctrl+U": "View page source",
  "Ctrl+D": "Bookmark current page"
};
function parseShortcut(shortcut) {
  const parts = shortcut.split("+").map((p2) => p2.trim());
  const lowerParts = parts.map((p2) => p2.toLowerCase());
  return {
    ctrl: lowerParts.includes("ctrl"),
    alt: lowerParts.includes("alt"),
    shift: lowerParts.includes("shift"),
    key: parts[parts.length - 1]
    // Last part is always the key
  };
}
function normalizeShortcut(shortcut) {
  const parsed = parseShortcut(shortcut);
  const modifiers = [];
  if (parsed.ctrl) {
    modifiers.push("Ctrl");
  }
  if (parsed.alt) {
    modifiers.push("Alt");
  }
  if (parsed.shift) {
    modifiers.push("Shift");
  }
  const key = parsed.key.charAt(0).toUpperCase() + parsed.key.slice(1);
  return [...modifiers, key].join("+");
}
function isValidShortcut(shortcut) {
  const normalized = normalizeShortcut(shortcut);
  if (normalized === "Escape") {
    return true;
  }
  const parsed = parseShortcut(normalized);
  return parsed.ctrl || parsed.alt || parsed.shift;
}
function isConflictWithChrome(shortcut) {
  const normalized = normalizeShortcut(shortcut);
  if (CHROME_RESERVED_SHORTCUTS.includes(normalized)) {
    return {
      shortcut: normalized,
      description: CHROME_SHORTCUT_DESCRIPTIONS[normalized] || "Chrome system function"
    };
  }
  return null;
}
function isConflictWithExtension(shortcut, currentShortcuts, excludeKey = null) {
  const normalized = normalizeShortcut(shortcut);
  for (const [key, value] of Object.entries(currentShortcuts)) {
    if (key === excludeKey) {
      continue;
    }
    if (normalizeShortcut(value) === normalized) {
      return key;
    }
  }
  return null;
}
function validateShortcut(shortcut, currentShortcuts = {}, excludeKey = null) {
  if (!isValidShortcut(shortcut)) {
    return {
      valid: false,
      error: "Shortcut must include a modifier key (Ctrl, Alt, or Shift)",
      conflictWith: null
    };
  }
  const chromeConflict = isConflictWithChrome(shortcut);
  if (chromeConflict) {
    return {
      valid: false,
      error: `⚠️ Conflicts with Chrome: ${chromeConflict.description}`,
      conflictWith: "Chrome",
      description: chromeConflict.description
    };
  }
  const conflictKey = isConflictWithExtension(shortcut, currentShortcuts, excludeKey);
  if (conflictKey) {
    return {
      valid: false,
      error: `This shortcut is already used by: ${SHORTCUT_LABELS[conflictKey] || conflictKey}`,
      conflictWith: conflictKey
    };
  }
  return {
    valid: true,
    error: null,
    conflictWith: null
  };
}
async function loadShortcuts() {
  return new Promise((resolve) => {
    chrome.storage.local.get("assist_settings", (result) => {
      const settings = result.assist_settings || {};
      const shortcuts = settings.keyboardShortcuts || { ...DEFAULT_SHORTCUTS };
      console.log("[Keyboard Shortcuts] Loaded shortcuts:", shortcuts);
      resolve(shortcuts);
    });
  });
}
async function saveShortcuts(shortcuts) {
  return new Promise((resolve) => {
    chrome.storage.local.get("assist_settings", (result) => {
      const settings = result.assist_settings || {};
      settings.keyboardShortcuts = shortcuts;
      chrome.storage.local.set({ assist_settings: settings }, () => {
        console.log("[Keyboard Shortcuts] Saved shortcuts:", shortcuts);
        resolve();
      });
    });
  });
}
function eventToShortcut(event) {
  const modifiers = [];
  if (event.ctrlKey) {
    modifiers.push("Ctrl");
  }
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }
  let key = event.key;
  if (key === " ") {
    key = "Space";
  }
  if (key.length === 1) {
    key = key.toUpperCase();
  }
  return [...modifiers, key].join("+");
}
function matchesShortcut(event, shortcut) {
  const eventShortcut = eventToShortcut(event);
  const normalized = normalizeShortcut(shortcut);
  return eventShortcut === normalized;
}
function createShortcutHandler(shortcut, callback) {
  return (event) => {
    if (matchesShortcut(event, shortcut)) {
      event.preventDefault();
      event.stopPropagation();
      callback(event);
    }
  };
}
const shortcutHandlers = /* @__PURE__ */ new Map();
async function registerShortcut(featureKey, callback) {
  if (shortcutHandlers.has(featureKey)) {
    unregisterShortcut(featureKey);
  }
  const shortcuts = await loadShortcuts();
  const shortcut = shortcuts[featureKey];
  if (!shortcut) {
    console.warn(`[Keyboard Shortcuts] No shortcut found for: ${featureKey}`);
    return () => {
    };
  }
  const handler = createShortcutHandler(shortcut, callback);
  document.addEventListener("keydown", handler);
  shortcutHandlers.set(featureKey, handler);
  console.log(`[Keyboard Shortcuts] Registered: ${featureKey} → ${shortcut}`);
  return () => unregisterShortcut(featureKey);
}
function unregisterShortcut(featureKey) {
  const handler = shortcutHandlers.get(featureKey);
  if (handler) {
    document.removeEventListener("keydown", handler);
    shortcutHandlers.delete(featureKey);
    console.log(`[Keyboard Shortcuts] Unregistered: ${featureKey}`);
  }
}
const DEFAULT_CONFIG = {
  enableVisualFeedback: true,
  feedbackScale: 1.05,
  enableLogging: true,
  logPrefix: "[EventHandler]"
};
function attachInteractiveHandler(element, label, handler, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  if (!element) {
    if (config.enableLogging) {
      console.warn(`${config.logPrefix} Element not found for: ${label}`);
    }
    return () => {
    };
  }
  const mousedownHandler = (e2) => {
    if (config.enableLogging) {
      console.log(`${config.logPrefix} ${label} triggered`);
    }
    e2.preventDefault();
    e2.stopPropagation();
    try {
      handler(e2);
    } catch (error) {
      console.error(`${config.logPrefix} ${label} error:`, error);
    }
  };
  element.onmousedown = mousedownHandler;
  if (config.enableVisualFeedback) {
    const originalTransform = element.style.transform || "";
    element.onmouseenter = () => {
      element.style.transform = `scale(${config.feedbackScale})`;
      element.style.cursor = "pointer";
    };
    element.onmouseleave = () => {
      element.style.transform = originalTransform;
    };
  }
  return () => {
    element.onmousedown = null;
    element.onmouseenter = null;
    element.onmouseleave = null;
  };
}
function attachQuietHandler(element, label, handler) {
  return attachInteractiveHandler(element, label, handler, {
    enableVisualFeedback: false
  });
}
function attachHandlerBatch(handlers, options = {}) {
  const cleanups = handlers.map(
    ({ element, label, handler }) => attachInteractiveHandler(element, label, handler, options)
  );
  return () => cleanups.forEach((cleanup) => cleanup());
}
function attachDelegatedHandler(container, selector, label, handler) {
  if (!container) {
    console.warn(`[EventHandler] Container not found for delegated: ${label}`);
    return () => {
    };
  }
  const delegatedHandler = (e2) => {
    const target = e2.target.closest(selector);
    if (target && container.contains(target)) {
      console.log(`[EventHandler] ${label} delegated to:`, target);
      e2.preventDefault();
      e2.stopPropagation();
      try {
        handler(e2, target);
      } catch (error) {
        console.error(`[EventHandler] ${label} error:`, error);
      }
    }
  };
  container.addEventListener("mousedown", delegatedHandler);
  return () => container.removeEventListener("mousedown", delegatedHandler);
}
function attachAccessibleHandler(element, label, handler, options = {}) {
  const cleanup = attachInteractiveHandler(element, label, handler, options);
  if (!element) {
    return cleanup;
  }
  const keydownHandler = (e2) => {
    if (e2.key === "Enter" || e2.key === " ") {
      e2.preventDefault();
      console.log(`[EventHandler] ${label} triggered (keyboard)`);
      try {
        handler(e2);
      } catch (error) {
        console.error(`[EventHandler] ${label} error:`, error);
      }
    }
  };
  element.addEventListener("keydown", keydownHandler);
  return () => {
    cleanup();
    element.removeEventListener("keydown", keydownHandler);
  };
}
if (typeof window !== "undefined") {
  window.AssistEventHandlers = {
    attachInteractiveHandler,
    attachQuietHandler,
    attachHandlerBatch,
    attachDelegatedHandler,
    attachAccessibleHandler
  };
}
const e = "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : "undefined" != typeof window ? window : global, t = Object.keys, n = Array.isArray;
function r(e2, n2) {
  return "object" != typeof n2 || t(n2).forEach((function(t2) {
    e2[t2] = n2[t2];
  })), e2;
}
"undefined" == typeof Promise || e.Promise || (e.Promise = Promise);
const s = Object.getPrototypeOf, i = {}.hasOwnProperty;
function o(e2, t2) {
  return i.call(e2, t2);
}
function a(e2, n2) {
  "function" == typeof n2 && (n2 = n2(s(e2))), ("undefined" == typeof Reflect ? t : Reflect.ownKeys)(n2).forEach(((t2) => {
    l(e2, t2, n2[t2]);
  }));
}
const u = Object.defineProperty;
function l(e2, t2, n2, s2) {
  u(e2, t2, r(n2 && o(n2, "get") && "function" == typeof n2.get ? { get: n2.get, set: n2.set, configurable: true } : { value: n2, configurable: true, writable: true }, s2));
}
function c(e2) {
  return { from: function(t2) {
    return e2.prototype = Object.create(t2.prototype), l(e2.prototype, "constructor", e2), { extend: a.bind(null, e2.prototype) };
  } };
}
const h = Object.getOwnPropertyDescriptor;
function d(e2, t2) {
  let n2;
  return h(e2, t2) || (n2 = s(e2)) && d(n2, t2);
}
const f = [].slice;
function p(e2, t2, n2) {
  return f.call(e2, t2, n2);
}
function y(e2, t2) {
  return t2(e2);
}
function m(e2) {
  if (!e2) throw new Error("Assertion Failed");
}
function v(t2) {
  e.setImmediate ? setImmediate(t2) : setTimeout(t2, 0);
}
function g(e2, t2) {
  return e2.reduce(((e3, n2, r2) => {
    var s2 = t2(n2, r2);
    return s2 && (e3[s2[0]] = s2[1]), e3;
  }), {});
}
function b(e2, t2) {
  if ("string" == typeof t2 && o(e2, t2)) return e2[t2];
  if (!t2) return e2;
  if ("string" != typeof t2) {
    for (var n2 = [], r2 = 0, s2 = t2.length; r2 < s2; ++r2) {
      var i2 = b(e2, t2[r2]);
      n2.push(i2);
    }
    return n2;
  }
  var a2 = t2.indexOf(".");
  if (-1 !== a2) {
    var u2 = e2[t2.substr(0, a2)];
    return null == u2 ? void 0 : b(u2, t2.substr(a2 + 1));
  }
}
function _(e2, t2, r2) {
  if (e2 && void 0 !== t2 && (!("isFrozen" in Object) || !Object.isFrozen(e2))) if ("string" != typeof t2 && "length" in t2) {
    m("string" != typeof r2 && "length" in r2);
    for (var s2 = 0, i2 = t2.length; s2 < i2; ++s2) _(e2, t2[s2], r2[s2]);
  } else {
    var a2 = t2.indexOf(".");
    if (-1 !== a2) {
      var u2 = t2.substr(0, a2), l2 = t2.substr(a2 + 1);
      if ("" === l2) void 0 === r2 ? n(e2) && !isNaN(parseInt(u2)) ? e2.splice(u2, 1) : delete e2[u2] : e2[u2] = r2;
      else {
        var c2 = e2[u2];
        c2 && o(e2, u2) || (c2 = e2[u2] = {}), _(c2, l2, r2);
      }
    } else void 0 === r2 ? n(e2) && !isNaN(parseInt(t2)) ? e2.splice(t2, 1) : delete e2[t2] : e2[t2] = r2;
  }
}
function w(e2) {
  var t2 = {};
  for (var n2 in e2) o(e2, n2) && (t2[n2] = e2[n2]);
  return t2;
}
const x = [].concat;
function k(e2) {
  return x.apply([], e2);
}
const E = "BigUint64Array,BigInt64Array,Array,Boolean,String,Date,RegExp,Blob,File,FileList,FileSystemFileHandle,FileSystemDirectoryHandle,ArrayBuffer,DataView,Uint8ClampedArray,ImageBitmap,ImageData,Map,Set,CryptoKey".split(",").concat(k([8, 16, 32, 64].map(((e2) => ["Int", "Uint", "Float"].map(((t2) => t2 + e2 + "Array")))))).filter(((t2) => e[t2])), P = E.map(((t2) => e[t2]));
g(E, ((e2) => [e2, true]));
let K = null;
function O(e2) {
  K = "undefined" != typeof WeakMap && /* @__PURE__ */ new WeakMap();
  const t2 = S(e2);
  return K = null, t2;
}
function S(e2) {
  if (!e2 || "object" != typeof e2) return e2;
  let t2 = K && K.get(e2);
  if (t2) return t2;
  if (n(e2)) {
    t2 = [], K && K.set(e2, t2);
    for (var r2 = 0, i2 = e2.length; r2 < i2; ++r2) t2.push(S(e2[r2]));
  } else if (P.indexOf(e2.constructor) >= 0) t2 = e2;
  else {
    const n2 = s(e2);
    for (var a2 in t2 = n2 === Object.prototype ? {} : Object.create(n2), K && K.set(e2, t2), e2) o(e2, a2) && (t2[a2] = S(e2[a2]));
  }
  return t2;
}
const { toString: A } = {};
function C(e2) {
  return A.call(e2).slice(8, -1);
}
const j = "undefined" != typeof Symbol ? Symbol.iterator : "@@iterator", D = "symbol" == typeof j ? function(e2) {
  var t2;
  return null != e2 && (t2 = e2[j]) && t2.apply(e2);
} : function() {
  return null;
}, I = {};
function B(e2) {
  var t2, r2, s2, i2;
  if (1 === arguments.length) {
    if (n(e2)) return e2.slice();
    if (this === I && "string" == typeof e2) return [e2];
    if (i2 = D(e2)) {
      for (r2 = []; !(s2 = i2.next()).done; ) r2.push(s2.value);
      return r2;
    }
    if (null == e2) return [e2];
    if ("number" == typeof (t2 = e2.length)) {
      for (r2 = new Array(t2); t2--; ) r2[t2] = e2[t2];
      return r2;
    }
    return [e2];
  }
  for (t2 = arguments.length, r2 = new Array(t2); t2--; ) r2[t2] = arguments[t2];
  return r2;
}
const T = "undefined" != typeof Symbol ? (e2) => "AsyncFunction" === e2[Symbol.toStringTag] : () => false;
var R = "undefined" != typeof location && /^(http|https):\/\/(localhost|127\.0\.0\.1)/.test(location.href);
function F(e2, t2) {
  R = e2, M = t2;
}
var M = () => true;
const N = !new Error("").stack;
function q() {
  if (N) try {
    throw q.arguments, new Error();
  } catch (e2) {
    return e2;
  }
  return new Error();
}
function $(e2, t2) {
  var n2 = e2.stack;
  return n2 ? (t2 = t2 || 0, 0 === n2.indexOf(e2.name) && (t2 += (e2.name + e2.message).split("\n").length), n2.split("\n").slice(t2).filter(M).map(((e3) => "\n" + e3)).join("")) : "";
}
var U = ["Unknown", "Constraint", "Data", "TransactionInactive", "ReadOnly", "Version", "NotFound", "InvalidState", "InvalidAccess", "Abort", "Timeout", "QuotaExceeded", "Syntax", "DataClone"], L = ["Modify", "Bulk", "OpenFailed", "VersionChange", "Schema", "Upgrade", "InvalidTable", "MissingAPI", "NoSuchDatabase", "InvalidArgument", "SubTransaction", "Unsupported", "Internal", "DatabaseClosed", "PrematureCommit", "ForeignAwait"].concat(U), V = { VersionChanged: "Database version changed by other database connection", DatabaseClosed: "Database has been closed", Abort: "Transaction aborted", TransactionInactive: "Transaction has already completed or failed", MissingAPI: "IndexedDB API missing. Please visit https://tinyurl.com/y2uuvskb" };
function W(e2, t2) {
  this._e = q(), this.name = e2, this.message = t2;
}
function Y(e2, t2) {
  return e2 + ". Errors: " + Object.keys(t2).map(((e3) => t2[e3].toString())).filter(((e3, t3, n2) => n2.indexOf(e3) === t3)).join("\n");
}
function z(e2, t2, n2, r2) {
  this._e = q(), this.failures = t2, this.failedKeys = r2, this.successCount = n2, this.message = Y(e2, t2);
}
function G(e2, t2) {
  this._e = q(), this.name = "BulkError", this.failures = Object.keys(t2).map(((e3) => t2[e3])), this.failuresByPos = t2, this.message = Y(e2, t2);
}
c(W).from(Error).extend({ stack: { get: function() {
  return this._stack || (this._stack = this.name + ": " + this.message + $(this._e, 2));
} }, toString: function() {
  return this.name + ": " + this.message;
} }), c(z).from(W), c(G).from(W);
var H = L.reduce(((e2, t2) => (e2[t2] = t2 + "Error", e2)), {});
const Q = W;
var X = L.reduce(((e2, t2) => {
  var n2 = t2 + "Error";
  function r2(e3, r3) {
    this._e = q(), this.name = n2, e3 ? "string" == typeof e3 ? (this.message = `${e3}${r3 ? "\n " + r3 : ""}`, this.inner = r3 || null) : "object" == typeof e3 && (this.message = `${e3.name} ${e3.message}`, this.inner = e3) : (this.message = V[t2] || n2, this.inner = null);
  }
  return c(r2).from(Q), e2[t2] = r2, e2;
}), {});
X.Syntax = SyntaxError, X.Type = TypeError, X.Range = RangeError;
var J = U.reduce(((e2, t2) => (e2[t2 + "Error"] = X[t2], e2)), {});
var Z = L.reduce(((e2, t2) => (-1 === ["Syntax", "Type", "Range"].indexOf(t2) && (e2[t2 + "Error"] = X[t2]), e2)), {});
function ee() {
}
function te(e2) {
  return e2;
}
function ne(e2, t2) {
  return null == e2 || e2 === te ? t2 : function(n2) {
    return t2(e2(n2));
  };
}
function re(e2, t2) {
  return function() {
    e2.apply(this, arguments), t2.apply(this, arguments);
  };
}
function se(e2, t2) {
  return e2 === ee ? t2 : function() {
    var n2 = e2.apply(this, arguments);
    void 0 !== n2 && (arguments[0] = n2);
    var r2 = this.onsuccess, s2 = this.onerror;
    this.onsuccess = null, this.onerror = null;
    var i2 = t2.apply(this, arguments);
    return r2 && (this.onsuccess = this.onsuccess ? re(r2, this.onsuccess) : r2), s2 && (this.onerror = this.onerror ? re(s2, this.onerror) : s2), void 0 !== i2 ? i2 : n2;
  };
}
function ie(e2, t2) {
  return e2 === ee ? t2 : function() {
    e2.apply(this, arguments);
    var n2 = this.onsuccess, r2 = this.onerror;
    this.onsuccess = this.onerror = null, t2.apply(this, arguments), n2 && (this.onsuccess = this.onsuccess ? re(n2, this.onsuccess) : n2), r2 && (this.onerror = this.onerror ? re(r2, this.onerror) : r2);
  };
}
function oe(e2, t2) {
  return e2 === ee ? t2 : function(n2) {
    var s2 = e2.apply(this, arguments);
    r(n2, s2);
    var i2 = this.onsuccess, o2 = this.onerror;
    this.onsuccess = null, this.onerror = null;
    var a2 = t2.apply(this, arguments);
    return i2 && (this.onsuccess = this.onsuccess ? re(i2, this.onsuccess) : i2), o2 && (this.onerror = this.onerror ? re(o2, this.onerror) : o2), void 0 === s2 ? void 0 === a2 ? void 0 : a2 : r(s2, a2);
  };
}
function ae(e2, t2) {
  return e2 === ee ? t2 : function() {
    return false !== t2.apply(this, arguments) && e2.apply(this, arguments);
  };
}
function ue(e2, t2) {
  return e2 === ee ? t2 : function() {
    var n2 = e2.apply(this, arguments);
    if (n2 && "function" == typeof n2.then) {
      for (var r2 = this, s2 = arguments.length, i2 = new Array(s2); s2--; ) i2[s2] = arguments[s2];
      return n2.then((function() {
        return t2.apply(r2, i2);
      }));
    }
    return t2.apply(this, arguments);
  };
}
Z.ModifyError = z, Z.DexieError = W, Z.BulkError = G;
var le = {};
const ce = 100, [he, de, fe] = "undefined" == typeof Promise ? [] : (() => {
  let e2 = Promise.resolve();
  if ("undefined" == typeof crypto || !crypto.subtle) return [e2, s(e2), e2];
  const t2 = crypto.subtle.digest("SHA-512", new Uint8Array([0]));
  return [t2, s(t2), e2];
})(), pe = de && de.then, ye = he && he.constructor, me = !!fe;
var ve = false, ge = fe ? () => {
  fe.then($e);
} : e.setImmediate ? setImmediate.bind(null, $e) : e.MutationObserver ? () => {
  var e2 = document.createElement("div");
  new MutationObserver((() => {
    $e(), e2 = null;
  })).observe(e2, { attributes: true }), e2.setAttribute("i", "1");
} : () => {
  setTimeout($e, 0);
}, be = function(e2, t2) {
  Se.push([e2, t2]), we && (ge(), we = false);
}, _e = true, we = true, xe = [], ke = [], Ee = null, Pe = te, Ke = { id: "global", global: true, ref: 0, unhandleds: [], onunhandled: dt, pgp: false, env: {}, finalize: function() {
  this.unhandleds.forEach(((e2) => {
    try {
      dt(e2[0], e2[1]);
    } catch (e3) {
    }
  }));
} }, Oe = Ke, Se = [], Ae = 0, Ce = [];
function je(e2) {
  if ("object" != typeof this) throw new TypeError("Promises must be constructed via new");
  this._listeners = [], this.onuncatched = ee, this._lib = false;
  var t2 = this._PSD = Oe;
  if (R && (this._stackHolder = q(), this._prev = null, this._numPrev = 0), "function" != typeof e2) {
    if (e2 !== le) throw new TypeError("Not a function");
    return this._state = arguments[1], this._value = arguments[2], void (false === this._state && Te(this, this._value));
  }
  this._state = null, this._value = null, ++t2.ref, Be(this, e2);
}
const De = { get: function() {
  var e2 = Oe, t2 = Xe;
  function n2(n3, r2) {
    var s2 = !e2.global && (e2 !== Oe || t2 !== Xe);
    const i2 = s2 && !tt();
    var o2 = new je(((t3, o3) => {
      Fe(this, new Ie(lt(n3, e2, s2, i2), lt(r2, e2, s2, i2), t3, o3, e2));
    }));
    return R && qe(o2, this), o2;
  }
  return n2.prototype = le, n2;
}, set: function(e2) {
  l(this, "then", e2 && e2.prototype === le ? De : { get: function() {
    return e2;
  }, set: De.set });
} };
function Ie(e2, t2, n2, r2, s2) {
  this.onFulfilled = "function" == typeof e2 ? e2 : null, this.onRejected = "function" == typeof t2 ? t2 : null, this.resolve = n2, this.reject = r2, this.psd = s2;
}
function Be(e2, t2) {
  try {
    t2(((t3) => {
      if (null === e2._state) {
        if (t3 === e2) throw new TypeError("A promise cannot be resolved with itself.");
        var n2 = e2._lib && Ue();
        t3 && "function" == typeof t3.then ? Be(e2, ((e3, n3) => {
          t3 instanceof je ? t3._then(e3, n3) : t3.then(e3, n3);
        })) : (e2._state = true, e2._value = t3, Re(e2)), n2 && Le();
      }
    }), Te.bind(null, e2));
  } catch (t3) {
    Te(e2, t3);
  }
}
function Te(e2, t2) {
  if (ke.push(t2), null === e2._state) {
    var n2 = e2._lib && Ue();
    t2 = Pe(t2), e2._state = false, e2._value = t2, R && null !== t2 && "object" == typeof t2 && !t2._promise && (function(e3, t3, n3) {
      try {
        e3.apply(null, n3);
      } catch (e4) {
      }
    })((() => {
      var n3 = d(t2, "stack");
      t2._promise = e2, l(t2, "stack", { get: () => ve ? n3 && (n3.get ? n3.get.apply(t2) : n3.value) : e2.stack });
    })), (function(e3) {
      xe.some(((t3) => t3._value === e3._value)) || xe.push(e3);
    })(e2), Re(e2), n2 && Le();
  }
}
function Re(e2) {
  var t2 = e2._listeners;
  e2._listeners = [];
  for (var n2 = 0, r2 = t2.length; n2 < r2; ++n2) Fe(e2, t2[n2]);
  var s2 = e2._PSD;
  --s2.ref || s2.finalize(), 0 === Ae && (++Ae, be((() => {
    0 == --Ae && Ve();
  }), []));
}
function Fe(e2, t2) {
  if (null !== e2._state) {
    var n2 = e2._state ? t2.onFulfilled : t2.onRejected;
    if (null === n2) return (e2._state ? t2.resolve : t2.reject)(e2._value);
    ++t2.psd.ref, ++Ae, be(Me, [n2, e2, t2]);
  } else e2._listeners.push(t2);
}
function Me(e2, t2, n2) {
  try {
    Ee = t2;
    var r2, s2 = t2._value;
    t2._state ? r2 = e2(s2) : (ke.length && (ke = []), r2 = e2(s2), -1 === ke.indexOf(s2) && (function(e3) {
      var t3 = xe.length;
      for (; t3; ) if (xe[--t3]._value === e3._value) return void xe.splice(t3, 1);
    })(t2)), n2.resolve(r2);
  } catch (e3) {
    n2.reject(e3);
  } finally {
    Ee = null, 0 == --Ae && Ve(), --n2.psd.ref || n2.psd.finalize();
  }
}
function Ne(e2, t2, n2) {
  if (t2.length === n2) return t2;
  var r2 = "";
  if (false === e2._state) {
    var s2, i2, o2 = e2._value;
    null != o2 ? (s2 = o2.name || "Error", i2 = o2.message || o2, r2 = $(o2, 0)) : (s2 = o2, i2 = ""), t2.push(s2 + (i2 ? ": " + i2 : "") + r2);
  }
  return R && ((r2 = $(e2._stackHolder, 2)) && -1 === t2.indexOf(r2) && t2.push(r2), e2._prev && Ne(e2._prev, t2, n2)), t2;
}
function qe(e2, t2) {
  var n2 = t2 ? t2._numPrev + 1 : 0;
  n2 < 100 && (e2._prev = t2, e2._numPrev = n2);
}
function $e() {
  Ue() && Le();
}
function Ue() {
  var e2 = _e;
  return _e = false, we = false, e2;
}
function Le() {
  var e2, t2, n2;
  do {
    for (; Se.length > 0; ) for (e2 = Se, Se = [], n2 = e2.length, t2 = 0; t2 < n2; ++t2) {
      var r2 = e2[t2];
      r2[0].apply(null, r2[1]);
    }
  } while (Se.length > 0);
  _e = true, we = true;
}
function Ve() {
  var e2 = xe;
  xe = [], e2.forEach(((e3) => {
    e3._PSD.onunhandled.call(null, e3._value, e3);
  }));
  for (var t2 = Ce.slice(0), n2 = t2.length; n2; ) t2[--n2]();
}
function We(e2) {
  return new je(le, false, e2);
}
function Ye(e2, t2) {
  var n2 = Oe;
  return function() {
    var r2 = Ue(), s2 = Oe;
    try {
      return it(n2, true), e2.apply(this, arguments);
    } catch (e3) {
      t2 && t2(e3);
    } finally {
      it(s2, false), r2 && Le();
    }
  };
}
a(je.prototype, { then: De, _then: function(e2, t2) {
  Fe(this, new Ie(null, null, e2, t2, Oe));
}, catch: function(e2) {
  if (1 === arguments.length) return this.then(null, e2);
  var t2 = arguments[0], n2 = arguments[1];
  return "function" == typeof t2 ? this.then(null, ((e3) => e3 instanceof t2 ? n2(e3) : We(e3))) : this.then(null, ((e3) => e3 && e3.name === t2 ? n2(e3) : We(e3)));
}, finally: function(e2) {
  return this.then(((t2) => (e2(), t2)), ((t2) => (e2(), We(t2))));
}, stack: { get: function() {
  if (this._stack) return this._stack;
  try {
    ve = true;
    var e2 = Ne(this, [], 20).join("\nFrom previous: ");
    return null !== this._state && (this._stack = e2), e2;
  } finally {
    ve = false;
  }
} }, timeout: function(e2, t2) {
  return e2 < 1 / 0 ? new je(((n2, r2) => {
    var s2 = setTimeout((() => r2(new X.Timeout(t2))), e2);
    this.then(n2, r2).finally(clearTimeout.bind(null, s2));
  })) : this;
} }), "undefined" != typeof Symbol && Symbol.toStringTag && l(je.prototype, Symbol.toStringTag, "Dexie.Promise"), Ke.env = ot(), a(je, { all: function() {
  var e2 = B.apply(null, arguments).map(nt);
  return new je((function(t2, n2) {
    0 === e2.length && t2([]);
    var r2 = e2.length;
    e2.forEach(((s2, i2) => je.resolve(s2).then(((n3) => {
      e2[i2] = n3, --r2 || t2(e2);
    }), n2)));
  }));
}, resolve: (e2) => {
  if (e2 instanceof je) return e2;
  if (e2 && "function" == typeof e2.then) return new je(((t3, n2) => {
    e2.then(t3, n2);
  }));
  var t2 = new je(le, true, e2);
  return qe(t2, Ee), t2;
}, reject: We, race: function() {
  var e2 = B.apply(null, arguments).map(nt);
  return new je(((t2, n2) => {
    e2.map(((e3) => je.resolve(e3).then(t2, n2)));
  }));
}, PSD: { get: () => Oe, set: (e2) => Oe = e2 }, totalEchoes: { get: () => Xe }, newPSD: Ze, usePSD: at, scheduler: { get: () => be, set: (e2) => {
  be = e2;
} }, rejectionMapper: { get: () => Pe, set: (e2) => {
  Pe = e2;
} }, follow: (e2, t2) => new je(((n2, r2) => Ze(((t3, n3) => {
  var r3 = Oe;
  r3.unhandleds = [], r3.onunhandled = n3, r3.finalize = re((function() {
    !(function(e3) {
      function t4() {
        e3(), Ce.splice(Ce.indexOf(t4), 1);
      }
      Ce.push(t4), ++Ae, be((() => {
        0 == --Ae && Ve();
      }), []);
    })((() => {
      0 === this.unhandleds.length ? t3() : n3(this.unhandleds[0]);
    }));
  }), r3.finalize), e2();
}), t2, n2, r2))) }), ye && (ye.allSettled && l(je, "allSettled", (function() {
  const e2 = B.apply(null, arguments).map(nt);
  return new je(((t2) => {
    0 === e2.length && t2([]);
    let n2 = e2.length;
    const r2 = new Array(n2);
    e2.forEach(((e3, s2) => je.resolve(e3).then(((e4) => r2[s2] = { status: "fulfilled", value: e4 }), ((e4) => r2[s2] = { status: "rejected", reason: e4 })).then((() => --n2 || t2(r2)))));
  }));
})), ye.any && "undefined" != typeof AggregateError && l(je, "any", (function() {
  const e2 = B.apply(null, arguments).map(nt);
  return new je(((t2, n2) => {
    0 === e2.length && n2(new AggregateError([]));
    let r2 = e2.length;
    const s2 = new Array(r2);
    e2.forEach(((e3, i2) => je.resolve(e3).then(((e4) => t2(e4)), ((e4) => {
      s2[i2] = e4, --r2 || n2(new AggregateError(s2));
    }))));
  }));
})));
const ze = { awaits: 0, echoes: 0, id: 0 };
var Ge = 0, He = [], Qe = 0, Xe = 0, Je = 0;
function Ze(e2, t2, n2, s2) {
  var i2 = Oe, o2 = Object.create(i2);
  o2.parent = i2, o2.ref = 0, o2.global = false, o2.id = ++Je;
  var a2 = Ke.env;
  o2.env = me ? { Promise: je, PromiseProp: { value: je, configurable: true, writable: true }, all: je.all, race: je.race, allSettled: je.allSettled, any: je.any, resolve: je.resolve, reject: je.reject, nthen: ct(a2.nthen, o2), gthen: ct(a2.gthen, o2) } : {}, t2 && r(o2, t2), ++i2.ref, o2.finalize = function() {
    --this.parent.ref || this.parent.finalize();
  };
  var u2 = at(o2, e2, n2, s2);
  return 0 === o2.ref && o2.finalize(), u2;
}
function et() {
  return ze.id || (ze.id = ++Ge), ++ze.awaits, ze.echoes += ce, ze.id;
}
function tt() {
  return !!ze.awaits && (0 == --ze.awaits && (ze.id = 0), ze.echoes = ze.awaits * ce, true);
}
function nt(e2) {
  return ze.echoes && e2 && e2.constructor === ye ? (et(), e2.then(((e3) => (tt(), e3)), ((e3) => (tt(), ft(e3))))) : e2;
}
function rt(e2) {
  ++Xe, ze.echoes && 0 != --ze.echoes || (ze.echoes = ze.id = 0), He.push(Oe), it(e2, true);
}
function st() {
  var e2 = He[He.length - 1];
  He.pop(), it(e2, false);
}
function it(t2, n2) {
  var r2 = Oe;
  if ((n2 ? !ze.echoes || Qe++ && t2 === Oe : !Qe || --Qe && t2 === Oe) || ut(n2 ? rt.bind(null, t2) : st), t2 !== Oe && (Oe = t2, r2 === Ke && (Ke.env = ot()), me)) {
    var s2 = Ke.env.Promise, i2 = t2.env;
    de.then = i2.nthen, s2.prototype.then = i2.gthen, (r2.global || t2.global) && (Object.defineProperty(e, "Promise", i2.PromiseProp), s2.all = i2.all, s2.race = i2.race, s2.resolve = i2.resolve, s2.reject = i2.reject, i2.allSettled && (s2.allSettled = i2.allSettled), i2.any && (s2.any = i2.any));
  }
}
function ot() {
  var t2 = e.Promise;
  return me ? { Promise: t2, PromiseProp: Object.getOwnPropertyDescriptor(e, "Promise"), all: t2.all, race: t2.race, allSettled: t2.allSettled, any: t2.any, resolve: t2.resolve, reject: t2.reject, nthen: de.then, gthen: t2.prototype.then } : {};
}
function at(e2, t2, n2, r2, s2) {
  var i2 = Oe;
  try {
    return it(e2, true), t2(n2, r2, s2);
  } finally {
    it(i2, false);
  }
}
function ut(e2) {
  pe.call(he, e2);
}
function lt(e2, t2, n2, r2) {
  return "function" != typeof e2 ? e2 : function() {
    var s2 = Oe;
    n2 && et(), it(t2, true);
    try {
      return e2.apply(this, arguments);
    } finally {
      it(s2, false), r2 && ut(tt);
    }
  };
}
function ct(e2, t2) {
  return function(n2, r2) {
    return e2.call(this, lt(n2, t2), lt(r2, t2));
  };
}
-1 === ("" + pe).indexOf("[native code]") && (et = tt = ee);
const ht = "unhandledrejection";
function dt(t2, n2) {
  var s2;
  try {
    s2 = n2.onuncatched(t2);
  } catch (e2) {
  }
  if (false !== s2) try {
    var i2, o2 = { promise: n2, reason: t2 };
    if (e.document && document.createEvent ? ((i2 = document.createEvent("Event")).initEvent(ht, true, true), r(i2, o2)) : e.CustomEvent && r(i2 = new CustomEvent(ht, { detail: o2 }), o2), i2 && e.dispatchEvent && (dispatchEvent(i2), !e.PromiseRejectionEvent && e.onunhandledrejection)) try {
      e.onunhandledrejection(i2);
    } catch (e2) {
    }
    R && i2 && !i2.defaultPrevented && console.warn(`Unhandled rejection: ${t2.stack || t2}`);
  } catch (e2) {
  }
}
var ft = je.reject;
function pt(e2, t2, n2, r2) {
  if (e2.idbdb && (e2._state.openComplete || Oe.letThrough || e2._vip)) {
    var s2 = e2._createTransaction(t2, n2, e2._dbSchema);
    try {
      s2.create(), e2._state.PR1398_maxLoop = 3;
    } catch (s3) {
      return s3.name === H.InvalidState && e2.isOpen() && --e2._state.PR1398_maxLoop > 0 ? (console.warn("Dexie: Need to reopen db"), e2._close(), e2.open().then((() => pt(e2, t2, n2, r2)))) : ft(s3);
    }
    return s2._promise(t2, ((e3, t3) => Ze((() => (Oe.trans = s2, r2(e3, t3, s2)))))).then(((e3) => s2._completion.then((() => e3))));
  }
  if (e2._state.openComplete) return ft(new X.DatabaseClosed(e2._state.dbOpenError));
  if (!e2._state.isBeingOpened) {
    if (!e2._options.autoOpen) return ft(new X.DatabaseClosed());
    e2.open().catch(ee);
  }
  return e2._state.dbReadyPromise.then((() => pt(e2, t2, n2, r2)));
}
const yt = "3.2.7", mt = String.fromCharCode(65535), vt = -1 / 0, gt = "Invalid key provided. Keys must be of type string, number, Date or Array<string | number | Date>.", bt = "String expected.", _t = [], wt = "undefined" != typeof navigator && /(MSIE|Trident|Edge)/.test(navigator.userAgent), xt = wt, kt = wt, Et = (e2) => !/(dexie\.js|dexie\.min\.js)/.test(e2), Pt = "__dbnames", Kt = "readonly", Ot = "readwrite";
function St(e2, t2) {
  return e2 ? t2 ? function() {
    return e2.apply(this, arguments) && t2.apply(this, arguments);
  } : e2 : t2;
}
const At = { type: 3, lower: -1 / 0, lowerOpen: false, upper: [[]], upperOpen: false };
function Ct(e2) {
  return "string" != typeof e2 || /\./.test(e2) ? (e3) => e3 : (t2) => (void 0 === t2[e2] && e2 in t2 && delete (t2 = O(t2))[e2], t2);
}
class jt {
  _trans(e2, t2, n2) {
    const r2 = this._tx || Oe.trans, s2 = this.name;
    function i2(e3, n3, r3) {
      if (!r3.schema[s2]) throw new X.NotFound("Table " + s2 + " not part of transaction");
      return t2(r3.idbtrans, r3);
    }
    const o2 = Ue();
    try {
      return r2 && r2.db === this.db ? r2 === Oe.trans ? r2._promise(e2, i2, n2) : Ze((() => r2._promise(e2, i2, n2)), { trans: r2, transless: Oe.transless || Oe }) : pt(this.db, e2, [this.name], i2);
    } finally {
      o2 && Le();
    }
  }
  get(e2, t2) {
    return e2 && e2.constructor === Object ? this.where(e2).first(t2) : this._trans("readonly", ((t3) => this.core.get({ trans: t3, key: e2 }).then(((e3) => this.hook.reading.fire(e3))))).then(t2);
  }
  where(e2) {
    if ("string" == typeof e2) return new this.db.WhereClause(this, e2);
    if (n(e2)) return new this.db.WhereClause(this, `[${e2.join("+")}]`);
    const r2 = t(e2);
    if (1 === r2.length) return this.where(r2[0]).equals(e2[r2[0]]);
    const s2 = this.schema.indexes.concat(this.schema.primKey).filter(((e3) => {
      if (e3.compound && r2.every(((t2) => e3.keyPath.indexOf(t2) >= 0))) {
        for (let t2 = 0; t2 < r2.length; ++t2) if (-1 === r2.indexOf(e3.keyPath[t2])) return false;
        return true;
      }
      return false;
    })).sort(((e3, t2) => e3.keyPath.length - t2.keyPath.length))[0];
    if (s2 && this.db._maxKey !== mt) {
      const t2 = s2.keyPath.slice(0, r2.length);
      return this.where(t2).equals(t2.map(((t3) => e2[t3])));
    }
    !s2 && R && console.warn(`The query ${JSON.stringify(e2)} on ${this.name} would benefit of a compound index [${r2.join("+")}]`);
    const { idxByName: i2 } = this.schema, o2 = this.db._deps.indexedDB;
    function a2(e3, t2) {
      try {
        return 0 === o2.cmp(e3, t2);
      } catch (e4) {
        return false;
      }
    }
    const [u2, l2] = r2.reduce((([t2, r3], s3) => {
      const o3 = i2[s3], u3 = e2[s3];
      return [t2 || o3, t2 || !o3 ? St(r3, o3 && o3.multi ? (e3) => {
        const t3 = b(e3, s3);
        return n(t3) && t3.some(((e4) => a2(u3, e4)));
      } : (e3) => a2(u3, b(e3, s3))) : r3];
    }), [null, null]);
    return u2 ? this.where(u2.name).equals(e2[u2.keyPath]).filter(l2) : s2 ? this.filter(l2) : this.where(r2).equals("");
  }
  filter(e2) {
    return this.toCollection().and(e2);
  }
  count(e2) {
    return this.toCollection().count(e2);
  }
  offset(e2) {
    return this.toCollection().offset(e2);
  }
  limit(e2) {
    return this.toCollection().limit(e2);
  }
  each(e2) {
    return this.toCollection().each(e2);
  }
  toArray(e2) {
    return this.toCollection().toArray(e2);
  }
  toCollection() {
    return new this.db.Collection(new this.db.WhereClause(this));
  }
  orderBy(e2) {
    return new this.db.Collection(new this.db.WhereClause(this, n(e2) ? `[${e2.join("+")}]` : e2));
  }
  reverse() {
    return this.toCollection().reverse();
  }
  mapToClass(e2) {
    this.schema.mappedClass = e2;
    const t2 = (t3) => {
      if (!t3) return t3;
      const n2 = Object.create(e2.prototype);
      for (var r2 in t3) if (o(t3, r2)) try {
        n2[r2] = t3[r2];
      } catch (e3) {
      }
      return n2;
    };
    return this.schema.readHook && this.hook.reading.unsubscribe(this.schema.readHook), this.schema.readHook = t2, this.hook("reading", t2), e2;
  }
  defineClass() {
    return this.mapToClass((function(e2) {
      r(this, e2);
    }));
  }
  add(e2, t2) {
    const { auto: n2, keyPath: r2 } = this.schema.primKey;
    let s2 = e2;
    return r2 && n2 && (s2 = Ct(r2)(e2)), this._trans("readwrite", ((e3) => this.core.mutate({ trans: e3, type: "add", keys: null != t2 ? [t2] : null, values: [s2] }))).then(((e3) => e3.numFailures ? je.reject(e3.failures[0]) : e3.lastResult)).then(((t3) => {
      if (r2) try {
        _(e2, r2, t3);
      } catch (e3) {
      }
      return t3;
    }));
  }
  update(e2, r2) {
    if ("object" != typeof e2 || n(e2)) return this.where(":id").equals(e2).modify(r2);
    {
      const n2 = b(e2, this.schema.primKey.keyPath);
      if (void 0 === n2) return ft(new X.InvalidArgument("Given object does not contain its primary key"));
      try {
        "function" != typeof r2 ? t(r2).forEach(((t2) => {
          _(e2, t2, r2[t2]);
        })) : r2(e2, { value: e2, primKey: n2 });
      } catch (e3) {
      }
      return this.where(":id").equals(n2).modify(r2);
    }
  }
  put(e2, t2) {
    const { auto: n2, keyPath: r2 } = this.schema.primKey;
    let s2 = e2;
    return r2 && n2 && (s2 = Ct(r2)(e2)), this._trans("readwrite", ((e3) => this.core.mutate({ trans: e3, type: "put", values: [s2], keys: null != t2 ? [t2] : null }))).then(((e3) => e3.numFailures ? je.reject(e3.failures[0]) : e3.lastResult)).then(((t3) => {
      if (r2) try {
        _(e2, r2, t3);
      } catch (e3) {
      }
      return t3;
    }));
  }
  delete(e2) {
    return this._trans("readwrite", ((t2) => this.core.mutate({ trans: t2, type: "delete", keys: [e2] }))).then(((e3) => e3.numFailures ? je.reject(e3.failures[0]) : void 0));
  }
  clear() {
    return this._trans("readwrite", ((e2) => this.core.mutate({ trans: e2, type: "deleteRange", range: At }))).then(((e2) => e2.numFailures ? je.reject(e2.failures[0]) : void 0));
  }
  bulkGet(e2) {
    return this._trans("readonly", ((t2) => this.core.getMany({ keys: e2, trans: t2 }).then(((e3) => e3.map(((e4) => this.hook.reading.fire(e4)))))));
  }
  bulkAdd(e2, t2, n2) {
    const r2 = Array.isArray(t2) ? t2 : void 0, s2 = (n2 = n2 || (r2 ? void 0 : t2)) ? n2.allKeys : void 0;
    return this._trans("readwrite", ((t3) => {
      const { auto: n3, keyPath: i2 } = this.schema.primKey;
      if (i2 && r2) throw new X.InvalidArgument("bulkAdd(): keys argument invalid on tables with inbound keys");
      if (r2 && r2.length !== e2.length) throw new X.InvalidArgument("Arguments objects and keys must have the same length");
      const o2 = e2.length;
      let a2 = i2 && n3 ? e2.map(Ct(i2)) : e2;
      return this.core.mutate({ trans: t3, type: "add", keys: r2, values: a2, wantResults: s2 }).then((({ numFailures: e3, results: t4, lastResult: n4, failures: r3 }) => {
        if (0 === e3) return s2 ? t4 : n4;
        throw new G(`${this.name}.bulkAdd(): ${e3} of ${o2} operations failed`, r3);
      }));
    }));
  }
  bulkPut(e2, t2, n2) {
    const r2 = Array.isArray(t2) ? t2 : void 0, s2 = (n2 = n2 || (r2 ? void 0 : t2)) ? n2.allKeys : void 0;
    return this._trans("readwrite", ((t3) => {
      const { auto: n3, keyPath: i2 } = this.schema.primKey;
      if (i2 && r2) throw new X.InvalidArgument("bulkPut(): keys argument invalid on tables with inbound keys");
      if (r2 && r2.length !== e2.length) throw new X.InvalidArgument("Arguments objects and keys must have the same length");
      const o2 = e2.length;
      let a2 = i2 && n3 ? e2.map(Ct(i2)) : e2;
      return this.core.mutate({ trans: t3, type: "put", keys: r2, values: a2, wantResults: s2 }).then((({ numFailures: e3, results: t4, lastResult: n4, failures: r3 }) => {
        if (0 === e3) return s2 ? t4 : n4;
        throw new G(`${this.name}.bulkPut(): ${e3} of ${o2} operations failed`, r3);
      }));
    }));
  }
  bulkDelete(e2) {
    const t2 = e2.length;
    return this._trans("readwrite", ((t3) => this.core.mutate({ trans: t3, type: "delete", keys: e2 }))).then((({ numFailures: e3, lastResult: n2, failures: r2 }) => {
      if (0 === e3) return n2;
      throw new G(`${this.name}.bulkDelete(): ${e3} of ${t2} operations failed`, r2);
    }));
  }
}
function Dt(e2) {
  var r2 = {}, s2 = function(t2, n2) {
    if (n2) {
      for (var s3 = arguments.length, i3 = new Array(s3 - 1); --s3; ) i3[s3 - 1] = arguments[s3];
      return r2[t2].subscribe.apply(null, i3), e2;
    }
    if ("string" == typeof t2) return r2[t2];
  };
  s2.addEventType = a2;
  for (var i2 = 1, o2 = arguments.length; i2 < o2; ++i2) a2(arguments[i2]);
  return s2;
  function a2(e3, i3, o3) {
    if ("object" != typeof e3) {
      var u2;
      i3 || (i3 = ae), o3 || (o3 = ee);
      var l2 = { subscribers: [], fire: o3, subscribe: function(e4) {
        -1 === l2.subscribers.indexOf(e4) && (l2.subscribers.push(e4), l2.fire = i3(l2.fire, e4));
      }, unsubscribe: function(e4) {
        l2.subscribers = l2.subscribers.filter((function(t2) {
          return t2 !== e4;
        })), l2.fire = l2.subscribers.reduce(i3, o3);
      } };
      return r2[e3] = s2[e3] = l2, l2;
    }
    t(u2 = e3).forEach((function(e4) {
      var t2 = u2[e4];
      if (n(t2)) a2(e4, u2[e4][0], u2[e4][1]);
      else {
        if ("asap" !== t2) throw new X.InvalidArgument("Invalid event config");
        var r3 = a2(e4, te, (function() {
          for (var e5 = arguments.length, t3 = new Array(e5); e5--; ) t3[e5] = arguments[e5];
          r3.subscribers.forEach((function(e6) {
            v((function() {
              e6.apply(null, t3);
            }));
          }));
        }));
      }
    }));
  }
}
function It(e2, t2) {
  return c(t2).from({ prototype: e2 }), t2;
}
function Bt(e2, t2) {
  return !(e2.filter || e2.algorithm || e2.or) && (t2 ? e2.justLimit : !e2.replayFilter);
}
function Tt(e2, t2) {
  e2.filter = St(e2.filter, t2);
}
function Rt(e2, t2, n2) {
  var r2 = e2.replayFilter;
  e2.replayFilter = r2 ? () => St(r2(), t2()) : t2, e2.justLimit = n2 && !r2;
}
function Ft(e2, t2) {
  if (e2.isPrimKey) return t2.primaryKey;
  const n2 = t2.getIndexByKeyPath(e2.index);
  if (!n2) throw new X.Schema("KeyPath " + e2.index + " on object store " + t2.name + " is not indexed");
  return n2;
}
function Mt(e2, t2, n2) {
  const r2 = Ft(e2, t2.schema);
  return t2.openCursor({ trans: n2, values: !e2.keysOnly, reverse: "prev" === e2.dir, unique: !!e2.unique, query: { index: r2, range: e2.range } });
}
function Nt(e2, t2, n2, r2) {
  const s2 = e2.replayFilter ? St(e2.filter, e2.replayFilter()) : e2.filter;
  if (e2.or) {
    const i2 = {}, a2 = (e3, n3, r3) => {
      if (!s2 || s2(n3, r3, ((e4) => n3.stop(e4)), ((e4) => n3.fail(e4)))) {
        var a3 = n3.primaryKey, u2 = "" + a3;
        "[object ArrayBuffer]" === u2 && (u2 = "" + new Uint8Array(a3)), o(i2, u2) || (i2[u2] = true, t2(e3, n3, r3));
      }
    };
    return Promise.all([e2.or._iterate(a2, n2), qt(Mt(e2, r2, n2), e2.algorithm, a2, !e2.keysOnly && e2.valueMapper)]);
  }
  return qt(Mt(e2, r2, n2), St(e2.algorithm, s2), t2, !e2.keysOnly && e2.valueMapper);
}
function qt(e2, t2, n2, r2) {
  var s2 = Ye(r2 ? (e3, t3, s3) => n2(r2(e3), t3, s3) : n2);
  return e2.then(((e3) => {
    if (e3) return e3.start((() => {
      var n3 = () => e3.continue();
      t2 && !t2(e3, ((e4) => n3 = e4), ((t3) => {
        e3.stop(t3), n3 = ee;
      }), ((t3) => {
        e3.fail(t3), n3 = ee;
      })) || s2(e3.value, e3, ((e4) => n3 = e4)), n3();
    }));
  }));
}
function $t(e2, t2) {
  try {
    const n2 = Ut(e2), r2 = Ut(t2);
    if (n2 !== r2) return "Array" === n2 ? 1 : "Array" === r2 ? -1 : "binary" === n2 ? 1 : "binary" === r2 ? -1 : "string" === n2 ? 1 : "string" === r2 ? -1 : "Date" === n2 ? 1 : "Date" !== r2 ? NaN : -1;
    switch (n2) {
      case "number":
      case "Date":
      case "string":
        return e2 > t2 ? 1 : e2 < t2 ? -1 : 0;
      case "binary":
        return (function(e3, t3) {
          const n3 = e3.length, r3 = t3.length, s2 = n3 < r3 ? n3 : r3;
          for (let n4 = 0; n4 < s2; ++n4) if (e3[n4] !== t3[n4]) return e3[n4] < t3[n4] ? -1 : 1;
          return n3 === r3 ? 0 : n3 < r3 ? -1 : 1;
        })(Lt(e2), Lt(t2));
      case "Array":
        return (function(e3, t3) {
          const n3 = e3.length, r3 = t3.length, s2 = n3 < r3 ? n3 : r3;
          for (let n4 = 0; n4 < s2; ++n4) {
            const r4 = $t(e3[n4], t3[n4]);
            if (0 !== r4) return r4;
          }
          return n3 === r3 ? 0 : n3 < r3 ? -1 : 1;
        })(e2, t2);
    }
  } catch (e3) {
  }
  return NaN;
}
function Ut(e2) {
  const t2 = typeof e2;
  if ("object" !== t2) return t2;
  if (ArrayBuffer.isView(e2)) return "binary";
  const n2 = C(e2);
  return "ArrayBuffer" === n2 ? "binary" : n2;
}
function Lt(e2) {
  return e2 instanceof Uint8Array ? e2 : ArrayBuffer.isView(e2) ? new Uint8Array(e2.buffer, e2.byteOffset, e2.byteLength) : new Uint8Array(e2);
}
class Vt {
  _read(e2, t2) {
    var n2 = this._ctx;
    return n2.error ? n2.table._trans(null, ft.bind(null, n2.error)) : n2.table._trans("readonly", e2).then(t2);
  }
  _write(e2) {
    var t2 = this._ctx;
    return t2.error ? t2.table._trans(null, ft.bind(null, t2.error)) : t2.table._trans("readwrite", e2, "locked");
  }
  _addAlgorithm(e2) {
    var t2 = this._ctx;
    t2.algorithm = St(t2.algorithm, e2);
  }
  _iterate(e2, t2) {
    return Nt(this._ctx, e2, t2, this._ctx.table.core);
  }
  clone(e2) {
    var t2 = Object.create(this.constructor.prototype), n2 = Object.create(this._ctx);
    return e2 && r(n2, e2), t2._ctx = n2, t2;
  }
  raw() {
    return this._ctx.valueMapper = null, this;
  }
  each(e2) {
    var t2 = this._ctx;
    return this._read(((n2) => Nt(t2, e2, n2, t2.table.core)));
  }
  count(e2) {
    return this._read(((e3) => {
      const t2 = this._ctx, n2 = t2.table.core;
      if (Bt(t2, true)) return n2.count({ trans: e3, query: { index: Ft(t2, n2.schema), range: t2.range } }).then(((e4) => Math.min(e4, t2.limit)));
      var r2 = 0;
      return Nt(t2, (() => (++r2, false)), e3, n2).then((() => r2));
    })).then(e2);
  }
  sortBy(e2, t2) {
    const n2 = e2.split(".").reverse(), r2 = n2[0], s2 = n2.length - 1;
    function i2(e3, t3) {
      return t3 ? i2(e3[n2[t3]], t3 - 1) : e3[r2];
    }
    var o2 = "next" === this._ctx.dir ? 1 : -1;
    function a2(e3, t3) {
      var n3 = i2(e3, s2), r3 = i2(t3, s2);
      return n3 < r3 ? -o2 : n3 > r3 ? o2 : 0;
    }
    return this.toArray((function(e3) {
      return e3.sort(a2);
    })).then(t2);
  }
  toArray(e2) {
    return this._read(((e3) => {
      var t2 = this._ctx;
      if ("next" === t2.dir && Bt(t2, true) && t2.limit > 0) {
        const { valueMapper: n2 } = t2, r2 = Ft(t2, t2.table.core.schema);
        return t2.table.core.query({ trans: e3, limit: t2.limit, values: true, query: { index: r2, range: t2.range } }).then((({ result: e4 }) => n2 ? e4.map(n2) : e4));
      }
      {
        const n2 = [];
        return Nt(t2, ((e4) => n2.push(e4)), e3, t2.table.core).then((() => n2));
      }
    }), e2);
  }
  offset(e2) {
    var t2 = this._ctx;
    return e2 <= 0 || (t2.offset += e2, Bt(t2) ? Rt(t2, (() => {
      var t3 = e2;
      return (e3, n2) => 0 === t3 || (1 === t3 ? (--t3, false) : (n2((() => {
        e3.advance(t3), t3 = 0;
      })), false));
    })) : Rt(t2, (() => {
      var t3 = e2;
      return () => --t3 < 0;
    }))), this;
  }
  limit(e2) {
    return this._ctx.limit = Math.min(this._ctx.limit, e2), Rt(this._ctx, (() => {
      var t2 = e2;
      return function(e3, n2, r2) {
        return --t2 <= 0 && n2(r2), t2 >= 0;
      };
    }), true), this;
  }
  until(e2, t2) {
    return Tt(this._ctx, (function(n2, r2, s2) {
      return !e2(n2.value) || (r2(s2), t2);
    })), this;
  }
  first(e2) {
    return this.limit(1).toArray((function(e3) {
      return e3[0];
    })).then(e2);
  }
  last(e2) {
    return this.reverse().first(e2);
  }
  filter(e2) {
    var t2, n2;
    return Tt(this._ctx, (function(t3) {
      return e2(t3.value);
    })), t2 = this._ctx, n2 = e2, t2.isMatch = St(t2.isMatch, n2), this;
  }
  and(e2) {
    return this.filter(e2);
  }
  or(e2) {
    return new this.db.WhereClause(this._ctx.table, e2, this);
  }
  reverse() {
    return this._ctx.dir = "prev" === this._ctx.dir ? "next" : "prev", this._ondirectionchange && this._ondirectionchange(this._ctx.dir), this;
  }
  desc() {
    return this.reverse();
  }
  eachKey(e2) {
    var t2 = this._ctx;
    return t2.keysOnly = !t2.isMatch, this.each((function(t3, n2) {
      e2(n2.key, n2);
    }));
  }
  eachUniqueKey(e2) {
    return this._ctx.unique = "unique", this.eachKey(e2);
  }
  eachPrimaryKey(e2) {
    var t2 = this._ctx;
    return t2.keysOnly = !t2.isMatch, this.each((function(t3, n2) {
      e2(n2.primaryKey, n2);
    }));
  }
  keys(e2) {
    var t2 = this._ctx;
    t2.keysOnly = !t2.isMatch;
    var n2 = [];
    return this.each((function(e3, t3) {
      n2.push(t3.key);
    })).then((function() {
      return n2;
    })).then(e2);
  }
  primaryKeys(e2) {
    var t2 = this._ctx;
    if ("next" === t2.dir && Bt(t2, true) && t2.limit > 0) return this._read(((e3) => {
      var n3 = Ft(t2, t2.table.core.schema);
      return t2.table.core.query({ trans: e3, values: false, limit: t2.limit, query: { index: n3, range: t2.range } });
    })).then((({ result: e3 }) => e3)).then(e2);
    t2.keysOnly = !t2.isMatch;
    var n2 = [];
    return this.each((function(e3, t3) {
      n2.push(t3.primaryKey);
    })).then((function() {
      return n2;
    })).then(e2);
  }
  uniqueKeys(e2) {
    return this._ctx.unique = "unique", this.keys(e2);
  }
  firstKey(e2) {
    return this.limit(1).keys((function(e3) {
      return e3[0];
    })).then(e2);
  }
  lastKey(e2) {
    return this.reverse().firstKey(e2);
  }
  distinct() {
    var e2 = this._ctx, t2 = e2.index && e2.table.schema.idxByName[e2.index];
    if (!t2 || !t2.multi) return this;
    var n2 = {};
    return Tt(this._ctx, (function(e3) {
      var t3 = e3.primaryKey.toString(), r2 = o(n2, t3);
      return n2[t3] = true, !r2;
    })), this;
  }
  modify(e2) {
    var n2 = this._ctx;
    return this._write(((r2) => {
      var s2;
      if ("function" == typeof e2) s2 = e2;
      else {
        var i2 = t(e2), o2 = i2.length;
        s2 = function(t2) {
          for (var n3 = false, r3 = 0; r3 < o2; ++r3) {
            var s3 = i2[r3], a3 = e2[s3];
            b(t2, s3) !== a3 && (_(t2, s3, a3), n3 = true);
          }
          return n3;
        };
      }
      const a2 = n2.table.core, { outbound: u2, extractKey: l2 } = a2.schema.primaryKey, c2 = this.db._options.modifyChunkSize || 200, h2 = [];
      let d2 = 0;
      const f2 = [], p2 = (e3, n3) => {
        const { failures: r3, numFailures: s3 } = n3;
        d2 += e3 - s3;
        for (let e4 of t(r3)) h2.push(r3[e4]);
      };
      return this.clone().primaryKeys().then(((t2) => {
        const i3 = (o3) => {
          const h3 = Math.min(c2, t2.length - o3);
          return a2.getMany({ trans: r2, keys: t2.slice(o3, o3 + h3), cache: "immutable" }).then(((d3) => {
            const f3 = [], y2 = [], m2 = u2 ? [] : null, v2 = [];
            for (let e3 = 0; e3 < h3; ++e3) {
              const n3 = d3[e3], r3 = { value: O(n3), primKey: t2[o3 + e3] };
              false !== s2.call(r3, r3.value, r3) && (null == r3.value ? v2.push(t2[o3 + e3]) : u2 || 0 === $t(l2(n3), l2(r3.value)) ? (y2.push(r3.value), u2 && m2.push(t2[o3 + e3])) : (v2.push(t2[o3 + e3]), f3.push(r3.value)));
            }
            const g2 = Bt(n2) && n2.limit === 1 / 0 && ("function" != typeof e2 || e2 === Wt) && { index: n2.index, range: n2.range };
            return Promise.resolve(f3.length > 0 && a2.mutate({ trans: r2, type: "add", values: f3 }).then(((e3) => {
              for (let t3 in e3.failures) v2.splice(parseInt(t3), 1);
              p2(f3.length, e3);
            }))).then((() => (y2.length > 0 || g2 && "object" == typeof e2) && a2.mutate({ trans: r2, type: "put", keys: m2, values: y2, criteria: g2, changeSpec: "function" != typeof e2 && e2 }).then(((e3) => p2(y2.length, e3))))).then((() => (v2.length > 0 || g2 && e2 === Wt) && a2.mutate({ trans: r2, type: "delete", keys: v2, criteria: g2 }).then(((e3) => p2(v2.length, e3))))).then((() => t2.length > o3 + h3 && i3(o3 + c2)));
          }));
        };
        return i3(0).then((() => {
          if (h2.length > 0) throw new z("Error modifying one or more objects", h2, d2, f2);
          return t2.length;
        }));
      }));
    }));
  }
  delete() {
    var e2 = this._ctx, t2 = e2.range;
    return Bt(e2) && (e2.isPrimKey && !kt || 3 === t2.type) ? this._write(((n2) => {
      const { primaryKey: r2 } = e2.table.core.schema, s2 = t2;
      return e2.table.core.count({ trans: n2, query: { index: r2, range: s2 } }).then(((t3) => e2.table.core.mutate({ trans: n2, type: "deleteRange", range: s2 }).then((({ failures: e3, lastResult: n3, results: r3, numFailures: s3 }) => {
        if (s3) throw new z("Could not delete some values", Object.keys(e3).map(((t4) => e3[t4])), t3 - s3);
        return t3 - s3;
      }))));
    })) : this.modify(Wt);
  }
}
const Wt = (e2, t2) => t2.value = null;
function Yt(e2, t2) {
  return e2 < t2 ? -1 : e2 === t2 ? 0 : 1;
}
function zt(e2, t2) {
  return e2 > t2 ? -1 : e2 === t2 ? 0 : 1;
}
function Gt(e2, t2, n2) {
  var r2 = e2 instanceof en ? new e2.Collection(e2) : e2;
  return r2._ctx.error = n2 ? new n2(t2) : new TypeError(t2), r2;
}
function Ht(e2) {
  return new e2.Collection(e2, (() => Zt(""))).limit(0);
}
function Qt(e2, t2, n2, r2, s2, i2) {
  for (var o2 = Math.min(e2.length, r2.length), a2 = -1, u2 = 0; u2 < o2; ++u2) {
    var l2 = t2[u2];
    if (l2 !== r2[u2]) return s2(e2[u2], n2[u2]) < 0 ? e2.substr(0, u2) + n2[u2] + n2.substr(u2 + 1) : s2(e2[u2], r2[u2]) < 0 ? e2.substr(0, u2) + r2[u2] + n2.substr(u2 + 1) : a2 >= 0 ? e2.substr(0, a2) + t2[a2] + n2.substr(a2 + 1) : null;
    s2(e2[u2], l2) < 0 && (a2 = u2);
  }
  return o2 < r2.length && "next" === i2 ? e2 + n2.substr(e2.length) : o2 < e2.length && "prev" === i2 ? e2.substr(0, n2.length) : a2 < 0 ? null : e2.substr(0, a2) + r2[a2] + n2.substr(a2 + 1);
}
function Xt(e2, t2, n2, r2) {
  var s2, i2, o2, a2, u2, l2, c2, h2 = n2.length;
  if (!n2.every(((e3) => "string" == typeof e3))) return Gt(e2, bt);
  function d2(e3) {
    s2 = /* @__PURE__ */ (function(e4) {
      return "next" === e4 ? (e5) => e5.toUpperCase() : (e5) => e5.toLowerCase();
    })(e3), i2 = /* @__PURE__ */ (function(e4) {
      return "next" === e4 ? (e5) => e5.toLowerCase() : (e5) => e5.toUpperCase();
    })(e3), o2 = "next" === e3 ? Yt : zt;
    var t3 = n2.map((function(e4) {
      return { lower: i2(e4), upper: s2(e4) };
    })).sort((function(e4, t4) {
      return o2(e4.lower, t4.lower);
    }));
    a2 = t3.map((function(e4) {
      return e4.upper;
    })), u2 = t3.map((function(e4) {
      return e4.lower;
    })), l2 = e3, c2 = "next" === e3 ? "" : r2;
  }
  d2("next");
  var f2 = new e2.Collection(e2, (() => Jt(a2[0], u2[h2 - 1] + r2)));
  f2._ondirectionchange = function(e3) {
    d2(e3);
  };
  var p2 = 0;
  return f2._addAlgorithm((function(e3, n3, r3) {
    var s3 = e3.key;
    if ("string" != typeof s3) return false;
    var d3 = i2(s3);
    if (t2(d3, u2, p2)) return true;
    for (var f3 = null, y2 = p2; y2 < h2; ++y2) {
      var m2 = Qt(s3, d3, a2[y2], u2[y2], o2, l2);
      null === m2 && null === f3 ? p2 = y2 + 1 : (null === f3 || o2(f3, m2) > 0) && (f3 = m2);
    }
    return n3(null !== f3 ? function() {
      e3.continue(f3 + c2);
    } : r3), false;
  })), f2;
}
function Jt(e2, t2, n2, r2) {
  return { type: 2, lower: e2, upper: t2, lowerOpen: n2, upperOpen: r2 };
}
function Zt(e2) {
  return { type: 1, lower: e2, upper: e2 };
}
class en {
  get Collection() {
    return this._ctx.table.db.Collection;
  }
  between(e2, t2, n2, r2) {
    n2 = false !== n2, r2 = true === r2;
    try {
      return this._cmp(e2, t2) > 0 || 0 === this._cmp(e2, t2) && (n2 || r2) && (!n2 || !r2) ? Ht(this) : new this.Collection(this, (() => Jt(e2, t2, !n2, !r2)));
    } catch (e3) {
      return Gt(this, gt);
    }
  }
  equals(e2) {
    return null == e2 ? Gt(this, gt) : new this.Collection(this, (() => Zt(e2)));
  }
  above(e2) {
    return null == e2 ? Gt(this, gt) : new this.Collection(this, (() => Jt(e2, void 0, true)));
  }
  aboveOrEqual(e2) {
    return null == e2 ? Gt(this, gt) : new this.Collection(this, (() => Jt(e2, void 0, false)));
  }
  below(e2) {
    return null == e2 ? Gt(this, gt) : new this.Collection(this, (() => Jt(void 0, e2, false, true)));
  }
  belowOrEqual(e2) {
    return null == e2 ? Gt(this, gt) : new this.Collection(this, (() => Jt(void 0, e2)));
  }
  startsWith(e2) {
    return "string" != typeof e2 ? Gt(this, bt) : this.between(e2, e2 + mt, true, true);
  }
  startsWithIgnoreCase(e2) {
    return "" === e2 ? this.startsWith(e2) : Xt(this, ((e3, t2) => 0 === e3.indexOf(t2[0])), [e2], mt);
  }
  equalsIgnoreCase(e2) {
    return Xt(this, ((e3, t2) => e3 === t2[0]), [e2], "");
  }
  anyOfIgnoreCase() {
    var e2 = B.apply(I, arguments);
    return 0 === e2.length ? Ht(this) : Xt(this, ((e3, t2) => -1 !== t2.indexOf(e3)), e2, "");
  }
  startsWithAnyOfIgnoreCase() {
    var e2 = B.apply(I, arguments);
    return 0 === e2.length ? Ht(this) : Xt(this, ((e3, t2) => t2.some(((t3) => 0 === e3.indexOf(t3)))), e2, mt);
  }
  anyOf() {
    const e2 = B.apply(I, arguments);
    let t2 = this._cmp;
    try {
      e2.sort(t2);
    } catch (e3) {
      return Gt(this, gt);
    }
    if (0 === e2.length) return Ht(this);
    const n2 = new this.Collection(this, (() => Jt(e2[0], e2[e2.length - 1])));
    n2._ondirectionchange = (n3) => {
      t2 = "next" === n3 ? this._ascending : this._descending, e2.sort(t2);
    };
    let r2 = 0;
    return n2._addAlgorithm(((n3, s2, i2) => {
      const o2 = n3.key;
      for (; t2(o2, e2[r2]) > 0; ) if (++r2, r2 === e2.length) return s2(i2), false;
      return 0 === t2(o2, e2[r2]) || (s2((() => {
        n3.continue(e2[r2]);
      })), false);
    })), n2;
  }
  notEqual(e2) {
    return this.inAnyRange([[vt, e2], [e2, this.db._maxKey]], { includeLowers: false, includeUppers: false });
  }
  noneOf() {
    const e2 = B.apply(I, arguments);
    if (0 === e2.length) return new this.Collection(this);
    try {
      e2.sort(this._ascending);
    } catch (e3) {
      return Gt(this, gt);
    }
    const t2 = e2.reduce(((e3, t3) => e3 ? e3.concat([[e3[e3.length - 1][1], t3]]) : [[vt, t3]]), null);
    return t2.push([e2[e2.length - 1], this.db._maxKey]), this.inAnyRange(t2, { includeLowers: false, includeUppers: false });
  }
  inAnyRange(e2, t2) {
    const n2 = this._cmp, r2 = this._ascending, s2 = this._descending, i2 = this._min, o2 = this._max;
    if (0 === e2.length) return Ht(this);
    if (!e2.every(((e3) => void 0 !== e3[0] && void 0 !== e3[1] && r2(e3[0], e3[1]) <= 0))) return Gt(this, "First argument to inAnyRange() must be an Array of two-value Arrays [lower,upper] where upper must not be lower than lower", X.InvalidArgument);
    const a2 = !t2 || false !== t2.includeLowers, u2 = t2 && true === t2.includeUppers;
    let l2, c2 = r2;
    function h2(e3, t3) {
      return c2(e3[0], t3[0]);
    }
    try {
      l2 = e2.reduce((function(e3, t3) {
        let r3 = 0, s3 = e3.length;
        for (; r3 < s3; ++r3) {
          const s4 = e3[r3];
          if (n2(t3[0], s4[1]) < 0 && n2(t3[1], s4[0]) > 0) {
            s4[0] = i2(s4[0], t3[0]), s4[1] = o2(s4[1], t3[1]);
            break;
          }
        }
        return r3 === s3 && e3.push(t3), e3;
      }), []), l2.sort(h2);
    } catch (e3) {
      return Gt(this, gt);
    }
    let d2 = 0;
    const f2 = u2 ? (e3) => r2(e3, l2[d2][1]) > 0 : (e3) => r2(e3, l2[d2][1]) >= 0, p2 = a2 ? (e3) => s2(e3, l2[d2][0]) > 0 : (e3) => s2(e3, l2[d2][0]) >= 0;
    let y2 = f2;
    const m2 = new this.Collection(this, (() => Jt(l2[0][0], l2[l2.length - 1][1], !a2, !u2)));
    return m2._ondirectionchange = (e3) => {
      "next" === e3 ? (y2 = f2, c2 = r2) : (y2 = p2, c2 = s2), l2.sort(h2);
    }, m2._addAlgorithm(((e3, t3, n3) => {
      for (var s3 = e3.key; y2(s3); ) if (++d2, d2 === l2.length) return t3(n3), false;
      return !!(function(e4) {
        return !f2(e4) && !p2(e4);
      })(s3) || (0 === this._cmp(s3, l2[d2][1]) || 0 === this._cmp(s3, l2[d2][0]) || t3((() => {
        c2 === r2 ? e3.continue(l2[d2][0]) : e3.continue(l2[d2][1]);
      })), false);
    })), m2;
  }
  startsWithAnyOf() {
    const e2 = B.apply(I, arguments);
    return e2.every(((e3) => "string" == typeof e3)) ? 0 === e2.length ? Ht(this) : this.inAnyRange(e2.map(((e3) => [e3, e3 + mt]))) : Gt(this, "startsWithAnyOf() only works with strings");
  }
}
function tn(e2) {
  return Ye((function(t2) {
    return nn(t2), e2(t2.target.error), false;
  }));
}
function nn(e2) {
  e2.stopPropagation && e2.stopPropagation(), e2.preventDefault && e2.preventDefault();
}
const rn = "storagemutated", sn = "x-storagemutated-1", on = Dt(null, rn);
class an {
  _lock() {
    return m(!Oe.global), ++this._reculock, 1 !== this._reculock || Oe.global || (Oe.lockOwnerFor = this), this;
  }
  _unlock() {
    if (m(!Oe.global), 0 == --this._reculock) for (Oe.global || (Oe.lockOwnerFor = null); this._blockedFuncs.length > 0 && !this._locked(); ) {
      var e2 = this._blockedFuncs.shift();
      try {
        at(e2[1], e2[0]);
      } catch (e3) {
      }
    }
    return this;
  }
  _locked() {
    return this._reculock && Oe.lockOwnerFor !== this;
  }
  create(e2) {
    if (!this.mode) return this;
    const t2 = this.db.idbdb, n2 = this.db._state.dbOpenError;
    if (m(!this.idbtrans), !e2 && !t2) switch (n2 && n2.name) {
      case "DatabaseClosedError":
        throw new X.DatabaseClosed(n2);
      case "MissingAPIError":
        throw new X.MissingAPI(n2.message, n2);
      default:
        throw new X.OpenFailed(n2);
    }
    if (!this.active) throw new X.TransactionInactive();
    return m(null === this._completion._state), (e2 = this.idbtrans = e2 || (this.db.core ? this.db.core.transaction(this.storeNames, this.mode, { durability: this.chromeTransactionDurability }) : t2.transaction(this.storeNames, this.mode, { durability: this.chromeTransactionDurability }))).onerror = Ye(((t3) => {
      nn(t3), this._reject(e2.error);
    })), e2.onabort = Ye(((t3) => {
      nn(t3), this.active && this._reject(new X.Abort(e2.error)), this.active = false, this.on("abort").fire(t3);
    })), e2.oncomplete = Ye((() => {
      this.active = false, this._resolve(), "mutatedParts" in e2 && on.storagemutated.fire(e2.mutatedParts);
    })), this;
  }
  _promise(e2, t2, n2) {
    if ("readwrite" === e2 && "readwrite" !== this.mode) return ft(new X.ReadOnly("Transaction is readonly"));
    if (!this.active) return ft(new X.TransactionInactive());
    if (this._locked()) return new je(((r3, s2) => {
      this._blockedFuncs.push([() => {
        this._promise(e2, t2, n2).then(r3, s2);
      }, Oe]);
    }));
    if (n2) return Ze((() => {
      var e3 = new je(((e4, n3) => {
        this._lock();
        const r3 = t2(e4, n3, this);
        r3 && r3.then && r3.then(e4, n3);
      }));
      return e3.finally((() => this._unlock())), e3._lib = true, e3;
    }));
    var r2 = new je(((e3, n3) => {
      var r3 = t2(e3, n3, this);
      r3 && r3.then && r3.then(e3, n3);
    }));
    return r2._lib = true, r2;
  }
  _root() {
    return this.parent ? this.parent._root() : this;
  }
  waitFor(e2) {
    var t2 = this._root();
    const n2 = je.resolve(e2);
    if (t2._waitingFor) t2._waitingFor = t2._waitingFor.then((() => n2));
    else {
      t2._waitingFor = n2, t2._waitingQueue = [];
      var r2 = t2.idbtrans.objectStore(t2.storeNames[0]);
      !(function e3() {
        for (++t2._spinCount; t2._waitingQueue.length; ) t2._waitingQueue.shift()();
        t2._waitingFor && (r2.get(-1 / 0).onsuccess = e3);
      })();
    }
    var s2 = t2._waitingFor;
    return new je(((e3, r3) => {
      n2.then(((n3) => t2._waitingQueue.push(Ye(e3.bind(null, n3)))), ((e4) => t2._waitingQueue.push(Ye(r3.bind(null, e4))))).finally((() => {
        t2._waitingFor === s2 && (t2._waitingFor = null);
      }));
    }));
  }
  abort() {
    this.active && (this.active = false, this.idbtrans && this.idbtrans.abort(), this._reject(new X.Abort()));
  }
  table(e2) {
    const t2 = this._memoizedTables || (this._memoizedTables = {});
    if (o(t2, e2)) return t2[e2];
    const n2 = this.schema[e2];
    if (!n2) throw new X.NotFound("Table " + e2 + " not part of transaction");
    const r2 = new this.db.Table(e2, n2, this);
    return r2.core = this.db.core.table(e2), t2[e2] = r2, r2;
  }
}
function un(e2, t2, n2, r2, s2, i2, o2) {
  return { name: e2, keyPath: t2, unique: n2, multi: r2, auto: s2, compound: i2, src: (n2 && !o2 ? "&" : "") + (r2 ? "*" : "") + (s2 ? "++" : "") + ln(t2) };
}
function ln(e2) {
  return "string" == typeof e2 ? e2 : e2 ? "[" + [].join.call(e2, "+") + "]" : "";
}
function cn(e2, t2, n2) {
  return { name: e2, primKey: t2, indexes: n2, mappedClass: null, idxByName: g(n2, ((e3) => [e3.name, e3])) };
}
let hn = (e2) => {
  try {
    return e2.only([[]]), hn = () => [[]], [[]];
  } catch (e3) {
    return hn = () => mt, mt;
  }
};
function dn(e2) {
  return null == e2 ? () => {
  } : "string" == typeof e2 ? (function(e3) {
    const t2 = e3.split(".");
    return 1 === t2.length ? (t3) => t3[e3] : (t3) => b(t3, e3);
  })(e2) : (t2) => b(t2, e2);
}
function fn(e2) {
  return [].slice.call(e2);
}
let pn = 0;
function yn(e2) {
  return null == e2 ? ":id" : "string" == typeof e2 ? e2 : `[${e2.join("+")}]`;
}
function mn(e2, t2, r2) {
  function s2(e3) {
    if (3 === e3.type) return null;
    if (4 === e3.type) throw new Error("Cannot convert never type to IDBKeyRange");
    const { lower: n2, upper: r3, lowerOpen: s3, upperOpen: i3 } = e3;
    return void 0 === n2 ? void 0 === r3 ? null : t2.upperBound(r3, !!i3) : void 0 === r3 ? t2.lowerBound(n2, !!s3) : t2.bound(n2, r3, !!s3, !!i3);
  }
  const { schema: i2, hasGetAll: o2 } = (function(e3, t3) {
    const r3 = fn(e3.objectStoreNames);
    return { schema: { name: e3.name, tables: r3.map(((e4) => t3.objectStore(e4))).map(((e4) => {
      const { keyPath: t4, autoIncrement: r4 } = e4, s3 = n(t4), i3 = null == t4, o3 = {}, a3 = { name: e4.name, primaryKey: { name: null, isPrimaryKey: true, outbound: i3, compound: s3, keyPath: t4, autoIncrement: r4, unique: true, extractKey: dn(t4) }, indexes: fn(e4.indexNames).map(((t5) => e4.index(t5))).map(((e5) => {
        const { name: t5, unique: r5, multiEntry: s4, keyPath: i4 } = e5, a4 = { name: t5, compound: n(i4), keyPath: i4, unique: r5, multiEntry: s4, extractKey: dn(i4) };
        return o3[yn(i4)] = a4, a4;
      })), getIndexByKeyPath: (e5) => o3[yn(e5)] };
      return o3[":id"] = a3.primaryKey, null != t4 && (o3[yn(t4)] = a3.primaryKey), a3;
    })) }, hasGetAll: r3.length > 0 && "getAll" in t3.objectStore(r3[0]) && !("undefined" != typeof navigator && /Safari/.test(navigator.userAgent) && !/(Chrome\/|Edge\/)/.test(navigator.userAgent) && [].concat(navigator.userAgent.match(/Safari\/(\d*)/))[1] < 604) };
  })(e2, r2), a2 = i2.tables.map(((e3) => (function(e4) {
    const t3 = e4.name;
    return { name: t3, schema: e4, mutate: function({ trans: e5, type: n2, keys: r3, values: i3, range: o3 }) {
      return new Promise(((a3, u3) => {
        a3 = Ye(a3);
        const l2 = e5.objectStore(t3), c2 = null == l2.keyPath, h2 = "put" === n2 || "add" === n2;
        if (!h2 && "delete" !== n2 && "deleteRange" !== n2) throw new Error("Invalid operation type: " + n2);
        const { length: d2 } = r3 || i3 || { length: 1 };
        if (r3 && i3 && r3.length !== i3.length) throw new Error("Given keys array must have same length as given values array.");
        if (0 === d2) return a3({ numFailures: 0, failures: {}, results: [], lastResult: void 0 });
        let f2;
        const p2 = [], y2 = [];
        let m2 = 0;
        const v2 = (e6) => {
          ++m2, nn(e6);
        };
        if ("deleteRange" === n2) {
          if (4 === o3.type) return a3({ numFailures: m2, failures: y2, results: [], lastResult: void 0 });
          3 === o3.type ? p2.push(f2 = l2.clear()) : p2.push(f2 = l2.delete(s2(o3)));
        } else {
          const [e6, t4] = h2 ? c2 ? [i3, r3] : [i3, null] : [r3, null];
          if (h2) for (let r4 = 0; r4 < d2; ++r4) p2.push(f2 = t4 && void 0 !== t4[r4] ? l2[n2](e6[r4], t4[r4]) : l2[n2](e6[r4])), f2.onerror = v2;
          else for (let t5 = 0; t5 < d2; ++t5) p2.push(f2 = l2[n2](e6[t5])), f2.onerror = v2;
        }
        const g2 = (e6) => {
          const t4 = e6.target.result;
          p2.forEach(((e7, t5) => null != e7.error && (y2[t5] = e7.error))), a3({ numFailures: m2, failures: y2, results: "delete" === n2 ? r3 : p2.map(((e7) => e7.result)), lastResult: t4 });
        };
        f2.onerror = (e6) => {
          v2(e6), g2(e6);
        }, f2.onsuccess = g2;
      }));
    }, getMany: ({ trans: e5, keys: n2 }) => new Promise(((r3, s3) => {
      r3 = Ye(r3);
      const i3 = e5.objectStore(t3), o3 = n2.length, a3 = new Array(o3);
      let u3, l2 = 0, c2 = 0;
      const h2 = (e6) => {
        const t4 = e6.target;
        a3[t4._pos] = t4.result, ++c2 === l2 && r3(a3);
      }, d2 = tn(s3);
      for (let e6 = 0; e6 < o3; ++e6) null != n2[e6] && (u3 = i3.get(n2[e6]), u3._pos = e6, u3.onsuccess = h2, u3.onerror = d2, ++l2);
      0 === l2 && r3(a3);
    })), get: ({ trans: e5, key: n2 }) => new Promise(((r3, s3) => {
      r3 = Ye(r3);
      const i3 = e5.objectStore(t3).get(n2);
      i3.onsuccess = (e6) => r3(e6.target.result), i3.onerror = tn(s3);
    })), query: /* @__PURE__ */ (function(e5) {
      return (n2) => new Promise(((r3, i3) => {
        r3 = Ye(r3);
        const { trans: o3, values: a3, limit: u3, query: l2 } = n2, c2 = u3 === 1 / 0 ? void 0 : u3, { index: h2, range: d2 } = l2, f2 = o3.objectStore(t3), p2 = h2.isPrimaryKey ? f2 : f2.index(h2.name), y2 = s2(d2);
        if (0 === u3) return r3({ result: [] });
        if (e5) {
          const e6 = a3 ? p2.getAll(y2, c2) : p2.getAllKeys(y2, c2);
          e6.onsuccess = (e7) => r3({ result: e7.target.result }), e6.onerror = tn(i3);
        } else {
          let e6 = 0;
          const t4 = a3 || !("openKeyCursor" in p2) ? p2.openCursor(y2) : p2.openKeyCursor(y2), n3 = [];
          t4.onsuccess = (s3) => {
            const i4 = t4.result;
            return i4 ? (n3.push(a3 ? i4.value : i4.primaryKey), ++e6 === u3 ? r3({ result: n3 }) : void i4.continue()) : r3({ result: n3 });
          }, t4.onerror = tn(i3);
        }
      }));
    })(o2), openCursor: function({ trans: e5, values: n2, query: r3, reverse: i3, unique: o3 }) {
      return new Promise(((a3, u3) => {
        a3 = Ye(a3);
        const { index: l2, range: c2 } = r3, h2 = e5.objectStore(t3), d2 = l2.isPrimaryKey ? h2 : h2.index(l2.name), f2 = i3 ? o3 ? "prevunique" : "prev" : o3 ? "nextunique" : "next", p2 = n2 || !("openKeyCursor" in d2) ? d2.openCursor(s2(c2), f2) : d2.openKeyCursor(s2(c2), f2);
        p2.onerror = tn(u3), p2.onsuccess = Ye(((t4) => {
          const n3 = p2.result;
          if (!n3) return void a3(null);
          n3.___id = ++pn, n3.done = false;
          const r4 = n3.continue.bind(n3);
          let s3 = n3.continuePrimaryKey;
          s3 && (s3 = s3.bind(n3));
          const i4 = n3.advance.bind(n3), o4 = () => {
            throw new Error("Cursor not stopped");
          };
          n3.trans = e5, n3.stop = n3.continue = n3.continuePrimaryKey = n3.advance = () => {
            throw new Error("Cursor not started");
          }, n3.fail = Ye(u3), n3.next = function() {
            let e6 = 1;
            return this.start((() => e6-- ? this.continue() : this.stop())).then((() => this));
          }, n3.start = (e6) => {
            const t5 = new Promise(((e7, t6) => {
              e7 = Ye(e7), p2.onerror = tn(t6), n3.fail = t6, n3.stop = (t7) => {
                n3.stop = n3.continue = n3.continuePrimaryKey = n3.advance = o4, e7(t7);
              };
            })), a4 = () => {
              if (p2.result) try {
                e6();
              } catch (e7) {
                n3.fail(e7);
              }
              else n3.done = true, n3.start = () => {
                throw new Error("Cursor behind last entry");
              }, n3.stop();
            };
            return p2.onsuccess = Ye(((e7) => {
              p2.onsuccess = a4, a4();
            })), n3.continue = r4, n3.continuePrimaryKey = s3, n3.advance = i4, a4(), t5;
          }, a3(n3);
        }), u3);
      }));
    }, count({ query: e5, trans: n2 }) {
      const { index: r3, range: i3 } = e5;
      return new Promise(((e6, o3) => {
        const a3 = n2.objectStore(t3), u3 = r3.isPrimaryKey ? a3 : a3.index(r3.name), l2 = s2(i3), c2 = l2 ? u3.count(l2) : u3.count();
        c2.onsuccess = Ye(((t4) => e6(t4.target.result))), c2.onerror = tn(o3);
      }));
    } };
  })(e3))), u2 = {};
  return a2.forEach(((e3) => u2[e3.name] = e3)), { stack: "dbcore", transaction: e2.transaction.bind(e2), table(e3) {
    if (!u2[e3]) throw new Error(`Table '${e3}' not found`);
    return u2[e3];
  }, MIN_KEY: -1 / 0, MAX_KEY: hn(t2), schema: i2 };
}
function vn({ _novip: e2 }, t2) {
  const n2 = t2.db, r2 = (function(e3, t3, { IDBKeyRange: n3, indexedDB: r3 }, s2) {
    const i2 = (function(e4, t4) {
      return t4.reduce(((e5, { create: t5 }) => ({ ...e5, ...t5(e5) })), e4);
    })(mn(t3, n3, s2), e3.dbcore);
    return { dbcore: i2 };
  })(e2._middlewares, n2, e2._deps, t2);
  e2.core = r2.dbcore, e2.tables.forEach(((t3) => {
    const n3 = t3.name;
    e2.core.schema.tables.some(((e3) => e3.name === n3)) && (t3.core = e2.core.table(n3), e2[n3] instanceof e2.Table && (e2[n3].core = t3.core));
  }));
}
function gn({ _novip: e2 }, t2, n2, r2) {
  n2.forEach(((n3) => {
    const s2 = r2[n3];
    t2.forEach(((t3) => {
      const r3 = d(t3, n3);
      (!r3 || "value" in r3 && void 0 === r3.value) && (t3 === e2.Transaction.prototype || t3 instanceof e2.Transaction ? l(t3, n3, { get() {
        return this.table(n3);
      }, set(e3) {
        u(this, n3, { value: e3, writable: true, configurable: true, enumerable: true });
      } }) : t3[n3] = new e2.Table(n3, s2));
    }));
  }));
}
function bn({ _novip: e2 }, t2) {
  t2.forEach(((t3) => {
    for (let n2 in t3) t3[n2] instanceof e2.Table && delete t3[n2];
  }));
}
function _n(e2, t2) {
  return e2._cfg.version - t2._cfg.version;
}
function wn(e2, n2, r2, s2) {
  const i2 = e2._dbSchema, o2 = e2._createTransaction("readwrite", e2._storeNames, i2);
  o2.create(r2), o2._completion.catch(s2);
  const a2 = o2._reject.bind(o2), u2 = Oe.transless || Oe;
  Ze((() => {
    Oe.trans = o2, Oe.transless = u2, 0 === n2 ? (t(i2).forEach(((e3) => {
      kn(r2, e3, i2[e3].primKey, i2[e3].indexes);
    })), vn(e2, r2), je.follow((() => e2.on.populate.fire(o2))).catch(a2)) : (function({ _novip: e3 }, n3, r3, s3) {
      const i3 = [], o3 = e3._versions;
      let a3 = e3._dbSchema = Pn(e3, e3.idbdb, s3), u3 = false;
      const l2 = o3.filter(((e4) => e4._cfg.version >= n3));
      function c2() {
        return i3.length ? je.resolve(i3.shift()(r3.idbtrans)).then(c2) : je.resolve();
      }
      return l2.forEach(((o4) => {
        i3.push((() => {
          const i4 = a3, l3 = o4._cfg.dbschema;
          Kn(e3, i4, s3), Kn(e3, l3, s3), a3 = e3._dbSchema = l3;
          const c3 = xn(i4, l3);
          c3.add.forEach(((e4) => {
            kn(s3, e4[0], e4[1].primKey, e4[1].indexes);
          })), c3.change.forEach(((e4) => {
            if (e4.recreate) throw new X.Upgrade("Not yet support for changing primary key");
            {
              const t2 = s3.objectStore(e4.name);
              e4.add.forEach(((e5) => En(t2, e5))), e4.change.forEach(((e5) => {
                t2.deleteIndex(e5.name), En(t2, e5);
              })), e4.del.forEach(((e5) => t2.deleteIndex(e5)));
            }
          }));
          const h2 = o4._cfg.contentUpgrade;
          if (h2 && o4._cfg.version > n3) {
            vn(e3, s3), r3._memoizedTables = {}, u3 = true;
            let n4 = w(l3);
            c3.del.forEach(((e4) => {
              n4[e4] = i4[e4];
            })), bn(e3, [e3.Transaction.prototype]), gn(e3, [e3.Transaction.prototype], t(n4), n4), r3.schema = n4;
            const o5 = T(h2);
            let a4;
            o5 && et();
            const d2 = je.follow((() => {
              if (a4 = h2(r3), a4 && o5) {
                var e4 = tt.bind(null, null);
                a4.then(e4, e4);
              }
            }));
            return a4 && "function" == typeof a4.then ? je.resolve(a4) : d2.then((() => a4));
          }
        })), i3.push(((t2) => {
          if (!u3 || !xt) {
            !(function(e4, t3) {
              [].slice.call(t3.db.objectStoreNames).forEach(((n4) => null == e4[n4] && t3.db.deleteObjectStore(n4)));
            })(o4._cfg.dbschema, t2);
          }
          bn(e3, [e3.Transaction.prototype]), gn(e3, [e3.Transaction.prototype], e3._storeNames, e3._dbSchema), r3.schema = e3._dbSchema;
        }));
      })), c2().then((() => {
        var e4, n4;
        n4 = s3, t(e4 = a3).forEach(((t2) => {
          n4.db.objectStoreNames.contains(t2) || kn(n4, t2, e4[t2].primKey, e4[t2].indexes);
        }));
      }));
    })(e2, n2, o2, r2).catch(a2);
  }));
}
function xn(e2, t2) {
  const n2 = { del: [], add: [], change: [] };
  let r2;
  for (r2 in e2) t2[r2] || n2.del.push(r2);
  for (r2 in t2) {
    const s2 = e2[r2], i2 = t2[r2];
    if (s2) {
      const e3 = { name: r2, def: i2, recreate: false, del: [], add: [], change: [] };
      if ("" + (s2.primKey.keyPath || "") != "" + (i2.primKey.keyPath || "") || s2.primKey.auto !== i2.primKey.auto && !wt) e3.recreate = true, n2.change.push(e3);
      else {
        const t3 = s2.idxByName, r3 = i2.idxByName;
        let o2;
        for (o2 in t3) r3[o2] || e3.del.push(o2);
        for (o2 in r3) {
          const n3 = t3[o2], s3 = r3[o2];
          n3 ? n3.src !== s3.src && e3.change.push(s3) : e3.add.push(s3);
        }
        (e3.del.length > 0 || e3.add.length > 0 || e3.change.length > 0) && n2.change.push(e3);
      }
    } else n2.add.push([r2, i2]);
  }
  return n2;
}
function kn(e2, t2, n2, r2) {
  const s2 = e2.db.createObjectStore(t2, n2.keyPath ? { keyPath: n2.keyPath, autoIncrement: n2.auto } : { autoIncrement: n2.auto });
  return r2.forEach(((e3) => En(s2, e3))), s2;
}
function En(e2, t2) {
  e2.createIndex(t2.name, t2.keyPath, { unique: t2.unique, multiEntry: t2.multi });
}
function Pn(e2, t2, n2) {
  const r2 = {};
  return p(t2.objectStoreNames, 0).forEach(((e3) => {
    const t3 = n2.objectStore(e3);
    let s2 = t3.keyPath;
    const i2 = un(ln(s2), s2 || "", false, false, !!t3.autoIncrement, s2 && "string" != typeof s2, true), o2 = [];
    for (let e4 = 0; e4 < t3.indexNames.length; ++e4) {
      const n3 = t3.index(t3.indexNames[e4]);
      s2 = n3.keyPath;
      var a2 = un(n3.name, s2, !!n3.unique, !!n3.multiEntry, false, s2 && "string" != typeof s2, false);
      o2.push(a2);
    }
    r2[e3] = cn(e3, i2, o2);
  })), r2;
}
function Kn({ _novip: t2 }, n2, r2) {
  const s2 = r2.db.objectStoreNames;
  for (let e2 = 0; e2 < s2.length; ++e2) {
    const i2 = s2[e2], o2 = r2.objectStore(i2);
    t2._hasGetAll = "getAll" in o2;
    for (let e3 = 0; e3 < o2.indexNames.length; ++e3) {
      const t3 = o2.indexNames[e3], r3 = o2.index(t3).keyPath, s3 = "string" == typeof r3 ? r3 : "[" + p(r3).join("+") + "]";
      if (n2[i2]) {
        const e4 = n2[i2].idxByName[s3];
        e4 && (e4.name = t3, delete n2[i2].idxByName[s3], n2[i2].idxByName[t3] = e4);
      }
    }
  }
  "undefined" != typeof navigator && /Safari/.test(navigator.userAgent) && !/(Chrome\/|Edge\/)/.test(navigator.userAgent) && e.WorkerGlobalScope && e instanceof e.WorkerGlobalScope && [].concat(navigator.userAgent.match(/Safari\/(\d*)/))[1] < 604 && (t2._hasGetAll = false);
}
class On {
  _parseStoresSpec(e2, r2) {
    t(e2).forEach(((t2) => {
      if (null !== e2[t2]) {
        var s2 = e2[t2].split(",").map(((e3, t3) => {
          const r3 = (e3 = e3.trim()).replace(/([&*]|\+\+)/g, ""), s3 = /^\[/.test(r3) ? r3.match(/^\[(.*)\]$/)[1].split("+") : r3;
          return un(r3, s3 || null, /\&/.test(e3), /\*/.test(e3), /\+\+/.test(e3), n(s3), 0 === t3);
        })), i2 = s2.shift();
        if (i2.multi) throw new X.Schema("Primary key cannot be multi-valued");
        s2.forEach(((e3) => {
          if (e3.auto) throw new X.Schema("Only primary key can be marked as autoIncrement (++)");
          if (!e3.keyPath) throw new X.Schema("Index must have a name and cannot be an empty string");
        })), r2[t2] = cn(t2, i2, s2);
      }
    }));
  }
  stores(e2) {
    const n2 = this.db;
    this._cfg.storesSource = this._cfg.storesSource ? r(this._cfg.storesSource, e2) : e2;
    const s2 = n2._versions, i2 = {};
    let o2 = {};
    return s2.forEach(((e3) => {
      r(i2, e3._cfg.storesSource), o2 = e3._cfg.dbschema = {}, e3._parseStoresSpec(i2, o2);
    })), n2._dbSchema = o2, bn(n2, [n2._allTables, n2, n2.Transaction.prototype]), gn(n2, [n2._allTables, n2, n2.Transaction.prototype, this._cfg.tables], t(o2), o2), n2._storeNames = t(o2), this;
  }
  upgrade(e2) {
    return this._cfg.contentUpgrade = ue(this._cfg.contentUpgrade || ee, e2), this;
  }
}
function Sn(e2, t2) {
  let n2 = e2._dbNamesDB;
  return n2 || (n2 = e2._dbNamesDB = new Xn(Pt, { addons: [], indexedDB: e2, IDBKeyRange: t2 }), n2.version(1).stores({ dbnames: "name" })), n2.table("dbnames");
}
function An(e2) {
  return e2 && "function" == typeof e2.databases;
}
function Cn(e2) {
  return Ze((function() {
    return Oe.letThrough = true, e2();
  }));
}
function jn() {
  var e2;
  return !navigator.userAgentData && /Safari\//.test(navigator.userAgent) && !/Chrom(e|ium)\//.test(navigator.userAgent) && indexedDB.databases ? new Promise((function(t2) {
    var n2 = function() {
      return indexedDB.databases().finally(t2);
    };
    e2 = setInterval(n2, 100), n2();
  })).finally((function() {
    return clearInterval(e2);
  })) : Promise.resolve();
}
function Dn(e2) {
  const n2 = e2._state, { indexedDB: r2 } = e2._deps;
  if (n2.isBeingOpened || e2.idbdb) return n2.dbReadyPromise.then((() => n2.dbOpenError ? ft(n2.dbOpenError) : e2));
  R && (n2.openCanceller._stackHolder = q()), n2.isBeingOpened = true, n2.dbOpenError = null, n2.openComplete = false;
  const s2 = n2.openCanceller;
  function i2() {
    if (n2.openCanceller !== s2) throw new X.DatabaseClosed("db.open() was cancelled");
  }
  let o2 = n2.dbReadyResolve, a2 = null, u2 = false;
  const l2 = () => new je(((s3, o3) => {
    if (i2(), !r2) throw new X.MissingAPI();
    const l3 = e2.name, c2 = n2.autoSchema ? r2.open(l3) : r2.open(l3, Math.round(10 * e2.verno));
    if (!c2) throw new X.MissingAPI();
    c2.onerror = tn(o3), c2.onblocked = Ye(e2._fireOnBlocked), c2.onupgradeneeded = Ye(((t2) => {
      if (a2 = c2.transaction, n2.autoSchema && !e2._options.allowEmptyDB) {
        c2.onerror = nn, a2.abort(), c2.result.close();
        const e3 = r2.deleteDatabase(l3);
        e3.onsuccess = e3.onerror = Ye((() => {
          o3(new X.NoSuchDatabase(`Database ${l3} doesnt exist`));
        }));
      } else {
        a2.onerror = tn(o3);
        var s4 = t2.oldVersion > Math.pow(2, 62) ? 0 : t2.oldVersion;
        u2 = s4 < 1, e2._novip.idbdb = c2.result, wn(e2, s4 / 10, a2, o3);
      }
    }), o3), c2.onsuccess = Ye((() => {
      a2 = null;
      const r3 = e2._novip.idbdb = c2.result, i3 = p(r3.objectStoreNames);
      if (i3.length > 0) try {
        const s4 = r3.transaction(1 === (o4 = i3).length ? o4[0] : o4, "readonly");
        n2.autoSchema ? (function({ _novip: e3 }, n3, r4) {
          e3.verno = n3.version / 10;
          const s5 = e3._dbSchema = Pn(0, n3, r4);
          e3._storeNames = p(n3.objectStoreNames, 0), gn(e3, [e3._allTables], t(s5), s5);
        })(e2, r3, s4) : (Kn(e2, e2._dbSchema, s4), (function(e3, t2) {
          const n3 = xn(Pn(0, e3.idbdb, t2), e3._dbSchema);
          return !(n3.add.length || n3.change.some(((e4) => e4.add.length || e4.change.length)));
        })(e2, s4) || console.warn("Dexie SchemaDiff: Schema was extended without increasing the number passed to db.version(). Some queries may fail.")), vn(e2, s4);
      } catch (e3) {
      }
      var o4;
      _t.push(e2), r3.onversionchange = Ye(((t2) => {
        n2.vcFired = true, e2.on("versionchange").fire(t2);
      })), r3.onclose = Ye(((t2) => {
        e2.on("close").fire(t2);
      })), u2 && (function({ indexedDB: e3, IDBKeyRange: t2 }, n3) {
        !An(e3) && n3 !== Pt && Sn(e3, t2).put({ name: n3 }).catch(ee);
      })(e2._deps, l3), s3();
    }), o3);
  })).catch(((e3) => e3 && "UnknownError" === e3.name && n2.PR1398_maxLoop > 0 ? (n2.PR1398_maxLoop--, console.warn("Dexie: Workaround for Chrome UnknownError on open()"), l2()) : je.reject(e3)));
  return je.race([s2, ("undefined" == typeof navigator ? je.resolve() : jn()).then(l2)]).then((() => (i2(), n2.onReadyBeingFired = [], je.resolve(Cn((() => e2.on.ready.fire(e2.vip)))).then((function t2() {
    if (n2.onReadyBeingFired.length > 0) {
      let r3 = n2.onReadyBeingFired.reduce(ue, ee);
      return n2.onReadyBeingFired = [], je.resolve(Cn((() => r3(e2.vip)))).then(t2);
    }
  }))))).finally((() => {
    n2.onReadyBeingFired = null, n2.isBeingOpened = false;
  })).then((() => e2)).catch(((t2) => {
    n2.dbOpenError = t2;
    try {
      a2 && a2.abort();
    } catch (e3) {
    }
    return s2 === n2.openCanceller && e2._close(), ft(t2);
  })).finally((() => {
    n2.openComplete = true, o2();
  }));
}
function In(e2) {
  var t2 = (t3) => e2.next(t3), r2 = i2(t2), s2 = i2(((t3) => e2.throw(t3)));
  function i2(e3) {
    return (t3) => {
      var i3 = e3(t3), o2 = i3.value;
      return i3.done ? o2 : o2 && "function" == typeof o2.then ? o2.then(r2, s2) : n(o2) ? Promise.all(o2).then(r2, s2) : r2(o2);
    };
  }
  return i2(t2)();
}
function Bn(e2, t2, n2) {
  var r2 = arguments.length;
  if (r2 < 2) throw new X.InvalidArgument("Too few arguments");
  for (var s2 = new Array(r2 - 1); --r2; ) s2[r2 - 1] = arguments[r2];
  return n2 = s2.pop(), [e2, k(s2), n2];
}
function Tn(e2, t2, n2, r2, s2) {
  return je.resolve().then((() => {
    const i2 = Oe.transless || Oe, o2 = e2._createTransaction(t2, n2, e2._dbSchema, r2), a2 = { trans: o2, transless: i2 };
    if (r2) o2.idbtrans = r2.idbtrans;
    else try {
      o2.create(), e2._state.PR1398_maxLoop = 3;
    } catch (r3) {
      return r3.name === H.InvalidState && e2.isOpen() && --e2._state.PR1398_maxLoop > 0 ? (console.warn("Dexie: Need to reopen db"), e2._close(), e2.open().then((() => Tn(e2, t2, n2, null, s2)))) : ft(r3);
    }
    const u2 = T(s2);
    let l2;
    u2 && et();
    const c2 = je.follow((() => {
      if (l2 = s2.call(o2, o2), l2) if (u2) {
        var e3 = tt.bind(null, null);
        l2.then(e3, e3);
      } else "function" == typeof l2.next && "function" == typeof l2.throw && (l2 = In(l2));
    }), a2);
    return (l2 && "function" == typeof l2.then ? je.resolve(l2).then(((e3) => o2.active ? e3 : ft(new X.PrematureCommit("Transaction committed too early. See http://bit.ly/2kdckMn")))) : c2.then((() => l2))).then(((e3) => (r2 && o2._resolve(), o2._completion.then((() => e3))))).catch(((e3) => (o2._reject(e3), ft(e3))));
  }));
}
function Rn(e2, t2, r2) {
  const s2 = n(e2) ? e2.slice() : [e2];
  for (let e3 = 0; e3 < r2; ++e3) s2.push(t2);
  return s2;
}
const Fn = { stack: "dbcore", name: "VirtualIndexMiddleware", level: 1, create: function(e2) {
  return { ...e2, table(t2) {
    const n2 = e2.table(t2), { schema: r2 } = n2, s2 = {}, i2 = [];
    function o2(e3, t3, n3) {
      const r3 = yn(e3), a3 = s2[r3] = s2[r3] || [], u3 = null == e3 ? 0 : "string" == typeof e3 ? 1 : e3.length, l3 = t3 > 0, c2 = { ...n3, isVirtual: l3, keyTail: t3, keyLength: u3, extractKey: dn(e3), unique: !l3 && n3.unique };
      if (a3.push(c2), c2.isPrimaryKey || i2.push(c2), u3 > 1) {
        o2(2 === u3 ? e3[0] : e3.slice(0, u3 - 1), t3 + 1, n3);
      }
      return a3.sort(((e4, t4) => e4.keyTail - t4.keyTail)), c2;
    }
    const a2 = o2(r2.primaryKey.keyPath, 0, r2.primaryKey);
    s2[":id"] = [a2];
    for (const e3 of r2.indexes) o2(e3.keyPath, 0, e3);
    function u2(t3) {
      const n3 = t3.query.index;
      return n3.isVirtual ? { ...t3, query: { index: n3, range: (r3 = t3.query.range, s3 = n3.keyTail, { type: 1 === r3.type ? 2 : r3.type, lower: Rn(r3.lower, r3.lowerOpen ? e2.MAX_KEY : e2.MIN_KEY, s3), lowerOpen: true, upper: Rn(r3.upper, r3.upperOpen ? e2.MIN_KEY : e2.MAX_KEY, s3), upperOpen: true }) } } : t3;
      var r3, s3;
    }
    const l2 = { ...n2, schema: { ...r2, primaryKey: a2, indexes: i2, getIndexByKeyPath: function(e3) {
      const t3 = s2[yn(e3)];
      return t3 && t3[0];
    } }, count: (e3) => n2.count(u2(e3)), query: (e3) => n2.query(u2(e3)), openCursor(t3) {
      const { keyTail: r3, isVirtual: s3, keyLength: i3 } = t3.query.index;
      if (!s3) return n2.openCursor(t3);
      return n2.openCursor(u2(t3)).then(((n3) => n3 && (function(n4) {
        const s4 = Object.create(n4, { continue: { value: function(s5) {
          null != s5 ? n4.continue(Rn(s5, t3.reverse ? e2.MAX_KEY : e2.MIN_KEY, r3)) : t3.unique ? n4.continue(n4.key.slice(0, i3).concat(t3.reverse ? e2.MIN_KEY : e2.MAX_KEY, r3)) : n4.continue();
        } }, continuePrimaryKey: { value(t4, s5) {
          n4.continuePrimaryKey(Rn(t4, e2.MAX_KEY, r3), s5);
        } }, primaryKey: { get: () => n4.primaryKey }, key: { get() {
          const e3 = n4.key;
          return 1 === i3 ? e3[0] : e3.slice(0, i3);
        } }, value: { get: () => n4.value } });
        return s4;
      })(n3)));
    } };
    return l2;
  } };
} };
function Mn(e2, n2, r2, s2) {
  return r2 = r2 || {}, s2 = s2 || "", t(e2).forEach(((t2) => {
    if (o(n2, t2)) {
      var i2 = e2[t2], a2 = n2[t2];
      if ("object" == typeof i2 && "object" == typeof a2 && i2 && a2) {
        const e3 = C(i2);
        e3 !== C(a2) ? r2[s2 + t2] = n2[t2] : "Object" === e3 ? Mn(i2, a2, r2, s2 + t2 + ".") : i2 !== a2 && (r2[s2 + t2] = n2[t2]);
      } else i2 !== a2 && (r2[s2 + t2] = n2[t2]);
    } else r2[s2 + t2] = void 0;
  })), t(n2).forEach(((t2) => {
    o(e2, t2) || (r2[s2 + t2] = n2[t2]);
  })), r2;
}
const Nn = { stack: "dbcore", name: "HooksMiddleware", level: 2, create: (e2) => ({ ...e2, table(t2) {
  const n2 = e2.table(t2), { primaryKey: r2 } = n2.schema, s2 = { ...n2, mutate(e3) {
    const s3 = Oe.trans, { deleting: i2, creating: a2, updating: u2 } = s3.table(t2).hook;
    switch (e3.type) {
      case "add":
        if (a2.fire === ee) break;
        return s3._promise("readwrite", (() => l2(e3)), true);
      case "put":
        if (a2.fire === ee && u2.fire === ee) break;
        return s3._promise("readwrite", (() => l2(e3)), true);
      case "delete":
        if (i2.fire === ee) break;
        return s3._promise("readwrite", (() => l2(e3)), true);
      case "deleteRange":
        if (i2.fire === ee) break;
        return s3._promise("readwrite", (() => (function(e4) {
          return c2(e4.trans, e4.range, 1e4);
        })(e3)), true);
    }
    return n2.mutate(e3);
    function l2(e4) {
      const t3 = Oe.trans, s4 = e4.keys || (function(e5, t4) {
        return "delete" === t4.type ? t4.keys : t4.keys || t4.values.map(e5.extractKey);
      })(r2, e4);
      if (!s4) throw new Error("Keys missing");
      return "delete" !== (e4 = "add" === e4.type || "put" === e4.type ? { ...e4, keys: s4 } : { ...e4 }).type && (e4.values = [...e4.values]), e4.keys && (e4.keys = [...e4.keys]), (function(e5, t4, n3) {
        return "add" === t4.type ? Promise.resolve([]) : e5.getMany({ trans: t4.trans, keys: n3, cache: "immutable" });
      })(n2, e4, s4).then(((l3) => {
        const c3 = s4.map(((n3, s5) => {
          const c4 = l3[s5], h2 = { onerror: null, onsuccess: null };
          if ("delete" === e4.type) i2.fire.call(h2, n3, c4, t3);
          else if ("add" === e4.type || void 0 === c4) {
            const i3 = a2.fire.call(h2, n3, e4.values[s5], t3);
            null == n3 && null != i3 && (n3 = i3, e4.keys[s5] = n3, r2.outbound || _(e4.values[s5], r2.keyPath, n3));
          } else {
            const r3 = Mn(c4, e4.values[s5]), i3 = u2.fire.call(h2, r3, n3, c4, t3);
            if (i3) {
              const t4 = e4.values[s5];
              Object.keys(i3).forEach(((e5) => {
                o(t4, e5) ? t4[e5] = i3[e5] : _(t4, e5, i3[e5]);
              }));
            }
          }
          return h2;
        }));
        return n2.mutate(e4).then((({ failures: t4, results: n3, numFailures: r3, lastResult: i3 }) => {
          for (let r4 = 0; r4 < s4.length; ++r4) {
            const i4 = n3 ? n3[r4] : s4[r4], o2 = c3[r4];
            null == i4 ? o2.onerror && o2.onerror(t4[r4]) : o2.onsuccess && o2.onsuccess("put" === e4.type && l3[r4] ? e4.values[r4] : i4);
          }
          return { failures: t4, results: n3, numFailures: r3, lastResult: i3 };
        })).catch(((e5) => (c3.forEach(((t4) => t4.onerror && t4.onerror(e5))), Promise.reject(e5))));
      }));
    }
    function c2(e4, t3, s4) {
      return n2.query({ trans: e4, values: false, query: { index: r2, range: t3 }, limit: s4 }).then((({ result: n3 }) => l2({ type: "delete", keys: n3, trans: e4 }).then(((r3) => r3.numFailures > 0 ? Promise.reject(r3.failures[0]) : n3.length < s4 ? { failures: [], numFailures: 0, lastResult: void 0 } : c2(e4, { ...t3, lower: n3[n3.length - 1], lowerOpen: true }, s4)))));
    }
  } };
  return s2;
} }) };
function qn(e2, t2, n2) {
  try {
    if (!t2) return null;
    if (t2.keys.length < e2.length) return null;
    const r2 = [];
    for (let s2 = 0, i2 = 0; s2 < t2.keys.length && i2 < e2.length; ++s2) 0 === $t(t2.keys[s2], e2[i2]) && (r2.push(n2 ? O(t2.values[s2]) : t2.values[s2]), ++i2);
    return r2.length === e2.length ? r2 : null;
  } catch (e3) {
    return null;
  }
}
const $n = { stack: "dbcore", level: -1, create: (e2) => ({ table: (t2) => {
  const n2 = e2.table(t2);
  return { ...n2, getMany: (e3) => {
    if (!e3.cache) return n2.getMany(e3);
    const t3 = qn(e3.keys, e3.trans._cache, "clone" === e3.cache);
    return t3 ? je.resolve(t3) : n2.getMany(e3).then(((t4) => (e3.trans._cache = { keys: e3.keys, values: "clone" === e3.cache ? O(t4) : t4 }, t4)));
  }, mutate: (e3) => ("add" !== e3.type && (e3.trans._cache = null), n2.mutate(e3)) };
} }) };
function Un(e2) {
  return !("from" in e2);
}
const Ln = function(e2, t2) {
  if (!this) {
    const t3 = new Ln();
    return e2 && "d" in e2 && r(t3, e2), t3;
  }
  r(this, arguments.length ? { d: 1, from: e2, to: arguments.length > 1 ? t2 : e2 } : { d: 0 });
};
function Vn(e2, t2, n2) {
  const s2 = $t(t2, n2);
  if (isNaN(s2)) return;
  if (s2 > 0) throw RangeError();
  if (Un(e2)) return r(e2, { from: t2, to: n2, d: 1 });
  const i2 = e2.l, o2 = e2.r;
  if ($t(n2, e2.from) < 0) return i2 ? Vn(i2, t2, n2) : e2.l = { from: t2, to: n2, d: 1, l: null, r: null }, Gn(e2);
  if ($t(t2, e2.to) > 0) return o2 ? Vn(o2, t2, n2) : e2.r = { from: t2, to: n2, d: 1, l: null, r: null }, Gn(e2);
  $t(t2, e2.from) < 0 && (e2.from = t2, e2.l = null, e2.d = o2 ? o2.d + 1 : 1), $t(n2, e2.to) > 0 && (e2.to = n2, e2.r = null, e2.d = e2.l ? e2.l.d + 1 : 1);
  const a2 = !e2.r;
  i2 && !e2.l && Wn(e2, i2), o2 && a2 && Wn(e2, o2);
}
function Wn(e2, t2) {
  Un(t2) || (function e3(t3, { from: n2, to: r2, l: s2, r: i2 }) {
    Vn(t3, n2, r2), s2 && e3(t3, s2), i2 && e3(t3, i2);
  })(e2, t2);
}
function Yn(e2, t2) {
  const n2 = zn(t2);
  let r2 = n2.next();
  if (r2.done) return false;
  let s2 = r2.value;
  const i2 = zn(e2);
  let o2 = i2.next(s2.from), a2 = o2.value;
  for (; !r2.done && !o2.done; ) {
    if ($t(a2.from, s2.to) <= 0 && $t(a2.to, s2.from) >= 0) return true;
    $t(s2.from, a2.from) < 0 ? s2 = (r2 = n2.next(a2.from)).value : a2 = (o2 = i2.next(s2.from)).value;
  }
  return false;
}
function zn(e2) {
  let t2 = Un(e2) ? null : { s: 0, n: e2 };
  return { next(e3) {
    const n2 = arguments.length > 0;
    for (; t2; ) switch (t2.s) {
      case 0:
        if (t2.s = 1, n2) for (; t2.n.l && $t(e3, t2.n.from) < 0; ) t2 = { up: t2, n: t2.n.l, s: 1 };
        else for (; t2.n.l; ) t2 = { up: t2, n: t2.n.l, s: 1 };
      case 1:
        if (t2.s = 2, !n2 || $t(e3, t2.n.to) <= 0) return { value: t2.n, done: false };
      case 2:
        if (t2.n.r) {
          t2.s = 3, t2 = { up: t2, n: t2.n.r, s: 0 };
          continue;
        }
      case 3:
        t2 = t2.up;
    }
    return { done: true };
  } };
}
function Gn(e2) {
  var t2, n2;
  const r2 = ((null === (t2 = e2.r) || void 0 === t2 ? void 0 : t2.d) || 0) - ((null === (n2 = e2.l) || void 0 === n2 ? void 0 : n2.d) || 0), s2 = r2 > 1 ? "r" : r2 < -1 ? "l" : "";
  if (s2) {
    const t3 = "r" === s2 ? "l" : "r", n3 = { ...e2 }, r3 = e2[s2];
    e2.from = r3.from, e2.to = r3.to, e2[s2] = r3[s2], n3[s2] = r3[t3], e2[t3] = n3, n3.d = Hn(n3);
  }
  e2.d = Hn(e2);
}
function Hn({ r: e2, l: t2 }) {
  return (e2 ? t2 ? Math.max(e2.d, t2.d) : e2.d : t2 ? t2.d : 0) + 1;
}
a(Ln.prototype, { add(e2) {
  return Wn(this, e2), this;
}, addKey(e2) {
  return Vn(this, e2, e2), this;
}, addKeys(e2) {
  return e2.forEach(((e3) => Vn(this, e3, e3))), this;
}, [j]() {
  return zn(this);
} });
const Qn = { stack: "dbcore", level: 0, create: (e2) => {
  const r2 = e2.schema.name, s2 = new Ln(e2.MIN_KEY, e2.MAX_KEY);
  return { ...e2, table: (i2) => {
    const o2 = e2.table(i2), { schema: a2 } = o2, { primaryKey: u2 } = a2, { extractKey: l2, outbound: c2 } = u2, h2 = { ...o2, mutate: (e3) => {
      const t2 = e3.trans, u3 = t2.mutatedParts || (t2.mutatedParts = {}), l3 = (e4) => {
        const t3 = `idb://${r2}/${i2}/${e4}`;
        return u3[t3] || (u3[t3] = new Ln());
      }, c3 = l3(""), h3 = l3(":dels"), { type: d3 } = e3;
      let [f3, p2] = "deleteRange" === e3.type ? [e3.range] : "delete" === e3.type ? [e3.keys] : e3.values.length < 50 ? [[], e3.values] : [];
      const y2 = e3.trans._cache;
      return o2.mutate(e3).then(((e4) => {
        if (n(f3)) {
          "delete" !== d3 && (f3 = e4.results), c3.addKeys(f3);
          const t3 = qn(f3, y2);
          t3 || "add" === d3 || h3.addKeys(f3), (t3 || p2) && (function(e5, t4, r3, s3) {
            function i3(t5) {
              const i4 = e5(t5.name || "");
              function o3(e6) {
                return null != e6 ? t5.extractKey(e6) : null;
              }
              const a3 = (e6) => t5.multiEntry && n(e6) ? e6.forEach(((e7) => i4.addKey(e7))) : i4.addKey(e6);
              (r3 || s3).forEach(((e6, t6) => {
                const n2 = r3 && o3(r3[t6]), i5 = s3 && o3(s3[t6]);
                0 !== $t(n2, i5) && (null != n2 && a3(n2), null != i5 && a3(i5));
              }));
            }
            t4.indexes.forEach(i3);
          })(l3, a2, t3, p2);
        } else if (f3) {
          const e5 = { from: f3.lower, to: f3.upper };
          h3.add(e5), c3.add(e5);
        } else c3.add(s2), h3.add(s2), a2.indexes.forEach(((e5) => l3(e5.name).add(s2)));
        return e4;
      }));
    } }, d2 = ({ query: { index: t2, range: n2 } }) => {
      var r3, s3;
      return [t2, new Ln(null !== (r3 = n2.lower) && void 0 !== r3 ? r3 : e2.MIN_KEY, null !== (s3 = n2.upper) && void 0 !== s3 ? s3 : e2.MAX_KEY)];
    }, f2 = { get: (e3) => [u2, new Ln(e3.key)], getMany: (e3) => [u2, new Ln().addKeys(e3.keys)], count: d2, query: d2, openCursor: d2 };
    return t(f2).forEach(((e3) => {
      h2[e3] = function(t2) {
        const { subscr: n2 } = Oe;
        if (n2) {
          const a3 = (e4) => {
            const t3 = `idb://${r2}/${i2}/${e4}`;
            return n2[t3] || (n2[t3] = new Ln());
          }, u3 = a3(""), h3 = a3(":dels"), [d3, p2] = f2[e3](t2);
          if (a3(d3.name || "").add(p2), !d3.isPrimaryKey) {
            if ("count" !== e3) {
              const n3 = "query" === e3 && c2 && t2.values && o2.query({ ...t2, values: false });
              return o2[e3].apply(this, arguments).then(((r3) => {
                if ("query" === e3) {
                  if (c2 && t2.values) return n3.then((({ result: e5 }) => (u3.addKeys(e5), r3)));
                  const e4 = t2.values ? r3.result.map(l2) : r3.result;
                  t2.values ? u3.addKeys(e4) : h3.addKeys(e4);
                } else if ("openCursor" === e3) {
                  const e4 = r3, n4 = t2.values;
                  return e4 && Object.create(e4, { key: { get: () => (h3.addKey(e4.primaryKey), e4.key) }, primaryKey: { get() {
                    const t3 = e4.primaryKey;
                    return h3.addKey(t3), t3;
                  } }, value: { get: () => (n4 && u3.addKey(e4.primaryKey), e4.value) } });
                }
                return r3;
              }));
            }
            h3.add(s2);
          }
        }
        return o2[e3].apply(this, arguments);
      };
    })), h2;
  } };
} };
class Xn {
  constructor(e2, t2) {
    this._middlewares = {}, this.verno = 0;
    const n2 = Xn.dependencies;
    this._options = t2 = { addons: Xn.addons, autoOpen: true, indexedDB: n2.indexedDB, IDBKeyRange: n2.IDBKeyRange, ...t2 }, this._deps = { indexedDB: t2.indexedDB, IDBKeyRange: t2.IDBKeyRange };
    const { addons: r2 } = t2;
    this._dbSchema = {}, this._versions = [], this._storeNames = [], this._allTables = {}, this.idbdb = null, this._novip = this;
    const s2 = { dbOpenError: null, isBeingOpened: false, onReadyBeingFired: null, openComplete: false, dbReadyResolve: ee, dbReadyPromise: null, cancelOpen: ee, openCanceller: null, autoSchema: true, PR1398_maxLoop: 3 };
    var i2;
    s2.dbReadyPromise = new je(((e3) => {
      s2.dbReadyResolve = e3;
    })), s2.openCanceller = new je(((e3, t3) => {
      s2.cancelOpen = t3;
    })), this._state = s2, this.name = e2, this.on = Dt(this, "populate", "blocked", "versionchange", "close", { ready: [ue, ee] }), this.on.ready.subscribe = y(this.on.ready.subscribe, ((e3) => (t3, n3) => {
      Xn.vip((() => {
        const r3 = this._state;
        if (r3.openComplete) r3.dbOpenError || je.resolve().then(t3), n3 && e3(t3);
        else if (r3.onReadyBeingFired) r3.onReadyBeingFired.push(t3), n3 && e3(t3);
        else {
          e3(t3);
          const r4 = this;
          n3 || e3((function e4() {
            r4.on.ready.unsubscribe(t3), r4.on.ready.unsubscribe(e4);
          }));
        }
      }));
    })), this.Collection = (i2 = this, It(Vt.prototype, (function(e3, t3) {
      this.db = i2;
      let n3 = At, r3 = null;
      if (t3) try {
        n3 = t3();
      } catch (e4) {
        r3 = e4;
      }
      const s3 = e3._ctx, o2 = s3.table, a2 = o2.hook.reading.fire;
      this._ctx = { table: o2, index: s3.index, isPrimKey: !s3.index || o2.schema.primKey.keyPath && s3.index === o2.schema.primKey.name, range: n3, keysOnly: false, dir: "next", unique: "", algorithm: null, filter: null, replayFilter: null, justLimit: true, isMatch: null, offset: 0, limit: 1 / 0, error: r3, or: s3.or, valueMapper: a2 !== te ? a2 : null };
    }))), this.Table = (function(e3) {
      return It(jt.prototype, (function(t3, n3, r3) {
        this.db = e3, this._tx = r3, this.name = t3, this.schema = n3, this.hook = e3._allTables[t3] ? e3._allTables[t3].hook : Dt(null, { creating: [se, ee], reading: [ne, te], updating: [oe, ee], deleting: [ie, ee] });
      }));
    })(this), this.Transaction = (function(e3) {
      return It(an.prototype, (function(t3, n3, r3, s3, i3) {
        this.db = e3, this.mode = t3, this.storeNames = n3, this.schema = r3, this.chromeTransactionDurability = s3, this.idbtrans = null, this.on = Dt(this, "complete", "error", "abort"), this.parent = i3 || null, this.active = true, this._reculock = 0, this._blockedFuncs = [], this._resolve = null, this._reject = null, this._waitingFor = null, this._waitingQueue = null, this._spinCount = 0, this._completion = new je(((e4, t4) => {
          this._resolve = e4, this._reject = t4;
        })), this._completion.then((() => {
          this.active = false, this.on.complete.fire();
        }), ((e4) => {
          var t4 = this.active;
          return this.active = false, this.on.error.fire(e4), this.parent ? this.parent._reject(e4) : t4 && this.idbtrans && this.idbtrans.abort(), ft(e4);
        }));
      }));
    })(this), this.Version = (function(e3) {
      return It(On.prototype, (function(t3) {
        this.db = e3, this._cfg = { version: t3, storesSource: null, dbschema: {}, tables: {}, contentUpgrade: null };
      }));
    })(this), this.WhereClause = (function(e3) {
      return It(en.prototype, (function(t3, n3, r3) {
        this.db = e3, this._ctx = { table: t3, index: ":id" === n3 ? null : n3, or: r3 };
        const s3 = e3._deps.indexedDB;
        if (!s3) throw new X.MissingAPI();
        this._cmp = this._ascending = s3.cmp.bind(s3), this._descending = (e4, t4) => s3.cmp(t4, e4), this._max = (e4, t4) => s3.cmp(e4, t4) > 0 ? e4 : t4, this._min = (e4, t4) => s3.cmp(e4, t4) < 0 ? e4 : t4, this._IDBKeyRange = e3._deps.IDBKeyRange;
      }));
    })(this), this.on("versionchange", ((e3) => {
      e3.newVersion > 0 ? console.warn(`Another connection wants to upgrade database '${this.name}'. Closing db now to resume the upgrade.`) : console.warn(`Another connection wants to delete database '${this.name}'. Closing db now to resume the delete request.`), this.close();
    })), this.on("blocked", ((e3) => {
      !e3.newVersion || e3.newVersion < e3.oldVersion ? console.warn(`Dexie.delete('${this.name}') was blocked`) : console.warn(`Upgrade '${this.name}' blocked by other connection holding version ${e3.oldVersion / 10}`);
    })), this._maxKey = hn(t2.IDBKeyRange), this._createTransaction = (e3, t3, n3, r3) => new this.Transaction(e3, t3, n3, this._options.chromeTransactionDurability, r3), this._fireOnBlocked = (e3) => {
      this.on("blocked").fire(e3), _t.filter(((e4) => e4.name === this.name && e4 !== this && !e4._state.vcFired)).map(((t3) => t3.on("versionchange").fire(e3)));
    }, this.use(Fn), this.use(Nn), this.use(Qn), this.use($n), this.vip = Object.create(this, { _vip: { value: true } }), r2.forEach(((e3) => e3(this)));
  }
  version(e2) {
    if (isNaN(e2) || e2 < 0.1) throw new X.Type("Given version is not a positive number");
    if (e2 = Math.round(10 * e2) / 10, this.idbdb || this._state.isBeingOpened) throw new X.Schema("Cannot add version when database is open");
    this.verno = Math.max(this.verno, e2);
    const t2 = this._versions;
    var n2 = t2.filter(((t3) => t3._cfg.version === e2))[0];
    return n2 || (n2 = new this.Version(e2), t2.push(n2), t2.sort(_n), n2.stores({}), this._state.autoSchema = false, n2);
  }
  _whenReady(e2) {
    return this.idbdb && (this._state.openComplete || Oe.letThrough || this._vip) ? e2() : new je(((e3, t2) => {
      if (this._state.openComplete) return t2(new X.DatabaseClosed(this._state.dbOpenError));
      if (!this._state.isBeingOpened) {
        if (!this._options.autoOpen) return void t2(new X.DatabaseClosed());
        this.open().catch(ee);
      }
      this._state.dbReadyPromise.then(e3, t2);
    })).then(e2);
  }
  use({ stack: e2, create: t2, level: n2, name: r2 }) {
    r2 && this.unuse({ stack: e2, name: r2 });
    const s2 = this._middlewares[e2] || (this._middlewares[e2] = []);
    return s2.push({ stack: e2, create: t2, level: null == n2 ? 10 : n2, name: r2 }), s2.sort(((e3, t3) => e3.level - t3.level)), this;
  }
  unuse({ stack: e2, name: t2, create: n2 }) {
    return e2 && this._middlewares[e2] && (this._middlewares[e2] = this._middlewares[e2].filter(((e3) => n2 ? e3.create !== n2 : !!t2 && e3.name !== t2))), this;
  }
  open() {
    return Dn(this);
  }
  _close() {
    const e2 = this._state, t2 = _t.indexOf(this);
    if (t2 >= 0 && _t.splice(t2, 1), this.idbdb) {
      try {
        this.idbdb.close();
      } catch (e3) {
      }
      this._novip.idbdb = null;
    }
    e2.dbReadyPromise = new je(((t3) => {
      e2.dbReadyResolve = t3;
    })), e2.openCanceller = new je(((t3, n2) => {
      e2.cancelOpen = n2;
    }));
  }
  close() {
    this._close();
    const e2 = this._state;
    this._options.autoOpen = false, e2.dbOpenError = new X.DatabaseClosed(), e2.isBeingOpened && e2.cancelOpen(e2.dbOpenError);
  }
  delete() {
    const e2 = arguments.length > 0, t2 = this._state;
    return new je(((n2, r2) => {
      const s2 = () => {
        this.close();
        var e3 = this._deps.indexedDB.deleteDatabase(this.name);
        e3.onsuccess = Ye((() => {
          !(function({ indexedDB: e4, IDBKeyRange: t3 }, n3) {
            !An(e4) && n3 !== Pt && Sn(e4, t3).delete(n3).catch(ee);
          })(this._deps, this.name), n2();
        })), e3.onerror = tn(r2), e3.onblocked = this._fireOnBlocked;
      };
      if (e2) throw new X.InvalidArgument("Arguments not allowed in db.delete()");
      t2.isBeingOpened ? t2.dbReadyPromise.then(s2) : s2();
    }));
  }
  backendDB() {
    return this.idbdb;
  }
  isOpen() {
    return null !== this.idbdb;
  }
  hasBeenClosed() {
    const e2 = this._state.dbOpenError;
    return e2 && "DatabaseClosed" === e2.name;
  }
  hasFailed() {
    return null !== this._state.dbOpenError;
  }
  dynamicallyOpened() {
    return this._state.autoSchema;
  }
  get tables() {
    return t(this._allTables).map(((e2) => this._allTables[e2]));
  }
  transaction() {
    const e2 = Bn.apply(this, arguments);
    return this._transaction.apply(this, e2);
  }
  _transaction(e2, t2, n2) {
    let r2 = Oe.trans;
    r2 && r2.db === this && -1 === e2.indexOf("!") || (r2 = null);
    const s2 = -1 !== e2.indexOf("?");
    let i2, o2;
    e2 = e2.replace("!", "").replace("?", "");
    try {
      if (o2 = t2.map(((e3) => {
        var t3 = e3 instanceof this.Table ? e3.name : e3;
        if ("string" != typeof t3) throw new TypeError("Invalid table argument to Dexie.transaction(). Only Table or String are allowed");
        return t3;
      })), "r" == e2 || e2 === Kt) i2 = Kt;
      else {
        if ("rw" != e2 && e2 != Ot) throw new X.InvalidArgument("Invalid transaction mode: " + e2);
        i2 = Ot;
      }
      if (r2) {
        if (r2.mode === Kt && i2 === Ot) {
          if (!s2) throw new X.SubTransaction("Cannot enter a sub-transaction with READWRITE mode when parent transaction is READONLY");
          r2 = null;
        }
        r2 && o2.forEach(((e3) => {
          if (r2 && -1 === r2.storeNames.indexOf(e3)) {
            if (!s2) throw new X.SubTransaction("Table " + e3 + " not included in parent transaction.");
            r2 = null;
          }
        })), s2 && r2 && !r2.active && (r2 = null);
      }
    } catch (e3) {
      return r2 ? r2._promise(null, ((t3, n3) => {
        n3(e3);
      })) : ft(e3);
    }
    const a2 = Tn.bind(null, this, i2, o2, r2, n2);
    return r2 ? r2._promise(i2, a2, "lock") : Oe.trans ? at(Oe.transless, (() => this._whenReady(a2))) : this._whenReady(a2);
  }
  table(e2) {
    if (!o(this._allTables, e2)) throw new X.InvalidTable(`Table ${e2} does not exist`);
    return this._allTables[e2];
  }
}
const Jn = "undefined" != typeof Symbol && "observable" in Symbol ? Symbol.observable : "@@observable";
class Zn {
  constructor(e2) {
    this._subscribe = e2;
  }
  subscribe(e2, t2, n2) {
    return this._subscribe(e2 && "function" != typeof e2 ? e2 : { next: e2, error: t2, complete: n2 });
  }
  [Jn]() {
    return this;
  }
}
function er(e2, n2) {
  return t(n2).forEach(((t2) => {
    Wn(e2[t2] || (e2[t2] = new Ln()), n2[t2]);
  })), e2;
}
function tr(e2) {
  let n2, r2 = false;
  const s2 = new Zn(((s3) => {
    const i2 = T(e2);
    let o2 = false, a2 = {}, u2 = {};
    const l2 = { get closed() {
      return o2;
    }, unsubscribe: () => {
      o2 = true, on.storagemutated.unsubscribe(f2);
    } };
    s3.start && s3.start(l2);
    let c2 = false, h2 = false;
    function d2() {
      return t(u2).some(((e3) => a2[e3] && Yn(a2[e3], u2[e3])));
    }
    const f2 = (e3) => {
      er(a2, e3), d2() && p2();
    }, p2 = () => {
      if (c2 || o2) return;
      a2 = {};
      const t2 = {}, y2 = (function(t3) {
        i2 && et();
        const n3 = () => Ze(e2, { subscr: t3, trans: null }), r3 = Oe.trans ? at(Oe.transless, n3) : n3();
        return i2 && r3.then(tt, tt), r3;
      })(t2);
      h2 || (on(rn, f2), h2 = true), c2 = true, Promise.resolve(y2).then(((e3) => {
        r2 = true, n2 = e3, c2 = false, o2 || (d2() ? p2() : (a2 = {}, u2 = t2, s3.next && s3.next(e3)));
      }), ((e3) => {
        c2 = false, r2 = false, s3.error && s3.error(e3), l2.unsubscribe();
      }));
    };
    return p2(), l2;
  }));
  return s2.hasValue = () => r2, s2.getValue = () => n2, s2;
}
let nr;
try {
  nr = { indexedDB: e.indexedDB || e.mozIndexedDB || e.webkitIndexedDB || e.msIndexedDB, IDBKeyRange: e.IDBKeyRange || e.webkitIDBKeyRange };
} catch (e2) {
  nr = { indexedDB: null, IDBKeyRange: null };
}
const rr = Xn;
function sr(e2) {
  let t2 = ir;
  try {
    ir = true, on.storagemutated.fire(e2);
  } finally {
    ir = t2;
  }
}
a(rr, { ...Z, delete: (e2) => new rr(e2, { addons: [] }).delete(), exists: (e2) => new rr(e2, { addons: [] }).open().then(((e3) => (e3.close(), true))).catch("NoSuchDatabaseError", (() => false)), getDatabaseNames(e2) {
  try {
    return (function({ indexedDB: e3, IDBKeyRange: t2 }) {
      return An(e3) ? Promise.resolve(e3.databases()).then(((e4) => e4.map(((e5) => e5.name)).filter(((e5) => e5 !== Pt)))) : Sn(e3, t2).toCollection().primaryKeys();
    })(rr.dependencies).then(e2);
  } catch (e3) {
    return ft(new X.MissingAPI());
  }
}, defineClass: () => function(e2) {
  r(this, e2);
}, ignoreTransaction: (e2) => Oe.trans ? at(Oe.transless, e2) : e2(), vip: Cn, async: function(e2) {
  return function() {
    try {
      var t2 = In(e2.apply(this, arguments));
      return t2 && "function" == typeof t2.then ? t2 : je.resolve(t2);
    } catch (e3) {
      return ft(e3);
    }
  };
}, spawn: function(e2, t2, n2) {
  try {
    var r2 = In(e2.apply(n2, t2 || []));
    return r2 && "function" == typeof r2.then ? r2 : je.resolve(r2);
  } catch (e3) {
    return ft(e3);
  }
}, currentTransaction: { get: () => Oe.trans || null }, waitFor: function(e2, t2) {
  const n2 = je.resolve("function" == typeof e2 ? rr.ignoreTransaction(e2) : e2).timeout(t2 || 6e4);
  return Oe.trans ? Oe.trans.waitFor(n2) : n2;
}, Promise: je, debug: { get: () => R, set: (e2) => {
  F(e2, "dexie" === e2 ? () => true : Et);
} }, derive: c, extend: r, props: a, override: y, Events: Dt, on, liveQuery: tr, extendObservabilitySet: er, getByKeyPath: b, setByKeyPath: _, delByKeyPath: function(e2, t2) {
  "string" == typeof t2 ? _(e2, t2, void 0) : "length" in t2 && [].map.call(t2, (function(t3) {
    _(e2, t3, void 0);
  }));
}, shallowClone: w, deepClone: O, getObjectDiff: Mn, cmp: $t, asap: v, minKey: vt, addons: [], connections: _t, errnames: H, dependencies: nr, semVer: yt, version: yt.split(".").map(((e2) => parseInt(e2))).reduce(((e2, t2, n2) => e2 + t2 / Math.pow(10, 2 * n2))) }), rr.maxKey = hn(rr.dependencies.IDBKeyRange), "undefined" != typeof dispatchEvent && "undefined" != typeof addEventListener && (on(rn, ((e2) => {
  if (!ir) {
    let t2;
    wt ? (t2 = document.createEvent("CustomEvent"), t2.initCustomEvent(sn, true, true, e2)) : t2 = new CustomEvent(sn, { detail: e2 }), ir = true, dispatchEvent(t2), ir = false;
  }
})), addEventListener(sn, (({ detail: e2 }) => {
  ir || sr(e2);
})));
let ir = false;
if ("undefined" != typeof BroadcastChannel) {
  const e2 = new BroadcastChannel(sn);
  "function" == typeof e2.unref && e2.unref(), on(rn, ((t2) => {
    ir || e2.postMessage(t2);
  })), e2.onmessage = (e3) => {
    e3.data && sr(e3.data);
  };
} else if ("undefined" != typeof self && "undefined" != typeof navigator) {
  on(rn, ((e3) => {
    try {
      ir || ("undefined" != typeof localStorage && localStorage.setItem(sn, JSON.stringify({ trig: Math.random(), changedParts: e3 })), "object" == typeof self.clients && [...self.clients.matchAll({ includeUncontrolled: true })].forEach(((t2) => t2.postMessage({ type: sn, changedParts: e3 }))));
    } catch (e4) {
    }
  })), "undefined" != typeof addEventListener && addEventListener("storage", ((e3) => {
    if (e3.key === sn) {
      const t2 = JSON.parse(e3.newValue);
      t2 && sr(t2.changedParts);
    }
  }));
  const e2 = self.document && navigator.serviceWorker;
  e2 && e2.addEventListener("message", (function({ data: e3 }) {
    e3 && e3.type === sn && sr(e3.changedParts);
  }));
}
je.rejectionMapper = function(e2, t2) {
  if (!e2 || e2 instanceof W || e2 instanceof TypeError || e2 instanceof SyntaxError || !e2.name || !J[e2.name]) return e2;
  var n2 = new J[e2.name](t2 || e2.message, e2);
  return "stack" in e2 && l(n2, "stack", { get: function() {
    return this.inner.stack;
  } }), n2;
}, F(R, Et);
class BaseStorageAdapter {
  /**
   * Get all annotations
   * @returns {Promise<Array>} Array of annotation objects
   */
  async getAll() {
    throw new Error("getAll() must be implemented");
  }
  /**
   * Get a single annotation by ID
   * @param {string} id - Annotation ID
   * @returns {Promise<Object|null>} Annotation object or null if not found
   */
  async getById(_id) {
    throw new Error("getById() must be implemented");
  }
  /**
   * Get annotations for a specific URL
   * @param {string} _url - Page URL
   * @returns {Promise<Array>} Array of annotations for the URL
   */
  async getByUrl(_url) {
    throw new Error("getByUrl() must be implemented");
  }
  /**
   * Create a new annotation
   * @param {Object} _annotation - Annotation data
   * @returns {Promise<Object>} Created annotation with ID
   */
  async create(_annotation) {
    throw new Error("create() must be implemented");
  }
  /**
   * Update an existing annotation
   * @param {string} _id - Annotation ID
   * @param {Object} _updates - Updated fields
   * @returns {Promise<Object>} Updated annotation
   */
  async update(_id, _updates) {
    throw new Error("update() must be implemented");
  }
  /**
   * Delete an annotation
   * @param {string} _id - Annotation ID
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(_id) {
    throw new Error("delete() must be implemented");
  }
  /**
   * Search annotations by query
   * @param {string} _query - Search query
   * @returns {Promise<Array>} Matching annotations
   */
  async search(_query) {
    throw new Error("search() must be implemented");
  }
  /**
   * Filter annotations by criteria
   * @param {Object} _filters - Filter criteria (tags, color, dateRange, etc.)
   * @returns {Promise<Array>} Filtered annotations
   */
  async filter(_filters) {
    throw new Error("filter() must be implemented");
  }
  /**
   * Get total count of annotations
   * @returns {Promise<number>} Total count
   */
  async count() {
    throw new Error("count() must be implemented");
  }
  /**
   * Clear all annotations (dangerous!)
   * @returns {Promise<void>}
   */
  async clear() {
    throw new Error("clear() must be implemented");
  }
  /**
   * Export all annotations
   * @returns {Promise<Array>} All annotations
   */
  async export() {
    return this.getAll();
  }
  /**
   * Import annotations (replaces existing)
   * @param {Array} annotations - Annotations to import
   * @returns {Promise<number>} Number of annotations imported
   */
  async import(_annotations) {
    throw new Error("import() must be implemented");
  }
}
class DexieStorageAdapter extends BaseStorageAdapter {
  constructor() {
    super();
    this.db = new Xn("AssistAnnotations");
    this.db.version(1).stores({
      annotations: "++id, url, type, createdAt, updatedAt, *tags, color"
    });
    this.db.version(2).stores({
      annotations: "++id, url, type, createdAt, updatedAt, *tags, color, *projectIds"
    });
  }
  /**
   * Get annotations linked to a specific project (Task 5.15)
   */
  async getByProjectId(projectId) {
    try {
      return await this.db.annotations.where("projectIds").equals(projectId).toArray();
    } catch (error) {
      console.error(`[DexieAdapter] Error getting annotations for project ${projectId}:`, error);
      throw error;
    }
  }
  /**
   * Link an annotation to a citation project (Task 5.15)
   */
  async linkToProject(annotationId, projectId) {
    try {
      const annotation = await this.getById(annotationId);
      if (!annotation) {
        throw new Error(`Annotation ${annotationId} not found`);
      }
      const projectIds = annotation.projectIds || [];
      if (!projectIds.includes(projectId)) {
        projectIds.push(projectId);
        return await this.update(annotationId, { projectIds });
      }
      return annotation;
    } catch (error) {
      console.error(`[DexieAdapter] Error linking annotation:`, error);
      throw error;
    }
  }
  /**
   * Unlink an annotation from a citation project (Task 5.15)
   */
  async unlinkFromProject(annotationId, projectId) {
    try {
      const annotation = await this.getById(annotationId);
      if (!annotation) {
        throw new Error(`Annotation ${annotationId} not found`);
      }
      const projectIds = (annotation.projectIds || []).filter((id) => id !== projectId);
      return await this.update(annotationId, { projectIds });
    } catch (error) {
      console.error(`[DexieAdapter] Error unlinking annotation:`, error);
      throw error;
    }
  }
  async getAll() {
    try {
      const annotations = await this.db.annotations.toArray();
      return annotations;
    } catch (error) {
      console.error("[DexieAdapter] Error getting all annotations:", error);
      throw error;
    }
  }
  async getById(id) {
    try {
      const annotation = await this.db.annotations.get(parseInt(id));
      return annotation || null;
    } catch (error) {
      console.error(`[DexieAdapter] Error getting annotation ${id}:`, error);
      throw error;
    }
  }
  async getByUrl(url) {
    try {
      const annotations = await this.db.annotations.where("url").equals(url).toArray();
      return annotations;
    } catch (error) {
      console.error(`[DexieAdapter] Error getting annotations for URL ${url}:`, error);
      throw error;
    }
  }
  async create(annotation) {
    try {
      const now = Date.now();
      const newAnnotation = {
        ...annotation,
        createdAt: now,
        updatedAt: now,
        tags: annotation.tags || [],
        color: annotation.color || "yellow"
      };
      const id = await this.db.annotations.add(newAnnotation);
      const created = await this.getById(id);
      return created;
    } catch (error) {
      console.error("[DexieAdapter] Error creating annotation:", error);
      throw error;
    }
  }
  async update(id, updates) {
    try {
      const updatedData = {
        ...updates,
        updatedAt: Date.now()
      };
      await this.db.annotations.update(parseInt(id), updatedData);
      const updated = await this.getById(id);
      return updated;
    } catch (error) {
      console.error(`[DexieAdapter] Error updating annotation ${id}:`, error);
      throw error;
    }
  }
  async delete(id) {
    try {
      await this.db.annotations.delete(parseInt(id));
      return true;
    } catch (error) {
      console.error(`[DexieAdapter] Error deleting annotation ${id}:`, error);
      return false;
    }
  }
  async search(query) {
    try {
      const lowerQuery = query.toLowerCase();
      const annotations = await this.db.annotations.filter((ann) => {
        const content = (ann.content || "").toLowerCase();
        const title = (ann.title || "").toLowerCase();
        const tags = (ann.tags || []).join(" ").toLowerCase();
        return content.includes(lowerQuery) || title.includes(lowerQuery) || tags.includes(lowerQuery);
      }).toArray();
      return annotations;
    } catch (error) {
      console.error("[DexieAdapter] Error searching annotations:", error);
      throw error;
    }
  }
  async filter(filters) {
    try {
      let collection = this.db.annotations;
      if (filters.url) {
        collection = collection.where("url").equals(filters.url);
      }
      if (filters.tags && filters.tags.length > 0) {
        collection = collection.where("tags").anyOf(filters.tags);
      }
      if (filters.color) {
        collection = collection.where("color").equals(filters.color);
      }
      if (filters.startDate || filters.endDate) {
        collection = collection.filter((ann) => {
          if (filters.startDate && ann.createdAt < filters.startDate) {
            return false;
          }
          if (filters.endDate && ann.createdAt > filters.endDate) {
            return false;
          }
          return true;
        });
      }
      const annotations = await collection.toArray();
      return annotations;
    } catch (error) {
      console.error("[DexieAdapter] Error filtering annotations:", error);
      throw error;
    }
  }
  async count() {
    try {
      const total = await this.db.annotations.count();
      return total;
    } catch (error) {
      console.error("[DexieAdapter] Error counting annotations:", error);
      throw error;
    }
  }
  async clear() {
    try {
      await this.db.annotations.clear();
    } catch (error) {
      console.error("[DexieAdapter] Error clearing annotations:", error);
      throw error;
    }
  }
  async import(annotations) {
    try {
      await this.db.annotations.bulkAdd(annotations);
      return annotations.length;
    } catch (error) {
      console.error("[DexieAdapter] Error importing annotations:", error);
      throw error;
    }
  }
}
class LocalStorageAdapter extends BaseStorageAdapter {
  constructor() {
    super();
    this.STORAGE_KEY = "assist_annotations";
    this.nextId = 1;
  }
  /**
   * Get annotations from chrome.storage.local
   * @private
   */
  async _getStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.STORAGE_KEY, (result) => {
        const data = result[this.STORAGE_KEY] || { annotations: [], nextId: 1 };
        this.nextId = data.nextId || 1;
        resolve(data.annotations || []);
      });
    });
  }
  /**
   * Save annotations to chrome.storage.local
   * @private
   */
  async _saveStorage(annotations) {
    return new Promise((resolve, reject) => {
      const data = {
        annotations,
        nextId: this.nextId
      };
      chrome.storage.local.set({ [this.STORAGE_KEY]: data }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }
  async getAll() {
    try {
      const annotations = await this._getStorage();
      return annotations;
    } catch (error) {
      console.error("[LocalAdapter] Error getting all annotations:", error);
      throw error;
    }
  }
  async getById(id) {
    try {
      const annotations = await this._getStorage();
      const annotation = annotations.find((ann) => ann.id === parseInt(id));
      return annotation || null;
    } catch (error) {
      console.error(`[LocalAdapter] Error getting annotation ${id}:`, error);
      throw error;
    }
  }
  async getByUrl(url) {
    try {
      const annotations = await this._getStorage();
      const filtered = annotations.filter((ann) => ann.url === url);
      return filtered;
    } catch (error) {
      console.error(`[LocalAdapter] Error getting annotations for URL ${url}:`, error);
      throw error;
    }
  }
  async create(annotation) {
    try {
      const annotations = await this._getStorage();
      const now = Date.now();
      const newAnnotation = {
        ...annotation,
        id: this.nextId++,
        createdAt: now,
        updatedAt: now,
        tags: annotation.tags || [],
        color: annotation.color || "yellow"
      };
      annotations.push(newAnnotation);
      await this._saveStorage(annotations);
      return newAnnotation;
    } catch (error) {
      console.error("[LocalAdapter] Error creating annotation:", error);
      throw error;
    }
  }
  async update(id, updates) {
    try {
      const annotations = await this._getStorage();
      const index = annotations.findIndex((ann) => ann.id === parseInt(id));
      if (index === -1) {
        throw new Error(`Annotation ${id} not found`);
      }
      annotations[index] = {
        ...annotations[index],
        ...updates,
        updatedAt: Date.now()
      };
      await this._saveStorage(annotations);
      return annotations[index];
    } catch (error) {
      console.error(`[LocalAdapter] Error updating annotation ${id}:`, error);
      throw error;
    }
  }
  async delete(id) {
    try {
      const annotations = await this._getStorage();
      const filtered = annotations.filter((ann) => ann.id !== parseInt(id));
      if (filtered.length === annotations.length) {
        return false;
      }
      await this._saveStorage(filtered);
      return true;
    } catch (error) {
      console.error(`[LocalAdapter] Error deleting annotation ${id}:`, error);
      return false;
    }
  }
  async search(query) {
    try {
      const annotations = await this._getStorage();
      const lowerQuery = query.toLowerCase();
      const results = annotations.filter((ann) => {
        const content = (ann.content || "").toLowerCase();
        const title = (ann.title || "").toLowerCase();
        const tags = (ann.tags || []).join(" ").toLowerCase();
        return content.includes(lowerQuery) || title.includes(lowerQuery) || tags.includes(lowerQuery);
      });
      return results;
    } catch (error) {
      console.error("[LocalAdapter] Error searching annotations:", error);
      throw error;
    }
  }
  async filter(filters) {
    try {
      const annotations = await this._getStorage();
      const results = annotations.filter((ann) => {
        if (filters.url && ann.url !== filters.url) {
          return false;
        }
        if (filters.tags && filters.tags.length > 0) {
          const hasTags = filters.tags.some((tag) => (ann.tags || []).includes(tag));
          if (!hasTags) {
            return false;
          }
        }
        if (filters.color && ann.color !== filters.color) {
          return false;
        }
        if (filters.startDate && ann.createdAt < filters.startDate) {
          return false;
        }
        if (filters.endDate && ann.createdAt > filters.endDate) {
          return false;
        }
        return true;
      });
      return results;
    } catch (error) {
      console.error("[LocalAdapter] Error filtering annotations:", error);
      throw error;
    }
  }
  async count() {
    try {
      const annotations = await this._getStorage();
      return annotations.length;
    } catch (error) {
      console.error("[LocalAdapter] Error counting annotations:", error);
      throw error;
    }
  }
  async clear() {
    try {
      await this._saveStorage([]);
    } catch (error) {
      console.error("[LocalAdapter] Error clearing annotations:", error);
      throw error;
    }
  }
  async import(annotations) {
    try {
      const withIds = annotations.map((ann) => ({
        ...ann,
        id: this.nextId++
      }));
      await this._saveStorage(withIds);
      return withIds.length;
    } catch (error) {
      console.error("[LocalAdapter] Error importing annotations:", error);
      throw error;
    }
  }
  /** Get annotations linked to a specific project (Task 5.15) */
  async getByProjectId(projectId) {
    try {
      const annotations = await this._getStorage();
      return annotations.filter((ann) => (ann.projectIds || []).includes(projectId));
    } catch (error) {
      console.error(`[LocalAdapter] Error getting annotations for project:`, error);
      throw error;
    }
  }
  /** Link an annotation to a citation project (Task 5.15) */
  async linkToProject(annotationId, projectId) {
    try {
      const annotation = await this.getById(annotationId);
      if (!annotation) {
        throw new Error(`Annotation ${annotationId} not found`);
      }
      const projectIds = annotation.projectIds || [];
      if (!projectIds.includes(projectId)) {
        projectIds.push(projectId);
        return await this.update(annotationId, { projectIds });
      }
      return annotation;
    } catch (error) {
      console.error(`[LocalAdapter] Error linking annotation:`, error);
      throw error;
    }
  }
  /** Unlink an annotation from a citation project (Task 5.15) */
  async unlinkFromProject(annotationId, projectId) {
    try {
      const annotation = await this.getById(annotationId);
      if (!annotation) {
        throw new Error(`Annotation ${annotationId} not found`);
      }
      const projectIds = (annotation.projectIds || []).filter((id) => id !== projectId);
      return await this.update(annotationId, { projectIds });
    } catch (error) {
      console.error(`[LocalAdapter] Error unlinking annotation:`, error);
      throw error;
    }
  }
}
function getStorageAdapter(mode = "local") {
  if (mode === "indexeddb") {
    return new DexieStorageAdapter();
  } else {
    return new LocalStorageAdapter();
  }
}
const storageAdapter = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  BaseStorageAdapter,
  DexieStorageAdapter,
  LocalStorageAdapter,
  getStorageAdapter
}, Symbol.toStringTag, { value: "Module" }));
export {
  SHORTCUT_LABELS as S,
  Xn as X,
  attachQuietHandler as a,
  attachInteractiveHandler as b,
  attachAccessibleHandler as c,
  sanitizeURL as d,
  attachDelegatedHandler as e,
  saveShortcuts as f,
  getStorageAdapter as g,
  eventToShortcut as h,
  storageAdapter as i,
  loadShortcuts as l,
  purify as p,
  registerShortcut as r,
  sanitizeHTML as s,
  validateShortcut as v
};
//# sourceMappingURL=storage-adapter-C0pzedCF.js.map
