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
/* =========================================
   FILE VALIDATION
========================================= */

function validateFile(file) {
    if (!(file instanceof File)) {
        return {
            valid: false,
            reason: "Invalid file."
        };
    }

    const extension = getExtension(file.name);

    const validExtension =
        APP_CONFIG.supportedExtensions.includes(extension);

    const validMime =
        APP_CONFIG.supportedMimeTypes.includes(file.type);

    if (!validExtension && !validMime) {
        return {
            valid: false,
            reason: "Unsupported image format."
        };
    }

    if (file.size <= 0) {
        return {
            valid: false,
            reason: "The selected file is empty."
        };
    }

    if (file.size > APP_CONFIG.limits.maxFileSize) {
        return {
            valid: false,
            reason: "File exceeds the 25 MB limit."
        };
    }

    return {
        valid: true,
        reason: ""
    };
}

/* =========================================
   IMAGE DIMENSION VALIDATION
========================================= */

function loadImageDimensions(file) {
    return new Promise((resolve, reject) => {
        const objectURL = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            const width = image.naturalWidth;
            const height = image.naturalHeight;

            URL.revokeObjectURL(objectURL);

            if (!width || !height) {
                reject(new Error("Unable to read image dimensions."));
                return;
            }

            const pixels = width * height;

            if (
                pixels > APP_CONFIG.limits.maxSourcePixels ||
                width > APP_CONFIG.limits.maxDimension ||
                height > APP_CONFIG.limits.maxDimension
            ) {
                reject(
                    new Error("Image exceeds the 50 megapixel source limit.")
                );
                return;
            }

            resolve({
                width,
                height,
                pixels
            });
        };

        image.onerror = () => {
            URL.revokeObjectURL(objectURL);

            reject(
                new Error("The selected file is not a readable image.")
            );
        };

        image.src = objectURL;
    });
}

/* =========================================
   FILE IMPORT
========================================= */

async function importFiles(fileList) {
    const incoming = Array.from(fileList || []);

    if (incoming.length === 0) {
        return;
    }

    if (state.files.length >= APP_CONFIG.limits.maxFiles) {
        showToast("Maximum of 30 files reached.", "warning");
        return;
    }

    let addedCount = 0;

    for (const file of incoming) {
        if (state.files.length >= APP_CONFIG.limits.maxFiles) {
            showToast("Maximum of 30 files reached.", "warning");
            break;
        }

        const validation = validateFile(file);

        if (!validation.valid) {
            showToast(
                `${file.name}: ${validation.reason}`,
                "error"
            );
            continue;
        }

        const duplicate = state.files.some(existing => {
            return (
                existing.name === file.name &&
                existing.size === file.size &&
                existing.lastModified === file.lastModified
            );
        });

        if (duplicate) {
            continue;
        }

        try {
            const dimensions = await loadImageDimensions(file);

            const entry = {
                id: createId(),
                file,
                name: file.name,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified,

                width: dimensions.width,
                height: dimensions.height,
                pixels: dimensions.pixels,

                importedAt: Date.now()
            };

            state.files.push(entry);
            addedCount++;

        } catch (error) {
            showToast(
                `${file.name}: ${error.message}`,
                "error"
            );
        }
    }

    if (addedCount > 0) {
        if (!state.activeId) {
            state.activeId = state.files[0].id;
        }

        renderFileList();
        updateFileSummary();
        updateActiveFile();

        showToast(
            `${addedCount} file(s) imported.`,
            "success"
        );
    }
}

/* =========================================
   FILE REMOVAL
========================================= */

function removeFile(id) {
    const index = state.files.findIndex(
        file => file.id === id
    );

    if (index === -1) {
        return;
    }

    const removed = state.files[index];

    state.files.splice(index, 1);

    state.results = state.results.filter(
        result => result.id !== id
    );

    if (state.activeId === id) {
        const nextFile =
            state.files[Math.min(index, state.files.length - 1)];

        state.activeId = nextFile ? nextFile.id : null;
    }

    if (removed) {
        URL.revokeObjectURL(
            removed.previewURL || ""
        );
    }

    renderFileList();
    updateFileSummary();
    updateActiveFile();

    showToast("File removed.", "success");
}

function clearAllFiles() {
    if (state.busy) {
        showToast(
            "Cancel the current conversion first.",
            "warning"
        );
        return;
    }

    state.files = [];
    state.results = [];
    state.activeId = null;

    if (state.previewURL) {
        URL.revokeObjectURL(state.previewURL);
        state.previewURL = null;
    }

    renderFileList();
    updateFileSummary();
    updateActiveFile();

    showToast("All files cleared.", "success");
}

/* =========================================
   ACTIVE FILE SELECTION
========================================= */

function selectFile(id) {
    if (!getFileById(id)) {
        return;
    }

    state.activeId = id;
    state.zoom = 1;

    renderFileList();
    updateActiveFile();
}

/* =========================================
   FILE SUMMARY
========================================= */

function updateFileSummary() {
    const count = state.files.length;

    const totalSize = state.files.reduce(
        (total, item) => total + item.size,
        0
    );

    if (DOM.fileCount) {
        DOM.fileCount.textContent = String(count);
    }

    if (DOM.fileSummary) {
        DOM.fileSummary.textContent =
            `${count} file(s) · ${formatBytes(totalSize)}`;
    }

    if (DOM.clearAllBtn) {
        DOM.clearAllBtn.disabled = count === 0 || state.busy;
    }

    updateExportButtons();
}
