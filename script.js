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
/* =========================================
   FILE LIST RENDERING
========================================= */

function renderFileList() {
    if (!DOM.fileList) {
        return;
    }

    DOM.fileList.replaceChildren();

    if (state.files.length === 0) {
        const empty = document.createElement("div");

        empty.className = "empty-files";
        empty.textContent = "No images imported yet.";

        DOM.fileList.appendChild(empty);
        return;
    }

    for (const entry of state.files) {
        const item = document.createElement("div");

        item.className = "file-item";

        if (entry.id === state.activeId) {
            item.classList.add("active");
        }

        const thumbnail = document.createElement("div");
        thumbnail.className = "file-thumbnail";

        const image = document.createElement("img");
        image.alt = "";
        image.loading = "lazy";

        const thumbnailURL = URL.createObjectURL(entry.file);

        image.src = thumbnailURL;

        image.addEventListener("load", () => {
            URL.revokeObjectURL(thumbnailURL);
        }, { once: true });

        image.addEventListener("error", () => {
            URL.revokeObjectURL(thumbnailURL);
        }, { once: true });

        thumbnail.appendChild(image);

        const details = document.createElement("div");
        details.className = "file-details";

        const name = document.createElement("div");
        name.className = "file-name";
        name.textContent = entry.name;
        name.title = entry.name;

        const metadata = document.createElement("div");
        metadata.className = "file-meta";

        metadata.textContent =
            `${entry.width} × ${entry.height} · ${formatBytes(entry.size)}`;

        details.append(name, metadata);

        const actions = document.createElement("div");
        actions.className = "file-actions";

        const removeButton = document.createElement("button");

        removeButton.type = "button";
        removeButton.className = "file-remove";
        removeButton.textContent = "×";
        removeButton.title = "Remove file";
        removeButton.setAttribute("aria-label", `Remove ${entry.name}`);

        removeButton.addEventListener("click", event => {
            event.stopPropagation();
            removeFile(entry.id);
        });

        actions.appendChild(removeButton);

        item.append(thumbnail, details, actions);

        item.addEventListener("click", () => {
            selectFile(entry.id);
        });

        DOM.fileList.appendChild(item);
    }
}

/* =========================================
   ACTIVE FILE DISPLAY
========================================= */

function updateActiveFile() {
    const entry = getActiveFile();
    const result = getActiveResult();

    if (!entry) {
        showEmptyPreview();
        updateExportButtons();
        return;
    }

    if (DOM.activeFileLabel) {
        DOM.activeFileLabel.textContent = entry.name;
    }

    if (DOM.previewDimensions) {
        DOM.previewDimensions.textContent =
            `${entry.width} × ${entry.height}`;
    }

    if (state.activeTab === "output" && result) {
        showSvgPreview(result.svg);
    } else if (state.activeTab === "code" && result) {
        showCodePreview(result.svg);
    } else if (state.activeTab === "info" && result) {
        showInfoPreview(entry, result);
    } else {
        showOriginalPreview(entry);
    }

    updateExportButtons();
}

/* =========================================
   PREVIEW HELPERS
========================================= */

function clearPreviewURL() {
    if (state.previewURL) {
        URL.revokeObjectURL(state.previewURL);
        state.previewURL = null;
    }
}

function hidePreviewViews() {
    if (DOM.previewImage) {
        DOM.previewImage.classList.remove("visible");
        DOM.previewImage.removeAttribute("src");
    }

    if (DOM.previewPlaceholder) {
        DOM.previewPlaceholder.hidden = true;
    }

    if (DOM.codePanel) {
        DOM.codePanel.hidden = true;
    }

    if (DOM.infoPanel) {
        DOM.infoPanel.hidden = true;
    }
}

function showEmptyPreview() {
    clearPreviewURL();
    hidePreviewViews();

    if (DOM.previewPlaceholder) {
        DOM.previewPlaceholder.hidden = false;
    }

    if (DOM.activeFileLabel) {
        DOM.activeFileLabel.textContent = "No file selected";
    }

    if (DOM.previewDimensions) {
        DOM.previewDimensions.textContent = "—";
    }

    if (DOM.codeArea) {
        DOM.codeArea.textContent = "";
    }

    if (DOM.infoContent) {
        DOM.infoContent.replaceChildren();
    }
}

/* =========================================
   ORIGINAL IMAGE PREVIEW
========================================= */

function showOriginalPreview(entry) {
    clearPreviewURL();
    hidePreviewViews();

    if (!DOM.previewImage) {
        return;
    }

    state.previewURL = URL.createObjectURL(entry.file);

    DOM.previewImage.src = state.previewURL;
    DOM.previewImage.alt = entry.name;
    DOM.previewImage.classList.add("visible");

    applyZoom();
}

/* =========================================
   SVG IMAGE PREVIEW
========================================= */

function showSvgPreview(svg) {
    clearPreviewURL();
    hidePreviewViews();

    if (!DOM.previewImage) {
        return;
    }

    const blob = new Blob(
        [svg],
        { type: "image/svg+xml;charset=utf-8" }
    );

    state.previewURL = URL.createObjectURL(blob);

    DOM.previewImage.src = state.previewURL;
    DOM.previewImage.alt = "Converted SVG preview";
    DOM.previewImage.classList.add("visible");

    applyZoom();
}

/* =========================================
   SVG CODE PREVIEW
========================================= */

function showCodePreview(svg) {
    clearPreviewURL();
    hidePreviewViews();

    if (DOM.codePanel) {
        DOM.codePanel.hidden = false;
    }

    if (DOM.codeArea) {
        DOM.codeArea.textContent = svg;
    }
}

/* =========================================
   PREVIEW ZOOM
========================================= */

function applyZoom() {
    if (DOM.previewImage) {
        DOM.previewImage.style.transform =
            `scale(${state.zoom})`;
    }

    if (DOM.zoomLabel) {
        DOM.zoomLabel.textContent =
            `${Math.round(state.zoom * 100)}%`;
    }
}

function changeZoom(amount) {
    state.zoom = clamp(
        state.zoom + amount,
        0.1,
        5
    );

    applyZoom();
}

function resetZoom() {
    state.zoom = 1;
    applyZoom();
}

function fitPreview() {
    state.zoom = 1;
    applyZoom();
}
/* =========================================
   INFO PREVIEW
========================================= */

function showInfoPreview(entry, result) {
    clearPreviewURL();
    hidePreviewViews();

    if (!DOM.infoPanel || !DOM.infoContent) {
        return;
    }

    DOM.infoPanel.hidden = false;
    DOM.infoContent.replaceChildren();

    const cards = [
        ["FILE NAME", entry.name],
        ["FILE SIZE", formatBytes(entry.size)],
        ["SOURCE FORMAT", entry.type || getExtension(entry.name).toUpperCase()],
        ["SOURCE DIMENSIONS", `${entry.width} × ${entry.height}`],
        ["SOURCE PIXELS", formatNumber(entry.pixels)],
        ["SVG SIZE", formatBytes(result.blob.size)],
        ["SVG DIMENSIONS", `${result.width} × ${result.height}`],
        ["CONVERSION TIME", `${result.duration.toFixed(2)} s`]
    ];

    const grid = document.createElement("div");
    grid.className = "info-grid";

    for (const [label, value] of cards) {
        const card = document.createElement("div");
        card.className = "info-card";

        const heading = document.createElement("div");
        heading.className = "info-card-label";
        heading.textContent = label;

        const content = document.createElement("div");
        content.className = "info-card-value";
        content.textContent = value;

        card.append(heading, content);
        grid.appendChild(card);
    }

    const description = document.createElement("div");
    description.className = "info-description";

    description.textContent =
        "This image has been converted into scalable vector graphics. " +
        "SVG can be resized without the usual pixelation associated with raster images.";

    DOM.infoContent.append(grid, description);
}

/* =========================================
   SETTINGS VALUE HELPERS
========================================= */

function readNumber(element, fallback, min, max) {
    if (!element) {
        return fallback;
    }

    const value = Number(element.value);

    if (!Number.isFinite(value)) {
        return fallback;
    }

    return clamp(value, min, max);
}

function readChecked(element, fallback = false) {
    return element
        ? Boolean(element.checked)
        : fallback;
}

function readSelect(element, fallback) {
    if (!element || !element.value) {
        return fallback;
    }

    return element.value;
}

/* =========================================
   CONVERSION SETTINGS
========================================= */

function getConversionOptions() {
    const colors = readNumber(
        DOM.colors,
        16,
        2,
        64
    );

    const scale = readNumber(
        DOM.scale,
        1,
        0.1,
        4
    );

    const simplify = readNumber(
        DOM.simplify,
        1,
        0,
        10
    );

    const smooth = readNumber(
        DOM.smooth,
        1,
        0,
        10
    );

    const threshold = readNumber(
        DOM.threshold,
        0,
        0,
        255
    );

    const maxSize = readNumber(
        DOM.maxSize,
        4096,
        256,
        12000
    );

    const mode = readSelect(
        DOM.mode,
        "color"
    );

    return {
        colors,
        scale,
        simplify,
        smooth,
        threshold,
        maxSize,
        mode,

        whiteBg: readChecked(DOM.whiteBg),
        preserveAlpha: readChecked(DOM.preserveAlpha, true),
        layered: readChecked(DOM.layered),
        smoothEdges: readChecked(DOM.smoothEdges),
        optimizeSvg: readChecked(DOM.optimizeSvg)
    };
}

/* =========================================
   IMAGETRACER OPTIONS
========================================= */

function buildTracerOptions(settings) {
    const simplifyFactor = settings.simplify / 10;
    const smoothFactor = settings.smooth / 10;

    const options = {
        numberofcolors: settings.colors,

        // Color quantization and path detection
        colorsampling: 2,
        mincolorratio: 0.02,

        // Path precision
        ltres: 1 + simplifyFactor * 3,
        qtres: 1 + simplifyFactor * 3,

        // Remove tiny paths
        pathomit: Math.round(
            8 - simplifyFactor * 7
        ),

        // Edge smoothing
        blurradius: settings.smoothEdges
            ? Math.max(1, Math.round(smoothFactor * 2))
            : 0,

        blurdelta: 20 + Math.round(
            smoothFactor * 30
        ),

        // Output settings
        viewbox: true,
        desc: false,
        roundcoords: 2,

        // Layering
        layering: settings.layered,

        // SVG structure
        strokewidth: 0,
        linefilter: true
    };

    if (settings.mode === "grayscale") {
        options.colorsampling = 0;
        options.numberofcolors = Math.min(
            settings.colors,
            16
        );
    }

    return options;
}

/* =========================================
   SETTINGS DISPLAY
========================================= */

function updateSettingsLabels() {
    const pairs = [
        [DOM.colors, DOM.colorsValue, value => `${value}`],
        [DOM.scale, DOM.scaleValue, value => `${value}×`],
        [DOM.simplify, DOM.simplifyValue, value => `${value}`],
        [DOM.smooth, DOM.smoothValue, value => `${value}`],
        [DOM.threshold, DOM.thresholdValue, value => `${value}`]
    ];

    for (const [input, output, formatter] of pairs) {
        if (!input || !output) {
            continue;
        }

        output.textContent = formatter(input.value);
    }
}

/* =========================================
   OPTION SNAPSHOT
========================================= */

function captureConversionSettings() {
    const settings = getConversionOptions();

    state.currentOptions = {
        ...settings,
        tracerOptions: buildTracerOptions(settings),
        capturedAt: Date.now()
    };

    return state.currentOptions;
       }
/* =========================================
   IMAGE LOADING
========================================= */

function loadImageElement(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to decode the image."));
        };

        image.src = url;
    });
}

/* =========================================
   CANVAS SIZE CALCULATION
========================================= */

function calculateProcessSize(width, height, settings) {
    const maxDimension = settings.maxSize;
    const maxPixels = APP_CONFIG.limits.maxProcessPixels;

    let scale = settings.scale;

    const dimensionScale = Math.min(
        maxDimension / width,
        maxDimension / height,
        1
    );

    scale = Math.min(scale, dimensionScale);

    const requestedWidth = width * scale;
    const requestedHeight = height * scale;

    const pixelScale = Math.sqrt(
        maxPixels / (requestedWidth * requestedHeight)
    );

    scale *= Math.min(1, pixelScale);

    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
    };
}

/* =========================================
   CANVAS CREATION
========================================= */

function createProcessingCanvas(width, height) {
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", {
        willReadFrequently: true,
        alpha: true
    });

    if (!context) {
        throw new Error("Canvas 2D is not supported.");
    }

    return {
        canvas,
        context
    };
}

/* =========================================
   IMAGE DRAWING
========================================= */

async function drawImageToCanvas(entry, settings) {
    const image = await loadImageElement(entry.file);

    const dimensions = calculateProcessSize(
        image.naturalWidth,
        image.naturalHeight,
        settings
    );

    const { canvas, context } = createProcessingCanvas(
        dimensions.width,
        dimensions.height
    );

    context.clearRect(
        0,
        0,
        dimensions.width,
        dimensions.height
    );

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(
        image,
        0,
        0,
        dimensions.width,
        dimensions.height
    );

    return {
        canvas,
        context,
        width: dimensions.width,
        height: dimensions.height
    };
}

/* =========================================
   PIXEL TRANSPARENCY PROCESSING
========================================= */

function processImageAlpha(imageData, settings) {
    const pixels = imageData.data;

    const preserveAlpha = settings.preserveAlpha;
    const threshold = settings.threshold;
    const removeWhite = settings.whiteBg;

    const whiteTolerance = 12;

    for (let i = 0; i < pixels.length; i += 4) {
        const red = pixels[i];
        const green = pixels[i + 1];
        const blue = pixels[i + 2];

        let alpha = pixels[i + 3];

        // Remove nearly transparent pixels.
        if (threshold > 0 && alpha < threshold) {
            alpha = 0;
        }

        // Remove near-white background pixels.
        if (
            removeWhite &&
            red >= 255 - whiteTolerance &&
            green >= 255 - whiteTolerance &&
            blue >= 255 - whiteTolerance
        ) {
            alpha = 0;
        }

        // Ignore original transparency when disabled.
        if (!preserveAlpha && alpha > 0) {
            alpha = 255;
        }

        pixels[i + 3] = alpha;
    }

    return imageData;
}

/* =========================================
   GRAYSCALE PROCESSING
========================================= */

function convertToGrayscale(imageData) {
    const pixels = imageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
        const red = pixels[i];
        const green = pixels[i + 1];
        const blue = pixels[i + 2];

        const gray = Math.round(
            red * 0.2126 +
            green * 0.7152 +
            blue * 0.0722
        );

        pixels[i] = gray;
        pixels[i + 1] = gray;
        pixels[i + 2] = gray;
    }

    return imageData;
}

/* =========================================
   COMPLETE IMAGE PREPARATION
========================================= */

async function prepareImageData(entry, settings) {
    const prepared = await drawImageToCanvas(
        entry,
        settings
    );

    let imageData = prepared.context.getImageData(
        0,
        0,
        prepared.width,
        prepared.height
    );

    imageData = processImageAlpha(
        imageData,
        settings
    );

    if (settings.mode === "grayscale") {
        imageData = convertToGrayscale(imageData);
    }

    return {
        imageData,
        width: prepared.width,
        height: prepared.height,
        pixels: prepared.width * prepared.height
    };
}

/* =========================================
   IMAGE PREPARATION VALIDATION
========================================= */

function validatePreparedImage(prepared) {
    if (!prepared || !prepared.imageData) {
        throw new Error("Image preparation failed.");
    }

    if (
        prepared.width <= 0 ||
        prepared.height <= 0
    ) {
        throw new Error("Invalid processing dimensions.");
    }

    if (
        prepared.pixels >
        APP_CONFIG.limits.maxProcessPixels
    ) {
        throw new Error("Processing image exceeds the pixel limit.");
    }

    const expectedLength =
        prepared.width * prepared.height * 4;

    if (prepared.imageData.data.length !== expectedLength) {
        throw new Error("Image pixel data is incomplete.");
    }

    return true;
}
/* =========================================
   WORKER SOURCE
========================================= */

function getWorkerSource() {
    return `
"use strict";

let tracerReady = false;

try {
    importScripts(${JSON.stringify(APP_CONFIG.tracerUrl)});

    if (
        typeof ImageTracer === "undefined" ||
        typeof ImageTracer.imagedataToSVG !== "function"
    ) {
        throw new Error("ImageTracerJS failed to load.");
    }

    tracerReady = true;

} catch (error) {
    self.postMessage({
        type: "init-error",
        message: error.message || "Tracer initialization failed."
    });
}

self.onmessage = function(event) {
    const message = event.data || {};

    if (message.type !== "convert") {
        return;
    }

    if (!tracerReady) {
        self.postMessage({
            type: "error",
            message: "ImageTracerJS is not ready."
        });
        return;
    }

    try {
        const imageData = {
            width: message.width,
            height: message.height,
            data: new Uint8ClampedArray(message.pixels)
        };

        const svg = ImageTracer.imagedataToSVG(
            imageData,
            message.options
        );

        if (
            typeof svg !== "string" ||
            !svg.includes("<svg")
        ) {
            throw new Error("Invalid SVG output.");
        }

        self.postMessage({
            type: "complete",
            svg
        });

    } catch (error) {
        self.postMessage({
            type: "error",
            message: error.message || "SVG conversion failed."
        });
    }
};
`;
}

/* =========================================
   WORKER CREATION
========================================= */

function createTracerWorker() {
    const source = getWorkerSource();

    const blob = new Blob(
        [source],
        { type: "application/javascript" }
    );

    const workerURL = URL.createObjectURL(blob);

    let worker;

    try {
        worker = new Worker(workerURL);
    } catch (error) {
        URL.revokeObjectURL(workerURL);
        throw new Error(
            `Unable to create conversion worker: ${error.message}`
        );
    }

    worker.addEventListener("error", () => {
        URL.revokeObjectURL(workerURL);
    }, { once: true });

    worker.addEventListener("message", event => {
        if (
            event.data &&
            (
                event.data.type === "complete" ||
                event.data.type === "error" ||
                event.data.type === "init-error"
            )
        ) {
            URL.revokeObjectURL(workerURL);
        }
    });

    return worker;
}

/* =========================================
   WORKER CLEANUP
========================================= */

function terminateWorker() {
    if (state.workerTimer) {
        clearTimeout(state.workerTimer);
        state.workerTimer = null;
    }

    if (state.worker) {
        state.worker.terminate();
        state.worker = null;
    }
}

/* =========================================
   SVG WORKER CONVERSION
========================================= */

function convertImageInWorker(prepared, options) {
    return new Promise((resolve, reject) => {
        let worker;

        try {
            worker = createTracerWorker();
        } catch (error) {
            reject(error);
            return;
        }

        state.worker = worker;

        let settled = false;

        const finish = (callback, value) => {
            if (settled) {
                return;
            }

            settled = true;

            if (state.workerTimer) {
                clearTimeout(state.workerTimer);
                state.workerTimer = null;
            }

            worker.terminate();

            if (state.worker === worker) {
                state.worker = null;
            }

            callback(value);
        };

        state.workerTimer = setTimeout(() => {
            finish(
                reject,
                new Error("SVG conversion timed out.")
            );
        }, APP_CONFIG.limits.workerTimeout);

        worker.onmessage = event => {
            const message = event.data || {};

            if (message.type === "init-error") {
                finish(
                    reject,
                    new Error(message.message)
                );
                return;
            }

            if (message.type === "error") {
                finish(
                    reject,
                    new Error(message.message)
                );
                return;
            }

            if (message.type === "complete") {
                finish(resolve, message.svg);
            }
        };

        worker.onerror = event => {
            finish(
                reject,
                new Error(
                    event.message || "Worker execution failed."
                )
            );
        };

        try {
            worker.postMessage({
                type: "convert",

                width: prepared.width,
                height: prepared.height,

                pixels: prepared.imageData.data.buffer,

                options
            }, [
                prepared.imageData.data.buffer
            ]);

        } catch (error) {
            finish(
                reject,
                new Error(
                    `Unable to send image data to worker: ${error.message}`
                )
            );
        }
    });
}

/* =========================================
   SVG OUTPUT VALIDATION
========================================= */

function validateSvg(svg) {
    if (typeof svg !== "string" || svg.length === 0) {
        throw new Error("SVG output is empty.");
    }

    if (!/<svg[\s>]/i.test(svg)) {
        throw new Error("SVG root element is missing.");
    }

    if (!/<\/svg\s*>/i.test(svg)) {
        throw new Error("SVG output appears incomplete.");
    }

    return true;
}

/* =========================================
   SVG DOCUMENT NORMALIZATION
========================================= */

function normalizeSvg(svg) {
    let output = String(svg).trim();

    if (!/xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(output)) {
        output = output.replace(
            /<svg\b/i,
            '<svg xmlns="http://www.w3.org/2000/svg"'
        );
    }

    return output;
}
/* =========================================
   SVG OPTIMIZATION
========================================= */

function optimizeSvgOutput(svg) {
    let output = normalizeSvg(svg);

    // Remove XML comments.
    output = output.replace(/<!--[\s\S]*?-->/g, "");

    // Remove unnecessary whitespace between tags.
    output = output.replace(/>\s+</g, "><");

    // Remove duplicate whitespace.
    output = output.replace(/\s{2,}/g, " ");

    return output.trim();
}

/* =========================================
   SVG OUTPUT CREATION
========================================= */

function createSvgBlob(svg) {
    return new Blob(
        [svg],
        {
            type: "image/svg+xml;charset=utf-8"
        }
    );
}

function createConversionResult(
    entry,
    svg,
    dimensions,
    duration,
    settings
) {
    const blob = createSvgBlob(svg);

    return {
        id: entry.id,
        name: entry.name,

        svg,
        blob,

        width: dimensions.width,
        height: dimensions.height,

        sourceWidth: entry.width,
        sourceHeight: entry.height,

        duration,
        settings,

        createdAt: Date.now()
    };
}

/* =========================================
   CONVERSION PROGRESS
========================================= */

function updateProgress(percent, message) {
    const value = clamp(
        Math.round(percent),
        0,
        100
    );

    if (DOM.progressPercent) {
        DOM.progressPercent.textContent = `${value}%`;
    }

    if (DOM.progressFill) {
        DOM.progressFill.style.width = `${value}%`;
    }

    if (DOM.progressMessage) {
        DOM.progressMessage.textContent = message;
    }
}

/* =========================================
   CONVERSION UI STATE
========================================= */

function setBusy(busy) {
    state.busy = Boolean(busy);

    if (DOM.convertBtn) {
        DOM.convertBtn.disabled =
            state.busy || state.files.length === 0;
    }

    if (DOM.cancelBtn) {
        DOM.cancelBtn.disabled = !state.busy;
        DOM.cancelBtn.hidden = !state.busy;
    }

    if (DOM.clearAllBtn) {
        DOM.clearAllBtn.disabled =
            state.busy || state.files.length === 0;
    }

    if (DOM.fileInput) {
        DOM.fileInput.disabled = state.busy;
    }

    updateExportButtons();
}

/* =========================================
   SINGLE FILE CONVERSION
========================================= */

async function convertSingleFile(entry, settings) {
    const startTime = performance.now();

    updateProgress(
        0,
        `Preparing ${entry.name}...`
    );

    const prepared = await prepareImageData(
        entry,
        settings
    );

    validatePreparedImage(prepared);

    if (state.cancelled) {
        throw new Error("Conversion cancelled.");
    }

    updateProgress(
        20,
        `Tracing ${entry.name}...`
    );

    const tracerOptions = buildTracerOptions(settings);

    let svg = await convertImageInWorker(
        prepared,
        tracerOptions
    );

    if (state.cancelled) {
        throw new Error("Conversion cancelled.");
    }

    validateSvg(svg);

    if (settings.optimizeSvg) {
        svg = optimizeSvgOutput(svg);
    } else {
        svg = normalizeSvg(svg);
    }

    validateSvg(svg);

    const duration =
        (performance.now() - startTime) / 1000;

    return createConversionResult(
        entry,
        svg,
        {
            width: prepared.width,
            height: prepared.height
        },
        duration,
        settings
    );
}

/* =========================================
   MULTI-FILE CONVERSION
========================================= */

async function startConversion() {
    if (state.busy) {
        return;
    }

    if (state.files.length === 0) {
        showToast("Import an image first.", "warning");
        return;
    }

    const settings = captureConversionSettings();

    state.cancelled = false;
    state.currentIndex = 0;
    state.totalCount = state.files.length;

    setBusy(true);

    const filesToConvert = [...state.files];

    let completed = 0;
    let failed = 0;

    updateProgress(0, "Starting conversion...");

    try {
        for (let index = 0; index < filesToConvert.length; index++) {
            if (state.cancelled) {
                break;
            }

            const entry = filesToConvert[index];

            state.currentIndex = index + 1;

            updateProgress(
                Math.round((index / filesToConvert.length) * 100),
                `Converting ${entry.name} (${index + 1}/${filesToConvert.length})`
            );

            try {
                const result = await convertSingleFile(
                    entry,
                    settings
                );

                if (state.cancelled) {
                    break;
                }

                const existingIndex = state.results.findIndex(
                    item => item.id === entry.id
                );

                if (existingIndex >= 0) {
                    state.results[existingIndex] = result;
                } else {
                    state.results.push(result);
                }

                completed++;

            } catch (error) {
                if (state.cancelled) {
                    break;
                }

                failed++;

                console.error(
                    `Conversion failed: ${entry.name}`,
                    error
                );

                showToast(
                    `${entry.name}: ${error.message}`,
                    "error"
                );
            }
        }

        if (state.cancelled) {
            updateProgress(0, "Conversion cancelled.");
            showToast("Conversion cancelled.", "warning");
        } else {
            updateProgress(
                100,
                `Finished: ${completed} converted, ${failed} failed.`
            );

            if (completed > 0) {
                showToast(
                    `${completed} image(s) converted.`,
                    "success"
                );
            }
        }

    } finally {
        terminateWorker();
        setBusy(false);

        renderFileList();
        updateActiveFile();
        updateExportButtons();
    }
}
/* =========================================
   CONVERSION CANCELLATION
========================================= */

function cancelConversion() {
    if (!state.busy) {
        return;
    }

    state.cancelled = true;

    updateProgress(
        0,
        "Cancelling conversion..."
    );

    // Worker processing is stopped immediately.
    terminateWorker();

    showToast(
        "Cancellation requested.",
        "warning"
    );
}

/* =========================================
   PREVIEW TAB MANAGEMENT
========================================= */

function setActiveTab(tab) {
    const validTabs = [
        "original",
        "output",
        "code",
        "info"
    ];

    if (!validTabs.includes(tab)) {
        return;
    }

    state.activeTab = tab;

    const tabElements = {
        original: DOM.originalTab,
        output: DOM.outputTab,
        code: DOM.codeTab,
        info: DOM.infoTab
    };

    for (const [name, element] of Object.entries(tabElements)) {
        if (!element) {
            continue;
        }

        const active = name === tab;

        element.classList.toggle("active", active);
        element.setAttribute(
            "aria-selected",
            String(active)
        );
    }

    if (DOM.previewFormat) {
        const labels = {
            original: "ORIGINAL",
            output: "SVG OUTPUT",
            code: "SVG CODE",
            info: "IMAGE INFO"
        };

        DOM.previewFormat.textContent = labels[tab];
    }

    updateActiveFile();
}

/* =========================================
   PREVIEW TAB ACTIONS
========================================= */

function showOriginalTab() {
    setActiveTab("original");
}

function showOutputTab() {
    if (!getActiveResult()) {
        showToast(
            "Convert an image before viewing SVG output.",
            "warning"
        );
        return;
    }

    setActiveTab("output");
}

function showCodeTab() {
    if (!getActiveResult()) {
        showToast(
            "Convert an image before viewing SVG code.",
            "warning"
        );
        return;
    }

    setActiveTab("code");
}

function showInfoTab() {
    if (!getActiveFile()) {
        showToast(
            "Select an image first.",
            "warning"
        );
        return;
    }

    setActiveTab("info");
}

/* =========================================
   ZOOM CONTROLS
========================================= */

function zoomIn() {
    changeZoom(0.1);
}

function zoomOut() {
    changeZoom(-0.1);
}

function zoomToDefault() {
    resetZoom();
}

function fitImageToStage() {
    fitPreview();

    if (!DOM.previewStage || !DOM.previewImage) {
        return;
    }

    const image = DOM.previewImage;

    if (!image.naturalWidth || !image.naturalHeight) {
        return;
    }

    const stage = DOM.previewStage;

    const availableWidth = Math.max(
        1,
        stage.clientWidth - 56
    );

    const availableHeight = Math.max(
        1,
        stage.clientHeight - 56
    );

    const scaleX = availableWidth / image.naturalWidth;
    const scaleY = availableHeight / image.naturalHeight;

    state.zoom = clamp(
        Math.min(scaleX, scaleY, 1),
        0.1,
        5
    );

    applyZoom();
}

/* =========================================
   PREVIEW KEYBOARD SUPPORT
========================================= */

function handlePreviewKeyboard(event) {
    if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
    ) {
        return;
    }

    if (event.key === "+" || event.key === "=") {
        zoomIn();
    } else if (event.key === "-") {
        zoomOut();
    } else if (event.key === "0") {
        zoomToDefault();
    }
}

/* =========================================
   PREVIEW WHEEL ZOOM
========================================= */

function handlePreviewWheel(event) {
    if (!event.ctrlKey || !DOM.previewStage?.contains(event.target)) {
        return;
    }

    event.preventDefault();

    if (event.deltaY < 0) {
        zoomIn();
    } else {
        zoomOut();
    }
}
