"use strict";

module.exports = {
  edges: {
    top: {
      type: String,
      enum: ["smooth", "ticket", "torn", "jagged"],
      default: "smooth",
    },
    bottom: {
      type: String,
      enum: ["smooth", "ticket", "torn", "jagged"],
      default: "smooth",
    },
    left: {
      type: String,
      enum: ["smooth", "ticket", "torn", "jagged"],
      default: "smooth",
    },
    right: {
      type: String,
      enum: ["smooth", "ticket", "torn", "jagged"],
      default: "smooth",
    },
  },

  typography: {
    titleAlignment: {
      type: String,
      enum: ["left", "center", "right"],
      default: "left",
    },
    descAlignment: {
      type: String,
      enum: ["left", "center", "right"],
      default: "left",
    },
    codeAlignment: {
      type: String,
      enum: ["left", "center", "right"],
      default: "left",
    },
  },

  imageConfig: {
    scale: {
      type: Number,
      default: 100,
    },
    offsetX: {
      type: Number,
      default: 0,
    },
    offsetY: {
      type: Number,
      default: 0,
    },
    fit: {
      type: String,
      enum: ["cover", "contain", "fill"],
      default: "contain",
    },
  },
};
