// Used only by Jest to transform ES module syntax in tests and the renderer
// pure-function modules. The app itself is not bundled through Babel.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
