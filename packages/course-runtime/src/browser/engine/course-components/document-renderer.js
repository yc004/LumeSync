// Versioned, non-executable renderer for editor-authored declarative courses.
// Keep this file before runtime/app.tsx in the render-engine source order.
(function installDocumentRenderer(global) {
    'use strict';

    const FORMAT = 'lumesync-course-document';
    const VERSION = '1.0.0';
    const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;
    const MAX_PAGES = 500;
    const MAX_BLOCKS = 100;
    const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
    const COMPONENT_PROPS = {
        'core.heading': { kind: 'heading', props: ['text', 'level'] },
        'core.paragraph': { kind: 'paragraph', props: ['text'] },
        'core.bullets': { kind: 'bullets', props: ['items'] },
        'core.callout': { kind: 'callout', props: ['title', 'text', 'tone'] }
    };
    const CALLOUT_COLORS = {
        info: ['#eaf1ff', '#26428b'],
        tip: ['#e7f7ef', '#175c36'],
        warning: ['#fff4dc', '#77510a']
    };
    const PACK_TAGS = new Set(['div', 'section', 'article', 'aside', 'header', 'footer', 'h1', 'h2', 'h3', 'h4', 'p', 'span', 'small', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote']);
    const PACK_STYLES = new Set(['display', 'flexDirection', 'alignItems', 'justifyContent', 'gap', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'border', 'borderLeft', 'borderRadius', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'width', 'maxWidth', 'minWidth', 'boxShadow']);

    function fail(message) { throw new Error(`Declarative course rejected: ${message}`); }
    function isObject(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
    function exactKeys(value, allowed, label) {
        if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${label} contains an unsupported field`);
    }
    function requireText(value, max, label) {
        if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label} is invalid`);
    }
    function safeId(value, label) {
        if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) fail(`${label} is invalid`);
        return value;
    }
    function safePath(value) {
        return typeof value === 'string'
            && value.length > 0
            && value.length <= 240
            && !/[\u0000-\u001f\u007f\\]/.test(value)
            && !value.startsWith('/')
            && !/^[a-zA-Z]:/.test(value)
            && value.split('/').every(part => part && part !== '.' && part !== '..');
    }

    function validateBlock(block, pageId, seenIds, catalog, lockedExtensions) {
        if (!isObject(block)) fail(`page ${pageId} contains a non-object block`);
        exactKeys(block, ['id', 'type', 'props'], `block on page ${pageId}`);
        const blockId = safeId(block.id, 'block ID');
        if (seenIds.has(blockId)) fail(`page ${pageId} contains a duplicate block ID`);
        seenIds.add(blockId);
        const definition = catalog[block.type];
        if (!definition) fail(`component ${String(block.type)} is not supported`);
        if (!isObject(block.props)) fail(`props for ${block.type} must be an object`);
        exactKeys(block.props, definition.props, `props for ${block.type}`);
        if (definition.extension && !lockedExtensions.has(`${definition.extension.id}@${definition.extension.version}`)) {
            fail(`component ${block.type} is not declared by the course extension lock`);
        }
        if (definition.kind === 'heading') {
            requireText(block.props.text, 500, 'heading text');
            if (![1, 2, 3].includes(block.props.level)) fail('heading level is invalid');
        } else if (definition.kind === 'paragraph') {
            requireText(block.props.text, 10000, 'paragraph text');
        } else if (definition.kind === 'bullets') {
            if (!Array.isArray(block.props.items) || block.props.items.length < 1 || block.props.items.length > 50
                || block.props.items.some(item => typeof item !== 'string' || item.length > 1000)) fail('bullet items are invalid');
        } else if (definition.kind === 'callout') {
            requireText(block.props.text, 5000, 'callout text');
            if (block.props.title !== undefined && (typeof block.props.title !== 'string' || block.props.title.length > 200)) fail('callout title is invalid');
            if (!Object.prototype.hasOwnProperty.call(CALLOUT_COLORS, block.props.tone)) fail('callout tone is invalid');
        } else if (definition.component) {
            validateComponentProps(definition.component, block.props);
        } else {
            fail(`component ${String(block.type)} is not supported`);
        }
    }

    function stableStringify(value) {
        if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
        if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
        return JSON.stringify(value);
    }

    function validateComponentProps(component, props) {
        const definitions = component.props;
        exactKeys(props, Object.keys(definitions), `props for ${component.id}`);
        for (const [name, field] of Object.entries(definitions)) {
            const value = props[name];
            if (value === undefined) {
                if (field.required && field.default === undefined) fail(`component ${component.id} is missing ${name}`);
                continue;
            }
            if (field.type === 'string' && (typeof value !== 'string' || value.length > (field.maxLength || 1000))) fail(`component prop ${name} is invalid`);
            if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max))) fail(`component prop ${name} is invalid`);
            if (field.type === 'boolean' && typeof value !== 'boolean') fail(`component prop ${name} is invalid`);
            if (field.type === 'color' && (typeof value !== 'string' || !HEX_COLOR.test(value))) fail(`component prop ${name} is invalid`);
            if (field.type === 'enum' && !field.options.includes(value)) fail(`component prop ${name} is invalid`);
        }
    }

    function validatePackTemplate(node, component, depth, count) {
        count.value += 1;
        if (count.value > 150 || depth > 10 || !isObject(node)) fail(`component ${component.id} has an invalid template`);
        if (node.prop !== undefined) {
            exactKeys(node, ['prop'], `template ${component.id}`);
            if (typeof node.prop !== 'string' || !component.props[node.prop]) fail(`component ${component.id} references an unknown prop`);
            return;
        }
        if (node.text !== undefined) {
            exactKeys(node, ['text'], `template ${component.id}`);
            if (typeof node.text !== 'string' || node.text.length > 500) fail(`component ${component.id} has invalid template text`);
            return;
        }
        exactKeys(node, ['tag', 'style', 'children'], `template ${component.id}`);
        if (!PACK_TAGS.has(node.tag)) fail(`component ${component.id} uses an unsupported tag`);
        if (node.style !== undefined) {
            if (!isObject(node.style) || Object.keys(node.style).length > 24) fail(`component ${component.id} has invalid style`);
            for (const [key, value] of Object.entries(node.style)) {
                if (!PACK_STYLES.has(key)) fail(`component ${component.id} uses unsupported style ${key}`);
                if (typeof value === 'string') {
                    if (!value.trim() || value.length > 120 || /url\s*\(|expression\s*\(|javascript:|@import|[;{}<>]/i.test(value)) fail(`component ${component.id} has unsafe style`);
                } else if (isObject(value) && Object.keys(value).length === 1 && typeof value.prop === 'string'
                    && component.props[value.prop] && ['color', 'number'].includes(component.props[value.prop].type)) {
                    // Prop value is assigned through a React style object, never interpolated into CSS source.
                } else fail(`component ${component.id} has an invalid style binding`);
            }
        }
        if (node.children !== undefined) {
            if (!Array.isArray(node.children) || node.children.length > 40) fail(`component ${component.id} has invalid children`);
            node.children.forEach(child => validatePackTemplate(child, component, depth + 1, count));
        }
    }

    function validateComponentPack(pack) {
        if (!isObject(pack)) fail('component pack must be an object');
        exactKeys(pack, ['format', 'formatVersion', 'id', 'version', 'displayName', 'description', 'components'], 'component pack');
        if (pack.format !== 'lumesync-component-pack' || pack.formatVersion !== '1.0.0'
            || typeof pack.id !== 'string' || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){1,7}$/.test(pack.id)
            || typeof pack.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(pack.version)
            || typeof pack.displayName !== 'string' || !pack.displayName.trim() || pack.displayName.length > 100
            || (pack.description !== undefined && (typeof pack.description !== 'string' || pack.description.length > 1000))
            || !Array.isArray(pack.components) || pack.components.length < 1 || pack.components.length > 100) fail('component pack format is unsupported');
        const ids = new Set();
        for (const component of pack.components) {
            if (!isObject(component)) fail('component definition must be an object');
            exactKeys(component, ['id', 'label', 'description', 'props', 'template'], 'component');
            if (typeof component.id !== 'string' || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){2,8}$/.test(component.id)
                || !component.id.startsWith(`${pack.id}.`) || ids.has(component.id)
                || typeof component.label !== 'string' || !component.label.trim() || component.label.length > 80
                || (component.description !== undefined && (typeof component.description !== 'string' || component.description.length > 500))
                || !isObject(component.props) || Object.keys(component.props).length > 24) fail('component definition is invalid');
            ids.add(component.id);
            for (const [name, field] of Object.entries(component.props)) {
                if (!/^[a-z][a-zA-Z0-9_]{0,39}$/.test(name) || !isObject(field)) fail(`component ${component.id} has an invalid prop`);
                exactKeys(field, ['type', 'label', 'default', 'required', 'maxLength', 'min', 'max', 'options'], `prop ${name}`);
                if (!['string', 'number', 'boolean', 'color', 'enum'].includes(field.type)
                    || typeof field.label !== 'string' || !field.label.trim() || field.label.length > 80 || field.default === undefined
                    || (field.required !== undefined && typeof field.required !== 'boolean')) fail(`component ${component.id} has an invalid prop`);
                const typeKeys = { string: ['maxLength'], number: ['min', 'max'], enum: ['options'], boolean: [], color: [] }[field.type];
                if (Object.keys(field).some(key => !['type', 'label', 'default', 'required', ...typeKeys].includes(key))) fail(`component ${component.id} prop ${name} has fields for another type`);
                if (field.type === 'string' && (typeof field.default !== 'string' || field.default.length > (field.maxLength || 1000)
                    || (field.maxLength !== undefined && (!Number.isInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 4000)))) fail(`component ${component.id} has an invalid string prop`);
                if (field.type === 'number' && (typeof field.default !== 'number' || !Number.isFinite(field.default)
                    || (field.min !== undefined && !Number.isFinite(field.min)) || (field.max !== undefined && !Number.isFinite(field.max))
                    || (field.min !== undefined && field.max !== undefined && field.min > field.max)
                    || (field.min !== undefined && field.default < field.min) || (field.max !== undefined && field.default > field.max))) fail(`component ${component.id} has an invalid number prop`);
                if (field.type === 'boolean' && typeof field.default !== 'boolean') fail(`component ${component.id} has an invalid boolean prop`);
                if (field.type === 'color' && (typeof field.default !== 'string' || !HEX_COLOR.test(field.default))) fail(`component ${component.id} has an invalid color prop`);
                if (field.type === 'enum' && (!Array.isArray(field.options) || field.options.length < 1 || field.options.length > 30
                    || field.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 80)
                    || new Set(field.options).size !== field.options.length || !field.options.includes(field.default))) fail(`component ${component.id} has invalid enum options`);
            }
            validatePackTemplate(component.template, component, 0, { value: 0 });
        }
        return pack;
    }

    function renderPackTemplate(React, node, props, key) {
        if (node.prop !== undefined) return props[node.prop] === true ? '是' : props[node.prop] === false ? '否' : props[node.prop] ?? '';
        if (node.text !== undefined) return node.text;
        const style = {};
        for (const [key, value] of Object.entries(node.style || {})) style[key] = isObject(value) ? (props[value.prop] ?? '') : value;
        return React.createElement(node.tag, { ...(key ? { key } : {}), ...(Object.keys(style).length ? { style } : {}) }, ...(node.children || []).map(child => renderPackTemplate(React, child, props)));
    }

    function validateDocument(document) {
        if (!isObject(document)) fail('course metadata must be an object');
        exactKeys(document, ['format', 'formatVersion', 'id', 'title', 'description', 'aspectRatio', 'theme', 'pageOrder', 'extensions'], 'course metadata');
        if (document.format !== FORMAT || document.formatVersion !== VERSION) fail('document format/version is unsupported');
        safeId(document.id, 'course ID');
        requireText(document.title, 200, 'course title');
        if (typeof document.description !== 'string' || document.description.length > 2000) fail('course description is invalid');
        if (document.aspectRatio !== '16:9') fail('aspect ratio is unsupported');
        if (!isObject(document.theme)) fail('theme is invalid');
        exactKeys(document.theme, ['background', 'surface', 'text', 'accent'], 'theme');
        for (const key of ['background', 'surface', 'text', 'accent']) {
            if (typeof document.theme[key] !== 'string' || !HEX_COLOR.test(document.theme[key])) fail(`theme color ${key} is invalid`);
        }
        if (!Array.isArray(document.pageOrder) || document.pageOrder.length < 1 || document.pageOrder.length > MAX_PAGES) fail('page order is invalid');
        const ids = new Set();
        document.pageOrder.forEach(id => {
            safeId(id, 'page ID');
            if (ids.has(id)) fail('page order contains duplicate IDs');
            ids.add(id);
        });
        if (document.extensions !== undefined && (!Array.isArray(document.extensions) || document.extensions.length > 50)) fail('course extension lock is invalid');
    }

    async function readText(zip, filePath) {
        if (!safePath(filePath)) fail(`unsafe source path ${String(filePath)}`);
        const file = zip.file(filePath);
        if (!file) fail(`source file ${filePath} is missing`);
        const size = file._data && Number.isFinite(file._data.uncompressedSize) ? file._data.uncompressedSize : null;
        if (size !== null && size > MAX_DOCUMENT_BYTES) fail(`source file ${filePath} is too large`);
        const text = await file.async('string');
        if (text.length > MAX_DOCUMENT_BYTES) fail(`source file ${filePath} is too large`);
        return text;
    }

    async function sha256(text) {
        if (typeof global.TextEncoder !== 'function') fail('TextEncoder is unavailable');
        const bytes = new global.TextEncoder().encode(text);
        if (global.crypto?.subtle?.digest) {
            const digest = new Uint8Array(await global.crypto.subtle.digest('SHA-256', bytes));
            return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
        }

        // HTTP classroom pages opened through a LAN IP are not secure contexts,
        // so Web Crypto is unavailable there. Keep digest verification working
        // without weakening validation for those classrooms.
        const constants = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        const state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
        const bitLength = bytes.length * 8;
        const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
        const padded = new Uint8Array(paddedLength);
        padded.set(bytes);
        padded[bytes.length] = 0x80;
        const view = new DataView(padded.buffer);
        view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
        view.setUint32(paddedLength - 4, bitLength >>> 0, false);
        const words = new Uint32Array(64);
        const rotateRight = (value, count) => (value >>> count) | (value << (32 - count));

        for (let offset = 0; offset < paddedLength; offset += 64) {
            for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
            for (let index = 16; index < 64; index += 1) {
                const x = words[index - 15];
                const y = words[index - 2];
                const sigma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
                const sigma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
                words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
            }
            let [a, b, c, d, e, f, g, h] = state;
            for (let index = 0; index < 64; index += 1) {
                const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
                const choice = (e & f) ^ (~e & g);
                const t1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
                const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
                const majority = (a & b) ^ (a & c) ^ (b & c);
                const t2 = (sum0 + majority) >>> 0;
                h = g; g = f; f = e; e = (d + t1) >>> 0;
                d = c; c = b; b = a; a = (t1 + t2) >>> 0;
            }
            state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
            state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
            state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
            state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
        }
        return Array.from(state, word => word.toString(16).padStart(8, '0')).join('');
    }

    function compareTextEntries(entries) {
        return entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
            .map(entry => `${entry.name}\n${entry.text}`).join('\n');
    }

    function renderBlock(React, block, theme, catalog) {
        const props = block.props;
        const definition = catalog[block.type];
        if (definition.kind === 'heading') {
            const level = props.level;
            const fontSize = level === 1 ? 'clamp(2rem,5vw,4.2rem)' : level === 2 ? 'clamp(1.7rem,4vw,3rem)' : 'clamp(1.4rem,3vw,2.2rem)';
            return React.createElement(`h${level}`, { key: block.id, style: { margin: '0 0 .65em', fontSize, lineHeight: 1.18, color: theme.text } }, props.text);
        }
        if (definition.kind === 'paragraph') {
            return React.createElement('p', { key: block.id, style: { fontSize: 'clamp(1rem,2vw,1.7rem)', lineHeight: 1.65, whiteSpace: 'pre-wrap' } }, props.text);
        }
        if (definition.kind === 'bullets') {
            return React.createElement('ul', { key: block.id, style: { paddingLeft: '1.3em' } }, props.items.map((item, index) => React.createElement('li', {
                key: `${block.id}-${index}`, style: { fontSize: 'clamp(1rem,2vw,1.7rem)', lineHeight: 1.65 }
            }, item)));
        }
        if (definition.kind === 'callout') {
            const [background, color] = CALLOUT_COLORS[props.tone];
            return React.createElement('aside', {
                key: block.id,
                style: { background, color, padding: '1em 1.2em', borderRadius: 12, margin: '1em 0' }
            }, props.title ? React.createElement('strong', null, props.title) : null,
            React.createElement('p', { style: { margin: '.4em 0 0', fontSize: 'clamp(1rem,2vw,1.7rem)', lineHeight: 1.65, whiteSpace: 'pre-wrap' } }, props.text));
        }
        const resolvedProps = { ...Object.fromEntries(Object.entries(definition.component.props).map(([name, field]) => [name, field.default])), ...props };
        return renderPackTemplate(React, definition.component.template, resolvedProps, block.id);
    }

    async function loadCourse({ zip, manifest, React, course = {} }) {
        const editor = manifest?.editor;
        if (!editor || editor.documentFormat !== FORMAT) return null;
        if (editor.documentVersion !== VERSION || editor.metadataFile !== 'source/course.json'
            || editor.sourcePagesRoot !== 'source/pages/' || editor.buildManifest !== 'build/build-manifest.json') {
            fail('editor metadata version or paths are unsupported');
        }
        if (!Array.isArray(manifest.pages) || manifest.pages.length < 1 || manifest.pages.length > MAX_PAGES) fail('manifest page list is invalid');
        const metadataText = await readText(zip, editor.metadataFile);
        let metadata;
        try { metadata = JSON.parse(metadataText); } catch { fail('course metadata is not valid JSON'); }
        validateDocument(metadata);
        if (metadata.id !== manifest.id || metadata.title !== manifest.title || metadata.pageOrder.length !== manifest.pages.length) {
            fail('manifest and source metadata do not match');
        }

        const catalog = { ...COMPONENT_PROPS };
        const lockedExtensions = new Set();
        const lockedExtensionIds = new Set();
        const extensionFiles = [];
        const extensionRefs = metadata.extensions || [];
        for (const extension of extensionRefs) {
            if (!isObject(extension)) fail('course extension lock entry is invalid');
            exactKeys(extension, ['id', 'version', 'hash'], 'course extension lock');
            if (typeof extension.id !== 'string' || !/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*){1,7}$/.test(extension.id)
                || typeof extension.version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(extension.version)
                || typeof extension.hash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(extension.hash)) fail('course extension lock entry is invalid');
            const extensionKey = `${extension.id}@${extension.version}`;
            if (lockedExtensions.has(extensionKey)) fail(`duplicate course extension lock ${extensionKey}`);
            if (lockedExtensionIds.has(extension.id)) fail(`course locks multiple versions of extension ${extension.id}`);
            lockedExtensions.add(extensionKey);
            lockedExtensionIds.add(extension.id);
            const filePath = `source/extensions/${extension.id}.json`;
            const text = await readText(zip, filePath);
            let pack;
            try { pack = JSON.parse(text); } catch { fail(`component pack ${extension.id} is not valid JSON`); }
            validateComponentPack(pack);
            if (pack.id !== extension.id || pack.version !== extension.version
                || `sha256:${await sha256(`${stableStringify(pack)}\n`)}` !== extension.hash) fail(`component pack ${extensionKey} does not match its locked hash`);
            for (const component of pack.components) {
                if (catalog[component.id]) fail(`component ID ${component.id} is declared more than once`);
                catalog[component.id] = { props: Object.keys(component.props), component, extension: { id: pack.id, version: pack.version } };
            }
            extensionFiles.push({ name: filePath, text });
        }

        const pageFiles = [];
        const pagesById = new Map();
        for (const pageId of metadata.pageOrder) {
            const filePath = `${editor.sourcePagesRoot}${pageId}.json`;
            const text = await readText(zip, filePath);
            let page;
            try { page = JSON.parse(text); } catch { fail(`page source ${pageId} is not valid JSON`); }
            if (!isObject(page)) fail(`page ${pageId} is invalid`);
            exactKeys(page, ['id', 'title', 'blocks'], `page ${pageId}`);
            if (page.id !== pageId) fail(`page source ID does not match ${pageId}`);
            requireText(page.title, 200, 'page title');
            if (!Array.isArray(page.blocks) || page.blocks.length > MAX_BLOCKS) fail(`blocks on page ${pageId} are invalid`);
            const blockIds = new Set();
            page.blocks.forEach(block => validateBlock(block, pageId, blockIds, catalog, lockedExtensions));
            pagesById.set(pageId, page);
            pageFiles.push({ name: filePath, text });
        }
        const allowedFiles = new Set(['manifest.json', editor.metadataFile, editor.buildManifest,
            ...extensionFiles.map(entry => entry.name), ...pageFiles.map(entry => entry.name), ...manifest.pages.map(page => page.file)]);
        for (const [name, entry] of Object.entries(zip.files)) {
            if (entry.dir) continue;
            if (!allowedFiles.has(name)) fail(`package entry ${name} is not supported by this document version`);
        }
        const inputDigest = await sha256(compareTextEntries([{ name: editor.metadataFile, text: metadataText }, ...pageFiles, ...extensionFiles]));
        const buildText = await readText(zip, editor.buildManifest);
        let buildManifest;
        try { buildManifest = JSON.parse(buildText); } catch { fail('build manifest is not valid JSON'); }
        if (buildManifest?.format !== 'lumesync-build-manifest' || buildManifest.inputDigest !== `sha256:${inputDigest}`) {
            fail('source digest does not match build manifest');
        }
        if (buildManifest.version !== '1.0.0' || !Array.isArray(buildManifest.targets)
            || buildManifest.targets.length !== 1 || buildManifest.targets[0] !== 'lumesync-tsx-v1'
            || !Array.isArray(buildManifest.pages) || buildManifest.pages.length !== pageFiles.length) {
            fail('build manifest is unsupported');
        }
        const outputFiles = [];
        for (let index = 0; index < metadata.pageOrder.length; index += 1) {
            const pageId = metadata.pageOrder[index];
            const outputPath = `slides/${pageId}.tsx`;
            const buildPage = buildManifest.pages[index];
            if (!isObject(buildPage) || buildPage.id !== pageId
                || buildPage.source !== `source/pages/${pageId}.json` || buildPage.output !== outputPath) {
                fail(`build manifest page ${pageId} is invalid`);
            }
            outputFiles.push({ name: outputPath, text: await readText(zip, outputPath) });
        }
        const outputDigest = await sha256(compareTextEntries(outputFiles));
        if (buildManifest.outputDigest !== `sha256:${outputDigest}`) fail('output digest does not match build manifest');

        const manifestById = new Map(manifest.pages.map(page => [page.id, page]));
        const slides = metadata.pageOrder.map(pageId => {
            const page = pagesById.get(pageId);
            const declared = manifestById.get(pageId);
            if (!declared || declared.title !== page.title || declared.file !== `slides/${pageId}.tsx`) fail(`manifest page ${pageId} does not match source`);
            const children = page.blocks.map(block => renderBlock(React, block, metadata.theme, catalog));
            const component = React.createElement('main', {
                style: {
                    boxSizing: 'border-box', width: '100%', height: '100%', overflow: 'auto', padding: '5% 7%',
                    background: metadata.theme.surface, color: metadata.theme.text,
                    fontFamily: 'Inter, PingFang SC, Microsoft YaHei, sans-serif'
                },
                'aria-label': page.title
            }, ...children);
            return { id: page.id, title: page.title, component };
        });
        return {
            id: metadata.id,
            title: metadata.title,
            icon: manifest.icon || course.icon || 'Course',
            desc: metadata.description || manifest.desc || '',
            color: manifest.color || course.color || 'from-blue-500 to-indigo-600',
            dependencies: [],
            slides
        };
    }

    global.LumeSyncDocumentRenderer = Object.freeze({ format: FORMAT, version: VERSION, loadCourse });
})(window);
