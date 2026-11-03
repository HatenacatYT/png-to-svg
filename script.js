"use strict";

/* =========================================
   VECTOR FORGE
   Image to SVG Conversion Studio
   JavaScript Core
========================================= */

/* =========================================
   APPLICATION CONFIGURATION
========================================= */

const APP_CONFIG = Object.freeze({
    name: "VECTOR FORGE",
    version: "2.0.0",

    limits: {
        maxFiles: 30,
        maxFileSize: 25 * 1024 * 1024,
        maxSourcePixels: 50_000_000,
        maxProcessPixels: 12_000_000,
        maxDimension: 12000,
        workerTimeout: 120000
    },

    supportedExtensions: [
        "png",
        "jpg",
        "jpeg",
        "webp",
        "bmp",
        "gif"
    ],

    supportedMimeTypes: [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/bmp",
        "image/gif"
    ],

    tracerUrl:
        "https://cdn.jsdelivr.net/npm/imagetracerjs@1.2.6/imagetracer_v1.2.6.js"
});

/* =========================================
   APPLICATION STATE
========================================= */

const state = {
    files: [],
    results: [],

    activeId: null,

    busy: false,
    cancelled: false,

    currentIndex: 0,
    totalCount: 0,

    activeTab: "original",

    zoom: 1,

    worker: null,
    workerTimer: null,

    previewURL: null,

    currentOptions: null
};

/* =========================================
   DOM REFERENCES
========================================= */

const DOM = {
    engineDot: document.getElementById("engineDot"),
    engineStatus: document.getElementById("engineStatus"),

    fileCount: document.getElementById("fileCount"),
    dropzone: document.getElementById("dropzone"),
    fileInput: document.getElementById("fileInput"),
    fileSummary: document.getElementById("fileSummary"),
    clearAllBtn: document.getElementById("clearAllBtn"),
    fileList: document.getElementById("fileList"),

    colors: document.getElementById("colors"),
    colorsValue: document.getElementById("colorsValue"),

    scale: document.getElementById("scale"),
    scaleValue: document.getElementById("scaleValue"),

    simplify: document.getElementById("simplify"),
    simplifyValue: document.getElementById("simplifyValue"),

    smooth: document.getElementById("smooth"),
    smoothValue: document.getElementById("smoothValue"),

    mode: document.getElementById("mode"),
    threshold: document.getElementById("threshold"),
    thresholdValue: document.getElementById("thresholdValue"),

    whiteBg: document.getElementById("whiteBg"),
    preserveAlpha: document.getElementById("preserveAlpha"),
    layered: document.getElementById("layered"),

    maxSize: document.getElementById("maxSize"),
    smoothEdges: document.getElementById("smoothEdges"),
    optimizeSvg: document.getElementById("optimizeSvg"),

    convertBtn: document.getElementById("convertBtn"),
    cancelBtn: document.getElementById("cancelBtn"),

    activeFileLabel: document.getElementById("activeFileLabel"),
    fitBtn: document.getElementById("fitBtn"),
    quickSaveBtn: document.getElementById("quickSaveBtn"),

    originalTab: document.getElementById("originalTab"),
    outputTab: document.getElementById("outputTab"),
    codeTab: document.getElementById("codeTab"),
    infoTab: document.getElementById("infoTab"),

    previewFormat: document.getElementById("previewFormat"),

    zoomOutBtn: document.getElementById("zoomOutBtn"),
    zoomResetBtn: document.getElementById("zoomResetBtn"),
    zoomInBtn: document.getElementById("zoomInBtn"),

    previewStage: document.getElementById("previewStage"),
    previewImage: document.getElementById("previewImage"),
    previewPlaceholder: document.getElementById("previewPlaceholder"),

    previewDimensions: document.getElementById("previewDimensions"),
    zoomLabel: document.getElementById("zoomLabel"),

    codePanel: document.getElementById("codePanel"),
    codeArea: document.getElementById("codeArea"),

    infoPanel: document.getElementById("infoPanel"),
    infoContent: document.getElementById("infoContent"),

    progressPercent: document.getElementById("progressPercent"),
    progressFill: document.getElementById("progressFill"),
    progressMessage: document.getElementById("progressMessage"),

    exportInfo: document.getElementById("exportInfo"),
    copyBtn: document.getElementById("copyBtn"),
    savePngBtn: document.getElementById("savePngBtn"),
    saveBtn: document.getElementById("saveBtn"),
    zipBtn: document.getElementById("zipBtn"),

    toastRegion: document.getElementById("toastRegion")
};

/* =========================================
   BASIC UTILITIES
========================================= */

function createId() {
    if (typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return (
        Date.now().toString(36) +
        Math.random().toString(36).slice(2)
    );
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "0 B";
    }

    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1
    );

    const value = bytes / Math.pow(1024, index);

    return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
}

function getExtension(filename) {
    const parts = String(filename).split(".");

    return parts.length > 1
        ? parts.pop().toLowerCase()
        : "";
}

function getBaseName(filename) {
    return String(filename).replace(/\.[^.]+$/, "");
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[character];
    });
}

/* =========================================
   FILE LOOKUP
========================================= */

function getActiveFile() {
    return state.files.find(
        file => file.id === state.activeId
    ) || null;
}

function getActiveResult() {
    return state.results.find(
        result => result.id === state.activeId
    ) || null;
}

function getFileById(id) {
    return state.files.find(
        file => file.id === id
    ) || null;
}

function getResultById(id) {
    return state.results.find(
        result => result.id === id
    ) || null;
}
