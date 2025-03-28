module.exports = {
  webpack: {
    configure: {
      resolve: {
        fallback: {
          "path": require.resolve("path-browserify"),
          "fs": false,
          "process": require.resolve("process/browser"),
          "buffer": require.resolve("buffer"),
          "stream": require.resolve("stream-browserify"),
          "util": require.resolve("util"),
          "child_process": false
        }
      }
    }
  }
}; 