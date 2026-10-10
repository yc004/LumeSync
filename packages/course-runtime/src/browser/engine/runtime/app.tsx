// ========================================================
// LumeSync render-engine runtime API
// Core owns course loading and course-stage rendering only.
// Host applications own teacher/student chrome and app flow.
// ========================================================

const engineLoadScriptWithFallback = window.loadScriptWithFallback;
const engineCheckModelUrlValidity = window.checkModelUrlValidity;
const EngineCourseErrorBoundary = window.CourseErrorBoundary;
const EngineSyncClassroom = window.SyncClassroom;
const EngineWebPageSlide = window.WebPageSlide;

const ensurePdfJsLoaded = async () => {
    if (window.pdfjsLib && typeof window.pdfjsLib.getDocument === 'function') return true;
    const ok = await engineLoadScriptWithFallback(
        '/lib/pdf.min.js',
        'https://fastly.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
    );
    if (!ok || !window.pdfjsLib) return false;
    try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';
    } catch (_) {}
    return true;
};

const ensureJsZipLoaded = async () => {
    if (window.JSZip && typeof window.JSZip.loadAsync === 'function') return true;
    const ok = await engineLoadScriptWithFallback(
        '/lib/jszip.min.js',
        'https://fastly.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
    );
    return !!ok && !!window.JSZip && typeof window.JSZip.loadAsync === 'function';
};

const disposeLoadedLume = () => {
    const urls = Array.isArray(window.__LumeSyncLoadedLumeObjectUrls)
        ? window.__LumeSyncLoadedLumeObjectUrls
        : [];
    urls.forEach(url => {
        try {
            URL.revokeObjectURL(url);
        } catch (_) {}
    });
    window.__LumeSyncLoadedLumeObjectUrls = [];
};

const normalizeLumePath = (value) => String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');

const getLumeZipFile = (zip, filePath) => {
    const normalized = normalizeLumePath(filePath);
    return zip.file(normalized) || zip.file(normalized.replace(/\//g, '\\'));
};

const buildCourseFileUrl = (filePath) => {
    const normalized = normalizeLumePath(filePath);
    const encodedPath = normalized
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    return `/courses/${encodedPath}`;
};

const getMimeFromPath = (filePath) => {
    const ext = String(filePath || '').split('.').pop()?.toLowerCase();
    const mimeMap = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        mp4: 'video/mp4',
        webm: 'video/webm',
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        woff: 'font/woff',
        woff2: 'font/woff2',
        ttf: 'font/ttf',
        otf: 'font/otf',
        css: 'text/css'
    };
    return mimeMap[ext] || 'application/octet-stream';
};

const buildLumeAssetMap = async (zip, manifest) => {
    const assetMap = new Map();
    const objectUrls = [];
    const explicitAssetPaths = Object.keys(manifest.assets || {});
    const discoveredAssetPaths = Object.keys(zip.files || {})
        .filter(name => normalizeLumePath(name).startsWith('assets/') && !zip.files[name].dir);
    const paths = Array.from(new Set([...explicitAssetPaths, ...discoveredAssetPaths].map(normalizeLumePath)));

    for (const assetPath of paths) {
        const file = getLumeZipFile(zip, assetPath);
        if (!file) {
            console.warn('[LumeZip] asset not found:', assetPath);
            continue;
        }
        const blob = await file.async('blob');
        const typedBlob = blob.type ? blob : new Blob([blob], { type: getMimeFromPath(assetPath) });
        const url = URL.createObjectURL(typedBlob);
        objectUrls.push(url);
        assetMap.set(assetPath, url);
        assetMap.set('/' + assetPath, url);
    }

    window.__LumeSyncLoadedLumeObjectUrls = objectUrls;
    return assetMap;
};

const createLumeAssetResolver = (assetMap) => (assetPath) => {
    const normalized = normalizeLumePath(assetPath);
    const resolved = assetMap.get(assetPath) || assetMap.get(normalized) || assetMap.get('/' + normalized);
    if (!resolved && normalized.startsWith('assets/')) {
        console.warn('[LumeZip] unresolved asset path:', assetPath);
    }
    return resolved || assetPath;
};

const rewriteLumeAssetPaths = (source) => String(source || '').replace(
    /\b(src|href|poster)=["'](assets\/[^"']+)["']/g,
    (_match, attr, assetPath) => `${attr}={assetUrl("${assetPath}")}`
);

const executeCompiledLumeCode = (compiledCode, assetUrl, moduleFile) => {
    const module = { exports: {} };
    const exports = module.exports;
    const require = (name) => {
        if (name === 'react') return { __esModule: true, default: React, ...React };
        if (name === 'react-dom') return { __esModule: true, default: ReactDOM, ...ReactDOM };
        if (name === '@lumesync/course-sdk' || name === 'lumesync-course-sdk') return window.CourseGlobalContext || {};
        throw new Error(`Unsupported import "${name}" in ${moduleFile}`);
    };
    new Function('React', 'ReactDOM', 'assetUrl', 'module', 'exports', 'require', compiledCode)(
        React,
        ReactDOM,
        assetUrl,
        module,
        exports,
        require
    );
    return module.exports;
};

const compileLumeModule = (source, fileName, assetUrl, sourceType = 'module') => {
    if (!window.Babel || typeof window.Babel.transform !== 'function') {
        throw new Error('Babel runtime is required to compile TSX slides');
    }

    const compiledCode = window.Babel.transform(rewriteLumeAssetPaths(source), {
        presets: ['react', 'typescript'],
        plugins: sourceType === 'module' ? ['transform-modules-commonjs'] : [],
        filename: fileName,
        sourceType
    }).code;

    if (!compiledCode) throw new Error(`Failed to compile ${fileName}`);
    return executeCompiledLumeCode(compiledCode, assetUrl, fileName);
};

const resolveSlideExport = (moduleExports, page) => {
    const fileBaseName = normalizeLumePath(page.file).split('/').pop()?.replace(/\.[^.]+$/, '');
    return moduleExports.default
        || (page.exportName ? moduleExports[page.exportName] : null)
        || (fileBaseName ? moduleExports[fileBaseName] : null);
};

const slideExportToElement = (slideExport, page) => {
    if (React.isValidElement(slideExport)) return slideExport;
    if (typeof slideExport === 'function') return React.createElement(slideExport, { page });
    throw new Error(`Slide module did not export a React component: ${page.file}`);
};

const validateLumeManifest = (manifest) => {
    if (!manifest || typeof manifest !== 'object') throw new Error('Invalid manifest.json');
    if (manifest.runtime?.format !== 'lumesync-zip') throw new Error('Unsupported .lume manifest runtime format');
    const entryMode = manifest.runtime?.entryMode || 'pages';
    if (entryMode !== 'pages' && entryMode !== 'legacy-course-data') {
        throw new Error(`Unsupported .lume entryMode: ${entryMode}`);
    }
    if (!Array.isArray(manifest.pages) || manifest.pages.length === 0) {
        throw new Error('manifest.json must contain at least one page');
    }
    manifest.pages.forEach((page, idx) => {
        if (!page?.file) throw new Error(`manifest.pages[${idx}].file is required`);
    });
    return entryMode;
};

const buildCourseDataFromMemory = async ({ manifest, slides: memorySlides = [], course = {} } = {}) => {
    disposeLoadedLume();

    const normalizedManifest = {
        ...manifest,
        runtime: {
            format: 'lumesync-zip',
            entryMode: 'pages',
            ...(manifest?.runtime || {})
        }
    };

    validateLumeManifest(normalizedManifest);

    const memorySlideMap = new Map(
        (Array.isArray(memorySlides) ? memorySlides : []).map((slide) => [
            normalizeLumePath(slide?.file),
            String(slide?.source || '')
        ])
    );

    const assetUrl = (assetPath) => assetPath;
    const compiledSlides = [];

    for (const page of normalizedManifest.pages) {
        const slidePath = normalizeLumePath(page.file);
        const source = memorySlideMap.get(slidePath);
        if (typeof source !== 'string' || !source.trim()) {
            throw new Error(`Slide source not found in memory: ${page.file}`);
        }

        const moduleExports = compileLumeModule(source, slidePath, assetUrl, 'module');
        const slideExport = resolveSlideExport(moduleExports, page);
        compiledSlides.push({
            id: page.id || slidePath,
            title: page.title || page.id || slidePath,
            transition: page.transition,
            scrollable: page.scrollable === true,
            component: slideExportToElement(slideExport, page)
        });
    }

    const courseId = normalizedManifest.id || course.id || 'memory-course';
    window.CourseGlobalContext = createExportCourseContext({ courseId, slideIndex: 0 });

    const courseData = {
        id: courseId,
        title: normalizedManifest.title || course.title || courseId,
        icon: normalizedManifest.icon || course.icon || 'Course',
        desc: normalizedManifest.desc || normalizedManifest.description || course.desc || '',
        color: normalizedManifest.color || course.color || 'from-blue-500 to-indigo-600',
        slides: compiledSlides
    };

    window.CourseData = courseData;
    return courseData;
};

const loadLumeZipCourse = async (course, options = {}) => {
    const { socket, onProgress, createContext = createCourseContext } = options;
    disposeLoadedLume();

    setProgress(onProgress, { currentStep: 'init-lume-zip', currentFile: 'jszip', progress: 5, totalSteps: 5, currentStepIndex: 1 });
    const ok = await ensureJsZipLoaded();
    if (!ok) throw new Error('JSZip failed to load');

    const courseUrl = buildCourseFileUrl(course.file);
    setProgress(onProgress, { currentStep: 'fetch-lume-zip', currentFile: course.file, progress: 15, totalSteps: 5, currentStepIndex: 2 });
    const response = await fetch(courseUrl);
    if (!response.ok) throw new Error('Failed to fetch ' + courseUrl);

    const buffer = await response.arrayBuffer();
    const zip = await window.JSZip.loadAsync(buffer);
    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) throw new Error('manifest.json not found in .lume package');

    setProgress(onProgress, { currentStep: 'parse-manifest', currentFile: 'manifest.json', progress: 30, totalSteps: 5, currentStepIndex: 3 });
    const manifest = JSON.parse(await manifestFile.async('string'));
    const entryMode = validateLumeManifest(manifest);
    const assetMap = await buildLumeAssetMap(zip, manifest);
    const assetUrl = createLumeAssetResolver(assetMap);

    setProgress(onProgress, { currentStep: 'compile-slides', currentFile: 'slides', progress: 55, totalSteps: 5, currentStepIndex: 4 });

    if (manifest.editor?.documentFormat === 'lumesync-course-document'
        && window.LumeSyncDocumentRenderer
        && typeof window.LumeSyncDocumentRenderer.loadCourse === 'function') {
        const documentCourse = await window.LumeSyncDocumentRenderer.loadCourse({ zip, manifest, React, course });
        if (!documentCourse) throw new Error('Declarative course renderer did not return a course');
        window.CourseGlobalContext = createContext({ socket });
        window.CourseData = documentCourse;
        return loadCourseDataDependencies(documentCourse, {
            socket,
            onProgress,
            createContext,
            baseSteps: 5,
            firstDependencyStepIndex: 6,
            dependencyProgressStart: 65,
            dependencyProgressSpan: 25,
        });
    }

    if (entryMode === 'legacy-course-data') {
        window.CourseData = null;
        const legacyPage = manifest.pages[0];
        const legacyFile = getLumeZipFile(zip, legacyPage.file);
        if (!legacyFile) throw new Error(`Slide file not found: ${legacyPage.file}`);
        const source = await legacyFile.async('string');
        compileLumeModule(source, legacyPage.file, assetUrl, 'script');
        if (!window.CourseData) throw new Error('Legacy CourseData was not registered by ' + legacyPage.file);
        const legacyCourseData = {
            ...window.CourseData,
            id: window.CourseData.id || manifest.id || course.id,
            title: window.CourseData.title || manifest.title || course.title || course.id,
            icon: window.CourseData.icon || manifest.icon || course.icon,
            desc: window.CourseData.desc || manifest.desc || course.desc,
            color: window.CourseData.color || manifest.color || course.color,
            dependencies: window.CourseData.dependencies || manifest.dependencies || [],
            modelsUrls: window.CourseData.modelsUrls || manifest.modelsUrls
        };
        window.CourseData = legacyCourseData;
        return loadCourseDataDependencies(legacyCourseData, {
            socket,
            onProgress,
            createContext,
            baseSteps: 5,
            firstDependencyStepIndex: 6,
            dependencyProgressStart: 65,
            dependencyProgressSpan: 25,
        });
    }

    const slides = [];
    for (const page of manifest.pages) {
        const slidePath = normalizeLumePath(page.file);
        const slideFile = getLumeZipFile(zip, slidePath);
        if (!slideFile) throw new Error(`Slide file not found: ${page.file}`);
        const source = await slideFile.async('string');
        const moduleExports = compileLumeModule(source, slidePath, assetUrl, 'module');
        const slideExport = resolveSlideExport(moduleExports, page);
        slides.push({
            id: page.id || slidePath,
            title: page.title || page.id || slidePath,
            transition: page.transition,
            scrollable: page.scrollable === true,
            component: slideExportToElement(slideExport, page)
        });
    }

    window.CourseGlobalContext = createContext({ socket });
    const courseData = {
        id: manifest.id || course.id,
        title: manifest.title || course.title || course.id,
        icon: manifest.icon || course.icon || 'Course',
        desc: manifest.desc || manifest.description || course.desc || '',
        color: manifest.color || course.color || 'from-blue-500 to-indigo-600',
        dependencies: manifest.dependencies || [],
        modelsUrls: manifest.modelsUrls,
        slides
    };
    window.CourseData = courseData;
    return loadCourseDataDependencies(courseData, {
        socket,
        onProgress,
        createContext,
        baseSteps: 5,
        firstDependencyStepIndex: 6,
        dependencyProgressStart: 65,
        dependencyProgressSpan: 25,
    });
};

const getPdfDoc = (pdfUrl) => {
    if (!window.__LumeSyncPdfDocCache) window.__LumeSyncPdfDocCache = new Map();
    const cache = window.__LumeSyncPdfDocCache;
    const key = String(pdfUrl || '');
    if (!key) return Promise.reject(new Error('Missing pdfUrl'));
    const existing = cache.get(key);
    if (existing) return existing;
    const p = window.pdfjsLib.getDocument({ url: key }).promise;
    cache.set(key, p);
    return p;
};

function PdfPageSlide({ pdfUrl, pageNumber }) {
    const canvasRef = useRef(null);
    const [status, setStatus] = useState('loading');

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                setStatus('loading');
                const doc = await getPdfDoc(pdfUrl);
                const page = await doc.getPage(pageNumber);
                if (cancelled) return;

                const canvas = canvasRef.current;
                if (!canvas) return;

                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) throw new Error('Canvas context not available');

                const padding = 24;
                const maxW = 1280 - padding * 2;
                const maxH = 720 - padding * 2;

                const baseViewport = page.getViewport({ scale: 1 });
                const scale = Math.max(0.1, Math.min(maxW / baseViewport.width, maxH / baseViewport.height));
                const viewport = page.getViewport({ scale });

                const outputScale = window.devicePixelRatio || 1;
                canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
                canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
                canvas.style.width = Math.floor(viewport.width) + 'px';
                canvas.style.height = Math.floor(viewport.height) + 'px';

                ctx.setTransform(1, 0, 0, 1, 0, 0);
                if (outputScale !== 1) ctx.scale(outputScale, outputScale);

                await page.render({ canvasContext: ctx, viewport }).promise;
                if (cancelled) return;
                setStatus('done');
            } catch (err) {
                if (cancelled) return;
                console.error('[PDF] render failed:', err);
                setStatus('error');
            }
        })();

        return () => { cancelled = true; };
    }, [pdfUrl, pageNumber]);

    return (
        <div className="w-full h-full bg-slate-50 flex items-center justify-center relative">
            <canvas ref={canvasRef} className="bg-white rounded-xl shadow-xl" />
            {status === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="px-4 py-2 rounded-xl bg-white/90 border border-slate-200 text-slate-600 font-bold">
                        Rendering PDF...
                    </div>
                </div>
            )}
            {status === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 font-bold">
                        PDF render failed
                    </div>
                </div>
            )}
            <div className="absolute bottom-4 right-4 px-2 py-1 rounded-lg bg-white/90 border border-slate-200 text-slate-600 text-xs font-bold">
                {pageNumber}
            </div>
        </div>
    );
}

const setProgress = (onProgress, patch) => {
    if (typeof onProgress === 'function') onProgress(patch);
};

const createCourseContext = ({ socket, modelUrl, onCameraActive } = {}) => ({
    ...(modelUrl ? { modelUrl } : {}),
    canvas: window.__LumeSyncCanvas,
    getCamera: (onStream) => {
        if (typeof onCameraActive === 'function') onCameraActive(true);
        if (window._onCamActive) {
            window._onCamActive(true);
        } else {
            setTimeout(() => {
                if (window._onCamActive) window._onCamActive(true);
            }, 0);
        }
        return window.CameraManager.getStream(onStream);
    },
    releaseCamera: () => window.CameraManager.release(),
    unregisterCamera: (onStream) => window.CameraManager.unregister(onStream),
    syncInteraction: (event, payload = {}) => {
        const activeSocket = socket || window.socketRef?.current;
        if (activeSocket) activeSocket.emit('interaction:sync', { event, payload });
    },
});

const createExportCourseContext = ({ courseId = '', slideIndex = 0 } = {}) => ({
    canvas: null,
    getCamera: async () => {
        throw new Error('Camera is unavailable during export preview');
    },
    releaseCamera: () => {},
    unregisterCamera: () => {},
    syncInteraction: () => {},
    getSocket: () => null,
    getCurrentCourseMeta: () => ({ courseId, slideIndex }),
    setVoteToolbarState: () => {},
    clearVoteToolbarState: () => {},
    useSyncVar: (_key, initialValue) => [initialValue, () => {}],
    useLocalVar: (_key, initialValue) => [initialValue, () => {}],
    getStudentInfo: () => null,
    submitContent: async () => ({ success: false, error: 'Export preview mode does not accept submissions' }),
});

const loadCourseDataDependencies = async (courseData, {
    socket,
    onProgress,
    createContext = createCourseContext,
    baseSteps = 3,
    firstDependencyStepIndex = 4,
    dependencyProgressStart = 30,
    dependencyProgressSpan = 40,
} = {}) => {
    const dependencies = Array.isArray(courseData?.dependencies) ? courseData.dependencies : [];
    let totalSteps = baseSteps;
    if (dependencies.length) totalSteps += dependencies.length;
    if (courseData?.modelsUrls) totalSteps += 1;

    if (dependencies.length) {
        const depMappings = dependencies
            .filter(d => d.localSrc && d.publicSrc)
            .map(d => ({ filename: d.localSrc.split('/').pop(), publicSrc: d.publicSrc }));
        if (depMappings.length > 0 && socket) {
            // register-dependencies 会写入服务端的依赖 URL 映射，服务端只接受 host；
            // 学生页加载同一课件时不要再发，否则每次都会触发契约守卫的 event_forbidden。
            const clientRole = (typeof window !== 'undefined' && window.__LumeSyncIdentity && window.__LumeSyncIdentity.role) || '';
            if (clientRole === 'host') socket.emit('register-dependencies', depMappings);
        }

        let depIndex = 0;
        for (const dep of dependencies) {
            const fileName = dep.localSrc.split('/').pop();
            setProgress(onProgress, {
                currentStep: 'load-dependency',
                currentFile: fileName,
                progress: dependencyProgressStart + (depIndex / Math.max(dependencies.length, 1)) * dependencyProgressSpan,
                totalSteps,
                currentStepIndex: firstDependencyStepIndex + depIndex
            });
            await engineLoadScriptWithFallback(dep.localSrc, dep.publicSrc);
            depIndex++;
        }
    }

    let modelUrl = '';
    if (courseData?.modelsUrls) {
        setProgress(onProgress, {
            currentStep: 'check-models',
            currentFile: 'models',
            progress: Math.min(95, dependencyProgressStart + dependencyProgressSpan + 5),
            totalSteps,
            currentStepIndex: firstDependencyStepIndex + dependencies.length
        });
        modelUrl = await engineCheckModelUrlValidity(courseData.modelsUrls);
    }

    window.CourseGlobalContext = createContext({ socket, modelUrl });
    setProgress(onProgress, { currentStep: 'done', currentFile: '', progress: 100, totalSteps, currentStepIndex: totalSteps });
    return courseData;
};

const loadCourse = async (course, options = {}) => {
    const { socket, onProgress, createContext = createCourseContext } = options;
    if (!course || !course.file) throw new Error('Missing course file');

    const courseFileLower = String(course.file || '').toLowerCase();
    if (course.type === 'legacy-script') {
        throw new Error('This legacy single-file .lume must be migrated to the Zip manifest format before playback.');
    }
    if (courseFileLower.endsWith('.lume')) {
        return loadLumeZipCourse(course, options);
    }
    if (courseFileLower.endsWith('.pdf')) {
        disposeLoadedLume();
        setProgress(onProgress, { currentStep: 'init-pdf', currentFile: 'pdf.js', progress: 10, totalSteps: 3, currentStepIndex: 1 });
        const ok = await ensurePdfJsLoaded();
        if (!ok) throw new Error('PDF renderer failed to load');

        const pdfUrl = buildCourseFileUrl(course.file);
        setProgress(onProgress, { currentStep: 'parse-pdf', currentFile: course.file, progress: 50, totalSteps: 3, currentStepIndex: 2 });
        const doc = await getPdfDoc(pdfUrl);
        const pageCount = Math.max(1, Number(doc.numPages || 1));
        const slides = Array.from({ length: pageCount }, (_, idx) => ({
            id: 'page-' + (idx + 1),
            component: <PdfPageSlide pdfUrl={pdfUrl} pageNumber={idx + 1} />
        }));

        window.CourseGlobalContext = createContext({ socket });
        setProgress(onProgress, { currentStep: 'done', currentFile: '', progress: 100, totalSteps: 3, currentStepIndex: 3 });
        return {
            id: course.id,
            title: course.title || course.id,
            icon: course.icon || 'PDF',
            desc: course.desc || 'PDF courseware',
            color: course.color || 'from-rose-500 to-orange-600',
            slides
        };
    }

    disposeLoadedLume();
    window.CourseData = null;
    setProgress(onProgress, { currentStep: 'fetch-course', currentFile: course.file, progress: 5, totalSteps: 3, currentStepIndex: 1 });

    const scriptUrl = buildCourseFileUrl(course.file);
    const response = await fetch(scriptUrl);
    if (!response.ok) throw new Error('Failed to fetch ' + scriptUrl);
    const scriptContent = await response.text();

    setProgress(onProgress, { currentStep: 'compile-course', currentFile: course.file, progress: 15, totalSteps: 3, currentStepIndex: 2 });
    let compiledCode = scriptContent;
    if (window.Babel) {
        const babelFilename = String(course.file || '').toLowerCase().endsWith('.lume')
            ? String(course.file).replace(/\.lume$/i, '.tsx')
            : course.file;
        compiledCode = window.Babel.transform(scriptContent, { presets: ['react', 'typescript'], filename: babelFilename }).code;
    }

    setProgress(onProgress, { currentStep: 'execute-course', currentFile: course.file, progress: 25, totalSteps: 3, currentStepIndex: 3 });
    new Function(compiledCode)();

    let retries = 100;
    while (!window.CourseData && retries > 0) {
        await new Promise(r => setTimeout(r, 100));
        retries--;
    }
    if (!window.CourseData) throw new Error('CourseData was not registered by ' + course.file);

    return loadCourseDataDependencies(window.CourseData, { socket, onProgress, createContext });
};

function CourseStage(props) {
    const {
        renderChrome = false,
        renderTeacherOverlays = false,
        hideTopBar = true,
        hideBottomBar = true,
        ...stageProps
    } = props;
    return (
        <EngineSyncClassroom
            {...stageProps}
            renderChrome={renderChrome}
            renderTeacherOverlays={renderTeacherOverlays}
            hideTopBar={hideTopBar}
            hideBottomBar={hideBottomBar}
        />
    );
}

function CourseExportDocument({ course, courseData, contentScale = 1 }) {
    const slides = Array.isArray(courseData?.slides) ? courseData.slides : [];
    const normalizedContentScale = Math.min(Math.max(Number(contentScale) || 1, 0.2), 1.5);
    const slideWidth = 1280;
    const slideHeight = 720;
    const exportContentStyle = {
        width: `${slideWidth}px`,
        height: `${slideHeight}px`,
        transform: `scale(${normalizedContentScale})`,
        transformOrigin: 'top left',
    };

    return (
        <div className="min-h-screen bg-slate-200 px-6 py-8 text-slate-900 print:bg-white print:px-0 print:py-0">
            <style>{`
                .lumesync-export-document .text-transparent.bg-clip-text,
                .lumesync-export-document .bg-clip-text.text-transparent {
                    background-image: none !important;
                    -webkit-background-clip: border-box !important;
                    background-clip: border-box !important;
                    -webkit-text-fill-color: #2563eb !important;
                    color: #2563eb !important;
                    text-shadow: none !important;
                }
            `}</style>
            {slides.map((slide, index) => (
                <section
                    key={slide?.id || `slide-${index + 1}`}
                    className="lumesync-export-document mx-auto mb-8 flex w-full max-w-[1920px] justify-center break-after-page print:mb-0 print:max-w-none"
                    data-export-page={`slide-${index + 1}`}
                >
                    <div
                        className="flex w-full overflow-hidden rounded-[32px] border border-slate-300 bg-white shadow-[0_32px_120px_rgba(15,23,42,0.18)] print:rounded-none print:border-0 print:shadow-none"
                        style={{ aspectRatio: '16 / 9' }}
                    >
                        <div className="relative h-full w-full overflow-hidden bg-white">
                            <div style={exportContentStyle}>
                                {slide?.component || (
                                    <div className="flex h-full items-center justify-center text-slate-400">
                                        This slide is empty.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            ))}
        </div>
    );
}

const renderCourseStage = (rootElement, props) => {
    if (!rootElement) throw new Error('Missing rootElement');
    const root = ReactDOM.createRoot(rootElement);
    root.render(<CourseStage {...props} />);
    return root;
};

const renderCourseExportDocument = (rootElement, props) => {
    if (!rootElement) throw new Error('Missing rootElement');
    const root = ReactDOM.createRoot(rootElement);
    root.render(<CourseExportDocument {...props} />);
    return root;
};

window.LumeSyncRenderEngine = {
    ...(window.LumeSyncRenderEngine || {}),
    buildCourseDataFromMemory,
    CourseErrorBoundary: EngineCourseErrorBoundary,
    CourseExportDocument,
    CourseStage,
    PdfPageSlide,
    WebPageSlide: EngineWebPageSlide,
    createCourseContext,
    createExportCourseContext,
    getPdfDoc,
    loadCourse,
    renderCourseExportDocument,
    renderCourseStage,
};

console.log('[LumeSync RenderEngine] runtime API loaded');
